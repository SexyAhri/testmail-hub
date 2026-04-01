import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Popconfirm, Space, Tooltip } from "antd";
import type { ReactNode } from "react";

interface ActionButtonsProps {
  confirmDelete?: boolean;
  deleteDisabled?: boolean;
  deleteConfirmTitle?: string;
  deleteTooltip?: ReactNode;
  extra?: ReactNode;
  onAdd?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onView?: () => void;
}

export function ActionButtons({
  confirmDelete = true,
  deleteDisabled = false,
  deleteConfirmTitle = "确定删除？",
  deleteTooltip,
  extra,
  onAdd,
  onDelete,
  onEdit,
  onView,
}: ActionButtonsProps) {
  const deleteButton = (
    <Button
      type="link"
      size="small"
      danger
      icon={<DeleteOutlined />}
      disabled={deleteDisabled}
      onClick={!deleteDisabled && !confirmDelete ? onDelete : undefined}
    >
      删除
    </Button>
  );

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
        deleteDisabled ? (
          deleteTooltip ? (
            <Tooltip title={deleteTooltip}>
              <span>{deleteButton}</span>
            </Tooltip>
          ) : (
            deleteButton
          )
        ) : (
          confirmDelete ? (
            <Popconfirm title={deleteConfirmTitle} onConfirm={onDelete}>
              {deleteButton}
            </Popconfirm>
          ) : (
            deleteButton
          )
        )
      ) : null}
      {extra}
    </Space>
  );
}
