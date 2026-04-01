import {
  CheckCircleOutlined,
  EyeOutlined,
  FolderOpenOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UserOutlined,
  WarningOutlined,
} from "@ant-design/icons";

import { MetricCard, MetricGrid } from "../../components";

interface GovernanceSummary {
  highPrivilegeCount: number;
  missingNoteCount: number;
  multiProjectCount: number;
  pendingLoginAfterChangeCount: number;
  recentlyChangedCount: number;
}

interface AdminsMetricsProps {
  boundCount: number;
  enabledCount: number;
  governanceSummary: GovernanceSummary;
  itemCount: number;
  total: number;
  viewerCount: number;
}

export function AdminsMetrics({
  boundCount,
  enabledCount,
  governanceSummary,
  itemCount,
  total,
  viewerCount,
}: AdminsMetricsProps) {
  return (
    <MetricGrid minItemWidth={220}>
      <MetricCard
        title="筛选结果总数"
        value={total}
        icon={<TeamOutlined />}
        percent={total > 0 ? 100 : 0}
        color="#1677ff"
      />
      <MetricCard
        title="当前页启用"
        value={enabledCount}
        icon={<CheckCircleOutlined />}
        percent={itemCount ? (enabledCount / itemCount) * 100 : 0}
        color="#16a34a"
      />
      <MetricCard
        title="当前页高权限"
        value={governanceSummary.highPrivilegeCount}
        icon={<SafetyCertificateOutlined />}
        percent={itemCount ? (governanceSummary.highPrivilegeCount / itemCount) * 100 : 0}
        color="#cf1322"
      />
      <MetricCard
        title="当前页跨项目"
        value={governanceSummary.multiProjectCount}
        icon={<FolderOpenOutlined />}
        percent={itemCount ? (governanceSummary.multiProjectCount / itemCount) * 100 : 0}
        color="#d48806"
      />
      <MetricCard
        title="变更后未登录"
        value={governanceSummary.pendingLoginAfterChangeCount}
        icon={<WarningOutlined />}
        percent={itemCount ? (governanceSummary.pendingLoginAfterChangeCount / itemCount) * 100 : 0}
        color="#fa8c16"
      />
      <MetricCard
        title="当前页缺备注"
        value={governanceSummary.missingNoteCount}
        icon={<UserOutlined />}
        percent={itemCount ? (governanceSummary.missingNoteCount / itemCount) * 100 : 0}
        color="#595959"
      />
      <MetricCard
        title="当前页项目级"
        value={boundCount}
        icon={<FolderOpenOutlined />}
        percent={itemCount ? (boundCount / itemCount) * 100 : 0}
        color="#d48806"
      />
      <MetricCard
        title="7天内变更"
        value={governanceSummary.recentlyChangedCount}
        icon={<ReloadOutlined />}
        percent={itemCount ? (governanceSummary.recentlyChangedCount / itemCount) * 100 : 0}
        color="#1677ff"
      />
      <MetricCard
        title="当前页只读"
        value={viewerCount}
        icon={<EyeOutlined />}
        percent={itemCount ? (viewerCount / itemCount) * 100 : 0}
        color="#7c3aed"
      />
    </MetricGrid>
  );
}
