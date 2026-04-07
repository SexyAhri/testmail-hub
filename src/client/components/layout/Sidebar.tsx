import {
  ApiOutlined,
  AppstoreOutlined,
  AuditOutlined,
  BellOutlined,
  DashboardOutlined,
  FieldTimeOutlined,
  FileSearchOutlined,
  InboxOutlined,
  KeyOutlined,
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

import { hasAdminPermission, isReadOnlyAdminRole } from "../../../utils/constants";
import { useTheme } from "../../providers";
import type { SessionPayload } from "../../types";
import { BrandLogo } from "./BrandLogo";

const { Sider } = Layout;

export interface SidebarItem {
  children?: SidebarItem[];
  icon?: ReactNode;
  key: string;
  label: string;
}

export function buildDefaultSidebarItems(user?: SessionPayload["user"] | null): SidebarItem[] {
  const items: SidebarItem[] = [
    { key: "/monitor", icon: <DashboardOutlined />, label: "监控中心" },
    { key: "/projects", icon: <AppstoreOutlined />, label: "项目空间" },
    { key: "/domains", icon: <AppstoreOutlined />, label: "域名资产" },
    {
      key: "mail",
      icon: <MailOutlined />,
      label: "邮件管理",
      children: [
        { key: "/emails", icon: <FileSearchOutlined />, label: "邮件中心" },
        { key: "/archives", icon: <InboxOutlined />, label: "归档中心" },
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
        { key: "/retention", icon: <FieldTimeOutlined />, label: "生命周期策略" },
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
        { key: "/api-tokens", icon: <KeyOutlined />, label: "API Token" },
        { key: "/system/audit", icon: <AuditOutlined />, label: "审计日志" },
        { key: "/system/errors", icon: <WarningOutlined />, label: "系统日志" },
      ],
    },
    { key: "/api", icon: <ApiOutlined />, label: "开放 API" },
  ];

  const filteredItems = items
    .map(item => {
      if (item.key !== "system" || !item.children) return item;

      return {
        ...item,
        children: item.children.filter(child => {
          if (isReadOnlyAdminRole(user?.role, user?.access_scope || "all")) {
            return !["/admins", "/api-tokens", "/system/audit", "/system/errors"].includes(child.key);
          }

          if (!hasAdminPermission(user?.role, "admins:read", user?.access_scope || "all") && child.key === "/admins") {
            return false;
          }
          if (user?.access_scope === "bound") {
            return !["/system/audit", "/system/errors"].includes(child.key);
          }

          return true;
        }),
      };
    })
    .filter(item => !item.children || item.children.length > 0);

  return filteredItems;
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
      if (
        item.key.startsWith("/")
        && (pathname === item.key || pathname.startsWith(`${item.key}/`))
        && item.key.length > bestLength
      ) {
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
  const { palette } = useTheme();
  const [openKeys, setOpenKeys] = useState<string[]>(() => findOpenKeys(items, pathname));

  useEffect(() => {
    setOpenKeys(findOpenKeys(items, pathname));
  }, [items, pathname]);

  const menuItems = useMemo(() => convertToMenuItems(items), [items]);
  const selectedKey = useMemo(() => findSelectedKey(items, pathname), [items, pathname]);
  return (
    <Sider width={260} style={{ background: palette.sidebarBg }}>
      <div
        style={{
          minHeight: 60,
          display: "flex",
          alignItems: "center",
          padding: "0 18px",
          borderBottom: `1px solid ${palette.sidebarBorder}`,
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
