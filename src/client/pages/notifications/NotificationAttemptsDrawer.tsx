import { Space, Tag, Typography } from "antd";

import { DataTable, DetailDrawer, TypeTag } from "../../components";
import { useTheme } from "../../providers";
import { withAlpha } from "../../theme";
import type {
  NotificationDeliveryAttemptRecord,
  NotificationDeliveryRecord,
  PaginationPayload,
} from "../../types";
import { formatDateTime } from "../../utils";
import { buildAttemptColumns } from "./notification-table-columns";
import { DELIVERY_STATUS_OPTIONS } from "./notification-utils";

interface NotificationAttemptsDrawerProps {
  activeDelivery: NotificationDeliveryRecord | null;
  attempts: PaginationPayload<NotificationDeliveryAttemptRecord>;
  loading: boolean;
  onClose: () => void;
  onPageChange: (page: number) => void;
  open: boolean;
}

const attemptColumns = buildAttemptColumns();

export function NotificationAttemptsDrawer({
  activeDelivery,
  attempts,
  loading,
  onClose,
  onPageChange,
  open,
}: NotificationAttemptsDrawerProps) {
  const { palette } = useTheme();

  return (
    <DetailDrawer
      title={activeDelivery ? `尝试明细 · 投递 #${activeDelivery.id}` : "尝试明细"}
      open={open}
      onClose={onClose}
      width="56vw"
    >
      {activeDelivery ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              display: "grid",
              gap: 8,
              padding: 14,
              borderRadius: 12,
              background: withAlpha(palette.info, 0.06),
              border: `1px solid ${withAlpha(palette.info, 0.14)}`,
            }}
          >
            <Space size={[8, 8]} wrap>
              <Tag color="blue">{activeDelivery.event}</Tag>
              <TypeTag options={DELIVERY_STATUS_OPTIONS} type={activeDelivery.status} />
              {activeDelivery.is_dead_letter ? <Tag color="red">死信</Tag> : null}
            </Space>
            <Typography.Text type="secondary">
              {`尝试 ${activeDelivery.attempt_count}/${activeDelivery.max_attempts} · 最近 ${formatDateTime(activeDelivery.last_attempt_at)}`}
            </Typography.Text>
            {activeDelivery.dead_letter_reason ? (
              <Typography.Text type="danger">{activeDelivery.dead_letter_reason}</Typography.Text>
            ) : null}
          </div>

          <DataTable
            cardTitle="尝试明细"
            columns={attemptColumns}
            current={attempts.page}
            dataSource={attempts.items}
            loading={loading}
            onPageChange={onPageChange}
            pageSize={attempts.pageSize}
            rowKey="id"
            total={attempts.total}
          />
        </div>
      ) : null}
    </DetailDrawer>
  );
}
