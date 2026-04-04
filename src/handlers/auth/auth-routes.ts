import {
  addAuditLog,
  findAdminUserByUsername,
  touchAdminUserLogin,
} from "../../core/db";
import { captureError } from "../../core/errors";
import {
  clearAdminSessionCookie,
  createBootstrapSessionCookie,
  createSessionCookie,
  verifyPassword,
} from "../../core/auth";
import { sendEventNotifications } from "../../core/notifications";
import { json, jsonError, readJsonBody } from "../../utils/utils";
import type { AuthSession, WorkerEnv } from "../../server/types";

export async function handleAdminLogin(
  request: Request,
  env: WorkerEnv,
): Promise<Response> {
  const parsed = await readJsonBody<{
    password?: string;
    token?: string;
    username?: string;
  }>(request);
  if (!parsed.ok) return jsonError(parsed.error || "invalid JSON body", 400);

  const token = String(parsed.data?.token || "").trim();
  if (token && env.ADMIN_TOKEN && token === env.ADMIN_TOKEN) {
    const response = json({
      ok: true,
      user: {
        display_name: "初始管理员",
        role: "owner",
        username: "bootstrap-owner",
      },
    });
    response.headers.set(
      "Set-Cookie",
      await createBootstrapSessionCookie(
        request,
        env.ADMIN_TOKEN,
        env.SESSION_SECRET,
      ),
    );
    await addAuditLog(env.DB, {
      action: "admin.login",
      actor: {
        display_name: "初始管理员",
        role: "owner",
        user_id: "bootstrap-owner",
      },
      detail: { auth_kind: "bootstrap_token" },
      entity_type: "admin_session",
    });
    await sendEventNotifications(env.DB, "admin.login", {
      auth_kind: "bootstrap_token",
      username: "bootstrap-owner",
    });
    return response;
  }

  const username = String(parsed.data?.username || "")
    .trim()
    .toLowerCase();
  const password = String(parsed.data?.password || "");
  if (!username || !password) {
    if (token) {
      await captureError(
        env.DB,
        "auth.login_failed",
        new Error("invalid bootstrap token"),
        {
          reason: "invalid_bootstrap_token",
        },
        env.ERROR_WEBHOOK_URL,
      );
    }
    return jsonError("token or username/password is required", 400);
  }

  const adminUser = await findAdminUserByUsername(env.DB, username);
  if (!adminUser || !adminUser.is_enabled) {
    await captureError(
      env.DB,
      "auth.login_failed",
      new Error("invalid credentials"),
      {
        reason: !adminUser ? "user_not_found" : "user_disabled",
        username,
      },
      env.ERROR_WEBHOOK_URL,
    );
    return jsonError("invalid credentials", 401);
  }

  const verified = await verifyPassword(
    password,
    adminUser.password_hash,
    adminUser.password_salt,
  );
  if (!verified) {
    await captureError(
      env.DB,
      "auth.login_failed",
      new Error("invalid credentials"),
      {
        reason: "password_mismatch",
        username,
      },
      env.ERROR_WEBHOOK_URL,
    );
    return jsonError("invalid credentials", 401);
  }

  const response = json({
    ok: true,
    user: {
      access_scope: adminUser.access_scope,
      display_name: adminUser.display_name,
      role: adminUser.role,
      username: adminUser.username,
    },
  });

  response.headers.set(
    "Set-Cookie",
    await createSessionCookie(
      request,
      {
        access_scope: adminUser.access_scope,
        auth_kind: "admin_user",
        display_name: adminUser.display_name,
        expires_at: Date.now(),
        project_ids: adminUser.projects.map((project) => project.id),
        role: adminUser.role,
        user_agent_hash: "",
        user_id: adminUser.id,
        username: adminUser.username,
      },
      env.ADMIN_TOKEN || env.SESSION_SECRET || "testmail-hub",
      env.SESSION_SECRET,
    ),
  );

  await touchAdminUserLogin(env.DB, adminUser.id);
  await addAuditLog(env.DB, {
    action: "admin.login",
    actor: {
      display_name: adminUser.display_name,
      role: adminUser.role,
      user_id: adminUser.id,
    },
    detail: { auth_kind: "admin_user", username: adminUser.username },
    entity_type: "admin_session",
  });
  await sendEventNotifications(env.DB, "admin.login", {
    auth_kind: "admin_user",
    username: adminUser.username,
  });
  return response;
}

export function handleAdminSession(
  env: WorkerEnv,
  session: AuthSession,
): Response {
  return json({
    ok: true,
    mailbox_domain: env.MAILBOX_DOMAIN || "",
    user: {
      access_scope: session.access_scope || "all",
      display_name: session.display_name,
      role: session.role,
      username: session.username,
    },
  });
}

export function handleAdminLogout(request: Request): Response {
  const response = json({ ok: true });
  response.headers.set("Set-Cookie", clearAdminSessionCookie(request));
  return response;
}
