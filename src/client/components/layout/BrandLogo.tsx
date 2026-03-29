import { MailOutlined } from "@ant-design/icons";

import { APP_BRAND } from "../../brand";

interface BrandLogoProps {
  animated?: boolean;
  iconBoxSize?: number;
  iconSize?: number;
  textColor?: string;
  textSize?: number;
}

export function BrandLogo({
  animated = false,
  iconBoxSize = 34,
  iconSize = 16,
  textColor = "#fff",
  textSize = 16,
}: BrandLogoProps) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
      <div
        className={animated ? "animate-float" : undefined}
        style={{
          width: iconBoxSize,
          height: iconBoxSize,
          borderRadius: Math.max(10, Math.round(iconBoxSize * 0.28)),
          background: "linear-gradient(135deg, #5d79ff, #5970ec)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 10px 24px rgba(79, 110, 247, 0.28)",
          flexShrink: 0,
        }}
      >
        <MailOutlined style={{ fontSize: iconSize, color: "#fff" }} />
      </div>
      <span
        style={{
          fontSize: textSize,
          fontWeight: 700,
          color: textColor,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          whiteSpace: "nowrap",
        }}
      >
        {APP_BRAND}
      </span>
    </div>
  );
}
