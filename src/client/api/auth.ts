import type { LoginPayload, SessionPayload } from "../types";
import { request, withJsonBody } from "./core";

export async function login(payload: LoginPayload | string) {
  const body = typeof payload === "string" ? { token: payload } : payload;
  return request<{ ok: true; user: SessionPayload["user"] }>("/auth/login", withJsonBody("POST", body));
}

export async function logout() {
  return request<{ ok: true }>("/auth/logout", { method: "POST" });
}

export async function getSession() {
  return request<SessionPayload>("/auth/session");
}
