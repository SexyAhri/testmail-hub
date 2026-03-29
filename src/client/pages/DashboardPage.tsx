import {
  AlertOutlined,
  InboxOutlined,
  MailOutlined,
  PaperClipOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { App, Button, Col, Row, Spin } from "antd";
import { useEffect, useMemo, useState } from "react";

import { getOverviewStats } from "../api";
import { InfoCard, MetricCard, MetricChart, PageHeader } from "../components";
import type { MetricChartDatum } from "../components";
import type { OverviewStats } from "../types";
import { normalizeApiError } from "../utils";

interface DashboardPageProps {
  domains: string[];
  mailboxDomain: string;
  onUnauthorized: () => void;
}

const INITIAL_STATS: OverviewStats = {
  active_mailboxes: 0,
  attachment_total: 0,
  deleted_email_total: 0,
  email_total: 0,
  error_total: 0,
  matched_email_total: 0,
  recent_daily: [],
  top_domains: [],
  top_senders: [],
};

function formatMonthDay(timestamp: Date) {
  const month = String(timestamp.getMonth() + 1).padStart(2, "0");
  const day = String(timestamp.getDate()).padStart(2, "0");
  return `${month}-${day}`;
}

function buildLastSevenDaysSeries(
  recentDaily: OverviewStats["recent_daily"],
): MetricChartDatum[] {
  const dailyMap = new Map(recentDaily.map(item => [item.day, item.value]));
  const output: MetricChartDatum[] = [];
  const now = new Date();

  for (let offset = 6; offset >= 0; offset -= 1) {
    const current = new Date(now);
    current.setHours(0, 0, 0, 0);
    current.setDate(now.getDate() - offset);

    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, "0");
    const day = String(current.getDate()).padStart(2, "0");
    const key = `${year}-${month}-${day}`;

    output.push({
      time: formatMonthDay(current),
      value: dailyMap.get(key) ?? 0,
    });
  }

  return output;
}

function buildRankingSeries(
  items: OverviewStats["top_domains"] | OverviewStats["top_senders"],
): MetricChartDatum[] {
  return items
    .slice()
    .sort((left, right) => right.value - left.value)
    .slice(0, 5)
    .map(item => ({
      time: item.label.length > 18 ? `${item.label.slice(0, 18)}...` : item.label,
      value: item.value,
    }));
}

export default function DashboardPage({
  domains,
  mailboxDomain,
  onUnauthorized,
}: DashboardPageProps) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<OverviewStats>(INITIAL_STATS);

  useEffect(() => {
    void loadStats();
  }, []);

  async function loadStats() {
    setLoading(true);
    try {
      setStats(await getOverviewStats());
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    } finally {
      setLoading(false);
    }
  }

  const recentDailyData = useMemo(
    () => buildLastSevenDaysSeries(stats.recent_daily),
    [stats.recent_daily],
  );

  const topSenderChartData = useMemo(
    () => buildRankingSeries(stats.top_senders),
    [stats.top_senders],
  );

  const topDomainChartData = useMemo(
    () => buildRankingSeries(stats.top_domains),
    [stats.top_domains],
  );

  const systemInfoItems = useMemo(
    () => [
      { label: "活跃邮箱", value: stats.active_mailboxes },
      { label: "有效邮件", value: stats.email_total },
      { label: "命中邮件", value: stats.matched_email_total },
      { label: "附件总量", value: stats.attachment_total },
      { label: "回收站邮件", value: stats.deleted_email_total },
      { label: "错误事件", value: stats.error_total },
      { label: "默认域名", value: mailboxDomain || "--" },
      { label: "接入域名数", value: domains.length },
    ],
    [domains.length, mailboxDomain, stats.active_mailboxes, stats.attachment_total, stats.deleted_email_total, stats.email_total, stats.error_total, stats.matched_email_total],
  );

  if (loading && stats === INITIAL_STATS) {
    return (
      <div style={{ textAlign: "center", padding: 100 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="监控中心"
        subtitle="邮件、附件、回收站、错误事件和活跃邮箱的整体概览。"
        extra={(
          <Button onClick={() => void loadStats()} loading={loading}>
            刷新概览
          </Button>
        )}
        tags={[
          { label: mailboxDomain || "未设置默认域名", color: "blue" },
          { label: `${domains.length} 个接入域名`, color: "processing" },
        ]}
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <MetricCard
            title="有效邮件"
            value={stats.email_total}
            icon={<MailOutlined />}
            percent={Math.min(100, stats.email_total)}
            color="#1890ff"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <MetricCard
            title="命中规则"
            value={stats.matched_email_total}
            icon={<ThunderboltOutlined />}
            percent={stats.email_total ? (stats.matched_email_total / stats.email_total) * 100 : 0}
            color="#52c41a"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <MetricCard
            title="附件总量"
            value={stats.attachment_total}
            icon={<PaperClipOutlined />}
            percent={Math.min(100, stats.attachment_total)}
            color="#faad14"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <MetricCard
            title="错误事件"
            value={stats.error_total}
            icon={<AlertOutlined />}
            percent={Math.min(100, stats.error_total * 10)}
            color="#ff4d4f"
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={16}>
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <MetricChart
                title="近 7 天收件趋势"
                data={recentDailyData}
                color="#1890ff"
                emptyText="暂无近期收件趋势"
                height={220}
              />
            </Col>
            <Col span={24}>
              <MetricChart
                title="高频发件人"
                data={topSenderChartData}
                color="#52c41a"
                emptyText="暂无发件人统计"
                height={220}
              />
            </Col>
            <Col span={24}>
              <MetricChart
                title="高频发件域名"
                data={topDomainChartData}
                color="#faad14"
                emptyText="暂无域名统计"
                height={220}
              />
            </Col>
          </Row>
        </Col>
        <Col xs={24} lg={8}>
          <InfoCard
            title="系统状态"
            icon={<InboxOutlined />}
            color="#1890ff"
            items={systemInfoItems}
          />
        </Col>
      </Row>
    </div>
  );
}
