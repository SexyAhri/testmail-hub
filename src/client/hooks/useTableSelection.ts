import type { TableProps } from "antd";
import { useEffect, useMemo, useState } from "react";
import type { Key } from "react";

type RowKeyGetter<T> = keyof T | ((record: T) => Key);

function resolveRowKey<T extends object>(record: T, rowKey: RowKeyGetter<T>): Key {
  if (typeof rowKey === "function") return rowKey(record);
  return record[rowKey] as Key;
}

export function useTableSelection<T extends object>(items: T[], rowKey: RowKeyGetter<T>) {
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);

  const itemMap = useMemo(() => {
    const next = new Map<Key, T>();
    for (const item of items) {
      next.set(resolveRowKey(item, rowKey), item);
    }
    return next;
  }, [items, rowKey]);

  useEffect(() => {
    setSelectedRowKeys(current => current.filter(key => itemMap.has(key)));
  }, [itemMap]);

  const selectedItems = useMemo(
    () => selectedRowKeys.map(key => itemMap.get(key)).filter((item): item is T => Boolean(item)),
    [itemMap, selectedRowKeys],
  );

  const rowSelection = useMemo<TableProps<T>["rowSelection"]>(
    () => ({
      selectedRowKeys,
      onChange: nextKeys => setSelectedRowKeys(nextKeys),
    }),
    [selectedRowKeys],
  );

  return {
    clearSelection: () => setSelectedRowKeys([]),
    rowSelection,
    selectedItems,
    selectedRowKeys,
    setSelectedRowKeys,
  };
}
