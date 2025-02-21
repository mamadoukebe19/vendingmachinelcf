import { Construct } from 'constructs';
import { IdentityStack } from './identity-stack';
import { OrchestrationStack } from './orchestration/orchestration-stack';
import { DynamoDBStack } from './dynamodb-stack';
import { ApiStack } from './api-stack/api-stack';
import { EventBusStack } from './event-bus-stack';
import { Environment } from 'aws-cdk-lib';
import { FrontEndStack } from './frontend/frontend-stack';

export interface AwsAccountVendingMachineProps {
  managementAccount: {
    accountId: string;
    region: string;
    instanceArn: string;
    permissionSetArn: string;
  };
  deploymentAccount: {
    accountId: string;
    region: string;
  };
  application: {
    metadataUrl: string;
  };
  identity: {
    callbackUrls: string[];
    domainPrefix?: string;
  };
  awsNuke: {
    version?: string;
    blockList: string[];
    regions?: string[];
  };
}

export class AwsAccountVendingMachine {
  constructor(scope: Construct, props: AwsAccountVendingMachineProps) {
    const identityStack = new IdentityStack(scope, 'Identity', props);

    const env: Environment = {
      account: props.deploymentAccount.accountId,
      region: props.deploymentAccount.region,
    };

    const dynamodb = new DynamoDBStack(scope, 'DynamoDB', {
      env: env,
    });

    const eventBus = new EventBusStack(scope, 'EventBus', {
      env: env,
    });

    const orchestrationStack = new OrchestrationStack(scope, 'Orchestration', {
      env: env,
      accountsTable: dynamodb.accountsTable,
      config: props,
      eventBus: eventBus.eventBus,
    });

    const apiStack = new ApiStack(scope, 'Api', {
      env: env,
      eventBus: eventBus.eventBus,
      cognitoUserPool: identityStack.userPool,
      accountsTable: dynamodb.accountsTable,
      assignAccountStateMachine: orchestrationStack.assignAccountStateMachine,
      releaseAccountStateMachine: orchestrationStack.releaseAccountStateMachine,
    });

    const frontEndStack = new FrontEndStack(scope, 'FrontEnd', {
      env: env,
      api: apiStack.api,
      cognitoUserPool: identityStack.userPool,
      cognitoUserPoolClient: identityStack.userPoolClient,
      config: props,
    });
    frontEndStack.addDependency(identityStack, 'Identity pool and client id');
  }
}
