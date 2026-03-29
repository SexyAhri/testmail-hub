import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const REACT_PACKAGES = new Set(["react", "react-dom", "scheduler"]);
const ROUTER_PACKAGES = new Set(["@remix-run/router", "react-router", "react-router-dom"]);
const CHART_PACKAGES = new Set(["echarts", "echarts-for-react", "zrender"]);

function getPackageName(id: string) {
  const normalized = id.replace(/\\/g, "/");
  const marker = "/node_modules/";
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex === -1) return null;

  const packagePath = normalized.slice(markerIndex + marker.length);
  const parts = packagePath.split("/");
  if (!parts[0]) return null;
  return parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
}

export default defineConfig({
  plugins: [react(), cloudflare()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;

          const packageName = getPackageName(id);
          if (!packageName) return undefined;

          if (REACT_PACKAGES.has(packageName)) return "react-core";
          if (ROUTER_PACKAGES.has(packageName)) return "router";
          if (CHART_PACKAGES.has(packageName)) return "charts";
          if (packageName === "dayjs") return "dayjs";
          if (packageName === "@babel/runtime") return "vendor-runtime";
          if (
            packageName === "antd" ||
            packageName.startsWith("@ant-design/") ||
            packageName.startsWith("@rc-component/") ||
            packageName.startsWith("rc-") ||
            packageName === "@emotion/hash" ||
            packageName === "@emotion/unitless" ||
            packageName === "stylis"
          ) {
            return "antd-vendor";
          }

          return undefined;
        },
      },
    },
  },
});
