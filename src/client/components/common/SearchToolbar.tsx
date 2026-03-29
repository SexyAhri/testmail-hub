import { DeleteOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Button, DatePicker, Input, Select, Space, theme } from "antd";
import type { ReactNode } from "react";

const { RangePicker } = DatePicker;

interface SearchToolbarProps {
  addText?: string;
  children?: ReactNode;
  extra?: ReactNode;
  onAdd?: () => void;
  onClear?: () => void;
  onReset?: () => void;
  onSearchChange?: (value: string) => void;
  onStatusChange?: (value: string | undefined) => void;
  searchPlaceholder?: string;
  searchValue?: string;
  showClear?: boolean;
  showDateRange?: boolean;
  statusOptions?: Array<{ label: string; value: string }>;
  statusValue?: string;
}

export function SearchToolbar({
  addText = "新增",
  children,
  extra,
  onAdd,
  onClear,
  onReset,
  onSearchChange,
  onStatusChange,
  searchPlaceholder = "请输入搜索内容",
  searchValue,
  showClear = false,
  showDateRange = false,
  statusOptions = [
    { value: "active", label: "正常" },
    { value: "disabled", label: "停用" },
  ],
  statusValue,
}: SearchToolbarProps) {
  const { token } = theme.useToken();
  const hasCustomContent = Boolean(children);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        padding: "14px 16px",
        background: `linear-gradient(135deg, ${token.colorBgContainer} 0%, ${token.colorBgLayout} 100%)`,
        borderRadius: 12,
        border: `1px solid ${token.colorBorderSecondary}`,
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}
    >
      {hasCustomContent ? (
        <div style={{ width: "100%" }}>{children}</div>
      ) : (
        <>
          <Space size={12} wrap>
            {onSearchChange ? (
              <Input
                placeholder={searchPlaceholder}
                prefix={<SearchOutlined style={{ color: token.colorPrimary, fontSize: 16 }} />}
                value={searchValue}
                onChange={event => onSearchChange(event.target.value)}
                style={{ width: 240, borderRadius: 8 }}
                allowClear
                size="middle"
              />
            ) : null}

            {onStatusChange ? (
              <Select
                placeholder="筛选状态"
                value={statusValue}
                onChange={value => onStatusChange(value)}
                style={{ width: 130, borderRadius: 8 }}
                allowClear
                options={statusOptions}
                size="middle"
              />
            ) : null}

            {showDateRange ? <RangePicker style={{ borderRadius: 8 }} /> : null}

            {onReset ? (
              <Button icon={<ReloadOutlined />} onClick={onReset} style={{ borderRadius: 8 }}>
                重置
              </Button>
            ) : null}

            {showClear && onClear ? (
              <Button danger icon={<DeleteOutlined />} onClick={onClear} style={{ borderRadius: 8 }}>
                清空
              </Button>
            ) : null}

            {extra}
          </Space>

          {onAdd ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={onAdd}
              size="middle"
              style={{
                borderRadius: 8,
                boxShadow: `0 2px 8px ${token.colorPrimary}30`,
                fontWeight: 500,
              }}
            >
              {addText}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
