import * as cdk from 'aws-cdk-lib';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { AssignAccountConstruct } from './constructs/assign-account';
import { ReleaseAccountConstruct } from './constructs/release-account';
import { StateMachine } from 'aws-cdk-lib/aws-stepfunctions';
import { AwsAccountVendingMachineProps } from '../aws-account-vending-machine';
import { EventBus } from 'aws-cdk-lib/aws-events';

interface OrchestrationStackProps extends cdk.StackProps {
  config: AwsAccountVendingMachineProps;
  accountsTable: Table;
  eventBus: EventBus;
}

export class OrchestrationStack extends cdk.Stack {
  assignAccountStateMachine: StateMachine;
  releaseAccountStateMachine: StateMachine;

  constructor(scope: Construct, id: string, props: OrchestrationStackProps) {
    super(scope, id, props);

    const { accountsTable, eventBus, config } = props;

    const releaseAccount = new ReleaseAccountConstruct(this, 'ReleaseAccount', {
      accountsTable: accountsTable,
      config: props.config,
    });
    this.releaseAccountStateMachine = releaseAccount.stateMachine;

    const setupAccount = new AssignAccountConstruct(this, 'AssignAccount', {
      accountsTable,
      config: config,
      eventBus: eventBus,
      releaseAccountStateMachine: releaseAccount.stateMachine,
    });
    this.assignAccountStateMachine = setupAccount.stateMachine;
  }
}
