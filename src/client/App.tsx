import { App as AntdApp, Layout, Spin, theme } from "antd";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { getDomains, getSession, login, logout } from "./api";
import { APP_BROWSER_TITLE } from "./brand";
import { Footer, Header, Sidebar, buildDefaultSidebarItems } from "./components";
import type { LoginPayload, SessionPayload } from "./types";
import { normalizeApiError } from "./utils";

const { Content } = Layout;

const ApiDocsPage = lazy(() => import("./pages/ApiDocsPage"));
const ApiTokensPage = lazy(() => import("./pages/ApiTokensPage"));
const AdminsPage = lazy(() => import("./pages/AdminsPage"));
const AuditLogsPage = lazy(() => import("./pages/AuditLogsPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const DomainsPage = lazy(() => import("./pages/DomainsPage"));
const EmailDetailPage = lazy(() => import("./pages/EmailDetailPage"));
const EmailsPage = lazy(() => import("./pages/EmailsPage"));
const ErrorsPage = lazy(() => import("./pages/ErrorsPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const MailboxesPage = lazy(() => import("./pages/MailboxesPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const OutboundEmailsPage = lazy(() => import("./pages/OutboundEmailsPage"));
const ProjectsPage = lazy(() => import("./pages/ProjectsPage"));
const RulesPage = lazy(() => import("./pages/RulesPage"));
const TrashPage = lazy(() => import("./pages/TrashPage"));
const WhitelistPage = lazy(() => import("./pages/WhitelistPage"));

type AuthStatus = "authenticated" | "guest" | "loading";

function getBreadcrumbs(pathname: string) {
  const items: Array<{ path?: string; title: string }> = [{ title: "首页", path: "/monitor" }];

  if (pathname.startsWith("/monitor")) items.push({ title: "监控中心" });
  if (pathname.startsWith("/projects")) items.push({ title: "项目空间" });
  if (pathname.startsWith("/domains")) items.push({ title: "域名资产" });
  if (pathname.startsWith("/emails/")) items.push({ title: "邮件中心", path: "/emails" }, { title: "邮件详情" });
  if (pathname === "/emails") items.push({ title: "邮件中心" });
  if (pathname.startsWith("/trash")) items.push({ title: "回收站" });
  if (pathname.startsWith("/rules")) items.push({ title: "规则管理" });
  if (pathname.startsWith("/whitelist")) items.push({ title: "白名单" });
  if (pathname.startsWith("/mailboxes")) items.push({ title: "邮箱资产" });
  if (pathname.startsWith("/outbound")) items.push({ title: "发信中心" });
  if (pathname.startsWith("/admins")) items.push({ title: "管理员" });
  if (pathname.startsWith("/notifications")) items.push({ title: "通知配置" });
  if (pathname.startsWith("/api-tokens")) items.push({ title: "API Token" });
  if (pathname.startsWith("/system/audit")) items.push({ title: "审计日志" });
  if (pathname.startsWith("/system/errors")) items.push({ title: "系统日志" });
  if (pathname === "/api" || pathname.startsWith("/api/")) items.push({ title: "开放 API" });

  return items;
}

interface DashboardShellProps {
  domains: string[];
  mailboxDomain: string;
  onLogout: () => Promise<void>;
  onMailboxesChanged: () => Promise<void>;
  onUnauthorized: () => void;
  user: SessionPayload["user"] | null;
}

function DashboardShell({
  domains,
  mailboxDomain,
  onLogout,
  onMailboxesChanged,
  onUnauthorized,
  user,
}: DashboardShellProps) {
  const { token } = theme.useToken();
  const location = useLocation();
  const navigate = useNavigate();
  const sidebarItems = useMemo(() => buildDefaultSidebarItems(), []);

  return (
    <Layout style={{ minHeight: "100vh", background: token.colorBgLayout }}>
      <Sidebar items={sidebarItems} pathname={location.pathname} onNavigate={path => navigate(path)} />
      <Layout style={{ background: token.colorBgLayout }}>
        <Header
          breadcrumbs={getBreadcrumbs(location.pathname)}
          onLogout={onLogout}
          onNavigate={path => navigate(path)}
          username={user?.display_name || user?.username || "Admin"}
        />
        <Content style={{ padding: 10, background: token.colorBgContainer, borderRadius: token.borderRadius, minHeight: 280 }}>
          <Suspense fallback={<div style={{ padding: 80, textAlign: "center" }}><Spin size="large" /></div>}>
            <div key={location.pathname} className="page-content">
              <Routes>
                <Route path="/" element={<Navigate to="/monitor" replace />} />
                <Route path="/monitor" element={<DashboardPage domains={domains} mailboxDomain={mailboxDomain} onUnauthorized={onUnauthorized} />} />
                <Route path="/projects" element={<ProjectsPage onUnauthorized={onUnauthorized} />} />
                <Route path="/domains" element={<DomainsPage onDomainsChanged={onMailboxesChanged} onUnauthorized={onUnauthorized} />} />
                <Route path="/emails" element={<EmailsPage domains={domains} onUnauthorized={onUnauthorized} />} />
                <Route path="/emails/:messageId" element={<EmailDetailPage onUnauthorized={onUnauthorized} />} />
                <Route path="/trash" element={<TrashPage onUnauthorized={onUnauthorized} />} />
                <Route path="/rules" element={<RulesPage onUnauthorized={onUnauthorized} />} />
                <Route path="/whitelist" element={<WhitelistPage onUnauthorized={onUnauthorized} />} />
                <Route path="/mailboxes" element={<MailboxesPage domains={domains} mailboxDomain={mailboxDomain} onMailboxesChanged={onMailboxesChanged} onUnauthorized={onUnauthorized} />} />
                <Route path="/outbound" element={<OutboundEmailsPage onUnauthorized={onUnauthorized} />} />
                <Route path="/admins" element={<AdminsPage onUnauthorized={onUnauthorized} />} />
                <Route path="/notifications" element={<NotificationsPage onUnauthorized={onUnauthorized} />} />
                <Route path="/api-tokens" element={<ApiTokensPage onUnauthorized={onUnauthorized} />} />
                <Route path="/system/audit" element={<AuditLogsPage onUnauthorized={onUnauthorized} />} />
                <Route path="/system/errors" element={<ErrorsPage onUnauthorized={onUnauthorized} />} />
                <Route path="/api" element={<ApiDocsPage mailboxDomain={mailboxDomain} />} />
                <Route path="*" element={<Navigate to="/monitor" replace />} />
              </Routes>
            </div>
          </Suspense>
        </Content>
        <Footer />
      </Layout>
    </Layout>
  );
}

export default function App() {
  const { message } = AntdApp.useApp();
  const { token } = theme.useToken();
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [loginLoading, setLoginLoading] = useState(false);
  const [mailboxDomain, setMailboxDomain] = useState("");
  const [domains, setDomains] = useState<string[]>([]);
  const [user, setUser] = useState<SessionPayload["user"] | null>(null);

  useEffect(() => {
    document.title = APP_BROWSER_TITLE;
    void hydrateSession(true);
  }, []);

  async function refreshDomains() {
    try {
      const payload = await getDomains();
      setDomains(payload.domains);
      if (payload.default_domain) {
        setMailboxDomain(payload.default_domain);
      }
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        handleUnauthorized();
        return;
      }
      message.error(normalizeApiError(error));
    }
  }

  async function hydrateSession(silentGuest = false) {
    setAuthStatus("loading");
    try {
      const session = await getSession();
      setMailboxDomain(session.mailbox_domain);
      setUser(session.user);
      setAuthStatus("authenticated");
      await refreshDomains();
    } catch (error) {
      if (normalizeApiError(error) === "UNAUTHORIZED") {
        handleUnauthorized(silentGuest);
        return;
      }
      setAuthStatus("guest");
      setMailboxDomain("");
      setDomains([]);
      setUser(null);
      message.error(normalizeApiError(error));
    }
  }

  function handleUnauthorized(silent = false) {
    if (!silent && authStatus === "authenticated") {
      message.warning("登录状态已失效，请重新登录。");
    }
    setDomains([]);
    setMailboxDomain("");
    setUser(null);
    setAuthStatus("guest");
  }

  async function handleLogin(payload: LoginPayload) {
    setLoginLoading(true);
    try {
      await login(payload);
      await hydrateSession(true);
      message.success("登录成功");
    } catch (error) {
      message.error(normalizeApiError(error, "登录失败"));
      setAuthStatus("guest");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await logout();
      setDomains([]);
      setMailboxDomain("");
      setUser(null);
      setAuthStatus("guest");
      message.success("已退出登录");
    } catch (error) {
      message.error(normalizeApiError(error, "退出失败"));
    }
  }

  if (authStatus === "loading") {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: token.colorBgLayout }}>
        <Spin size="large" />
      </div>
    );
  }

  if (authStatus === "guest") {
    return (
      <Suspense fallback={<div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}><Spin size="large" /></div>}>
        <LoginPage loading={loginLoading} onLogin={handleLogin} />
      </Suspense>
    );
  }

  return (
    <BrowserRouter>
      <DashboardShell
        domains={domains}
        mailboxDomain={mailboxDomain}
        onLogout={handleLogout}
        onMailboxesChanged={refreshDomains}
        onUnauthorized={() => handleUnauthorized()}
        user={user}
      />
    </BrowserRouter>
  );
}
