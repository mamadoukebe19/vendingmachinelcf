import * as cdk from 'aws-cdk-lib';
import { Distribution } from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { UserPool, UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { Bucket, BucketAccessControl } from 'aws-cdk-lib/aws-s3';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { StringListParameter, StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import path = require('path');
import { AwsAccountVendingMachineProps } from '../aws-account-vending-machine';
import { TriggerInvalidation } from 'aws-cdk-lib/triggers';
import { GraphqlApi } from 'aws-cdk-lib/aws-appsync';

interface FrontEndStackProps extends cdk.StackProps {
  api: GraphqlApi;
  cognitoUserPool: UserPool;
  cognitoUserPoolClient: UserPoolClient;
  config: AwsAccountVendingMachineProps;
}

export class FrontEndStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FrontEndStackProps) {
    const { cognitoUserPool, cognitoUserPoolClient, config, api } = props;
    super(scope, id, props);

    const website = new Asset(this, 'BundleApp', {
      path: path.join(__dirname, '../../../../..'),
      bundling: {
        image: cdk.DockerImage.fromRegistry('node:22'),
        bundlingFileAccess: cdk.BundlingFileAccess.VOLUME_COPY,
        command: [
          'sh',
          '-c',
          `
            rm -rf node_modules packages/frontend/node_modules && \ 
            npm i -w frontend && \
            npm run build -w frontend && \
            cp -r packages/frontend/dist/* /asset-output
          `,
        ],
        user: 'root',
      },
    });

    const userPoolId = new StringParameter(this, 'UserPoolId', {
      parameterName: '/vending-machine/userPoolId',
      stringValue: cognitoUserPool.userPoolId,
    });

    const userPoolClientId = new StringParameter(this, 'UserPoolClientId', {
      parameterName: '/vending-machine/userPoolClientId',
      stringValue: cognitoUserPoolClient.userPoolClientId,
    });

    const graphQLUrl = new StringParameter(this, 'GraphQLUrl', {
      parameterName: '/vending-machine/graphQLUrl',
      stringValue: api.graphqlUrl,
    });

    const bucket = new Bucket(this, 'FrontendBucket', {
      accessControl: BucketAccessControl.PRIVATE,
    });

    const distribution = new Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(bucket),
      },
    });

    const configFile = Source.jsonData('config.json', {
      API: {
        GraphQL: {
          endpoint: graphQLUrl.stringValue,
          defaultAuthMode: 'userPool',
        },
      },
      Auth: {
        Cognito: {
          userPoolClientId: userPoolClientId.stringValue,
          userPoolId: userPoolId.stringValue,
          loginWith: {
            oauth: {
              domain: `${config.identity.domainPrefix}.auth.us-east-1.amazoncognito.com`,
              scopes: ['email', 'openid', 'profile'],
              redirectSignIn: config.identity.callbackUrls,
              redirectSignOut: config.identity.callbackUrls,
              responseType: 'code',
            },
          },
        },
      },
    });

    const deployment = new BucketDeployment(this, 'DeployFiles', {
      sources: [Source.bucket(website.bucket, website.s3ObjectKey), configFile],
      destinationBucket: bucket,
    });

    new cdk.CfnOutput(this, 'DistributionDomain', {
      value: distribution.distributionDomainName,
    });
  }
}
