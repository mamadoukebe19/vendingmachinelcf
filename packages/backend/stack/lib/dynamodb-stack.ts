import * as cdk from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class DynamoDBStack extends cdk.Stack {
  coursesTable: Table;
  accountsTable: Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.accountsTable = new Table(this, 'Accounts', {
      partitionKey: { name: 'accountId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    this.accountsTable.addGlobalSecondaryIndex({
      indexName: 'statusIndex',
      partitionKey: { name: 'status', type: AttributeType.STRING },
    });

    this.accountsTable.addGlobalSecondaryIndex({
      indexName: 'userIndex',
      partitionKey: { name: 'assignedTo', type: AttributeType.STRING },
      sortKey: { name: 'assignedAt', type: AttributeType.STRING },
    });
  }
}
