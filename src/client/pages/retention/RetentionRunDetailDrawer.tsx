import { Alert, Collapse, Descriptions, Space, Tag, Typography } from "antd";
import { useMemo, type ReactNode } from "react";

import { DetailDrawer } from "../../components";
import type { RetentionJobRunRecord } from "../../types";
import { formatDateTime } from "../../utils";
import {
  asObject,
  formatDuration,
  formatOptionalDateTime,
  normalizeRetentionJobActions,
  readBoolean,
  readExpiredMailboxSamples,
  readNumber,
  readNumberArray,
  readRetentionEmailSamples,
  readRetentionScopeSummarySamples,
  readString,
  renderRetentionJobActionTags,
  renderSampleTruncatedHint,
  renderScopeTags,
  stringifyJson,
} from "./retention-utils";

const { Paragraph, Text } = Typography;

interface RetentionRunDetailDrawerProps {
  onClose: () => void;
  runDetail: RetentionJobRunRecord | null;
}

export function RetentionRunDetailDrawer({
  onClose,
  runDetail,
}: RetentionRunDetailDrawerProps) {
  const runDetailPayload = useMemo(() => asObject(runDetail?.detail_json), [runDetail]);
  const runTriggeredBy = useMemo(() => asObject(runDetailPayload?.triggered_by), [runDetailPayload]);
  const runRequestedActions = useMemo(
    () => normalizeRetentionJobActions(runDetailPayload?.requested_actions),
    [runDetailPayload],
  );
  const runAffectedProjectIds = useMemo(
    () => readNumberArray(runDetailPayload, "affected_project_ids"),
    [runDetailPayload],
  );
  const runScopeSummaries = useMemo(
    () => readRetentionScopeSummarySamples(runDetailPayload, "scope_summaries"),
    [runDetailPayload],
  );
  const runArchivedEmailSamples = useMemo(
    () => readRetentionEmailSamples(runDetailPayload, "archived_email_samples"),
    [runDetailPayload],
  );
  const runPurgedActiveEmailSamples = useMemo(
    () => readRetentionEmailSamples(runDetailPayload, "purged_active_email_samples"),
    [runDetailPayload],
  );
  const runPurgedDeletedEmailSamples = useMemo(
    () => readRetentionEmailSamples(runDetailPayload, "purged_deleted_email_samples"),
    [runDetailPayload],
  );
  const runExpiredMailboxSamples = useMemo(
    () => readExpiredMailboxSamples(runDetailPayload, "expired_mailbox_samples"),
    [runDetailPayload],
  );
  const runScopeSummaryTruncated = useMemo(
    () => readBoolean(runDetailPayload, "scope_summary_truncated"),
    [runDetailPayload],
  );
  const runArchivedEmailSampleTruncated = useMemo(
    () => readBoolean(runDetailPayload, "archived_email_sample_truncated"),
    [runDetailPayload],
  );
  const runPurgedActiveEmailSampleTruncated = useMemo(
    () => readBoolean(runDetailPayload, "purged_active_email_sample_truncated"),
    [runDetailPayload],
  );
  const runPurgedDeletedEmailSampleTruncated = useMemo(
    () => readBoolean(runDetailPayload, "purged_deleted_email_sample_truncated"),
    [runDetailPayload],
  );
  const runExpiredMailboxSampleTruncated = useMemo(
    () => readBoolean(runDetailPayload, "expired_mailbox_sample_truncated"),
    [runDetailPayload],
  );

  const runObservationPanels = useMemo(() => {
    const cardStyle = {
      background: "#fff",
      border: "1px solid #f0f0f0",
      borderRadius: 8,
      padding: 10,
    } as const;

    const panels: Array<{ children: ReactNode; key: string; label: string }> = [];

    if (runScopeSummaries.length > 0) {
      panels.push({
        key: "scope_summaries",
        label: `作用域摘要（${runScopeSummaries.length}${runScopeSummaryTruncated ? "+" : ""}）`,
        children: (
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            {runScopeSummaries.map((summary, index) => (
              <div
                key={`scope:${summary.project_id ?? "all"}:${summary.environment_id ?? "all"}:${summary.mailbox_pool_id ?? "all"}:${index}`}
                style={cardStyle}
              >
                <Space direction="vertical" size={8} style={{ width: "100%" }}>
                  {renderScopeTags(summary)}
                  <Space size={[6, 6]} wrap>
                    <Tag color="purple">自动归档 {summary.archived_email_count}</Tag>
                    <Tag color="volcano">清理普通邮件 {summary.purged_active_email_count}</Tag>
                    <Tag color="red">清理已删邮件 {summary.purged_deleted_email_count}</Tag>
                  </Space>
                </Space>
              </div>
            ))}
            {renderSampleTruncatedHint(runScopeSummaryTruncated, runScopeSummaries.length)}
          </Space>
        ),
      });
    }

    if (runArchivedEmailSamples.length > 0) {
      panels.push({
        key: "archived_email_samples",
        label: `自动归档样本（${runArchivedEmailSamples.length}${runArchivedEmailSampleTruncated ? "+" : ""}）`,
        children: (
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            {runArchivedEmailSamples.map(sample => (
              <div key={`archived:${sample.message_id}:${sample.received_at ?? "none"}`} style={cardStyle}>
                <Space direction="vertical" size={8} style={{ width: "100%" }}>
                  <Space size={[6, 6]} wrap>
                    <Text code>{sample.message_id}</Text>
                    {renderScopeTags(sample)}
                  </Space>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    接收时间: {formatOptionalDateTime(sample.received_at)}
                  </Text>
                </Space>
              </div>
            ))}
            {renderSampleTruncatedHint(runArchivedEmailSampleTruncated, runArchivedEmailSamples.length)}
          </Space>
        ),
      });
    }

    if (runPurgedActiveEmailSamples.length > 0) {
      panels.push({
        key: "purged_active_email_samples",
        label: `普通邮件清理样本（${runPurgedActiveEmailSamples.length}${runPurgedActiveEmailSampleTruncated ? "+" : ""}）`,
        children: (
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            {runPurgedActiveEmailSamples.map(sample => (
              <div key={`purged-active:${sample.message_id}:${sample.received_at ?? "none"}`} style={cardStyle}>
                <Space direction="vertical" size={8} style={{ width: "100%" }}>
                  <Space size={[6, 6]} wrap>
                    <Text code>{sample.message_id}</Text>
                    {renderScopeTags(sample)}
                  </Space>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    接收时间: {formatOptionalDateTime(sample.received_at)}
                  </Text>
                </Space>
              </div>
            ))}
            {renderSampleTruncatedHint(runPurgedActiveEmailSampleTruncated, runPurgedActiveEmailSamples.length)}
          </Space>
        ),
      });
    }

    if (runPurgedDeletedEmailSamples.length > 0) {
      panels.push({
        key: "purged_deleted_email_samples",
        label: `已删邮件清理样本（${runPurgedDeletedEmailSamples.length}${runPurgedDeletedEmailSampleTruncated ? "+" : ""}）`,
        children: (
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            {runPurgedDeletedEmailSamples.map(sample => (
              <div key={`purged-deleted:${sample.message_id}:${sample.deleted_at ?? "none"}`} style={cardStyle}>
                <Space direction="vertical" size={8} style={{ width: "100%" }}>
                  <Space size={[6, 6]} wrap>
                    <Text code>{sample.message_id}</Text>
                    {renderScopeTags(sample)}
                  </Space>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    已删时间: {formatOptionalDateTime(sample.deleted_at)}
                  </Text>
                </Space>
              </div>
            ))}
            {renderSampleTruncatedHint(runPurgedDeletedEmailSampleTruncated, runPurgedDeletedEmailSamples.length)}
          </Space>
        ),
      });
    }

    if (runExpiredMailboxSamples.length > 0) {
      panels.push({
        key: "expired_mailbox_samples",
        label: `停用邮箱样本（${runExpiredMailboxSamples.length}${runExpiredMailboxSampleTruncated ? "+" : ""}）`,
        children: (
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            {runExpiredMailboxSamples.map(sample => (
              <div key={`expired-mailbox:${sample.address}:${sample.expires_at ?? "none"}`} style={cardStyle}>
                <Space direction="vertical" size={8} style={{ width: "100%" }}>
                  <Space size={[6, 6]} wrap>
                    <Text code>{sample.address}</Text>
                    {renderScopeTags(sample)}
                  </Space>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    过期时间: {formatOptionalDateTime(sample.expires_at)}
                  </Text>
                </Space>
              </div>
            ))}
            {renderSampleTruncatedHint(runExpiredMailboxSampleTruncated, runExpiredMailboxSamples.length)}
          </Space>
        ),
      });
    }

    return panels;
  }, [
    runArchivedEmailSampleTruncated,
    runArchivedEmailSamples,
    runExpiredMailboxSampleTruncated,
    runExpiredMailboxSamples,
    runPurgedActiveEmailSampleTruncated,
    runPurgedActiveEmailSamples,
    runPurgedDeletedEmailSampleTruncated,
    runPurgedDeletedEmailSamples,
    runScopeSummaries,
    runScopeSummaryTruncated,
  ]);

  return (
    <DetailDrawer
      title="执行记录详情"
      open={Boolean(runDetail)}
      onClose={onClose}
      width="42vw"
    >
      {runDetail ? (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="状态">
              <Tag color={runDetail.status === "success" ? "success" : "error"}>
                {runDetail.status === "success" ? "成功" : "失败"}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="触发来源">{runDetail.trigger_source}</Descriptions.Item>
            <Descriptions.Item label="执行动作" span={2}>
              {renderRetentionJobActionTags(runRequestedActions, true)}
            </Descriptions.Item>
            <Descriptions.Item label="触发账号" span={2}>
              {runTriggeredBy ? (
                <Space size={[4, 4]} wrap>
                  <span>
                    {readString(runTriggeredBy, "display_name") || readString(runTriggeredBy, "username") || "-"}
                    {readString(runTriggeredBy, "username")
                      && readString(runTriggeredBy, "display_name")
                      && readString(runTriggeredBy, "username") !== readString(runTriggeredBy, "display_name")
                      ? ` (${readString(runTriggeredBy, "username")})`
                      : ""}
                  </span>
                  {readString(runTriggeredBy, "role") ? (
                    <Tag>{readString(runTriggeredBy, "role")}</Tag>
                  ) : null}
                  {readString(runTriggeredBy, "auth_kind") ? (
                    <Tag color="processing">{readString(runTriggeredBy, "auth_kind")}</Tag>
                  ) : null}
                </Space>
              ) : (
                "-"
              )}
            </Descriptions.Item>
            <Descriptions.Item label="影响项目数">
              {readNumber(runDetailPayload, "affected_project_count") ?? "-"}
            </Descriptions.Item>
            <Descriptions.Item label="开始时间">{formatDateTime(runDetail.started_at)}</Descriptions.Item>
            <Descriptions.Item label="结束时间">
              {runDetail.finished_at ? formatDateTime(runDetail.finished_at) : "-"}
            </Descriptions.Item>
            <Descriptions.Item label="执行耗时">{formatDuration(runDetail.duration_ms)}</Descriptions.Item>
            <Descriptions.Item label="应用策略数">{runDetail.applied_policy_count}</Descriptions.Item>
            <Descriptions.Item label="扫描邮件">{runDetail.scanned_email_count}</Descriptions.Item>
            <Descriptions.Item label="自动归档">{runDetail.archived_email_count}</Descriptions.Item>
            <Descriptions.Item label="停用邮箱">{runDetail.expired_mailbox_count}</Descriptions.Item>
            <Descriptions.Item label="清理普通邮件">{runDetail.purged_active_email_count}</Descriptions.Item>
            <Descriptions.Item label="清理已删邮件">{runDetail.purged_deleted_email_count}</Descriptions.Item>
            <Descriptions.Item label="影响项目 ID" span={2}>
              {runAffectedProjectIds.length > 0 ? runAffectedProjectIds.join(", ") : "-"}
            </Descriptions.Item>
          </Descriptions>

          {runDetail.error_message ? (
            <Alert
              showIcon
              type="error"
              message="执行失败"
              description={runDetail.error_message}
            />
          ) : null}

          {runObservationPanels.length > 0 ? (
            <div>
              <Text strong>执行观测样本</Text>
              <Collapse
                size="small"
                style={{ marginTop: 8 }}
                items={runObservationPanels}
              />
            </div>
          ) : (
            <Alert
              showIcon
              type="info"
              message="本次执行没有产生可展示的作用域或样本记录。"
            />
          )}

          <div>
            <Text strong>执行上下文</Text>
            <Paragraph
              copyable
              style={{
                marginBottom: 0,
                marginTop: 8,
                padding: 12,
                background: "#fafafa",
                borderRadius: 8,
                border: "1px solid #f0f0f0",
                whiteSpace: "pre-wrap",
              }}
            >
              {stringifyJson(runDetail.detail_json)}
            </Paragraph>
          </div>
        </Space>
      ) : null}
    </DetailDrawer>
  );
}
