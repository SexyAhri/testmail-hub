import assert from "node:assert/strict";
import test from "node:test";

import {
  getNotificationDeliveriesPaged,
} from "../src/core/db";
import {
  processDueNotificationRetries,
  retryNotificationDelivery,
  sendEventNotifications,
} from "../src/core/notifications";
import type { D1Database, D1PreparedStatement } from "../src/server/types";

interface EndpointRow {
  access_scope: "all" | "bound";
  alert_config_json?: string;
  created_at: number;
  events: string;
  id: number;
  is_enabled: number;
  last_error: string;
  last_sent_at: number | null;
  last_status: string;
  name: string;
  secret: string;
  target: string;
  type: string;
  updated_at: number;
}

interface DeliveryRow {
  attempt_count: number;
  created_at: number;
  dead_letter_reason?: string;
  event: string;
  id: number;
  is_dead_letter?: number;
  last_attempt_at: number | null;
  last_error: string;
  max_attempts: number;
  next_retry_at: number | null;
  notification_endpoint_id: number;
  payload_json: string;
  response_status: number | null;
  resolved_at?: number | null;
  resolved_by?: string;
  scope_json: string;
  status: string;
  updated_at: number;
}

interface AttemptRow {
  attempt_number: number;
  attempted_at: number;
  created_at: number;
  duration_ms: number | null;
  error_message: string;
  id: number;
  next_retry_at: number | null;
  notification_delivery_id: number;
  notification_endpoint_id: number;
  response_status: number | null;
  status: string;
  updated_at: number;
}

function createNotificationDbFixture(options?: {
  attempts?: AttemptRow[];
  bindings?: Array<{ notification_endpoint_id: number; project_id: number; project_name: string; project_slug: string }>;
  deliveries?: DeliveryRow[];
  endpoints?: EndpointRow[];
}) {
  const endpoints = options?.endpoints || [
    {
      access_scope: "all" as const,
      alert_config_json: "{}",
      created_at: 1,
      events: JSON.stringify(["email.received"]),
      id: 1,
      is_enabled: 1,
      last_error: "",
      last_sent_at: null,
      last_status: "",
      name: "global",
      secret: "",
      target: "https://global.example.com/webhook",
      type: "webhook",
      updated_at: 1,
    },
    {
      access_scope: "bound" as const,
      alert_config_json: "{}",
      created_at: 1,
      events: JSON.stringify(["email.received"]),
      id: 2,
      is_enabled: 1,
      last_error: "",
      last_sent_at: null,
      last_status: "",
      name: "alpha",
      secret: "",
      target: "https://alpha.example.com/webhook",
      type: "webhook",
      updated_at: 1,
    },
    {
      access_scope: "bound" as const,
      alert_config_json: "{}",
      created_at: 1,
      events: JSON.stringify(["email.received"]),
      id: 3,
      is_enabled: 1,
      last_error: "",
      last_sent_at: null,
      last_status: "",
      name: "beta",
      secret: "",
      target: "https://beta.example.com/webhook",
      type: "webhook",
      updated_at: 1,
    },
  ];

  const bindings = options?.bindings || [
    {
      notification_endpoint_id: 2,
      project_id: 1,
      project_name: "Alpha",
      project_slug: "alpha",
    },
    {
      notification_endpoint_id: 3,
      project_id: 2,
      project_name: "Beta",
      project_slug: "beta",
    },
  ];

  const deliveries = [...(options?.deliveries || [])];
  const attempts = [...(options?.attempts || [])];

  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      let params: unknown[] = [];

      return {
        bind(...values: unknown[]) {
          params = values;
          return this;
        },
        all: async () => {
          if (query.includes("FROM notification_endpoints ORDER BY created_at DESC")) {
            return { results: endpoints };
          }

          if (query.includes("FROM notification_endpoint_project_bindings")) {
            const filteredIds = params.map(value => String(value));
            return {
              results: bindings
                .filter(binding => filteredIds.length === 0 || filteredIds.includes(String(binding.notification_endpoint_id)))
                .map(binding => ({
                  binding_id: binding.notification_endpoint_id,
                  project_id: binding.project_id,
                  project_name: binding.project_name,
                  project_slug: binding.project_slug,
                })),
            };
          }

          if (query.includes("FROM notification_deliveries WHERE status IN ('pending', 'retrying')")) {
            const [now, limit] = params as [number, number];
            return {
              results: deliveries
                .filter(item =>
                  ["pending", "retrying"].includes(item.status)
                  && item.next_retry_at !== null
                  && item.next_retry_at <= now,
                )
                .sort((left, right) => (left.next_retry_at || 0) - (right.next_retry_at || 0))
                .slice(0, Number(limit)),
            };
          }

          if (query.includes("FROM notification_deliveries WHERE notification_endpoint_id = ?")) {
            const endpointId = Number(params[0]);
            const pageSize = Number(params[params.length - 2]);
            const offset = Number(params[params.length - 1]);
            const deadLetterOnly = query.includes("is_dead_letter = 1");

            return {
              results: deliveries
                .filter(item =>
                  item.notification_endpoint_id === endpointId
                  && (!deadLetterOnly || Number(item.is_dead_letter || 0) === 1),
                )
                .sort((left, right) => right.created_at - left.created_at || right.id - left.id)
                .slice(offset, offset + pageSize),
            };
          }

          if (query.includes("FROM notification_delivery_attempts WHERE notification_delivery_id = ?")) {
            const [deliveryId, limit, offset] = params as [number, number, number];
            return {
              results: attempts
                .filter(item => item.notification_delivery_id === Number(deliveryId))
                .sort((left, right) => right.attempted_at - left.attempted_at || right.id - left.id)
                .slice(Number(offset), Number(offset) + Number(limit)),
            };
          }

          throw new Error(`Unexpected all query: ${query}`);
        },
        first: async () => {
          if (query.includes("FROM notification_deliveries WHERE id = ? LIMIT 1")) {
            const id = Number(params[0]);
            return deliveries.find(item => item.id === id) || null;
          }

          if (query.includes("FROM notification_deliveries WHERE notification_endpoint_id = ? AND event = ? AND created_at = ?")) {
            const [endpointId, event, createdAt] = params as [number, string, number];
            return (
              deliveries.find(item =>
                item.notification_endpoint_id === endpointId
                && item.event === event
                && item.created_at === createdAt,
              ) || null
            );
          }

          if (query.includes("FROM notification_endpoints WHERE id = ? LIMIT 1")) {
            const id = Number(params[0]);
            return endpoints.find(item => item.id === id) || null;
          }

          if (query.includes("COUNT(1) as total FROM notification_delivery_attempts")) {
            const deliveryId = Number(params[0]);
            return { total: attempts.filter(item => item.notification_delivery_id === deliveryId).length };
          }

          if (query.includes("COUNT(1) as total FROM notification_deliveries WHERE notification_endpoint_id = ?")) {
            const endpointId = Number(params[0]);
            const deadLetterOnly = query.includes("is_dead_letter = 1");
            return {
              total: deliveries.filter(item =>
                item.notification_endpoint_id === endpointId
                && (!deadLetterOnly || Number(item.is_dead_letter || 0) === 1),
              ).length,
            };
          }

          if (query.includes("COUNT(1) as total_deliveries")) {
            const endpointId = Number(params[0]);
            const matched = deliveries.filter(item => item.notification_endpoint_id === endpointId);
            return {
              dead_letter_total: matched.filter(item => Number(item.is_dead_letter || 0) === 1).length,
              failed_total: matched.filter(item => item.status === "failed").length,
              last_attempt_at: matched.reduce<number | null>((latest, item) => {
                if (item.last_attempt_at === null || item.last_attempt_at === undefined) return latest;
                return latest === null ? Number(item.last_attempt_at) : Math.max(latest, Number(item.last_attempt_at));
              }, null),
              pending_total: matched.filter(item => item.status === "pending").length,
              resolved_dead_letter_total: matched.filter(item => item.resolved_at !== null && item.resolved_at !== undefined).length,
              retrying_total: matched.filter(item => item.status === "retrying").length,
              success_total: matched.filter(item => item.status === "success").length,
              total_attempts: matched.reduce((sum, item) => sum + Number(item.attempt_count || 0), 0),
              total_deliveries: matched.length,
            };
          }

          if (query.includes("recent_success_attempts_24h")) {
            const [endpointId, threshold] = params as [number, number];
            const matched = attempts.filter(item =>
              item.notification_endpoint_id === Number(endpointId)
              && item.attempted_at >= Number(threshold),
            );
            return {
              avg_duration_ms_24h:
                matched.length > 0
                  ? matched.reduce((sum, item) => sum + Number(item.duration_ms || 0), 0) / matched.length
                  : null,
              last_failure_at: matched
                .filter(item => ["failed", "retrying"].includes(item.status))
                .reduce<number | null>((latest, item) =>
                  latest === null ? item.attempted_at : Math.max(latest, item.attempted_at), null),
              last_success_at: matched
                .filter(item => item.status === "success")
                .reduce<number | null>((latest, item) =>
                  latest === null ? item.attempted_at : Math.max(latest, item.attempted_at), null),
              recent_attempts_24h: matched.length,
              recent_failed_attempts_24h: matched.filter(item => ["failed", "retrying"].includes(item.status)).length,
              recent_success_attempts_24h: matched.filter(item => item.status === "success").length,
            };
          }

          return null;
        },
        run: async () => {
          if (query.startsWith("INSERT INTO notification_deliveries")) {
            const [
              notification_endpoint_id,
              event,
              payload_json,
              scope_json,
              status,
              max_attempts,
              next_retry_at,
              created_at,
              updated_at,
            ] = params;
            const id = deliveries.length > 0 ? Math.max(...deliveries.map(item => item.id)) + 1 : 1;
            deliveries.push({
              attempt_count: 0,
              created_at: Number(created_at),
              event: String(event),
              id,
              is_dead_letter: 0,
              last_attempt_at: null,
              last_error: "",
              max_attempts: Number(max_attempts),
              next_retry_at: Number(next_retry_at),
              notification_endpoint_id: Number(notification_endpoint_id),
              payload_json: String(payload_json),
              response_status: null,
              dead_letter_reason: "",
              resolved_at: null,
              resolved_by: "",
              scope_json: String(scope_json),
              status: String(status),
              updated_at: Number(updated_at),
            });
            return { meta: { last_row_id: id } };
          }

          if (query.startsWith("UPDATE notification_deliveries SET status = ?")) {
            const [
              status,
              attempt_count,
              last_error,
              response_status,
              next_retry_at,
              last_attempt_at,
              is_dead_letter,
              dead_letter_reason,
              resolved_at,
              resolved_by,
              updated_at,
              id,
            ] = params;
            const row = deliveries.find(item => item.id === Number(id));
            if (!row) throw new Error(`Delivery ${id} not found`);
            row.status = String(status);
            row.attempt_count = Number(attempt_count);
            row.last_error = String(last_error || "");
            row.response_status = response_status === null || response_status === undefined ? null : Number(response_status);
            row.next_retry_at = next_retry_at === null || next_retry_at === undefined ? null : Number(next_retry_at);
            row.last_attempt_at = last_attempt_at === null || last_attempt_at === undefined ? null : Number(last_attempt_at);
            row.is_dead_letter = Number(is_dead_letter || 0);
            row.dead_letter_reason = String(dead_letter_reason || "");
            row.resolved_at = resolved_at === null || resolved_at === undefined ? null : Number(resolved_at);
            row.resolved_by = String(resolved_by || "");
            row.updated_at = Number(updated_at);
            return {};
          }

          if (query.startsWith("INSERT INTO notification_delivery_attempts")) {
            const [
              notification_delivery_id,
              notification_endpoint_id,
              attempt_number,
              status,
              response_status,
              error_message,
              next_retry_at,
              attempted_at,
              duration_ms,
              created_at,
              updated_at,
            ] = params;
            const id = attempts.length > 0 ? Math.max(...attempts.map(item => item.id)) + 1 : 1;
            attempts.push({
              attempt_number: Number(attempt_number),
              attempted_at: Number(attempted_at),
              created_at: Number(created_at),
              duration_ms: duration_ms === null || duration_ms === undefined ? null : Number(duration_ms),
              error_message: String(error_message || ""),
              id,
              next_retry_at: next_retry_at === null || next_retry_at === undefined ? null : Number(next_retry_at),
              notification_delivery_id: Number(notification_delivery_id),
              notification_endpoint_id: Number(notification_endpoint_id),
              response_status: response_status === null || response_status === undefined ? null : Number(response_status),
              status: String(status),
              updated_at: Number(updated_at),
            });
            return { meta: { last_row_id: id } };
          }

          if (query.startsWith("UPDATE notification_endpoints SET last_status = ?")) {
            const [status, last_error, last_sent_at, updated_at, id] = params;
            const row = endpoints.find(item => item.id === Number(id));
            if (!row) throw new Error(`Endpoint ${id} not found`);
            row.last_status = String(status);
            row.last_error = String(last_error || "");
            row.last_sent_at = Number(last_sent_at);
            row.updated_at = Number(updated_at);
            return {};
          }

          throw new Error(`Unexpected run query: ${query}`);
        },
      };
    },
  };

  return { attempts, bindings, db, deliveries, endpoints };
}

test("sendEventNotifications only delivers project-bound webhooks to matching projects", async () => {
  const { db, deliveries } = createNotificationDbFixture();
  const calls: Array<{ body: Record<string, unknown>; url: string }> = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      body: JSON.parse(String(init?.body || "{}")) as Record<string, unknown>,
      url: String(input),
    });
    return new Response("ok", { status: 200 });
  }) as typeof fetch;

  try {
    await sendEventNotifications(
      db,
      "email.received",
      { message_id: "msg-1" },
      {
        environment_id: 11,
        mailbox_pool_id: 21,
        project_id: 1,
        project_ids: [1],
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 2);
  assert.deepEqual(
    calls.map(item => item.url).sort(),
    [
      "https://alpha.example.com/webhook",
      "https://global.example.com/webhook",
    ],
  );
  assert.equal((calls[0]?.body.scope as Record<string, unknown>).project_id, 1);
  assert.equal(deliveries.length, 2);
  assert.ok(deliveries.every(item => item.status === "success"));
});

test("failed delivery enters retry queue with backoff", async () => {
  const { attempts, db, deliveries, endpoints } = createNotificationDbFixture({
    endpoints: [
      {
        access_scope: "all",
        created_at: 1,
        events: JSON.stringify(["email.received"]),
        id: 1,
        is_enabled: 1,
        last_error: "",
        last_sent_at: null,
        last_status: "",
        name: "failing",
        secret: "",
        target: "https://fail.example.com/webhook",
        type: "webhook",
        updated_at: 1,
      },
    ],
    bindings: [],
  });
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;

  try {
    await sendEventNotifications(db, "email.received", { message_id: "msg-2" }, {});
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0]?.status, "retrying");
  assert.equal(deliveries[0]?.attempt_count, 1);
  assert.equal(deliveries[0]?.is_dead_letter, 0);
  assert.equal(deliveries[0]?.response_status, 500);
  assert.ok((deliveries[0]?.next_retry_at || 0) > Date.now() - 1000);
  assert.equal(endpoints[0]?.last_status, "retrying");
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0]?.status, "retrying");
});

test("terminal notification failure enters dead letter queue and records attempt detail", async () => {
  const { attempts, db, deliveries, endpoints } = createNotificationDbFixture({
    endpoints: [
      {
        access_scope: "all",
        created_at: 1,
        events: JSON.stringify(["email.received"]),
        id: 1,
        is_enabled: 1,
        last_error: "",
        last_sent_at: null,
        last_status: "",
        name: "dead-letter",
        secret: "",
        target: "https://dead-letter.example.com/webhook",
        type: "webhook",
        updated_at: 1,
      },
    ],
    bindings: [],
  });
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;

  try {
    const source = await sendEventNotifications(db, "email.received", { message_id: "msg-dead" }, {});
    void source;
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0]?.status, "retrying");
  assert.equal(attempts.length, 1);

  deliveries[0]!.attempt_count = 3;
  deliveries[0]!.max_attempts = 4;
  deliveries[0]!.next_retry_at = Date.now() - 1;

  globalThis.fetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;
  try {
    const summary = await processDueNotificationRetries(db, 20);
    assert.deepEqual(summary, { failed: 1, processed: 1, retrying: 0, success: 0 });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(deliveries[0]?.status, "failed");
  assert.equal(deliveries[0]?.is_dead_letter, 1);
  assert.equal(deliveries[0]?.dead_letter_reason, "notification failed with status 500: boom");
  assert.equal(endpoints[0]?.last_status, "failed");
  assert.equal(attempts.length, 2);
  assert.equal(attempts[1]?.status, "failed");
});

test("processDueNotificationRetries only processes deliveries that are due", async () => {
  const { db, deliveries } = createNotificationDbFixture({
    deliveries: [
      {
        attempt_count: 1,
        created_at: 100,
        event: "email.received",
        id: 10,
        last_attempt_at: 100,
        last_error: "notification failed with status 500",
        max_attempts: 4,
        next_retry_at: Date.now() - 500,
        notification_endpoint_id: 1,
        payload_json: JSON.stringify({ message_id: "due" }),
        response_status: 500,
        scope_json: "{}",
        status: "retrying",
        updated_at: 100,
      },
      {
        attempt_count: 1,
        created_at: 101,
        event: "email.received",
        id: 11,
        last_attempt_at: 101,
        last_error: "notification failed with status 500",
        max_attempts: 4,
        next_retry_at: Date.now() + 60_000,
        notification_endpoint_id: 1,
        payload_json: JSON.stringify({ message_id: "future" }),
        response_status: 500,
        scope_json: "{}",
        status: "retrying",
        updated_at: 101,
      },
    ],
    bindings: [],
    endpoints: [
      {
        access_scope: "all",
        created_at: 1,
        events: JSON.stringify(["email.received"]),
        id: 1,
        is_enabled: 1,
        last_error: "",
        last_sent_at: null,
        last_status: "",
        name: "global",
        secret: "",
        target: "https://retry.example.com/webhook",
        type: "webhook",
        updated_at: 1,
      },
    ],
  });
  const originalFetch = globalThis.fetch;
  let callCount = 0;

  globalThis.fetch = (async () => {
    callCount += 1;
    return new Response("ok", { status: 200 });
  }) as typeof fetch;

  try {
    const summary = await processDueNotificationRetries(db, 20);
    assert.deepEqual(summary, { failed: 0, processed: 1, retrying: 0, success: 1 });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(callCount, 1);
  assert.equal(deliveries.find(item => item.id === 10)?.status, "success");
  assert.equal(deliveries.find(item => item.id === 10)?.attempt_count, 2);
  assert.equal(deliveries.find(item => item.id === 11)?.status, "retrying");
  assert.equal(deliveries.find(item => item.id === 11)?.attempt_count, 1);
});

test("retryNotificationDelivery creates a new replay delivery", async () => {
  const { db, deliveries } = createNotificationDbFixture({
    deliveries: [
      {
        attempt_count: 4,
        created_at: 100,
        event: "email.received",
        id: 20,
        last_attempt_at: 120,
        last_error: "final failure",
        max_attempts: 4,
        next_retry_at: null,
        notification_endpoint_id: 1,
        payload_json: JSON.stringify({ message_id: "replay-source" }),
        response_status: 500,
        scope_json: JSON.stringify({ project_id: 1 }),
        status: "failed",
        updated_at: 120,
      },
    ],
    bindings: [],
    endpoints: [
      {
        access_scope: "all",
        created_at: 1,
        events: JSON.stringify(["email.received"]),
        id: 1,
        is_enabled: 1,
        last_error: "",
        last_sent_at: null,
        last_status: "",
        name: "global",
        secret: "",
        target: "https://replay.example.com/webhook",
        type: "webhook",
        updated_at: 1,
      },
    ],
  });
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => new Response("ok", { status: 200 })) as typeof fetch;

  try {
    const replay = await retryNotificationDelivery(db, 20);
    assert.ok(replay);
    assert.equal(replay?.id, 21);
    assert.equal(replay?.status, "success");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(deliveries.length, 2);
  assert.equal(deliveries[0]?.status, "failed");
  assert.equal(deliveries[1]?.status, "success");
  assert.equal(JSON.parse(deliveries[1]?.payload_json || "{}").message_id, "replay-source");
});

test("getNotificationDeliveriesPaged returns real endpoint summary instead of page-only counts", async () => {
  const now = Date.now();
  const { db } = createNotificationDbFixture({
    attempts: [
      {
        attempt_number: 1,
        attempted_at: now - 1_000,
        created_at: now - 1_000,
        duration_ms: 32,
        error_message: "",
        id: 1,
        next_retry_at: null,
        notification_delivery_id: 1,
        notification_endpoint_id: 1,
        response_status: 200,
        status: "success",
        updated_at: now - 1_000,
      },
      {
        attempt_number: 2,
        attempted_at: now - 2_000,
        created_at: now - 2_000,
        duration_ms: 44,
        error_message: "boom",
        id: 2,
        next_retry_at: null,
        notification_delivery_id: 2,
        notification_endpoint_id: 1,
        response_status: 500,
        status: "failed",
        updated_at: now - 2_000,
      },
      {
        attempt_number: 1,
        attempted_at: now - 3 * 24 * 60 * 60 * 1000,
        created_at: now - 3 * 24 * 60 * 60 * 1000,
        duration_ms: 41,
        error_message: "old",
        id: 3,
        next_retry_at: null,
        notification_delivery_id: 3,
        notification_endpoint_id: 1,
        response_status: 500,
        status: "failed",
        updated_at: now - 3 * 24 * 60 * 60 * 1000,
      },
    ],
    bindings: [],
    deliveries: [
      {
        attempt_count: 1,
        created_at: now - 1_000,
        event: "email.received",
        id: 1,
        is_dead_letter: 0,
        last_attempt_at: now - 1_000,
        last_error: "",
        max_attempts: 4,
        next_retry_at: null,
        notification_endpoint_id: 1,
        payload_json: JSON.stringify({ message_id: "ok" }),
        response_status: 200,
        scope_json: "{}",
        status: "success",
        updated_at: now - 1_000,
      },
      {
        attempt_count: 3,
        created_at: now - 2_000,
        dead_letter_reason: "boom",
        event: "email.received",
        id: 2,
        is_dead_letter: 1,
        last_attempt_at: now - 2_000,
        last_error: "boom",
        max_attempts: 4,
        next_retry_at: null,
        notification_endpoint_id: 1,
        payload_json: JSON.stringify({ message_id: "dead-letter" }),
        response_status: 500,
        resolved_at: null,
        resolved_by: "",
        scope_json: "{}",
        status: "failed",
        updated_at: now - 2_000,
      },
      {
        attempt_count: 2,
        created_at: now - 3_000,
        dead_letter_reason: "handled",
        event: "email.received",
        id: 3,
        is_dead_letter: 0,
        last_attempt_at: now - 3_000,
        last_error: "handled",
        max_attempts: 4,
        next_retry_at: null,
        notification_endpoint_id: 1,
        payload_json: JSON.stringify({ message_id: "resolved" }),
        response_status: 500,
        resolved_at: now - 500,
        resolved_by: "owner",
        scope_json: "{}",
        status: "failed",
        updated_at: now - 500,
      },
    ],
    endpoints: [
      {
        access_scope: "all",
        created_at: 1,
        events: JSON.stringify(["email.received"]),
        id: 1,
        is_enabled: 1,
        last_error: "",
        last_sent_at: null,
        last_status: "",
        name: "summary",
        secret: "",
        target: "https://summary.example.com/webhook",
        type: "webhook",
        updated_at: 1,
      },
    ],
  });

  const payload = await getNotificationDeliveriesPaged(db, 1, 10, 1, { dead_letter_only: true });

  assert.equal(payload.total, 1);
  assert.equal(payload.items.length, 1);
  assert.equal(payload.summary.total_deliveries, 3);
  assert.equal(payload.summary.dead_letter_total, 1);
  assert.equal(payload.summary.resolved_dead_letter_total, 1);
  assert.equal(payload.summary.failed_total, 2);
  assert.equal(payload.summary.success_total, 1);
  assert.equal(payload.summary.total_attempts, 6);
  assert.equal(payload.summary.recent_attempts_24h, 2);
  assert.equal(payload.summary.recent_success_attempts_24h, 1);
  assert.equal(payload.summary.recent_failed_attempts_24h, 1);
  assert.equal(payload.summary.success_rate_24h, 50);
  assert.equal(payload.summary.avg_duration_ms_24h, 38);
  assert.equal(payload.summary.last_success_at, now - 1_000);
  assert.equal(payload.summary.last_failure_at, now - 2_000);
  assert.equal(payload.summary.health_status, "warning");
  assert.equal(payload.summary.last_attempt_at, now - 1_000);
});

test("getNotificationDeliveriesPaged applies endpoint alert thresholds to health summary", async () => {
  const now = Date.now();
  const { db } = createNotificationDbFixture({
    attempts: [
      {
        attempt_number: 1,
        attempted_at: now - 1_000,
        created_at: now - 1_000,
        duration_ms: 21,
        error_message: "",
        id: 1,
        next_retry_at: null,
        notification_delivery_id: 1,
        notification_endpoint_id: 1,
        response_status: 200,
        status: "success",
        updated_at: now - 1_000,
      },
      {
        attempt_number: 2,
        attempted_at: now - 2_000,
        created_at: now - 2_000,
        duration_ms: 27,
        error_message: "boom",
        id: 2,
        next_retry_at: null,
        notification_delivery_id: 2,
        notification_endpoint_id: 1,
        response_status: 500,
        status: "failed",
        updated_at: now - 2_000,
      },
    ],
    bindings: [],
    deliveries: [
      {
        attempt_count: 1,
        created_at: now - 1_000,
        event: "email.received",
        id: 1,
        is_dead_letter: 0,
        last_attempt_at: now - 1_000,
        last_error: "",
        max_attempts: 4,
        next_retry_at: null,
        notification_endpoint_id: 1,
        payload_json: JSON.stringify({ message_id: "ok" }),
        response_status: 200,
        scope_json: "{}",
        status: "success",
        updated_at: now - 1_000,
      },
      {
        attempt_count: 2,
        created_at: now - 2_000,
        dead_letter_reason: "boom",
        event: "email.received",
        id: 2,
        is_dead_letter: 1,
        last_attempt_at: now - 2_000,
        last_error: "boom",
        max_attempts: 4,
        next_retry_at: null,
        notification_endpoint_id: 1,
        payload_json: JSON.stringify({ message_id: "dead-letter" }),
        response_status: 500,
        resolved_at: null,
        resolved_by: "",
        scope_json: "{}",
        status: "failed",
        updated_at: now - 2_000,
      },
    ],
    endpoints: [
      {
        access_scope: "all",
        alert_config_json: JSON.stringify({
          dead_letter_critical_threshold: 1,
          dead_letter_warning_threshold: 1,
          inactivity_hours: 24,
          min_attempts_24h: 2,
          retrying_critical_threshold: 10,
          retrying_warning_threshold: 1,
          success_rate_critical_threshold: 40,
          success_rate_warning_threshold: 80,
        }),
        created_at: 1,
        events: JSON.stringify(["email.received"]),
        id: 1,
        is_enabled: 1,
        last_error: "",
        last_sent_at: null,
        last_status: "",
        name: "custom-summary",
        secret: "",
        target: "https://summary.example.com/webhook",
        type: "webhook",
        updated_at: 1,
      },
    ],
  });

  const payload = await getNotificationDeliveriesPaged(db, 1, 10, 1);

  assert.equal(payload.summary.dead_letter_total, 1);
  assert.equal(payload.summary.recent_attempts_24h, 2);
  assert.equal(payload.summary.success_rate_24h, 50);
  assert.equal(payload.summary.health_status, "critical");
  assert.equal(payload.summary.alerts[0]?.severity, "critical");
});
