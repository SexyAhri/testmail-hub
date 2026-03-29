import { Card, Progress, theme } from "antd";
import type { ReactNode } from "react";

interface MetricCardProps {
  color?: string;
  icon: ReactNode;
  percent?: number;
  suffix?: string;
  title: string;
  value: string | number;
}

export function MetricCard({
  color = "#1890ff",
  icon,
  percent = 0,
  suffix,
  title,
  value,
}: MetricCardProps) {
  const { token } = theme.useToken();

  return (
    <Card
      size="small"
      style={{
        borderRadius: 12,
        height: "100%",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: `${color}15`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            color,
          }}
        >
          {icon}
        </div>
        <span
          style={{
            marginLeft: 12,
            color: token.colorTextSecondary,
            fontSize: 13,
          }}
        >
          {title}
        </span>
      </div>

      <div
        style={{
          fontSize: 24,
          fontWeight: 600,
          color: token.colorText,
          fontFamily: "monospace",
          lineHeight: 1.2,
          wordBreak: "break-word",
        }}
      >
        {value}
        {suffix ? (
          <span
            style={{
              fontSize: 13,
              color: token.colorTextSecondary,
              marginLeft: 4,
              fontWeight: 400,
            }}
          >
            {suffix}
          </span>
        ) : null}
      </div>

      <Progress
        percent={Math.max(0, Math.min(100, percent))}
        showInfo={false}
        strokeColor={color}
        trailColor={token.colorBorderSecondary}
        style={{ marginTop: 12 }}
        size="small"
      />
    </Card>
  );
}
