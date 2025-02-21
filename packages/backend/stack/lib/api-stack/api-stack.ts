import * as cdk from 'aws-cdk-lib';
import {
  AppsyncFunction,
  AuthorizationType,
  Code,
  Definition,
  DynamoDbDataSource,
  FieldLogLevel,
  FunctionRuntime,
  GraphqlApi,
  HttpDataSource,
  NoneDataSource,
  Resolver,
} from 'aws-cdk-lib/aws-appsync';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { StateMachine } from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';
import { buildResolver } from './build-resolver';
import {
  EventBus,
  EventField,
  Rule,
  RuleTargetInput,
} from 'aws-cdk-lib/aws-events';
import { AppSync } from 'aws-cdk-lib/aws-events-targets';

interface ApiProps extends cdk.StackProps {
  eventBus: EventBus;
  cognitoUserPool: UserPool;
  accountsTable: Table;
  assignAccountStateMachine: StateMachine;
  releaseAccountStateMachine: StateMachine;
}

export class ApiStack extends cdk.Stack {
  api: GraphqlApi;

  constructor(scope: Construct, id: string, props: ApiProps) {
    super(scope, id, props);

    const {
      cognitoUserPool,
      assignAccountStateMachine,
      releaseAccountStateMachine,
      eventBus,
    } = props;

    const appsync = (this.api = new GraphqlApi(this, 'AppSync', {
      name: 'VendingMachine',
      definition: Definition.fromFile(__dirname + '/graphql/schema.graphql'),
      logConfig: {
        fieldLogLevel: FieldLogLevel.ALL,
      },
      environmentVariables: {
        ASSIGN_ACCOUNT_STATE_MACHINE_ARN:
          assignAccountStateMachine.stateMachineArn,
        RELEASE_ACCOUNT_STATE_MACHINE_ARN:
          releaseAccountStateMachine.stateMachineArn,
      },
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool: cognitoUserPool,
          },
        },
        additionalAuthorizationModes: [
          {
            authorizationType: AuthorizationType.IAM,
          },
        ],
      },
    }));

    const noneDataSource = new NoneDataSource(this, 'NoneDataSource', {
      api: appsync,
    });

    const stepFunctionsDs = new HttpDataSource(
      this,
      'StepFunctionsDataSource',
      {
        api: appsync,
        endpoint: 'https://states.us-east-1.amazonaws.com',
        authorizationConfig: {
          signingRegion: 'us-east-1',
          signingServiceName: 'states',
        },
      },
    );
    assignAccountStateMachine.grantStartExecution(stepFunctionsDs);
    releaseAccountStateMachine.grantStartExecution(stepFunctionsDs);

    const accountsDs = new DynamoDbDataSource(this, 'AccountsDataSource', {
      api: appsync,
      table: props.accountsTable,
    });

    const requestAccountFunction = new AppsyncFunction(this, 'RequestAccount', {
      api: appsync,
      dataSource: stepFunctionsDs,
      name: 'RequestAccount',
      runtime: FunctionRuntime.JS_1_0_0,
      code: buildResolver(__dirname + '/graphql/resolvers/request-account.ts'),
    });

    const requestAccount = new Resolver(this, 'RequestAccountPipeline', {
      api: appsync,
      typeName: 'Mutation',
      fieldName: 'requestAccount',
      runtime: FunctionRuntime.JS_1_0_0,
      pipelineConfig: [requestAccountFunction],
      code: Code.fromInline(`
        export const request = () => {
          return {};
        }

        export const response = (ctx) => {
          return ctx.prev.result;
        }
      `),
    });

    const destroyAccountFunction = new AppsyncFunction(this, 'DestroyAccount', {
      api: appsync,
      dataSource: stepFunctionsDs,
      name: 'DestroyAccount',
      runtime: FunctionRuntime.JS_1_0_0,
      code: buildResolver(__dirname + '/graphql/resolvers/destroy-account.ts'),
    });

    const destroyAccount = new Resolver(this, 'DestroyAccountPipeline', {
      api: appsync,
      typeName: 'Mutation',
      fieldName: 'destroyAccount',
      runtime: FunctionRuntime.JS_1_0_0,
      pipelineConfig: [destroyAccountFunction],
      code: Code.fromInline(`
        export const request = () => {
          return {};
        }

        export const response = (ctx) => {
          return ctx.prev.result;
        }
      `),
    });

    const notifyAccountAssignedFunction = new Resolver(
      this,
      'NotifyAccountAssigned',
      {
        api: appsync,
        typeName: 'Mutation',
        fieldName: 'notifyAccountAssigned',
        dataSource: noneDataSource,
        runtime: FunctionRuntime.JS_1_0_0,
        code: Code.fromInline(`
          export const request = () => {
            return {};
          }
  
          export const response = (ctx) => {
            return ctx.args.input;
          }
        `),
      },
    );

    const listAccounts = new AppsyncFunction(this, 'ListAccounts', {
      api: appsync,
      dataSource: accountsDs,
      name: 'ListAccounts',
      runtime: FunctionRuntime.JS_1_0_0,
      code: buildResolver(__dirname + '/graphql/resolvers/list-my-accounts.ts'),
    });

    const listMyAccounts = new Resolver(this, 'ListMyAccountsPipeline', {
      api: appsync,
      typeName: 'Query',
      fieldName: 'listMyAccounts',
      runtime: FunctionRuntime.JS_1_0_0,
      pipelineConfig: [listAccounts],
      code: Code.fromInline(`
        export const request = () => {
          return {};
        }

        export const response = (ctx) => {
          return ctx.prev.result;
        }
      `),
    });

    //Triggers
    const accountAssignedRule = new Rule(this, 'RequestAccountRule', {
      eventBus,
      eventPattern: {
        source: ['VendingMachine'],
        detailType: ['accountAssigned'],
      },
    });

    accountAssignedRule.addTarget(
      new AppSync(appsync, {
        graphQLOperation:
          'mutation Notify($input: NotifyAccountAssignedInput!){ notifyAccountAssigned(input: $input) { taskId, status, details { accountId, name, expiresAt } } }',
        variables: RuleTargetInput.fromObject({
          input: {
            taskId: EventField.fromPath('$.detail.taskId'),
            status: EventField.fromPath('$.detail.status'),
            details: {
              accountId: EventField.fromPath('$.detail.account.accountId'),
              name: EventField.fromPath('$.detail.account.name'),
              expiresAt: EventField.fromPath('$.detail.account.expiresAt'),
            },
          },
        }),
      }),
    );

    const accountAssignationFailedRule = new Rule(
      this,
      'AssignationFailedRule',
      {
        eventBus,
        eventPattern: {
          source: ['VendingMachine'],
          detailType: ['accountAssignationFailed'],
        },
      },
    );

    accountAssignationFailedRule.addTarget(
      new AppSync(appsync, {
        graphQLOperation:
          'mutation Notify($input: NotifyAccountAssignedInput!){ notifyAccountAssigned(input: $input) { taskId, status, message } }',
        variables: RuleTargetInput.fromObject({
          input: {
            taskId: EventField.fromPath('$.detail.taskId'),
            status: EventField.fromPath('$.detail.status'),
            message: EventField.fromPath('$.detail.message'),
          },
        }),
      }),
    );
  }
}
