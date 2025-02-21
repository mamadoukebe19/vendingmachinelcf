import { useContext } from 'react';
import {
  DefaultError,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { GraphQLContext } from './providers/graphql';

export interface Account {
  accountId: string;
  expiresAt: string;
}

export const useMyAccounts = () => {
  const client = useContext(GraphQLContext);
  return useQuery<Account[]>({
    queryKey: ['myAccounts'],
    queryFn: async () => {
      const result = await client?.graphql({
        query: `query ListAccounts {
        listMyAccounts {
          items {
            accountId
            name
            expiresAt
          }
        }
      }`,
      });

      if (result && 'data' in result) {
        const accounts = result.data.listMyAccounts.items;

        return accounts;
      }

      return null;
    },
  });
};

type RequestAccountInput = {
  name: string;
  expiration: number;
};

export const useRequestAccount = () => {
  const client = useContext(GraphQLContext);

  return useMutation<{ taskId: string }, DefaultError, RequestAccountInput>({
    mutationFn: async (input) => {
      const result = await client?.graphql({
        query: `
        mutation RequestAccount($input: RequestAccountInput!) {
          requestAccount(input: $input) {
              taskId
          }
      }`,
        variables: {
          input: {
            name: input.name,
            expiration: input.expiration,
          },
        },
      });
      if (result && 'data' in result) {
        return result.data?.requestAccount;
      }

      return null;
    },
  });
};

export const useDestroyAccount = () => {
  const client = useContext(GraphQLContext);
  const queryClient = useQueryClient();
  return useMutation<boolean, DefaultError, { accountId: string }>({
    mutationFn: async (input) => {
      const result = await client?.graphql({
        query: `
          mutation DestroyAccount($input: DestroyAccountInput!) {
              destroyAccount(input: $input)
          }
        `,
        variables: {
          input: {
            accountId: input.accountId,
          },
        },
      });
      if (result && 'data' in result) {
        return result.data?.requestAccount;
      }

      return null;
    },
    onSuccess: (_, input) => {
      queryClient.setQueryData(['myAccounts'], (old: Account[]) =>
        old.filter((item) => item.accountId !== input.accountId),
      );
    },
  });
};
