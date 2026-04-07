import { Space, Tag, theme } from "antd";
import type { ReactNode } from "react";

interface PageHeaderProps {
  extra?: ReactNode;
  subtitle?: string;
  tags?: Array<{ color?: string; label: string }>;
  title: string;
}

export function PageHeader({ extra, subtitle, tags, title }: PageHeaderProps) {
  const { token } = theme.useToken();

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 16,
        marginBottom: 16,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "grid", gap: 8, minWidth: 0, flex: "1 1 480px" }}>
        <Space wrap size={[8, 8]}>
          <span style={{ fontSize: 18, fontWeight: 700, color: token.colorTextHeading }}>{title}</span>
          {tags?.map(tag => (
            <Tag key={`${tag.label}-${tag.color || "default"}`} color={tag.color}>
              {tag.label}
            </Tag>
          ))}
        </Space>
        {subtitle ? (
          <div
            style={{
              color: token.colorTextSecondary,
              fontSize: 13,
              lineHeight: 1.7,
              maxWidth: 780,
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
      {extra ? <div>{extra}</div> : null}
    </div>
  );
}
