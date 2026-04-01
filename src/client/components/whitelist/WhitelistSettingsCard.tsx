import { Card, Space, Switch, Typography } from "antd";

interface WhitelistSettingsCardProps {
  canManage: boolean;
  enabled: boolean;
  loading: boolean;
  onChange: (enabled: boolean) => void;
}

export function WhitelistSettingsCard({
  canManage,
  enabled,
  loading,
  onChange,
}: WhitelistSettingsCardProps) {
  return (
    <Card size="small" style={{ borderRadius: 12, marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <Space direction="vertical" size={4}>
          <Typography.Text strong>全局白名单检查</Typography.Text>
          <Typography.Text type="secondary">
            启用后，仅允许命中已启用白名单规则的发件人通过；关闭后，将跳过白名单检查。
          </Typography.Text>
        </Space>
        <Switch
          checked={enabled}
          checkedChildren="开"
          unCheckedChildren="关"
          disabled={!canManage}
          loading={loading}
          onChange={onChange}
        />
      </div>
    </Card>
  );
}
