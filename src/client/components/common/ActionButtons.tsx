import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Popconfirm, Space } from "antd";
import type { ReactNode } from "react";

interface ActionButtonsProps {
  deleteConfirmTitle?: string;
  extra?: ReactNode;
  onAdd?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onView?: () => void;
}

export function ActionButtons({
  deleteConfirmTitle = "确定删除？",
  extra,
  onAdd,
  onDelete,
  onEdit,
  onView,
}: ActionButtonsProps) {
  return (
    <Space>
      {onAdd ? (
        <Button type="link" size="small" icon={<PlusOutlined />} onClick={onAdd}>
          新增
        </Button>
      ) : null}
      {onView ? (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={onView}>
          查看
        </Button>
      ) : null}
      {onEdit ? (
        <Button type="link" size="small" icon={<EditOutlined />} onClick={onEdit}>
          编辑
        </Button>
      ) : null}
      {onDelete ? (
        <Popconfirm title={deleteConfirmTitle} onConfirm={onDelete}>
          <Button type="link" size="small" danger icon={<DeleteOutlined />}>
            删除
          </Button>
        </Popconfirm>
      ) : null}
      {extra}
    </Space>
  );
}
