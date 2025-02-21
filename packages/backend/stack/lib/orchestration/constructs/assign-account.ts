import { Duration, StackProps } from 'aws-cdk-lib';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import {
  Chain,
  Choice,
  Condition,
  CustomState,
  DefinitionBody,
  Fail,
  StateMachine,
  Succeed,
  Wait,
  WaitTime,
} from 'aws-cdk-lib/aws-stepfunctions';
import {
  CallAwsService,
  DynamoReturnValues,
} from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';
import { DynamoUnmarshall } from '../../constructs/DynamoUnmarshall';
import { AwsAccountVendingMachineProps } from '../../aws-account-vending-machine';
import {
  Policy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { EventBus } from 'aws-cdk-lib/aws-events';
import { JsonAtaChoice, JsonAtaCondition } from './JSONataChoice';

interface SetupAccountConstructProps extends StackProps {
  config: AwsAccountVendingMachineProps;
  accountsTable: Table;
  eventBus: EventBus;
  releaseAccountStateMachine: StateMachine;
}

export class AssignAccountConstruct extends Construct {
  stateMachine: StateMachine;

  constructor(scope: Construct, id: string, props: SetupAccountConstructProps) {
    super(scope, id);

    const { accountsTable, eventBus, releaseAccountStateMachine, config } =
      props;
    const {
      permissionSetArn,
      instanceArn,
      accountId: managementAccountId,
    } = config.managementAccount;

    const getAccount = new CallAwsService(this, 'Get Free Account', {
      service: 'dynamodb',
      action: 'query',
      parameters: {
        TableName: accountsTable.tableName,
        IndexName: 'statusIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': { S: 'FREE' },
        },
        Limit: 1,
      },
      resultPath: '$.account',
      iamResources: [`${accountsTable.tableArn}/index/statusIndex`],
    });

    const unmarshallAccount = new DynamoUnmarshall(this, 'Unmarshall Account', {
      path: '$states.input.account.Items[0]',
      variableName: 'account',
    });

    const assignValues = new CustomState(this, 'Assign Values', {
      stateJson: {
        Type: 'Pass',
        QueryLanguage: 'JSONata',
        Assign: {
          expiresAt: `{% $fromMillis($millis() + $states.input.expiration * 24 * 60 * 60 * 1000) %}`,
        },
      },
    });

    const lockAccount = new CustomState(this, 'Lock Account', {
      stateJson: {
        Type: 'Task',
        Resource: 'arn:aws:states:::dynamodb:updateItem',
        QueryLanguage: 'JSONata',
        Assign: {
          account: '{% $states.result.Attributes %}',
        },
        Arguments: {
          Key: {
            accountId: {
              S: '{% $account.accountId %}',
            },
          },
          TableName: accountsTable.tableName,
          ConditionExpression: '#status = :free',
          ExpressionAttributeNames: {
            '#name': 'name',
            '#status': 'status',
            '#updatedAt': 'updatedAt',
            '#assignedAt': 'assignedAt',
            '#assignedTo': 'assignedTo',
            '#expiresAt': 'expiresAt',
          },
          ExpressionAttributeValues: {
            ':name': { S: '{% $states.input.name %}' },
            ':status': { S: 'USED' },
            ':free': { S: 'FREE' },
            ':updatedAt': { S: '{% $now() %}' },
            ':assignedAt': { S: '{% $now() %}' },
            ':assignedTo': { S: '{% $states.input.identity.userId %}' },
            ':expiresAt': {
              S: '{% $expiresAt %}',
            },
          },
          ReturnValues: DynamoReturnValues.ALL_NEW,
          UpdateExpression:
            'SET #name = :name, #status = :status, #updatedAt = :updatedAt, #assignedAt = :assignedAt, #assignedTo = :assignedTo, #expiresAt = :expiresAt',
        },
        Output: '{% $states.input %}',
      },
    });

    lockAccount.addCatch(new Fail(this, 'Account Already Used'), {
      errors: ['ConditionalCheckFailedException'],
    });

    const unmarshallUpdatedAccount = new DynamoUnmarshall(
      this,
      'Unmarshall Updated Account',
      {
        path: '$account',
        variableName: 'account',
      },
    );

    const assignAccount = new CustomState(this, 'Assign Account', {
      stateJson: {
        Type: 'Task',
        Resource: 'arn:aws:states:::aws-sdk:ssoadmin:createAccountAssignment',
        QueryLanguage: 'JSONata',
        Arguments: {
          InstanceArn: instanceArn,
          PermissionSetArn: permissionSetArn,
          PrincipalType: 'USER',
          PrincipalId: '{% $states.input.identity.userId %}',
          TargetType: 'AWS_ACCOUNT',
          TargetId: '{% $account.accountId %}',
        },
        Output: '{% $states.input %}',
        Credentials: {
          RoleArn: `arn:aws:iam::${managementAccountId}:role/VendingMachine`,
        },
      },
    });

    const schedulerRole = new Role(this, 'SchedulerRole', {
      assumedBy: new ServicePrincipal('scheduler.amazonaws.com'),
    });
    releaseAccountStateMachine.grantStartExecution(schedulerRole);

    const scheduleDestroy = new CustomState(this, 'Schedule Destroy Account', {
      stateJson: {
        Type: 'Task',
        Resource: 'arn:aws:states:::aws-sdk:scheduler:createSchedule',
        QueryLanguage: 'JSONata',
        Arguments: {
          Name: '{% $account.accountId & "-destroy"  %}',
          ScheduleExpression:
            '{% "at(" & $substring($expiresAt, 0, 19) & ")" %}',
          ScheduleExpressionTimezone: 'UTC',
          GroupName: 'VendingMachine',
          ActionAfterCompletion: 'DELETE',
          Target: {
            Arn: releaseAccountStateMachine.stateMachineArn,
            Input:
              '{% $string($merge([$states.input, {"init": "auto", "account": $account }])) %}',
            RoleArn: schedulerRole.roleArn,
          },
          FlexibleTimeWindow: { Mode: 'OFF' },
        },
        Output: '{% $states.input %}',
      },
    });

    const putEventSuccess = new CustomState(this, 'Put Event Success', {
      stateJson: {
        Type: 'Task',
        Resource: 'arn:aws:states:::events:putEvents',
        QueryLanguage: 'JSONata',
        Arguments: {
          Entries: [
            {
              Detail: `{% $string({
                  "taskId": $states.input.taskId,
                  "status": "SUCCESS",
                  "account": $account
              }) %}`,
              DetailType: 'accountAssigned',
              Source: 'VendingMachine',
              EventBusName: eventBus.eventBusName,
            },
          ],
        },
        Output: '{% $states.input %}',
      },
    });

    const setupAccount = Chain.start(assignValues)
      .next(lockAccount)
      .next(unmarshallUpdatedAccount)
      .next(assignAccount)
      .next(scheduleDestroy)
      .next(putEventSuccess)
      .next(new Succeed(this, 'Done'));

    const putEventNoAccount = new CustomState(this, 'Put Event Failed', {
      stateJson: {
        Type: 'Task',
        Resource: 'arn:aws:states:::events:putEvents',
        QueryLanguage: 'JSONata',
        Arguments: {
          Entries: [
            {
              Detail: `{% $string({
                  "taskId": $states.input.taskId,
                  "message": "No available account.",
                  "status": "FAILED"
              }) %}`,
              DetailType: 'accountAssignationFailed',
              Source: 'VendingMachine',
              EventBusName: eventBus.eventBusName,
            },
          ],
        },
        Output: '{% $states.input %}',
      },
    });

    const accountChoice = new JsonAtaChoice(this, 'Account Found?');

    // Give FE time to subscribe
    const wait = new Wait(this, 'Wait', {
      time: WaitTime.duration(Duration.seconds(2)),
    });

    accountChoice
      .when(JsonAtaCondition.condition('$boolean($account)'), setupAccount)
      .otherwise(wait.next(putEventNoAccount));

    const chain = Chain.start(getAccount)
      .next(unmarshallAccount)
      .next(accountChoice);

    this.stateMachine = new StateMachine(this, 'StateMachine', {
      definitionBody: DefinitionBody.fromChainable(chain),
    });

    const managementRole = Role.fromRoleArn(
      this,
      'ManagementAccountRole',
      `arn:aws:iam::${managementAccountId}:role/VendingMachine`,
    );
    managementRole.grantAssumeRole(this.stateMachine.role);
    eventBus.grantPutEventsTo(this.stateMachine);
    schedulerRole.grantPassRole(this.stateMachine.role);

    this.stateMachine.role.attachInlinePolicy(
      new Policy(this, 'SchedulerPolicy', {
        statements: [
          new PolicyStatement({
            actions: ['scheduler:CreateSchedule'],
            resources: [
              `arn:aws:scheduler:${config.deploymentAccount.region}:${config.deploymentAccount.accountId}:schedule/VendingMachine/*`,
            ],
          }),
        ],
      }),
    );

    accountsTable.grantReadWriteData(this.stateMachine);
  }
}
