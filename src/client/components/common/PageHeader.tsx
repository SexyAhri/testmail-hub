import { Space, Tag } from "antd";
import type { ReactNode } from "react";

interface PageHeaderProps {
  extra?: ReactNode;
  subtitle?: string;
  tags?: Array<{ color?: string; label: string }>;
  title: string;
}

export function PageHeader({ extra, subtitle, tags, title }: PageHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        marginBottom: 16,
        flexWrap: "wrap",
      }}
    >
      <Space wrap>
        <span style={{ fontSize: 17, fontWeight: 600 }}>{title}</span>
        {tags?.map(tag => (
          <Tag key={`${tag.label}-${tag.color || "default"}`} color={tag.color}>
            {tag.label}
          </Tag>
        ))}
        {subtitle ? <span style={{ color: "#999", fontSize: 13 }}>{subtitle}</span> : null}
      </Space>
      {extra ? <div>{extra}</div> : null}
    </div>
  );
}
