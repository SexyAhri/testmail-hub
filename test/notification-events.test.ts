import assert from "node:assert/strict";
import test from "node:test";

import {
  getNotificationEventDefinition,
  normalizeNotificationEventValue,
  normalizeNotificationEventValues,
  NOTIFICATION_EVENT_DEFINITIONS,
} from "../src/utils/constants";

test("notification event catalog keeps canonical keys unique", () => {
  const keys = NOTIFICATION_EVENT_DEFINITIONS.map(item => item.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("notification event normalization maps aliases to canonical event keys", () => {
  assert.equal(normalizeNotificationEventValue("email.match"), "email.matched");
  assert.equal(normalizeNotificationEventValue("retention.completed"), "lifecycle.retention_completed");
  assert.equal(normalizeNotificationEventValue("outbound.failed"), "email.send_failed");
  assert.equal(normalizeNotificationEventValue("*"), "*");
  assert.equal(normalizeNotificationEventValue("unknown.event"), null);
});

test("notification event normalization deduplicates canonical and alias values", () => {
  const payload = normalizeNotificationEventValues([
    "email.match",
    "email.matched",
    "retention.completed",
    "*",
    "unknown.event",
  ]);

  assert.deepEqual(payload.values, [
    "email.matched",
    "lifecycle.retention_completed",
    "*",
  ]);
  assert.deepEqual(payload.invalid, ["unknown.event"]);
});

test("getNotificationEventDefinition resolves aliases to the canonical event metadata", () => {
  const definition = getNotificationEventDefinition("email.match");
  assert.equal(definition?.key, "email.matched");
  assert.equal(definition?.label, "规则命中");
});
