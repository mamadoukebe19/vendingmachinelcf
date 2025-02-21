import * as cdk from 'aws-cdk-lib';
import { EventBus } from 'aws-cdk-lib/aws-events';
import { CfnScheduleGroup } from 'aws-cdk-lib/aws-scheduler';
import { Construct } from 'constructs';

export class EventBusStack extends cdk.Stack {
  eventBus: EventBus;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.eventBus = new EventBus(this, 'VendingMachine', {});

    new CfnScheduleGroup(this, 'ScheduleGroup', {
      name: 'VendingMachine',
    });
  }
}
