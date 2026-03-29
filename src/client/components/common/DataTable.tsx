import { Table, theme } from "antd";
import type { TableProps } from "antd";
import type { CSSProperties, ReactNode } from "react";

interface DataTableProps<T> extends Omit<TableProps<T>, "pagination" | "size" | "title"> {
  cardExtra?: ReactNode;
  cardTitle?: string;
  cardToolbar?: ReactNode;
  current?: number;
  onPageChange?: (page: number, pageSize: number) => void;
  pageSize?: number;
  showPagination?: boolean;
  style?: CSSProperties;
  total?: number;
}

export function DataTable<T extends object>({
  cardExtra,
  cardTitle,
  cardToolbar,
  current,
  onPageChange,
  pageSize = 10,
  showPagination = true,
  style,
  total,
  ...tableProps
}: DataTableProps<T>) {
  const { token } = theme.useToken();
  const isRemotePagination = total !== undefined && current !== undefined;

  return (
    <div
      style={{
        background: token.colorBgContainer,
        borderRadius: 12,
        border: `1px solid ${token.colorBorderSecondary}`,
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        overflow: "hidden",
        ...style,
      }}
    >
      {cardTitle ? (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 10,
            padding: "12px 16px",
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            background: `linear-gradient(to right, ${token.colorBgContainer}, ${token.colorBgLayout})`,
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 14 }}>{cardTitle}</span>
          {cardExtra}
        </div>
      ) : null}

      {cardToolbar ? (
        <div
          style={{
            padding: "8px 16px",
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            background: token.colorBgContainer,
          }}
        >
          {cardToolbar}
        </div>
      ) : null}

      <Table<T>
        size="middle"
        bordered
        scroll={{ x: "max-content", y: "calc(100vh - 320px)" }}
        pagination={
          showPagination
            ? {
                pageSize,
                total: isRemotePagination ? total : undefined,
                current: isRemotePagination ? current : undefined,
                onChange: onPageChange,
                showTotal: value => (
                  <span style={{ fontSize: 13, color: token.colorTextSecondary }}>
                    共 <strong style={{ color: token.colorPrimary }}>{value}</strong> 条
                  </span>
                ),
                style: { marginRight: 16, marginBottom: 8 },
                showSizeChanger: true,
                showQuickJumper: true,
              }
            : false
        }
        {...tableProps}
      />
    </div>
  );
}
