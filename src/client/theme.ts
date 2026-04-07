import { theme } from "antd";
import type { ThemeConfig } from "antd";

export type ThemeMode = "light" | "dark";

export interface AppThemePalette {
  amber: string;
  cyan: string;
  error: string;
  info: string;
  neutral: string;
  sidebarBg: string;
  sidebarBorder: string;
  success: string;
  violet: string;
  warning: string;
}

const SHARED_TOKEN = {
  borderRadius: 7,
  controlHeight: 30,
  controlHeightLG: 38,
  controlHeightSM: 26,
  fontSize: 13,
  fontSizeLG: 15,
  fontSizeSM: 12,
  padding: 14,
  paddingLG: 18,
  paddingSM: 10,
  paddingXS: 6,
};

const SHARED_COMPONENTS = {
  Button: {
    fontWeight: 500,
  },
  Form: {
    labelFontSize: 13,
    verticalLabelPadding: "0 0 6px",
  },
  Menu: {
    itemFontSize: 13,
    itemHeight: 38,
  },
};

export const APP_THEME_CONFIGS: Record<ThemeMode, ThemeConfig> = {
  light: {
    algorithm: theme.defaultAlgorithm,
    token: {
      ...SHARED_TOKEN,
      colorBgContainer: "#f8f9fa",
      colorBgElevated: "#ffffff",
      colorBgLayout: "#eef0f2",
      colorBorder: "#dcdfe3",
      colorBorderSecondary: "#e8eaed",
      colorError: "#ff4d4f",
      colorInfo: "#4f6ef7",
      colorPrimary: "#4f6ef7",
      colorSuccess: "#52c41a",
      colorText: "#2c3e50",
      colorTextSecondary: "#5a6d82",
      colorTextTertiary: "#8492a6",
      colorWarning: "#faad14",
    },
    components: {
      ...SHARED_COMPONENTS,
      Card: {
        bodyPadding: 16,
        bodyPaddingSM: 12,
        colorBgContainer: "#f8f9fa",
        headerFontSize: 15,
        headerHeight: 42,
      },
      Layout: {
        siderBg: "#1e2a3a",
      },
      Table: {
        cellFontSize: 13,
        cellPaddingBlock: 10,
        cellPaddingBlockMD: 8,
        cellPaddingInline: 12,
        cellPaddingInlineMD: 10,
        colorBgContainer: "#f8f9fa",
        headerBg: "#f0f2f4",
      },
    },
  },
  dark: {
    algorithm: theme.darkAlgorithm,
    token: {
      ...SHARED_TOKEN,
      colorBgContainer: "#1e2128",
      colorBgElevated: "#252830",
      colorBgLayout: "#16181d",
      colorBorder: "#363940",
      colorBorderSecondary: "#2d3038",
      colorError: "#ff7875",
      colorInfo: "#5a7bf9",
      colorPrimary: "#5a7bf9",
      colorSuccess: "#73d13d",
      colorText: "#e8e9eb",
      colorTextSecondary: "#a8abb2",
      colorTextTertiary: "#73767d",
      colorWarning: "#ffc53d",
    },
    components: {
      ...SHARED_COMPONENTS,
      Card: {
        bodyPadding: 16,
        bodyPaddingSM: 12,
        colorBgContainer: "#1e2128",
        headerFontSize: 15,
        headerHeight: 42,
      },
      Layout: {
        siderBg: "#12141a",
      },
      Table: {
        cellFontSize: 13,
        cellPaddingBlock: 10,
        cellPaddingBlockMD: 8,
        cellPaddingInline: 12,
        cellPaddingInlineMD: 10,
        colorBgContainer: "#1e2128",
        headerBg: "#252830",
      },
    },
  },
};

export const APP_THEME_PALETTES: Record<ThemeMode, AppThemePalette> = {
  light: {
    amber: "#d46b08",
    cyan: "#13c2c2",
    error: "#ff4d4f",
    info: "#4f6ef7",
    neutral: "#94a3b8",
    sidebarBg: "#1e2a3a",
    sidebarBorder: "rgba(255,255,255,0.08)",
    success: "#52c41a",
    violet: "#722ed1",
    warning: "#faad14",
  },
  dark: {
    amber: "#ff9c6e",
    cyan: "#36cfc9",
    error: "#ff7875",
    info: "#5a7bf9",
    neutral: "#6b7280",
    sidebarBg: "#12141a",
    sidebarBorder: "#2d3038",
    success: "#73d13d",
    violet: "#b37feb",
    warning: "#ffc53d",
  },
};

export function withAlpha(color: string, opacity: number) {
  const alpha = Math.max(0, Math.min(1, opacity));
  const normalized = color.trim();
  const hexMatch = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);

  if (hexMatch) {
    const hex = hexMatch[1].length === 3
      ? hexMatch[1].split("").map(char => `${char}${char}`).join("")
      : hexMatch[1];
    const red = Number.parseInt(hex.slice(0, 2), 16);
    const green = Number.parseInt(hex.slice(2, 4), 16);
    const blue = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  const rgbMatch = normalized.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbMatch) {
    const [red, green, blue] = rgbMatch[1]
      .split(",")
      .map(part => Number.parseFloat(part.trim()))
      .slice(0, 3);
    if ([red, green, blue].every(channel => Number.isFinite(channel))) {
      return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
    }
  }

  return color;
}
