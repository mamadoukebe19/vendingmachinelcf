import { AppSyncIdentityCognito, Context, util } from '@aws-appsync/utils';

export const request = (ctx: Context) => {
  const taskId = util.autoId();
  ctx.stash.taskId = taskId;

  const { name, expiration } = ctx.args.input;

  if (expiration < 1 || expiration > 30) {
    util.error('Expiration must be between 1 and 30 days', 'ValidationError');
  }

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
        name: taskId,
        stateMachineArn: ctx.env.ASSIGN_ACCOUNT_STATE_MACHINE_ARN,
        input: JSON.stringify({
          taskId: taskId,
          name: name,
          expiration: expiration,
          identity: {
            userId: identity['custom:userId'],
            username: identity['custom:username'],
            email: identity.email,
          },
        }),
      }),
    },
  };
};

export const response = (ctx: Context) => {
  return {
    taskId: ctx.stash.taskId,
  };
};
