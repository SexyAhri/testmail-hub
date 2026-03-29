import { App as AntdApp, ConfigProvider, theme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type ThemeMode = "light" | "dark";

interface ThemeContextValue {
  setThemeMode: (mode: ThemeMode) => void;
  themeMode: ThemeMode;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeMode: "light",
  setThemeMode: () => undefined,
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function Providers({ children }: { children: ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "light";
    return window.localStorage.getItem("temp-mail-theme") === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeMode);
    window.localStorage.setItem("temp-mail-theme", themeMode);
  }, [themeMode]);

  const lightTheme = useMemo(() => ({
    algorithm: theme.defaultAlgorithm,
    token: {
      colorPrimary: "#4f6ef7",
      colorBgContainer: "#f8f9fa",
      colorBgLayout: "#eef0f2",
      colorBgElevated: "#ffffff",
      colorBorder: "#dcdfe3",
      colorBorderSecondary: "#e8eaed",
      colorText: "#2c3e50",
      colorTextSecondary: "#5a6d82",
      colorTextTertiary: "#8492a6",
      borderRadius: 7,
      fontSize: 13,
      fontSizeLG: 15,
      fontSizeSM: 12,
      controlHeight: 30,
      controlHeightLG: 38,
      controlHeightSM: 26,
      padding: 14,
      paddingLG: 18,
      paddingSM: 10,
      paddingXS: 6,
    },
    components: {
      Button: {
        fontWeight: 500,
      },
      Card: {
        colorBgContainer: "#f8f9fa",
        bodyPadding: 16,
        bodyPaddingSM: 12,
        headerFontSize: 15,
        headerHeight: 42,
      },
      Table: {
        colorBgContainer: "#f8f9fa",
        headerBg: "#f0f2f4",
        cellFontSize: 13,
        cellPaddingBlock: 10,
        cellPaddingInline: 12,
        cellPaddingBlockMD: 8,
        cellPaddingInlineMD: 10,
      },
      Layout: {
        siderBg: "#1e2a3a",
      },
      Menu: {
        itemHeight: 38,
        itemFontSize: 13,
      },
      Form: {
        labelFontSize: 13,
        verticalLabelPadding: "0 0 6px",
      },
    },
  }), []);

  const darkTheme = useMemo(() => ({
    algorithm: theme.darkAlgorithm,
    token: {
      colorPrimary: "#5a7bf9",
      colorBgContainer: "#1e2128",
      colorBgLayout: "#16181d",
      colorBgElevated: "#252830",
      colorBorder: "#363940",
      colorBorderSecondary: "#2d3038",
      colorText: "#e8e9eb",
      colorTextSecondary: "#a8abb2",
      colorTextTertiary: "#73767d",
      borderRadius: 7,
      fontSize: 13,
      fontSizeLG: 15,
      fontSizeSM: 12,
      controlHeight: 30,
      controlHeightLG: 38,
      controlHeightSM: 26,
      padding: 14,
      paddingLG: 18,
      paddingSM: 10,
      paddingXS: 6,
    },
    components: {
      Button: {
        fontWeight: 500,
      },
      Card: {
        colorBgContainer: "#1e2128",
        bodyPadding: 16,
        bodyPaddingSM: 12,
        headerFontSize: 15,
        headerHeight: 42,
      },
      Table: {
        colorBgContainer: "#1e2128",
        headerBg: "#252830",
        cellFontSize: 13,
        cellPaddingBlock: 10,
        cellPaddingInline: 12,
        cellPaddingBlockMD: 8,
        cellPaddingInlineMD: 10,
      },
      Layout: {
        siderBg: "#12141a",
      },
      Menu: {
        itemHeight: 38,
        itemFontSize: 13,
      },
      Form: {
        labelFontSize: 13,
        verticalLabelPadding: "0 0 6px",
      },
    },
  }), []);

  return (
    <ConfigProvider locale={zhCN} theme={themeMode === "dark" ? darkTheme : lightTheme}>
      <ThemeContext.Provider value={{ themeMode, setThemeMode: setThemeModeState }}>
        <AntdApp>{children}</AntdApp>
      </ThemeContext.Provider>
    </ConfigProvider>
  );
}
