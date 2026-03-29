import {
  LogoutOutlined,
  MoonOutlined,
  QuestionCircleOutlined,
  SunOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { App, Avatar, Breadcrumb, Dropdown, Layout, Space, Switch, theme } from "antd";
import { useRef } from "react";

import { useTheme } from "../../providers";

const { Header: AntHeader } = Layout;

interface HeaderProps {
  breadcrumbs: Array<{ path?: string; title: string }>;
  onLogout: () => Promise<void> | void;
  onNavigate: (path: string) => void;
  username?: string;
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void> };
};

export function Header({
  breadcrumbs,
  onLogout,
  onNavigate,
  username = "Admin",
}: HeaderProps) {
  const switchRef = useRef<HTMLSpanElement>(null);
  const { themeMode, setThemeMode } = useTheme();
  const { token } = theme.useToken();
  const { message, modal } = App.useApp();

  const createRipple = (x: number, y: number, toLight: boolean) => {
    const rippleContainer = document.createElement("div");
    rippleContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 99999;
      overflow: hidden;
    `;

    const rippleColor = toLight ? "rgba(79, 110, 247, 0.6)" : "rgba(255, 255, 255, 0.5)";

    for (let index = 0; index < 3; index += 1) {
      const ripple = document.createElement("div");
      ripple.style.cssText = `
        position: absolute;
        left: ${x}px;
        top: ${y}px;
        width: 0;
        height: 0;
        border-radius: 50%;
        transform: translate(-50%, -50%);
        border: 3px solid ${rippleColor};
        box-shadow: 0 0 10px ${rippleColor};
        animation: ripple-wave 0.8s ease-out forwards;
        animation-delay: ${index * 0.12}s;
      `;
      rippleContainer.appendChild(ripple);
    }

    document.body.appendChild(rippleContainer);
    setTimeout(() => rippleContainer.remove(), 1200);
  };

  const handleThemeChange = async (checked: boolean) => {
    const nextTheme = checked ? "dark" : "light";
    const toLight = !checked;

    const switchElement = switchRef.current;
    const rect = switchElement?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : 0;

    createRipple(x, y, toLight);

    const transitionDocument = document as ViewTransitionDocument;
    if (!transitionDocument.startViewTransition) {
      setThemeMode(nextTheme);
      return;
    }

    const maxRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    document.documentElement.style.setProperty("--theme-x", `${x}px`);
    document.documentElement.style.setProperty("--theme-y", `${y}px`);
    document.documentElement.style.setProperty("--theme-r", `${maxRadius}px`);

    const transition = transitionDocument.startViewTransition(() => {
      setThemeMode(nextTheme);
    });

    await transition.ready;
  };

  return (
    <AntHeader
      style={{
        padding: "0 18px",
        height: 52,
        lineHeight: "52px",
        background: token.colorBgContainer,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      <Breadcrumb
        items={breadcrumbs.map((item, index) => ({
          title:
            index < breadcrumbs.length - 1 && item.path ? (
              <a onClick={() => onNavigate(item.path!)} style={{ cursor: "pointer" }}>
                {item.title}
              </a>
            ) : (
              item.title
            ),
        }))}
      />

      <Space size="middle">
        <span ref={switchRef}>
          <Switch
            checkedChildren={<MoonOutlined />}
            unCheckedChildren={<SunOutlined />}
            checked={themeMode === "dark"}
            onChange={handleThemeChange}
          />
        </span>

        <QuestionCircleOutlined style={{ fontSize: 15, cursor: "pointer", color: token.colorTextSecondary }} />

        <Dropdown
          menu={{
            items: [
              {
                key: "profile",
                icon: <UserOutlined />,
                label: "当前会话",
              },
              { type: "divider" as const },
              {
                key: "logout",
                icon: <LogoutOutlined />,
                label: "退出登录",
              },
            ],
            onClick: ({ key }) => {
              if (key === "profile") {
                message.info(`当前登录用户：${username}`);
                return;
              }

              if (key === "logout") {
                modal.confirm({
                  title: "确认退出",
                  content: "确定要退出当前登录状态吗？",
                  okText: "确定",
                  cancelText: "取消",
                  onOk: async () => {
                    await onLogout();
                  },
                });
              }
            },
          }}
          placement="bottomRight"
        >
          <Space style={{ cursor: "pointer" }}>
            <Avatar size="small" style={{ backgroundColor: token.colorPrimary }}>
              {username.charAt(0).toUpperCase()}
            </Avatar>
            <span style={{ color: token.colorText }}>{username}</span>
          </Space>
        </Dropdown>
      </Space>
    </AntHeader>
  );
}
