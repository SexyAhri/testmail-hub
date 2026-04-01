import { App as AntdApp, Layout, Spin, theme } from "antd";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { getDomains, getSession, login, logout, subscribeRequestActivity } from "./api";
import { APP_BROWSER_TITLE } from "./brand";
import { Footer, Header, Sidebar, buildDefaultSidebarItems } from "./components";
import type { LoginPayload, SessionPayload } from "./types";
import { normalizeApiError } from "./utils";

const { Content } = Layout;

const ApiDocsPage = lazy(() => import("./pages/api-docs/ApiDocsPage"));
const ApiTokensPage = lazy(() => import("./pages/api-tokens/ApiTokensPage"));
const AdminsPage = lazy(() => import("./pages/admins/AdminsPage"));
const AuditLogsPage = lazy(() => import("./pages/audit-logs/AuditLogsPage"));
const ArchivesPage = lazy(() => import("./pages/archives/ArchivesPage"));
const DashboardPage = lazy(() => import("./pages/dashboard/DashboardPage"));
const DomainsPage = lazy(() => import("./pages/domains/DomainsPage"));
const EmailDetailPage = lazy(() => import("./pages/email-detail/EmailDetailPage"));
const EmailsPage = lazy(() => import("./pages/emails/EmailsPage"));
const ErrorsPage = lazy(() => import("./pages/errors/ErrorsPage"));
const LoginPage = lazy(() => import("./pages/login/LoginPage"));
const MailboxesPage = lazy(() => import("./pages/mailboxes/MailboxesPage"));
const NotificationsPage = lazy(() => import("./pages/notifications/NotificationsPage"));
const OutboundEmailsPage = lazy(() => import("./pages/outbound/OutboundEmailsPage"));
const ProjectsPage = lazy(() => import("./pages/projects/ProjectsPage"));
const RetentionPoliciesPage = lazy(() => import("./pages/retention/RetentionPoliciesPage"));
const RulesPage = lazy(() => import("./pages/rules/RulesPage"));
const TrashPage = lazy(() => import("./pages/trash/TrashPage"));
const WhitelistPage = lazy(() => import("./pages/whitelist/WhitelistPage"));

type AuthStatus = "authenticated" | "guest" | "loading";

function getBreadcrumbs(pathname: string) {
  const items: Array<{ path?: string; title: string }> = [{ path: "/monitor", title: "首页" }];

  if (pathname.startsWith("/monitor")) items.push({ title: "监控中心" });
  if (pathname.startsWith("/projects")) items.push({ title: "项目空间" });
  if (pathname.startsWith("/domains")) items.push({ title: "域名资产" });
  if (pathname.startsWith("/emails/")) items.push({ path: "/emails", title: "邮件中心" }, { title: "邮件详情" });
  if (pathname === "/emails") items.push({ title: "邮件中心" });
  if (pathname.startsWith("/archives")) items.push({ title: "归档中心" });
  if (pathname.startsWith("/trash")) items.push({ title: "回收站" });
  if (pathname.startsWith("/retention")) items.push({ title: "生命周期策略" });
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
  requestLoading: boolean;
  user: SessionPayload["user"] | null;
}

function DashboardShell({
  domains,
  mailboxDomain,
  onLogout,
  onMailboxesChanged,
  onUnauthorized,
  requestLoading,
  user,
}: DashboardShellProps) {
  const { token } = theme.useToken();
  const location = useLocation();
  const navigate = useNavigate();
  const sidebarItems = useMemo(() => buildDefaultSidebarItems(user), [user]);

  return (
    <Layout style={{ minHeight: "100vh", height: "100vh", overflow: "hidden", background: token.colorBgLayout }}>
      <Sidebar items={sidebarItems} pathname={location.pathname} onNavigate={path => navigate(path)} />
      <Layout style={{ background: token.colorBgLayout, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
        <Header
          breadcrumbs={getBreadcrumbs(location.pathname)}
          onLogout={onLogout}
          onNavigate={path => navigate(path)}
          requestLoading={requestLoading}
          username={user?.display_name || user?.username || "Admin"}
        />
        <Content
          style={{
            padding: 10,
            background: token.colorBgContainer,
            borderRadius: token.borderRadius,
            minHeight: 280,
            flex: "1 1 0",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <Suspense
            fallback={(
              <div style={{ padding: 80, textAlign: "center" }}>
                <Spin size="large" />
              </div>
            )}
          >
            <div key={location.pathname} className="page-content app-shell-page-content">
              <Routes>
                <Route path="/" element={<Navigate to="/monitor" replace />} />
                <Route path="/monitor" element={<DashboardPage domains={domains} mailboxDomain={mailboxDomain} onUnauthorized={onUnauthorized} />} />
                <Route path="/projects" element={<ProjectsPage currentUser={user} onUnauthorized={onUnauthorized} />} />
                <Route path="/domains" element={<DomainsPage currentUser={user} onDomainsChanged={onMailboxesChanged} onUnauthorized={onUnauthorized} />} />
                <Route path="/emails" element={<EmailsPage currentUser={user} domains={domains} onUnauthorized={onUnauthorized} />} />
                <Route path="/emails/:messageId" element={<EmailDetailPage currentUser={user} onUnauthorized={onUnauthorized} />} />
                <Route path="/archives" element={<ArchivesPage currentUser={user} onUnauthorized={onUnauthorized} />} />
                <Route path="/trash" element={<TrashPage currentUser={user} onUnauthorized={onUnauthorized} />} />
                <Route path="/retention" element={<RetentionPoliciesPage currentUser={user} onUnauthorized={onUnauthorized} />} />
                <Route path="/rules" element={<RulesPage currentUser={user} onUnauthorized={onUnauthorized} />} />
                <Route path="/whitelist" element={<WhitelistPage currentUser={user} onUnauthorized={onUnauthorized} />} />
                <Route path="/mailboxes" element={<MailboxesPage currentUser={user} domains={domains} mailboxDomain={mailboxDomain} onMailboxesChanged={onMailboxesChanged} onUnauthorized={onUnauthorized} />} />
                <Route path="/outbound" element={<OutboundEmailsPage currentUser={user} onUnauthorized={onUnauthorized} />} />
                <Route path="/admins" element={<AdminsPage currentUser={user} onUnauthorized={onUnauthorized} />} />
                <Route path="/notifications" element={<NotificationsPage currentUser={user} onUnauthorized={onUnauthorized} />} />
                <Route path="/api-tokens" element={<ApiTokensPage currentUser={user} onUnauthorized={onUnauthorized} />} />
                <Route path="/system/audit" element={<AuditLogsPage currentUser={user} onUnauthorized={onUnauthorized} />} />
                <Route path="/system/errors" element={<ErrorsPage currentUser={user} onUnauthorized={onUnauthorized} />} />
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
  const [requestLoading, setRequestLoading] = useState(false);
  const [domains, setDomains] = useState<string[]>([]);
  const [user, setUser] = useState<SessionPayload["user"] | null>(null);

  useEffect(() => {
    document.title = APP_BROWSER_TITLE;
    void hydrateSession(true);
  }, []);

  useEffect(() => subscribeRequestActivity(count => setRequestLoading(count > 0)), []);

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
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: token.colorBgLayout,
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  if (authStatus === "guest") {
    return (
      <Suspense
        fallback={(
          <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Spin size="large" />
          </div>
        )}
      >
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
        requestLoading={requestLoading}
        user={user}
      />
    </BrowserRouter>
  );
}
