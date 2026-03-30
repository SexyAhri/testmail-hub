import assert from "node:assert/strict";
import test from "node:test";

import {
  processDueNotificationRetries,
  retryNotificationDelivery,
  sendEventNotifications,
} from "../src/core/notifications";
import type { D1Database, D1PreparedStatement } from "../src/server/types";

interface EndpointRow {
  access_scope: "all" | "bound";
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
  event: string;
  id: number;
  last_attempt_at: number | null;
  last_error: string;
  max_attempts: number;
  next_retry_at: number | null;
  notification_endpoint_id: number;
  payload_json: string;
  response_status: number | null;
  scope_json: string;
  status: string;
  updated_at: number;
}

function createNotificationDbFixture(options?: {
  bindings?: Array<{ notification_endpoint_id: number; project_id: number; project_name: string; project_slug: string }>;
  deliveries?: DeliveryRow[];
  endpoints?: EndpointRow[];
}) {
  const endpoints = options?.endpoints || [
    {
      access_scope: "all" as const,
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
              last_attempt_at: null,
              last_error: "",
              max_attempts: Number(max_attempts),
              next_retry_at: Number(next_retry_at),
              notification_endpoint_id: Number(notification_endpoint_id),
              payload_json: String(payload_json),
              response_status: null,
              scope_json: String(scope_json),
              status: String(status),
              updated_at: Number(updated_at),
            });
            return { meta: { last_row_id: id } };
          }

          if (query.startsWith("UPDATE notification_deliveries SET status = ?")) {
            const [status, attempt_count, last_error, response_status, next_retry_at, last_attempt_at, updated_at, id] = params;
            const row = deliveries.find(item => item.id === Number(id));
            if (!row) throw new Error(`Delivery ${id} not found`);
            row.status = String(status);
            row.attempt_count = Number(attempt_count);
            row.last_error = String(last_error || "");
            row.response_status = response_status === null || response_status === undefined ? null : Number(response_status);
            row.next_retry_at = next_retry_at === null || next_retry_at === undefined ? null : Number(next_retry_at);
            row.last_attempt_at = last_attempt_at === null || last_attempt_at === undefined ? null : Number(last_attempt_at);
            row.updated_at = Number(updated_at);
            return {};
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

  return { bindings, db, deliveries, endpoints };
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
  const { db, deliveries, endpoints } = createNotificationDbFixture({
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
  assert.equal(deliveries[0]?.response_status, 500);
  assert.ok((deliveries[0]?.next_retry_at || 0) > Date.now() - 1000);
  assert.equal(endpoints[0]?.last_status, "retrying");
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
