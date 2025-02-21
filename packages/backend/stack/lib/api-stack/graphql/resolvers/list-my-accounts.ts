import {
  AppSyncIdentityCognito,
  Context,
  DynamoDBQueryRequest,
} from '@aws-appsync/utils';
import { query } from '@aws-appsync/utils/dynamodb';

export const request = (ctx: Context): DynamoDBQueryRequest => {
  const taskId = util.autoId();
  ctx.stash.taskId = taskId;

  const identity = (ctx.identity as AppSyncIdentityCognito).claims;

  return query<{ assignedTo: string }>({
    index: 'userIndex',
    query: {
      assignedTo: { eq: identity['custom:userId'] },
    },
  });
};

export const response = (ctx: Context) => {
  return ctx.result;
};
