import { createContext } from 'react';
import { V6Client } from '@aws-amplify/api-graphql';

export const GraphQLContext = createContext<V6Client | null>(null);
