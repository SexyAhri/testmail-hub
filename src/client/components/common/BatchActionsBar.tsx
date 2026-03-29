import { ClearOutlined } from "@ant-design/icons";
import { Button, Space, Tag } from "antd";
import type { ReactNode } from "react";

interface BatchActionsBarProps {
  children?: ReactNode;
  onClear?: () => void;
  selectedCount: number;
}

export function BatchActionsBar({ children, onClear, selectedCount }: BatchActionsBarProps) {
  if (!selectedCount) return null;

  return (
    <Space size={[8, 8]} wrap>
      <Tag color="processing" style={{ marginInlineEnd: 0 }}>
        已选 {selectedCount} 项
      </Tag>
      {children}
      {onClear ? (
        <Button type="link" size="small" icon={<ClearOutlined />} onClick={onClear}>
          清空选择
        </Button>
      ) : null}
    </Space>
  );
}
