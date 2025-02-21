#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AwsAccountVendingMachine } from '../lib/aws-account-vending-machine';

const app = new cdk.App();

new AwsAccountVendingMachine(app, {
  managementAccount: {
    accountId: '886436967273',
    region: 'us-east-1',
    instanceArn: 'arn:aws:sso:::instance/ssoins-7223803ee0e299f3',
    permissionSetArn:
      'arn:aws:sso:::permissionSet/ssoins-7223803ee0e299f3/ps-9a01fed6153c4518',
  },
  deploymentAccount: {
    accountId: '481665124648',
    region: 'us-east-1',
  },
  application: {
    metadataUrl:
      'https://portal.sso.us-east-1.amazonaws.com/saml/metadata/ODg2NDM2OTY3MjczX2lucy00ZGIzMDIzOGRiNTNiZGVj',
  },
  identity: {
    callbackUrls: ['https://d113qwo20e99le.cloudfront.net'],
    domainPrefix: 'my-vending-machinelcf',
  },
  awsNuke: {
    blockList: ['886436967273', '222222222222', '333333333333'],
    regions: ['us-east-1'],
  },
});
