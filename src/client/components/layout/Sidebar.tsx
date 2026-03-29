import {
  ApiOutlined,
  AppstoreOutlined,
  AuditOutlined,
  BellOutlined,
  DashboardOutlined,
  FileSearchOutlined,
  InboxOutlined,
  MailOutlined,
  NotificationOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  TeamOutlined,
  ToolOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { Layout, Menu } from "antd";
import type { MenuProps } from "antd";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useTheme } from "../../providers";
import { BrandLogo } from "./BrandLogo";

const { Sider } = Layout;

export interface SidebarItem {
  children?: SidebarItem[];
  icon?: ReactNode;
  key: string;
  label: string;
}

export function buildDefaultSidebarItems(): SidebarItem[] {
  return [
    { key: "/monitor", icon: <DashboardOutlined />, label: "监控中心" },
    {
      key: "mail",
      icon: <MailOutlined />,
      label: "邮件管理",
      children: [
        { key: "/emails", icon: <FileSearchOutlined />, label: "邮件中心" },
        { key: "/trash", icon: <NotificationOutlined />, label: "回收站" },
        { key: "/mailboxes", icon: <InboxOutlined />, label: "邮箱资产" },
        { key: "/outbound", icon: <SendOutlined />, label: "发信中心" },
      ],
    },
    {
      key: "policy",
      icon: <SafetyCertificateOutlined />,
      label: "策略中心",
      children: [
        { key: "/rules", icon: <ToolOutlined />, label: "规则管理" },
        { key: "/whitelist", icon: <NotificationOutlined />, label: "白名单" },
        { key: "/notifications", icon: <BellOutlined />, label: "通知配置" },
      ],
    },
    {
      key: "system",
      icon: <AuditOutlined />,
      label: "系统管理",
      children: [
        { key: "/admins", icon: <TeamOutlined />, label: "管理员" },
        { key: "/system/audit", icon: <AuditOutlined />, label: "审计日志" },
        { key: "/system/errors", icon: <WarningOutlined />, label: "系统日志" },
      ],
    },
    { key: "/api", icon: <ApiOutlined />, label: "开放 API" },
  ];
}

function convertToMenuItems(items: SidebarItem[]): Required<MenuProps>["items"][number][] {
  return items.map(item => {
    if (item.children?.length) {
      return {
        key: item.key,
        icon: item.icon || <AppstoreOutlined />,
        label: item.label,
        children: convertToMenuItems(item.children),
      };
    }

    return {
      key: item.key,
      icon: item.icon || <AppstoreOutlined />,
      label: item.label,
    };
  });
}

function findOpenKeys(items: SidebarItem[], pathname: string, parents: string[] = []): string[] {
  for (const item of items) {
    if (item.children?.length) {
      const nested = findOpenKeys(item.children, pathname, [...parents, item.key]);
      if (nested.length > 0) return nested;
    }

    if (item.key.startsWith("/") && (pathname === item.key || pathname.startsWith(`${item.key}/`))) {
      return parents;
    }
  }

  return [];
}

function findSelectedKey(items: SidebarItem[], pathname: string): string {
  let bestMatch = "/monitor";
  let bestLength = 0;

  const walk = (nodes: SidebarItem[]) => {
    for (const item of nodes) {
      if (item.children?.length) walk(item.children);
      if (item.key.startsWith("/") && (pathname === item.key || pathname.startsWith(`${item.key}/`)) && item.key.length > bestLength) {
        bestMatch = item.key;
        bestLength = item.key.length;
      }
    }
  };

  walk(items);
  return bestMatch;
}

interface SidebarProps {
  items?: SidebarItem[];
  onNavigate: (path: string) => void;
  pathname: string;
}

export function Sidebar({ items = buildDefaultSidebarItems(), onNavigate, pathname }: SidebarProps) {
  const { themeMode } = useTheme();
  const [openKeys, setOpenKeys] = useState<string[]>(() => findOpenKeys(items, pathname));

  useEffect(() => {
    setOpenKeys(findOpenKeys(items, pathname));
  }, [items, pathname]);

  const menuItems = useMemo(() => convertToMenuItems(items), [items]);
  const selectedKey = useMemo(() => findSelectedKey(items, pathname), [items, pathname]);
  const siderBg = themeMode === "dark" ? "#12141a" : "#1e2a3a";

  return (
    <Sider width={260} style={{ background: siderBg }}>
      <div
        style={{
          minHeight: 60,
          display: "flex",
          alignItems: "center",
          padding: "0 18px",
          borderBottom: `1px solid ${themeMode === "dark" ? "#2d3038" : "rgba(255,255,255,0.08)"}`,
        }}
      >
        <BrandLogo iconBoxSize={30} iconSize={14} textSize={15} />
      </div>

      <Menu
        theme="dark"
        mode="inline"
        items={menuItems}
        selectedKeys={[selectedKey]}
        openKeys={openKeys}
        onOpenChange={keys => setOpenKeys(keys as string[])}
        onClick={({ key }) => {
          if (String(key).startsWith("/")) onNavigate(String(key));
        }}
        style={{ background: "transparent", borderRight: 0 }}
      />
    </Sider>
  );
}
