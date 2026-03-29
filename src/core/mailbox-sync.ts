import { isValidEmailAddress, normalizeEmailAddress } from "../utils/utils";
import type { WorkerEnv } from "../server/types";

export interface MailboxSyncCandidate {
  address: string;
  is_enabled: boolean;
  last_received_at: number | null;
  receive_count: number;
  source: "cloudflare" | "observed";
}

interface CloudflareApiEnvelope<T> {
  errors?: Array<{ message?: string }>;
  result?: T;
  result_info?: {
    page?: number;
    per_page?: number;
    total_count?: number;
    total_pages?: number;
  };
  success?: boolean;
}

interface CloudflareRoutingAction {
  type?: string;
  value?: unknown;
}

interface CloudflareRoutingMatcher {
  field?: string;
  type?: string;
  value?: string;
}

interface CloudflareRoutingRule {
  actions?: CloudflareRoutingAction[];
  enabled?: boolean;
  id?: string;
  matchers?: CloudflareRoutingMatcher[];
  name?: string;
  priority?: number;
}

interface CloudflareRoutingRuleInput {
  actions: CloudflareRoutingAction[];
  enabled: boolean;
  matchers: CloudflareRoutingMatcher[];
  name: string;
  priority?: number;
}

interface CloudflareCatchAllRule {
  actions?: CloudflareRoutingAction[];
  enabled?: boolean;
}

interface CloudflareCredentials {
  apiToken: string;
  mailboxDomain: string;
  workerName: string;
  zoneId: string;
}

export interface CloudflareMailboxSyncSnapshot {
  candidates: MailboxSyncCandidate[];
  catch_all_enabled: boolean;
  configured: boolean;
}

export function isCloudflareMailboxSyncConfigured(
  env: Pick<WorkerEnv, "CLOUDFLARE_API_TOKEN" | "CLOUDFLARE_ZONE_ID" | "MAILBOX_DOMAIN">,
): boolean {
  const credentials = resolveCredentials(env);
  return Boolean(credentials);
}

export function extractCloudflareMailboxCandidates(
  rules: CloudflareRoutingRule[],
  mailboxDomain: string,
): MailboxSyncCandidate[] {
  const normalizedDomain = String(mailboxDomain || "").trim().toLowerCase();
  const seen = new Map<string, MailboxSyncCandidate>();

  for (const rule of rules) {
    const address = extractLiteralAddressMatcher(rule, normalizedDomain);
    if (!address) continue;

    const current = seen.get(address);
    const next: MailboxSyncCandidate = {
      address,
      is_enabled: rule.enabled !== false,
      last_received_at: null,
      receive_count: 0,
      source: "cloudflare",
    };

    if (!current || (current.is_enabled === false && next.is_enabled === true)) {
      seen.set(address, next);
    }
  }

  return Array.from(seen.values()).sort((left, right) => left.address.localeCompare(right.address));
}

export async function getCloudflareMailboxSyncSnapshot(
  env: Pick<WorkerEnv, "CLOUDFLARE_API_TOKEN" | "CLOUDFLARE_ZONE_ID" | "MAILBOX_DOMAIN" | "CLOUDFLARE_EMAIL_WORKER">,
): Promise<CloudflareMailboxSyncSnapshot> {
  const credentials = resolveCredentials(env);
  if (!credentials) {
    return {
      candidates: [],
      catch_all_enabled: false,
      configured: false,
    };
  }

  const [catchAllEnvelope, rules] = await Promise.all([
    requestCloudflare<CloudflareCatchAllRule>(credentials, "/email/routing/rules/catch_all"),
    listCloudflareRoutingRules(credentials),
  ]);

  return {
    candidates: extractCloudflareMailboxCandidates(rules, credentials.mailboxDomain),
    catch_all_enabled: Boolean(catchAllEnvelope.result?.enabled),
    configured: true,
  };
}

export async function upsertCloudflareMailboxRoute(
  env: Pick<WorkerEnv, "CLOUDFLARE_API_TOKEN" | "CLOUDFLARE_ZONE_ID" | "MAILBOX_DOMAIN" | "CLOUDFLARE_EMAIL_WORKER">,
  input: { address: string; is_enabled: boolean },
): Promise<"created" | "updated" | "skipped"> {
  const credentials = resolveCredentials(env);
  if (!credentials) return "skipped";

  const address = normalizeEmailAddress(input.address);
  if (!address || !isValidEmailAddress(address)) {
    throw new Error("invalid mailbox address for Cloudflare route sync");
  }
  if (!address.endsWith(`@${credentials.mailboxDomain}`)) {
    throw new Error(`mailbox address must use @${credentials.mailboxDomain}`);
  }

  const rules = await listCloudflareRoutingRules(credentials);
  const existing = findRuleByAddress(rules, address, credentials.mailboxDomain);

  if (existing?.id) {
    const actions = cloneActions(existing.actions);
    const resolvedActions = actions.length > 0 ? actions : resolveDefaultActions(rules, credentials.workerName);
    if (resolvedActions.length === 0) {
      throw new Error("unable to infer Cloudflare email routing action");
    }

    const payload: CloudflareRoutingRuleInput = {
      actions: resolvedActions,
      enabled: input.is_enabled,
      matchers: [{ field: "to", type: "literal", value: address }],
      name: existing.name || buildMailboxRuleName(address),
      priority: Number.isFinite(existing.priority) ? existing.priority : undefined,
    };

    await requestCloudflare<CloudflareRoutingRule>(
      credentials,
      `/email/routing/rules/${existing.id}`,
      "PUT",
      payload,
    );
    return "updated";
  }

  const actions = resolveDefaultActions(rules, credentials.workerName);
  if (actions.length === 0) {
    throw new Error("unable to infer Cloudflare email routing action");
  }

  const highestPriority = rules.reduce(
    (max, rule) => Number.isFinite(rule.priority) ? Math.max(max, Number(rule.priority)) : max,
    -1,
  );

  const payload: CloudflareRoutingRuleInput = {
    actions,
    enabled: input.is_enabled,
    matchers: [{ field: "to", type: "literal", value: address }],
    name: buildMailboxRuleName(address),
    priority: highestPriority + 1,
  };

  await requestCloudflare<CloudflareRoutingRule>(
    credentials,
    "/email/routing/rules",
    "POST",
    payload,
  );

  return "created";
}

export async function deleteCloudflareMailboxRoute(
  env: Pick<WorkerEnv, "CLOUDFLARE_API_TOKEN" | "CLOUDFLARE_ZONE_ID" | "MAILBOX_DOMAIN" | "CLOUDFLARE_EMAIL_WORKER">,
  addressInput: string,
): Promise<"deleted" | "skipped"> {
  const credentials = resolveCredentials(env);
  if (!credentials) return "skipped";

  const address = normalizeEmailAddress(addressInput);
  if (!address || !isValidEmailAddress(address)) return "skipped";

  const rules = await listCloudflareRoutingRules(credentials);
  const existing = findRuleByAddress(rules, address, credentials.mailboxDomain);
  if (!existing?.id) return "skipped";

  await requestCloudflare<null>(
    credentials,
    `/email/routing/rules/${existing.id}`,
    "DELETE",
  );
  return "deleted";
}

function resolveCredentials(
  env: Pick<WorkerEnv, "CLOUDFLARE_API_TOKEN" | "CLOUDFLARE_ZONE_ID" | "MAILBOX_DOMAIN" | "CLOUDFLARE_EMAIL_WORKER">,
): CloudflareCredentials | null {
  const apiToken = String(env.CLOUDFLARE_API_TOKEN || "").trim();
  const zoneId = String(env.CLOUDFLARE_ZONE_ID || "").trim();
  const mailboxDomain = String(env.MAILBOX_DOMAIN || "").trim().toLowerCase();
  const workerName = String(env.CLOUDFLARE_EMAIL_WORKER || "temp-email-worker").trim();
  if (!apiToken || !zoneId || !mailboxDomain) return null;
  return { apiToken, mailboxDomain, workerName, zoneId };
}

async function listCloudflareRoutingRules(
  credentials: CloudflareCredentials,
): Promise<CloudflareRoutingRule[]> {
  const perPage = 100;
  let page = 1;
  const output: CloudflareRoutingRule[] = [];

  while (true) {
    const envelope = await requestCloudflare<CloudflareRoutingRule[]>(
      credentials,
      `/email/routing/rules?page=${page}&per_page=${perPage}`,
    );
    output.push(...(Array.isArray(envelope.result) ? envelope.result : []));
    const totalPages = Number(envelope.result_info?.total_pages || 1);
    if (page >= totalPages) break;
    page += 1;
  }

  return output;
}

function findRuleByAddress(
  rules: CloudflareRoutingRule[],
  address: string,
  mailboxDomain: string,
): CloudflareRoutingRule | null {
  const normalizedAddress = normalizeEmailAddress(address);
  for (const rule of rules) {
    const candidate = extractLiteralAddressMatcher(rule, mailboxDomain);
    if (candidate === normalizedAddress) return rule;
  }
  return null;
}

function extractLiteralAddressMatcher(
  rule: CloudflareRoutingRule,
  mailboxDomain: string,
): string | null {
  if (!Array.isArray(rule.matchers) || rule.matchers.length === 0) return null;
  if (!targetsMailboxWorker(rule.actions)) return null;

  for (const matcher of rule.matchers) {
    const field = String(matcher?.field || "").trim().toLowerCase();
    const type = String(matcher?.type || "").trim().toLowerCase();
    const value = normalizeEmailAddress(matcher?.value);
    if (field && field !== "to") continue;
    if (type && type !== "literal") continue;
    if (!value || !isValidEmailAddress(value)) continue;
    if (mailboxDomain && !value.endsWith(`@${mailboxDomain}`)) continue;
    return value;
  }

  return null;
}

function targetsMailboxWorker(actions: CloudflareRoutingAction[] | undefined): boolean {
  if (!Array.isArray(actions) || actions.length === 0) return true;
  return actions.some(action => {
    const type = String(action?.type || "").trim().toLowerCase();
    return type === "worker" || type === "forward";
  });
}

function resolveDefaultActions(
  rules: CloudflareRoutingRule[],
  workerName: string,
): CloudflareRoutingAction[] {
  const workerTemplate = rules.find(rule =>
    Array.isArray(rule.actions) &&
    rule.actions.some(action => String(action?.type || "").trim().toLowerCase() === "worker"),
  );
  if (workerTemplate?.actions && workerTemplate.actions.length > 0) {
    return cloneActions(workerTemplate.actions);
  }

  const forwardTemplate = rules.find(rule =>
    Array.isArray(rule.actions) &&
    rule.actions.some(action => String(action?.type || "").trim().toLowerCase() === "forward"),
  );
  if (forwardTemplate?.actions && forwardTemplate.actions.length > 0) {
    return cloneActions(forwardTemplate.actions);
  }

  if (!workerName) return [];
  return [{ type: "worker", value: [workerName] }];
}

function cloneActions(actions: CloudflareRoutingAction[] | undefined): CloudflareRoutingAction[] {
  if (!Array.isArray(actions)) return [];
  return actions.map(action => ({
    type: action?.type,
    value: Array.isArray(action?.value) ? [...action.value] : action?.value,
  }));
}

function buildMailboxRuleName(address: string): string {
  const localPart = normalizeEmailAddress(address).split("@")[0] || "mailbox";
  return `TempMail ${localPart}`;
}

async function requestCloudflare<T>(
  credentials: CloudflareCredentials,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<CloudflareApiEnvelope<T>> {
  const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${credentials.zoneId}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${credentials.apiToken}`,
      "Content-Type": "application/json",
    },
    method,
  });

  const text = await response.text();
  const payload = text ? safeParseCloudflareEnvelope<T>(text) : null;
  if (!response.ok || !payload?.success) {
    const message =
      payload?.errors?.map(item => String(item?.message || "").trim()).filter(Boolean).join("; ") ||
      `Cloudflare API request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function safeParseCloudflareEnvelope<T>(value: string): CloudflareApiEnvelope<T> | null {
  try {
    const parsed = JSON.parse(value) as CloudflareApiEnvelope<T>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
