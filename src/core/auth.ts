import {
  hasAdminPermission,
  normalizeAdminRole,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from "../utils/constants";
import { decodeBase64Url, encodeBase64Url } from "../utils/utils";
import type { AdminPermission } from "../utils/constants";
import type { AdminRole, AuthSession } from "../server/types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
// Cloudflare Workers has strict CPU budgets; keep this moderate to avoid 1101/1102 on admin creation/login.
const PBKDF2_ITERATIONS = 20_000;
const PASSWORD_SALT_BYTES = 16;
const MANAGED_API_TOKEN_PREFIX = "tmc_pat_";
const MANAGED_API_TOKEN_SEPARATOR = ".";

interface SessionPayload extends AuthSession {
  exp: number;
  nonce: string;
  v: 1;
}

export async function getAdminSessionFromRequest(
  request: Request,
  adminToken: string | undefined,
  sessionSecret: string | undefined,
): Promise<AuthSession | null> {
  if (!adminToken) return null;

  if (getBearerToken(request) === adminToken) {
    return buildBootstrapSession(request);
  }

  const cookies = parseCookies(request.headers.get("Cookie") || "");
  const sessionValue = cookies[SESSION_COOKIE_NAME];
  if (!sessionValue) return null;

  const verified = await verifySessionToken(
    request,
    sessionValue,
    getSessionSecret(adminToken, sessionSecret),
  );
  return verified;
}

export function isApiAuthorized(request: Request, apiToken: string | undefined): boolean {
  if (!apiToken) return false;
  return getBearerToken(request) === apiToken;
}

export function createManagedApiTokenValue(id: string): string {
  const suffix = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
  return `${MANAGED_API_TOKEN_PREFIX}${id}${MANAGED_API_TOKEN_SEPARATOR}${suffix}`;
}

export function getManagedApiTokenId(token: string): string | null {
  const normalized = String(token || "").trim();
  if (!normalized.startsWith(MANAGED_API_TOKEN_PREFIX)) return null;

  const remainder = normalized.slice(MANAGED_API_TOKEN_PREFIX.length);
  const separatorIndex = remainder.indexOf(MANAGED_API_TOKEN_SEPARATOR);
  if (separatorIndex <= 0) return null;

  return remainder.slice(0, separatorIndex).trim() || null;
}

export async function hashApiTokenValue(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(String(token || "").trim()));
  return encodeBase64Url(new Uint8Array(digest));
}

export async function createBootstrapSessionCookie(
  request: Request,
  adminToken: string,
  sessionSecret?: string,
): Promise<string> {
  return createSessionCookie(
    request,
    buildBootstrapSession(request),
    adminToken,
    sessionSecret,
  );
}

export async function createSessionCookie(
  request: Request,
  session: AuthSession,
  adminToken: string,
  sessionSecret?: string,
): Promise<string> {
  const secret = getSessionSecret(adminToken, sessionSecret);
  const userAgentHash = session.user_agent_hash || await hashUserAgent(request);
  const payload: SessionPayload = {
    ...session,
    exp: Date.now() + SESSION_TTL_SECONDS * 1000,
    nonce: crypto.randomUUID(),
    user_agent_hash: userAgentHash,
    v: 1,
  };

  const encodedPayload = encodeBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await signValue(encodedPayload, secret);
  const isSecure = new URL(request.url).protocol === "https:";

  return serializeCookie(SESSION_COOKIE_NAME, `${encodedPayload}.${signature}`, {
    httpOnly: true,
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
    sameSite: "Lax",
    secure: isSecure,
  });
}

export function clearAdminSessionCookie(request: Request): string {
  const isSecure = new URL(request.url).protocol === "https:";
  return serializeCookie(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "Lax",
    secure: isSecure,
  });
}

export function hasPermission(role: AdminRole, permission: AdminPermission): boolean {
  return hasAdminPermission(role, permission);
}

export async function hashPassword(password: string, saltBase64Url?: string) {
  const salt = saltBase64Url
    ? decodeBase64Url(saltBase64Url)
    : crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES));
  const safeSalt = Uint8Array.from(salt);

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: PBKDF2_ITERATIONS,
      salt: safeSalt,
    },
    key,
    256,
  );

  return {
    hash: encodeBase64Url(new Uint8Array(bits)),
    salt: encodeBase64Url(salt),
  };
}

export async function verifyPassword(
  password: string,
  expectedHash: string,
  saltBase64Url: string,
): Promise<boolean> {
  const computed = await hashPassword(password, saltBase64Url);
  return timingSafeEqual(computed.hash, expectedHash);
}

export async function hashUserAgent(request: Request): Promise<string> {
  const value = request.headers.get("User-Agent") || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return encodeBase64Url(new Uint8Array(digest));
}

function buildBootstrapSession(request: Request): AuthSession {
  return {
    access_scope: "all",
    auth_kind: "bootstrap_token",
    display_name: "初始管理员",
    expires_at: Date.now() + SESSION_TTL_SECONDS * 1000,
    project_ids: [],
    role: "owner",
    user_agent_hash: "",
    user_id: "bootstrap-owner",
    username: getBearerToken(request) ? "token-owner" : "bootstrap-owner",
  };
}

async function verifySessionToken(
  request: Request,
  sessionToken: string,
  secret: string,
): Promise<AuthSession | null> {
  const [payload, signature] = String(sessionToken || "").split(".");
  if (!payload || !signature || !secret) return null;

  const verified = await verifyValue(payload, signature, secret);
  if (!verified) return null;

  try {
    const parsed = JSON.parse(decoder.decode(decodeBase64Url(payload))) as SessionPayload;
    if (parsed.v !== 1) return null;
    if (Number(parsed.exp) <= Date.now()) return null;

    if (parsed.user_agent_hash) {
      const currentHash = await hashUserAgent(request);
      if (!timingSafeEqual(parsed.user_agent_hash, currentHash)) return null;
    }

    return {
      access_scope: parsed.access_scope || "all",
      auth_kind: parsed.auth_kind,
      display_name: parsed.display_name,
      expires_at: parsed.exp,
      project_ids: Array.isArray(parsed.project_ids)
        ? parsed.project_ids
          .map(item => Number(item))
          .filter(item => Number.isFinite(item) && item > 0)
        : [],
      role: normalizeAdminRole(parsed.role, parsed.access_scope || "all") || "viewer",
      user_agent_hash: parsed.user_agent_hash,
      user_id: parsed.user_id,
      username: parsed.username,
    };
  } catch {
    return null;
  }
}

export function getBearerToken(request: Request): string {
  const header = request.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const output: Record<string, string> = {};
  for (const part of String(cookieHeader || "").split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey) output[rawKey] = decodeURIComponent(rest.join("="));
  }
  return output;
}

function getSessionSecret(adminToken: string | undefined, sessionSecret: string | undefined): string {
  return String(sessionSecret || adminToken || "");
}

async function signValue(value: string, secret: string): Promise<string> {
  const key = await getHmacKey(secret, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return encodeBase64Url(new Uint8Array(signature));
}

async function verifyValue(value: string, signature: string, secret: string): Promise<boolean> {
  const key = await getHmacKey(secret, ["verify"]);
  return crypto.subtle.verify("HMAC", key, Uint8Array.from(decodeBase64Url(signature)), encoder.encode(value));
}

async function getHmacKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

function serializeCookie(
  name: string,
  value: string,
  options: {
    httpOnly?: boolean;
    maxAge?: number;
    path?: string;
    sameSite?: "Lax" | "Strict" | "None";
    secure?: boolean;
  },
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}
