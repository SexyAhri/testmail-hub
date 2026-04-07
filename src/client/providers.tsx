import { App as AntdApp, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { APP_THEME_CONFIGS, APP_THEME_PALETTES, type AppThemePalette, type ThemeMode } from "./theme";

interface ThemeContextValue {
  palette: AppThemePalette;
  setThemeMode: (mode: ThemeMode) => void;
  themeMode: ThemeMode;
}

const ThemeContext = createContext<ThemeContextValue>({
  palette: APP_THEME_PALETTES.light,
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

  return (
    <ConfigProvider locale={zhCN} theme={APP_THEME_CONFIGS[themeMode]}>
      <ThemeContext.Provider
        value={{
          palette: APP_THEME_PALETTES[themeMode],
          themeMode,
          setThemeMode: setThemeModeState,
        }}
      >
        <AntdApp>{children}</AntdApp>
      </ThemeContext.Provider>
    </ConfigProvider>
  );
}
