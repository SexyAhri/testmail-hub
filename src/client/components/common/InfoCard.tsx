import { Card, theme } from "antd";
import type { ReactNode } from "react";

import { withAlpha } from "../../theme";

interface InfoCardProps {
  color?: string;
  icon: ReactNode;
  items: Array<{ label: string; value: string | number }>;
  title: string;
}

export function InfoCard({ color, icon, items, title }: InfoCardProps) {
  const { token } = theme.useToken();
  const accentColor = color || token.colorPrimary;

  return (
    <Card size="small" style={{ borderRadius: 12, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: withAlpha(accentColor, 0.1),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            color: accentColor,
          }}
        >
          {icon}
        </div>
        <span
          style={{
            marginLeft: 12,
            color: token.colorText,
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          {title}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {items.map(item => (
          <div
            key={`${item.label}-${item.value}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              padding: "8px 12px",
              background: token.colorFillQuaternary,
              borderRadius: 8,
            }}
          >
            <span style={{ color: token.colorTextSecondary, fontSize: 13 }}>{item.label}</span>
            <span
              style={{
                color: token.colorText,
                fontSize: 12,
                fontFamily: "monospace",
                fontWeight: 500,
                maxWidth: "60%",
                textAlign: "right",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
