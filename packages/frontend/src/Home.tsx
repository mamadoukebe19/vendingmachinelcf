import {
  Alert,
  Button,
  Empty,
  FloatButton,
  Modal,
  Space,
  Table,
  TableProps,
  Tag,
  Typography,
} from 'antd';
import { DateTime } from 'luxon';
import { useCallback, useState } from 'react';
import { Account, useDestroyAccount, useMyAccounts } from './queries';
import Countdown from 'antd/es/statistic/Countdown';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowUpRightFromSquare,
  faBomb,
  faPlus,
} from '@fortawesome/free-solid-svg-icons';
import RequestAccountModal from './modals/RequestAccountModal';

const { Text, Paragraph } = Typography;

function Home() {
  const [requestAccountOpen, setRequestAccountOpen] = useState(false);
  const requestAccount = useCallback(() => {
    setRequestAccountOpen(true);
  }, []);

  const { mutate: destroyAccount } = useDestroyAccount();
  const [modal, contextHolder] = Modal.useModal();

  const { isLoading, data: accounts } = useMyAccounts();

  const columns: TableProps<Account>['columns'] = [
    {
      title: 'Account Id',
      dataIndex: 'accountId',
      key: 'accountId',
      width: 200,
      render: (text) => (
        <Tag>
          <Text copyable>{text}</Text>
        </Tag>
      ),
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Expires At',
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      render: (text) => {
        const expiresAt = DateTime.fromISO(text);
        return (
          <Space>
            {expiresAt.toFormat('ff')}
            <Countdown
              valueStyle={{ fontSize: 14 }}
              value={DateTime.fromISO(text).toMillis()}
              format="(D day[s], HH:mm:ss)"
            />
          </Space>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space>
          <Button
            type="primary"
            href={`https://bboure.awsapps.com/start/#/console?account_id=${record.accountId}&role_name=AdministratorAccess`}
            target="_blank"
          >
            Open with SSO
            <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
          </Button>
          <Button
            onClick={async () => {
              const confirmed = await modal.confirm({
                title: `Are you sure?`,
                content: (
                  <Space direction="vertical">
                    <Paragraph>
                      Account <Tag>{record.accountId}</Tag> will be destroyed
                      and released for future use.
                    </Paragraph>
                    <Alert
                      type="warning"
                      showIcon
                      description={
                        <Paragraph strong>
                          All resources in this account will be torn down
                          forever.
                        </Paragraph>
                      }
                    />
                  </Space>
                ),
              });
              if (confirmed) {
                destroyAccount({ accountId: record.accountId });
              }
            }}
            icon={<FontAwesomeIcon icon={faBomb} />}
            danger
          >
            Blow it up now
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <>
      {contextHolder}
      <RequestAccountModal
        open={requestAccountOpen}
        onClose={() => {
          setRequestAccountOpen(false);
        }}
      />
      <Table<Account>
        loading={isLoading}
        columns={columns}
        dataSource={
          accounts?.map((item, index) => ({
            key: `${index}`,
            ...item,
          })) || []
        }
        locale={{
          emptyText: (
            <Empty description="No account">
              <Button type="primary" onClick={requestAccount}>
                Request an account
              </Button>
            </Empty>
          ),
        }}
        pagination={false}
      />
      <FloatButton
        tooltip="Request Account"
        type="primary"
        icon={<FontAwesomeIcon icon={faPlus} />}
        onClick={requestAccount}
      />
    </>
  );
}

export default Home;
