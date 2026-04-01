import type { ApiEnvelope } from "../types";

type RequestActivityListener = (activeCount: number) => void;

interface RequestOptions extends RequestInit {
  trackActivity?: boolean;
}

let activeRequestCount = 0;
const requestActivityListeners = new Set<RequestActivityListener>();

function emitRequestActivity() {
  requestActivityListeners.forEach(listener => listener(activeRequestCount));
}

function beginRequestActivity() {
  activeRequestCount += 1;
  emitRequestActivity();
}

function endRequestActivity() {
  activeRequestCount = Math.max(0, activeRequestCount - 1);
  emitRequestActivity();
}

export function subscribeRequestActivity(listener: RequestActivityListener) {
  requestActivityListeners.add(listener);
  listener(activeRequestCount);
  return () => {
    requestActivityListeners.delete(listener);
  };
}

export async function request<T>(input: string, init?: RequestOptions): Promise<T> {
  const { trackActivity = true, ...requestInit } = init || {};
  if (trackActivity) beginRequestActivity();

  try {
    const response = await fetch(input, {
      credentials: "same-origin",
      ...requestInit,
      headers: {
        ...(requestInit.body ? { "Content-Type": "application/json" } : {}),
        ...(requestInit.headers || {}),
      },
    });

    if (response.status === 401) {
      throw new Error("UNAUTHORIZED");
    }

    if (response.status === 403) {
      throw new Error("FORBIDDEN");
    }

    const contentType = response.headers.get("Content-Type") || "";
    const payload = contentType.includes("application/json")
      ? ((await response.json().catch(() => null)) as ApiEnvelope<T> | null)
      : null;

    if (!response.ok || !payload) {
      throw new Error(payload?.message || "请求失败");
    }

    return payload.data;
  } finally {
    if (trackActivity) endRequestActivity();
  }
}

export function withJsonBody(method: RequestInit["method"], payload: unknown): RequestOptions {
  return {
    body: JSON.stringify(payload),
    method,
  };
}

export function withOptionalJsonBody(method: RequestInit["method"], payload?: unknown): RequestOptions {
  if (payload === undefined) {
    return { method };
  }
  return withJsonBody(method, payload);
}
