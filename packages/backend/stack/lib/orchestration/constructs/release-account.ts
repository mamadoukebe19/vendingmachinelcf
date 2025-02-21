import { StackProps } from 'aws-cdk-lib';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import {
  Cluster,
  ContainerImage,
  CpuArchitecture,
  FargateTaskDefinition,
  LogDriver,
  OperatingSystemFamily,
} from 'aws-cdk-lib/aws-ecs';
import { Policy, PolicyStatement, Role } from 'aws-cdk-lib/aws-iam';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import {
  Chain,
  CustomState,
  DefinitionBody,
  IntegrationPattern,
  JsonPath,
  StateMachine,
  TaskRole,
} from 'aws-cdk-lib/aws-stepfunctions';
import {
  CallAwsService,
  DynamoAttributeValue,
  DynamoUpdateItem,
  EcsFargateLaunchTarget,
  EcsRunTask,
} from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';
import { AwsAccountVendingMachineProps } from '../../aws-account-vending-machine';
import { JsonAtaChoice, JsonAtaCondition } from './JSONataChoice';

interface ReleaseAccountConstructProps extends StackProps {
  accountsTable: Table;
  config: AwsAccountVendingMachineProps;
}

export class ReleaseAccountConstruct extends Construct {
  stateMachine: StateMachine;

  constructor(
    scope: Construct,
    id: string,
    props: ReleaseAccountConstructProps,
  ) {
    super(scope, id);
    const {
      accountsTable,
      config: { awsNuke, managementAccount, deploymentAccount },
    } = props;
    const {
      permissionSetArn,
      instanceArn,
      accountId: managementAccountId,
    } = managementAccount;

    const vpc = new Vpc(this, 'Vpc', {
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: SubnetType.PUBLIC,
        },
      ],
    });

    const securityGroup = new SecurityGroup(this, 'SecurityGroup', {
      vpc,
      allowAllOutbound: true,
    });

    const cluster = new Cluster(this, 'Cluster', { vpc: vpc });

    const taskDefinition = new FargateTaskDefinition(this, 'AWSNuke', {
      cpu: 256,
      memoryLimitMiB: 512,
      runtimePlatform: {
        operatingSystemFamily: OperatingSystemFamily.LINUX,
        cpuArchitecture: CpuArchitecture.ARM64,
      },
    });
    const nukeAccountRole = Role.fromRoleArn(
      this,
      'AWSNukeRole',
      `arn:aws:iam::*:role/AWSNukeRole`,
    );
    nukeAccountRole.grantAssumeRole(taskDefinition.taskRole);

    const logGroup = new LogGroup(this, 'AWSNukeLogGroup', {});
    const containerDefinition = taskDefinition.addContainer('aws-nuke', {
      image: ContainerImage.fromAsset('./stack/aws-nuke', {
        platform: Platform.LINUX_ARM64,
        assetName: 'aws-nuke',
        buildArgs: {
          ...(awsNuke.version ? { AWS_NUKE_VERSION: awsNuke.version } : {}),
          // AWS Account blocklist for AWS Nuke
          ...(awsNuke.blockList
            ? { BLOCK_LIST: JSON.stringify(awsNuke.blockList) }
            : {}),
          ...(awsNuke.regions
            ? { REGIONS: JSON.stringify(awsNuke.regions) }
            : {}),
        },
      }),
      logging: LogDriver.awsLogs({
        logGroup,
        streamPrefix: 'aws-nuke',
      }),
    });

    const managementRole = Role.fromRoleArn(
      this,
      'ManagementAccountRole',
      `arn:aws:iam::${managementAccountId}:role/VendingMachine`,
    );

    const removeAccountAccess = new CallAwsService(
      this,
      'Remove Account Access',
      {
        service: 'ssoadmin',
        action: 'deleteAccountAssignment',
        parameters: {
          InstanceArn: instanceArn,
          PermissionSetArn: permissionSetArn,
          PrincipalType: 'USER',
          PrincipalId: JsonPath.stringAt('$.identity.userId'),
          TargetType: 'AWS_ACCOUNT',
          TargetId: JsonPath.stringAt('$.account.accountId'),
        },
        resultPath: '$.removeAccessResult',
        credentials: {
          role: TaskRole.fromRole(managementRole),
        },
        iamResources: [instanceArn, permissionSetArn],
      },
    );

    const unassignAccount = new DynamoUpdateItem(this, 'Unassign Account', {
      table: accountsTable,
      key: {
        accountId: DynamoAttributeValue.fromString(
          JsonPath.stringAt('$.account.accountId'),
        ),
      },
      updateExpression:
        'SET #status = :status, #updatedAt = :updatedAt REMOVE #name, #assignedTo, #assignedAt, #expiresAt',
      expressionAttributeNames: {
        '#name': 'name',
        '#status': 'status',
        '#updatedAt': 'updatedAt',
        '#assignedTo': 'assignedTo',
        '#assignedAt': 'assignedAt',
        '#expiresAt': 'expiresAt',
      },
      expressionAttributeValues: {
        ':status': DynamoAttributeValue.fromString('DESTROYING'),
        ':updatedAt': DynamoAttributeValue.fromString(
          JsonPath.stringAt('$$.State.EnteredTime'),
        ),
      },
      resultPath: '$.freeResult',
    });

    const nukeAccount = new EcsRunTask(this, 'Nuke Account', {
      integrationPattern: IntegrationPattern.RUN_JOB,
      cluster,
      taskDefinition,
      assignPublicIp: true,
      securityGroups: [securityGroup],
      subnets: {
        subnetType: SubnetType.PUBLIC,
      },
      containerOverrides: [
        {
          containerDefinition,
          environment: [
            {
              name: 'AWS_NUKE_ACCOUNT_ID',
              value: JsonPath.stringAt('$.account.accountId'),
            },
          ],
        },
      ],
      launchTarget: new EcsFargateLaunchTarget(),
      resultPath: '$.nukeResult',
    });

    const releaseAccount = new DynamoUpdateItem(this, 'Release Account', {
      table: accountsTable,
      key: {
        accountId: DynamoAttributeValue.fromString(
          JsonPath.stringAt('$.account.accountId'),
        ),
      },
      updateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
      expressionAttributeNames: {
        '#status': 'status',
        '#updatedAt': 'updatedAt',
      },
      expressionAttributeValues: {
        ':status': DynamoAttributeValue.fromString('FREE'),
        ':updatedAt': DynamoAttributeValue.fromString(
          JsonPath.stringAt('$$.State.EnteredTime'),
        ),
      },
      resultPath: '$.freeResult',
    });

    const userInitiated = new JsonAtaChoice(this, 'Is User Initiated?');

    const unScheduleDestroy = new CustomState(
      this,
      'Unschedule Destroy Account',
      {
        stateJson: {
          Type: 'Task',
          Resource: 'arn:aws:states:::aws-sdk:scheduler:deleteSchedule',
          QueryLanguage: 'JSONata',
          Arguments: {
            Name: '{% $states.input.account.accountId & "-destroy"  %}',
            GroupName: 'VendingMachine',
          },
          Output: '{% $states.input %}',
        },
      },
    );

    const releaseAccountChain = Chain.start(removeAccountAccess)
      .next(unassignAccount)
      .next(nukeAccount)
      .next(releaseAccount);

    userInitiated
      .when(
        JsonAtaCondition.condition('$states.input.init = "user"'),
        unScheduleDestroy.next(releaseAccountChain),
      )
      .otherwise(releaseAccountChain);

    this.stateMachine = new StateMachine(this, 'StateMachine', {
      definitionBody: DefinitionBody.fromChainable(userInitiated),
    });

    this.stateMachine.role.attachInlinePolicy(
      new Policy(this, 'SchedulerPolicy', {
        statements: [
          new PolicyStatement({
            actions: ['scheduler:CreateSchedule', 'scheduler:DeleteSchedule'],
            resources: [
              `arn:aws:scheduler:${deploymentAccount.region}:${deploymentAccount.accountId}:schedule/VendingMachine/*`,
            ],
          }),
        ],
      }),
    );

    taskDefinition.executionRole?.grantPassRole(this.stateMachine.role);
    taskDefinition.taskRole.grantPassRole(this.stateMachine.role);
  }
}
