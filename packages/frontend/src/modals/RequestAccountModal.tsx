import {
  Button,
  Form,
  FormProps,
  Input,
  InputNumber,
  Modal,
  Result,
} from 'antd';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useRequestAccount } from '../queries';
import { GraphQLContext } from '../providers/graphql';
import { Subscription } from 'rxjs';
import { GraphqlSubscriptionMessage } from '@aws-amplify/api-graphql';
import { faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useQueryClient } from '@tanstack/react-query';

type RequestAccountModalProps = {
  open: boolean;
  onClose: () => void;
};

type FieldType = {
  name: string;
  expiration: number;
};

type OnAccountAssigned = {
  onAccountAssigned: {
    taskId: string;
    status: 'FAILED' | 'SUCCESS';
    message?: string;
    details?: {
      accountId: string;
      name: string;
      expiresAt: string;
    };
  };
};

function RequestAccountModal(props: RequestAccountModalProps) {
  const { open, onClose } = props;

  const [form] = Form.useForm();

  const queryClient = useQueryClient();
  const [subscription, setSubscription] = useState<Subscription>();
  const [subscriptionResult, setSubscriptionResult] = useState<
    OnAccountAssigned['onAccountAssigned'] | undefined
  >();
  const [isSubscribing, setIsSubscribing] = useState(false);
  const client = useContext(GraphQLContext);
  const { data, isPending, mutate } = useRequestAccount();
  const closeAndReset = useCallback(() => {
    onClose();
    form.resetFields();
    setSubscriptionResult(undefined);
    setIsSubscribing(false);
    setSubscription(undefined);
    if (subscription) {
      subscription.unsubscribe();
    }
  }, [form, onClose, subscription]);

  useEffect(() => {
    let subscription: Subscription | undefined;
    if (data) {
      (async () => {
        const result = await client?.graphql({
          query: `
          subscription OnAccountAssigned ($taskId: String!) {
            onAccountAssigned(taskId: $taskId) {
              taskId
              status
              message
              details {
                accountId
                name
                expiresAt
              }
            }
          }`,
          variables: {
            taskId: data.taskId,
          },
        });

        if (result && 'subscribe' in result) {
          setIsSubscribing(true);
          subscription = result.subscribe(
            (data: GraphqlSubscriptionMessage<OnAccountAssigned>) => {
              const { details, status } = data.data.onAccountAssigned;
              setIsSubscribing(false);
              subscription?.unsubscribe();
              setSubscriptionResult(data.data.onAccountAssigned);
              if (status === 'SUCCESS' && details) {
                queryClient.setQueryData(['myAccounts'], (old: unknown[]) => [
                  ...old,
                  {
                    accountId: details?.accountId,
                    name: details?.name,
                    expiresAt: details?.expiresAt,
                  },
                ]);
              }
            },
          );
          setSubscription(subscription);
        }
      })();
    }

    return () => {
      if (subscription) {
        subscription.unsubscribe();
        setSubscription(undefined);
      }
    };
  }, [client, data, queryClient]);

  const requestAccount = useCallback<
    NonNullable<FormProps<FieldType>['onFinish']>
  >(
    (values) => {
      setIsSubscribing(true);
      mutate({ name: values.name, expiration: values.expiration });
    },
    [mutate],
  );

  return (
    <>
      <Modal
        title="Request an account"
        open={open}
        onOk={subscriptionResult ? closeAndReset : form.submit}
        confirmLoading={isPending || isSubscribing}
        onCancel={closeAndReset}
      >
        {subscriptionResult?.status === 'SUCCESS' ? (
          <Result
            status="success"
            title="You account is ready!"
            subTitle={`Account number: ${subscriptionResult.details?.accountId}.`}
            extra={[
              <Button
                type="primary"
                href={`https://bboure.awsapps.com/start/#/console?account_id=${subscriptionResult.details?.accountId}&role_name=AdministratorAccess`}
                target="_blank"
              >
                Open with SSO
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
              </Button>,
            ]}
          />
        ) : subscriptionResult?.status === 'FAILED' ? (
          <Result
            status="error"
            title="An error occurred"
            subTitle={subscriptionResult.message || 'Could not setup account'}
          />
        ) : (
          <Form
            form={form}
            labelCol={{ span: 8 }}
            wrapperCol={{ span: 16 }}
            style={{ maxWidth: 600 }}
            initialValues={{ remember: true }}
            onFinish={requestAccount}
            autoComplete="off"
          >
            <Form.Item<FieldType>
              label="Name"
              name="name"
              rules={[{ required: true, message: 'Give your account a name' }]}
            >
              <Input placeholder="AppSync POC" />
            </Form.Item>
            <Form.Item<FieldType>
              label="Expiration"
              name="expiration"
              initialValue={14}
              rules={[
                {
                  required: true,
                  message: 'Set an expiration in days',
                },
              ]}
            >
              <InputNumber
                style={{ width: '100%' }}
                suffix="days"
                min={1}
                max={30}
              />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </>
  );
}

export default RequestAccountModal;
