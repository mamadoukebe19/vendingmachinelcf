import * as cdk from 'aws-cdk-lib';
import {
  OAuthScope,
  ProviderAttribute,
  StringAttribute,
  UserPool,
  UserPoolClient,
  UserPoolClientIdentityProvider,
  UserPoolIdentityProviderSaml,
  UserPoolIdentityProviderSamlMetadata,
} from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import { AwsAccountVendingMachineProps } from './aws-account-vending-machine';

export class IdentityStack extends cdk.Stack {
  userPool: UserPool;
  userPoolClient: UserPoolClient;

  constructor(
    scope: Construct,
    id: string,
    props: AwsAccountVendingMachineProps,
  ) {
    const { deploymentAccount, application, identity } = props;
    const { callbackUrls, domainPrefix } = identity;

    super(scope, id, {
      env: {
        account: deploymentAccount.accountId,
        region: deploymentAccount.region,
      },
    });

    this.userPool = new UserPool(this, 'AccountVendingMachine', {
      customAttributes: {
        userId: new StringAttribute({ mutable: false }),
        username: new StringAttribute({ mutable: false }),
      },
    });

    this.userPool.addDomain('Domain', {
      cognitoDomain: domainPrefix ? { domainPrefix: domainPrefix } : undefined,
    });

    const provider = new UserPoolIdentityProviderSaml(this, 'SSO', {
      name: 'aws-sso',
      userPool: this.userPool,
      metadata: UserPoolIdentityProviderSamlMetadata.url(
        application.metadataUrl,
      ),
      attributeMapping: {
        email: ProviderAttribute.other('email'),
        custom: {
          'custom:userId': ProviderAttribute.other('userId'),
          'custom:username': ProviderAttribute.other('username'),
        },
      },
    });

    this.userPoolClient = this.userPool.addClient('Client', {
      supportedIdentityProviders: [
        UserPoolClientIdentityProvider.custom(provider.providerName),
      ],
      oAuth: {
        callbackUrls: callbackUrls,
        scopes: [OAuthScope.EMAIL, OAuthScope.OPENID, OAuthScope.PROFILE],
        flows: {
          implicitCodeGrant: false,
          authorizationCodeGrant: true,
          clientCredentials: false,
        },
      },
    });
  }
}