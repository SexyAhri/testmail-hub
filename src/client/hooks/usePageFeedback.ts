import { App } from "antd";
import { useCallback, useState } from "react";

import { buildBatchActionMessage, normalizeApiError, type BatchActionResult } from "../utils";

interface HandlePageErrorOptions {
  fallback?: string;
  ignoreFallbackMessage?: boolean;
}

export function usePageFeedback(onUnauthorized: () => void) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);

  const handlePageError = useCallback(
    (error: unknown, options: HandlePageErrorOptions = {}) => {
      const fallback = options.fallback ?? "请求失败";
      const normalized = normalizeApiError(error, fallback);

      if (normalized === "登录状态已失效，请重新登录") {
        onUnauthorized();
        return true;
      }

      if (!(options.ignoreFallbackMessage && normalized === fallback)) {
        message.error(normalized);
      }

      return false;
    },
    [message, onUnauthorized],
  );

  const runPageLoad = useCallback(
    async <T,>(task: () => Promise<T>) => {
      setLoading(true);
      try {
        return await task();
      } catch (error) {
        handlePageError(error);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [handlePageError],
  );

  const notifyBatchActionResult = useCallback(
    (actionLabel: string, result: BatchActionResult, extraSuffix = "") => {
      const messageText = `${buildBatchActionMessage(actionLabel, result)}${extraSuffix}`;

      if (result.failureCount === 0) {
        message.success(messageText);
      } else if (result.successCount > 0) {
        message.warning(messageText);
      } else {
        message.error(messageText);
      }
    },
    [message],
  );

  return {
    handlePageError,
    loading,
    notifyBatchActionResult,
    runPageLoad,
  };
}
