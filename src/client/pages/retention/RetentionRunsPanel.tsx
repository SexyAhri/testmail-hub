import {
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  FieldTimeOutlined,
  PartitionOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { Alert, Button, Dropdown, Select, Space, Tag } from "antd";
import { useMemo } from "react";
import type { ColumnsType } from "antd/es/table";

import {
  DataTable,
  MetricCard,
  MetricGrid,
  SearchToolbar,
} from "../../components";
import type {
  PaginationPayload,
  RetentionJobRunRecord,
  RetentionJobRunSummary,
} from "../../types";
import { formatDateTime } from "../../utils";
import type { RetentionRunFilters } from "./retention-utils";
import {
  RETENTION_RUN_OPTIONS,
  asObject,
  formatDuration,
  formatSuccessRate,
  getSuccessRatePercent,
  renderRetentionJobActionTags,
} from "./retention-utils";

interface RetentionRunsPanelProps {
  canWrite: boolean;
  onRefresh: () => void;
  onRunFiltersChange: (updater: (current: RetentionRunFilters) => RetentionRunFilters) => void;
  onRunNow: (optionKey?: string) => void;
  onRunPageChange: (page: number) => void;
  onViewDetail: (record: RetentionJobRunRecord) => void;
  runFilters: RetentionRunFilters;
  runPage: number;
  runSummary: RetentionJobRunSummary;
  runSummaryLoading: boolean;
  runningNow: boolean;
  runs: PaginationPayload<RetentionJobRunRecord>;
  runsLoading: boolean;
}

export function RetentionRunsPanel({
  canWrite,
  onRefresh,
  onRunFiltersChange,
  onRunNow,
  onRunPageChange,
  onViewDetail,
  runFilters,
  runSummary,
  runSummaryLoading,
  runningNow,
  runs,
  runsLoading,
}: RetentionRunsPanelProps) {
  const recent24hSuccessRate = useMemo(
    () => formatSuccessRate(runSummary.recent_24h_success_count, runSummary.recent_24h_run_count),
    [runSummary],
  );
  const recent24hSuccessRatePercent = useMemo(
    () => getSuccessRatePercent(runSummary.recent_24h_success_count, runSummary.recent_24h_run_count),
    [runSummary],
  );
  const totalSuccessRatePercent = useMemo(
    () => getSuccessRatePercent(runSummary.total_success_count, runSummary.total_run_count),
    [runSummary],
  );
  const recent24hPurgedEmailCount = useMemo(
    () => runSummary.recent_24h_purged_active_email_count + runSummary.recent_24h_purged_deleted_email_count,
    [runSummary],
  );
  const lastRunLabel = useMemo(() => {
    if (!runSummary.last_run) return "-";
    return `${runSummary.last_run.status === "success" ? "成功" : "失败"} #${runSummary.last_run.id}`;
  }, [runSummary]);
  const recent24hAverageDuration = useMemo(
    () => formatDuration(runSummary.average_duration_ms_24h),
    [runSummary],
  );
  const lastRunColor = runSummary.last_run?.status === "failed" ? "#fa541c" : "#0f766e";
  const lastRunPercent = runSummary.last_run?.status === "failed" ? 25 : runSummary.last_run ? 100 : 0;

  const runColumns = useMemo<ColumnsType<RetentionJobRunRecord>>(
    () => [
      {
        dataIndex: "started_at",
        key: "started_at",
        title: "开始时间",
        width: 176,
        render: value => formatDateTime(value),
      },
      {
        dataIndex: "status",
        key: "status",
        title: "状态",
        width: 100,
        render: value => <Tag color={value === "success" ? "success" : "error"}>{value === "success" ? "成功" : "失败"}</Tag>,
      },
      {
        dataIndex: "trigger_source",
        key: "trigger_source",
        title: "触发来源",
        width: 120,
        render: value => <Tag color="processing">{value || "scheduled"}</Tag>,
      },
      {
        key: "requested_actions",
        title: "执行动作",
        width: 180,
        render: (_value, record) => renderRetentionJobActionTags(asObject(record.detail_json)?.requested_actions),
      },
      {
        dataIndex: "scanned_email_count",
        key: "scanned_email_count",
        title: "扫描邮件",
        width: 110,
      },
      {
        dataIndex: "archived_email_count",
        key: "archived_email_count",
        title: "归档邮件",
        width: 100,
      },
      {
        dataIndex: "purged_active_email_count",
        key: "purged_active_email_count",
        title: "清理普通邮件",
        width: 120,
      },
      {
        dataIndex: "purged_deleted_email_count",
        key: "purged_deleted_email_count",
        title: "清理已删邮件",
        width: 120,
      },
      {
        dataIndex: "expired_mailbox_count",
        key: "expired_mailbox_count",
        title: "停用邮箱",
        width: 100,
      },
      {
        dataIndex: "duration_ms",
        key: "duration_ms",
        title: "耗时",
        width: 100,
        render: value => formatDuration(value),
      },
      {
        key: "detail",
        title: "详情",
        width: 96,
        render: (_value, record) => (
          <Button type="link" size="small" onClick={() => onViewDetail(record)}>
            查看
          </Button>
        ),
      },
    ],
    [onViewDetail],
  );

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <MetricGrid>
        <MetricCard title="总执行数" value={runSummary.total_run_count} icon={<PartitionOutlined />} color="#1677ff" percent={totalSuccessRatePercent} />
        <MetricCard
          title="最近 24h 成功率"
          value={recent24hSuccessRate}
          icon={<ExclamationCircleOutlined />}
          color={runSummary.recent_24h_failed_count > 0 ? "#fa541c" : "#16a34a"}
          percent={recent24hSuccessRatePercent}
        />
        <MetricCard
          title="最近 24h 生命周期动作"
          value={`归${runSummary.recent_24h_archived_email_count} / 清${recent24hPurgedEmailCount} / 停${runSummary.recent_24h_expired_mailbox_count}`}
          icon={<FieldTimeOutlined />}
          color="#7c3aed"
          percent={runSummary.recent_24h_run_count > 0 ? 100 : 0}
        />
        <MetricCard
          title="最近 24h 平均耗时"
          value={recent24hAverageDuration}
          icon={<ClockCircleOutlined />}
          color="#0f766e"
          percent={runSummary.average_duration_ms_24h ? 100 : 0}
        />
        <MetricCard
          title="最近一次执行"
          value={lastRunLabel}
          icon={<ReloadOutlined />}
          color={lastRunColor}
          percent={lastRunPercent}
        />
        <MetricCard
          title="连续失败次数"
          value={runSummary.consecutive_failure_count}
          icon={<ExclamationCircleOutlined />}
          color={runSummary.consecutive_failure_count > 0 ? "#fa541c" : "#16a34a"}
          percent={runSummary.consecutive_failure_count > 0 ? Math.min(100, runSummary.consecutive_failure_count * 20) : 100}
        />
      </MetricGrid>

      {runSummary.total_run_count === 0 ? (
        <Alert
          showIcon
          type="info"
          message="当前还没有生命周期任务执行记录。"
          description="可以先手动执行一次任务，确认策略、清理链路和审计留痕都正常。"
        />
      ) : runSummary.consecutive_failure_count > 0 ? (
        <Alert
          showIcon
          type="warning"
          message="最近生命周期任务存在连续失败，请优先检查执行链路。"
          description={`最近失败时间：${runSummary.last_failed_at ? formatDateTime(runSummary.last_failed_at) : "-"}；连续失败 ${runSummary.consecutive_failure_count} 次；最近成功时间：${runSummary.last_success_at ? formatDateTime(runSummary.last_success_at) : "-"}`}
        />
      ) : runSummary.recent_24h_run_count === 0 ? (
        <Alert
          showIcon
          type="info"
          message="最近 24 小时没有生命周期任务执行记录。"
          description="如果系统应该按计划定时执行，请检查调度链路；也可以先手动执行一次确认当前策略生效情况。"
        />
      ) : null}

      <SearchToolbar>
        <Space wrap size={12} style={{ width: "100%" }}>
          <Select
            allowClear
            placeholder="执行状态"
            style={{ width: 140 }}
            value={runFilters.status ?? undefined}
            options={[
              { label: "成功", value: "success" },
              { label: "失败", value: "failed" },
            ]}
            onChange={value => {
              onRunPageChange(1);
              onRunFiltersChange(current => ({ ...current, status: value ?? null }));
            }}
          />

          <Select
            allowClear
            placeholder="触发来源"
            style={{ width: 160 }}
            value={runFilters.trigger_source ?? undefined}
            options={[
              { label: "manual", value: "manual" },
              { label: "scheduled", value: "scheduled" },
            ]}
            onChange={value => {
              onRunPageChange(1);
              onRunFiltersChange(current => ({ ...current, trigger_source: value ?? null }));
            }}
          />

          <Button
            icon={<ReloadOutlined />}
            loading={runsLoading || runSummaryLoading}
            onClick={onRefresh}
          >
            刷新执行记录
          </Button>

          {canWrite ? (
            <Dropdown.Button
              type="primary"
              icon={<ReloadOutlined />}
              loading={runningNow}
              onClick={() => onRunNow()}
              menu={{
                items: RETENTION_RUN_OPTIONS.filter(option => option.key !== "full").map(option => ({
                  key: option.key,
                  label: (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span>{option.label}</span>
                      <span style={{ color: "#8c8c8c", fontSize: 12 }}>{option.description}</span>
                    </div>
                  ),
                })),
                onClick: ({ key }) => {
                  onRunNow(String(key || "full"));
                },
              }}
            >
              立即执行
            </Dropdown.Button>
          ) : null}

          <Button
            onClick={() => {
              onRunPageChange(1);
              onRunFiltersChange(() => ({ status: null, trigger_source: null }));
            }}
          >
            重置筛选
          </Button>
        </Space>
      </SearchToolbar>

      <DataTable<RetentionJobRunRecord>
        rowKey="id"
        loading={runsLoading}
        columns={runColumns}
        dataSource={runs.items}
        current={runs.page}
        pageSize={runs.pageSize}
        total={runs.total}
        onPageChange={onRunPageChange}
        cardTitle="执行记录"
      />
    </Space>
  );
}
