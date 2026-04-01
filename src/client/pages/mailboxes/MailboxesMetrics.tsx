import {
  InboxOutlined,
  MailOutlined,
  SyncOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";

import { MetricCard, MetricGrid } from "../../components";

interface MailboxesMetricsProps {
  assignedCount: number;
  enabledCount: number;
  mailboxCount: number;
  routeValue: number | string;
  syncConfigured: boolean;
}

export function MailboxesMetrics({
  assignedCount,
  enabledCount,
  mailboxCount,
  routeValue,
  syncConfigured,
}: MailboxesMetricsProps) {
  return (
    <MetricGrid>
      <MetricCard
        title="邮箱总数"
        value={mailboxCount}
        icon={<InboxOutlined />}
        percent={Math.min(100, mailboxCount * 10)}
        color="#1890ff"
      />
      <MetricCard
        title="已启用"
        value={enabledCount}
        icon={<ThunderboltOutlined />}
        percent={mailboxCount ? 100 : 0}
        color="#52c41a"
      />
      <MetricCard
        title="已分配"
        value={assignedCount}
        icon={<MailOutlined />}
        percent={mailboxCount ? (assignedCount / mailboxCount) * 100 : 0}
        color="#fa8c16"
      />
      <MetricCard
        title={syncConfigured ? "Cloudflare 路由" : "可用域名"}
        value={routeValue}
        icon={<SyncOutlined />}
        percent={100}
        color="#722ed1"
      />
    </MetricGrid>
  );
}
