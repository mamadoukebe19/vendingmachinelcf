import {
  AuthSession,
  fetchAuthSession,
  signInWithRedirect,
} from 'aws-amplify/auth';
import { useEffect, useState } from 'react';
import { Amplify, ResourcesConfig } from 'aws-amplify';
import Layout, { Content, Header } from 'antd/es/layout/layout';
import { Avatar, Menu, Spin, theme } from 'antd';
import { BrowserRouter, Route, Routes } from 'react-router';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { GraphQLContext } from './providers/graphql';
import { generateClient } from 'aws-amplify/api';
import { V6Client } from '@aws-amplify/api-graphql';
import Home from './Home';

const queryClient = new QueryClient();

const authenticate = async () => {
  const response = await fetch('./config.json');
  const config = (await response.json()) as ResourcesConfig;
  Amplify.configure(config);
};

function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [user, setUser] = useState<{ username: string } | null>(null);
  const [graphQLClient, setGraphQLClient] = useState<V6Client | null>(null);

  useEffect(() => {
    authenticate()
      .then(() => fetchAuthSession())
      .then((session) => {
        if (session.tokens) {
          setSession(session);
          setUser({
            username: session.tokens?.idToken?.payload[
              'custom:username'
            ] as string,
          });
          const idToken = session.tokens?.idToken?.toString();
          if (!idToken) {
            return;
          }
          const client = generateClient({
            headers: async () => {
              return {
                Authorization: idToken,
              };
            },
          });
          setGraphQLClient(client);
        } else {
          signInWithRedirect({
            provider: {
              custom: 'aws-sso',
            },
          });
        }
      });
  }, []);

  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  if (!session || !queryClient || !graphQLClient) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          flexDirection: 'column',
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  const menu = [
    {
      key: 'home',
      label: 'Home',
    },
  ];

  return (
    <div
      style={{
        minHeight: '100vh',
      }}
    >
      <QueryClientProvider client={queryClient}>
        <GraphQLContext.Provider value={graphQLClient}>
          <BrowserRouter>
            <Layout
              className="App"
              style={{
                minHeight: '100vh',
              }}
            >
              <Header style={{ display: 'flex', alignItems: 'center' }}>
                <Menu
                  theme="dark"
                  mode="horizontal"
                  defaultSelectedKeys={['home']}
                  items={menu}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <Avatar
                  style={{
                    backgroundColor: '#ffbf00',
                    color: '#000000',
                    verticalAlign: 'middle',
                  }}
                  size="large"
                >
                  {user?.username?.toUpperCase().substring(0, 1)}
                </Avatar>
              </Header>
              <Content style={{ padding: '0 48px' }}>
                <div
                  style={{
                    background: colorBgContainer,
                    minHeight: 280,
                    padding: 24,
                    borderRadius: borderRadiusLG,
                  }}
                >
                  <Routes>
                    <Route path="/" element={<Home />} />
                  </Routes>
                </div>
              </Content>
            </Layout>
          </BrowserRouter>
        </GraphQLContext.Provider>
      </QueryClientProvider>
    </div>
  );
}

export default App;
