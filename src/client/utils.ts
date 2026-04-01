import type { PaginationPayload } from "./types";

export function formatDateTime(value?: number | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export async function loadAllPages<T>(
  fetchPage: (page: number) => Promise<PaginationPayload<T>>,
) {
  const firstPage = await fetchPage(1);
  const totalPages = Math.max(1, Math.ceil(firstPage.total / firstPage.pageSize));

  if (totalPages === 1) {
    return firstPage.items;
  }

  const restPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_value, index) => fetchPage(index + 2)),
  );

  return [firstPage.items, ...restPages.map(page => page.items)].flat();
}

export function randomLocalPart(length = 10) {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const values = crypto.getRandomValues(new Uint8Array(length));
  let output = "";
  for (const value of values) output += chars[value % chars.length];
  return output;
}

export function normalizeApiError(error: unknown, fallback = "请求失败") {
  if (error instanceof Error) {
    if (error.message === "FORBIDDEN") return "当前账号没有权限执行该操作";
    if (error.message === "UNAUTHORIZED") return "登录状态已失效，请重新登录";
    return error.message;
  }
  return fallback;
}

export function formatBytes(value: number) {
  const size = Number(value || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  document.execCommand("copy");
  document.body.removeChild(textArea);
}

export async function fileToBase64(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });

  const [, base64 = ""] = dataUrl.split(",", 2);
  return base64;
}

export interface BatchActionResult {
  errorMessages: string[];
  failureCount: number;
  successCount: number;
}

export function buildBatchActionMessage(actionLabel: string, result: BatchActionResult) {
  if (result.failureCount === 0) {
    return `${actionLabel}成功，共处理 ${result.successCount} 项`;
  }

  const errorSuffix = result.errorMessages[0] ? `：${result.errorMessages[0]}` : "";
  return `${actionLabel}已完成，成功 ${result.successCount} 项，失败 ${result.failureCount} 项${errorSuffix}`;
}

export async function runBatchAction<T>(
  items: T[],
  action: (item: T) => Promise<unknown>,
): Promise<BatchActionResult> {
  let successCount = 0;
  const errorMessages = new Set<string>();

  for (const item of items) {
    try {
      await action(item);
      successCount += 1;
    } catch (error) {
      errorMessages.add(normalizeApiError(error));
    }
  }

  return {
    errorMessages: Array.from(errorMessages),
    failureCount: Math.max(0, items.length - successCount),
    successCount,
  };
}
