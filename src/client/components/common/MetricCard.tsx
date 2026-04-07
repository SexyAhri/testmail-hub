import { Card, Progress, theme } from "antd";
import type { ReactNode } from "react";

import { withAlpha } from "../../theme";

interface MetricCardProps {
  color?: string;
  description?: ReactNode;
  icon: ReactNode;
  percent?: number;
  showProgress?: boolean;
  suffix?: string;
  title: string;
  value: string | number;
}

export function MetricCard({
  color,
  description,
  icon,
  percent = 0,
  showProgress = true,
  suffix,
  title,
  value,
}: MetricCardProps) {
  const { token } = theme.useToken();
  const accentColor = color || token.colorPrimary;

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

      {description ? (
        <div
          style={{
            marginTop: 10,
            color: token.colorTextTertiary,
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          {description}
        </div>
      ) : null}

      {showProgress ? (
        <Progress
          percent={Math.max(0, Math.min(100, percent))}
          showInfo={false}
          strokeColor={accentColor}
          trailColor={token.colorBorderSecondary}
          style={{ marginTop: 12 }}
          size="small"
        />
      ) : null}
    </Card>
  );
}
