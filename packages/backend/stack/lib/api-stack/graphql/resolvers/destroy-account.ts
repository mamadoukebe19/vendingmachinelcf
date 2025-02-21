import { Context, util } from '@aws-appsync/utils';

export const request = (ctx: Context) => {
  const identity = (ctx.identity as AppSyncIdentityCognito).claims;

  return {
    method: 'POST',
    resourcePath: '/',
    params: {
      headers: {
        'x-amz-target': 'AWSStepFunctions.StartExecution',
        'content-type': 'application/x-amz-json-1.0',
      },
      body: JSON.stringify({
        name: util.autoId(),
        stateMachineArn: ctx.env.RELEASE_ACCOUNT_STATE_MACHINE_ARN,
        input: JSON.stringify({
          init: 'user',
          identity: {
            userId: identity['custom:userId'],
            username: identity['custom:username'],
            email: identity.email,
          },
          account: {
            accountId: ctx.args.input.accountId,
          },
        }),
      }),
    },
  };
};

export const response = (ctx: Context) => {
  return true;
};
