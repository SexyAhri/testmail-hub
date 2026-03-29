import type { ThemeConfig } from "antd";

export const enterpriseTheme: ThemeConfig = {
  token: {
    colorPrimary: "#1d4ed8",
    colorInfo: "#1d4ed8",
    colorSuccess: "#059669",
    colorWarning: "#d97706",
    colorError: "#dc2626",
    borderRadius: 14,
    fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
    colorBgLayout: "#eef3fb",
  },
  components: {
    Layout: {
      siderBg: "#081225",
      triggerBg: "#0f1e37",
      triggerColor: "#e2e8f0",
      bodyBg: "#eef3fb",
      headerBg: "#f8fbff",
    },
    Menu: {
      darkItemBg: "#081225",
      darkItemSelectedBg: "#173463",
      darkItemHoverBg: "rgba(255,255,255,0.08)",
      darkSubMenuItemBg: "#081225",
      itemBorderRadius: 12,
    },
    Card: {
      bodyPadding: 20,
    },
    Table: {
      headerBg: "#f5f8ff",
      rowHoverBg: "#f8fbff",
    },
  },
};
