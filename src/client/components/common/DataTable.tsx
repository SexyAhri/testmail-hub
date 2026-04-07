import { Table, theme } from "antd";
import type { TableProps } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { withAlpha } from "../../theme";

interface DataTableProps<T> extends Omit<TableProps<T>, "pagination" | "size" | "title"> {
  autoFitViewport?: boolean;
  autoPinHorizontalEdges?: boolean;
  cardExtra?: ReactNode;
  cardTitle?: string;
  cardToolbar?: ReactNode;
  current?: number;
  minScrollY?: number;
  onPageChange?: (page: number, pageSize: number) => void;
  pageSize?: number;
  showPagination?: boolean;
  style?: CSSProperties;
  total?: number;
  viewportBottomOffset?: number;
}

export function DataTable<T extends object>({
  autoFitViewport = false,
  autoPinHorizontalEdges = true,
  cardExtra,
  cardTitle,
  cardToolbar,
  className,
  columns,
  current,
  minScrollY = 160,
  onPageChange,
  pageSize = 10,
  rowSelection,
  showPagination = true,
  style,
  tableLayout,
  total,
  viewportBottomOffset = 16,
  ...tableProps
}: DataTableProps<T>) {
  const { token } = theme.useToken();
  const isRemotePagination = total !== undefined && current !== undefined;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [autoScrollY, setAutoScrollY] = useState<number>();
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);
  const dataSize = Array.isArray(tableProps.dataSource) ? tableProps.dataSource.length : 0;

  const recomputeAutoScrollY = useCallback(() => {
    if (!autoFitViewport || !rootRef.current || typeof window === "undefined") return;

    const rootTop = rootRef.current.getBoundingClientRect().top;
    const footerHeight = document.querySelector(".ant-layout-footer")?.getBoundingClientRect().height || 0;
    const titleHeight = titleRef.current?.getBoundingClientRect().height || 0;
    const toolbarHeight = toolbarRef.current?.getBoundingClientRect().height || 0;
    const tableHeaderHeight =
      rootRef.current.querySelector(".ant-table-header")?.getBoundingClientRect().height
      || rootRef.current.querySelector(".ant-table-thead")?.getBoundingClientRect().height
      || 44;
    const paginationHeight = showPagination
      ? rootRef.current.querySelector(".ant-pagination")?.getBoundingClientRect().height || 40
      : 0;
    const scrollContainer = rootRef.current.querySelector<HTMLElement>(".ant-table-body")
      || rootRef.current.querySelector<HTMLElement>(".ant-table-content");
    const horizontalScrollbarHeight = scrollContainer
      ? Math.max(0, scrollContainer.offsetHeight - scrollContainer.clientHeight)
      : 0;
    const tableFrameReserve = 16;
    const nextHeight = Math.floor(
      window.innerHeight
      - rootTop
      - footerHeight
      - viewportBottomOffset
      - titleHeight
      - toolbarHeight
      - tableHeaderHeight
      - paginationHeight
      - horizontalScrollbarHeight
      - tableFrameReserve,
    );

    setAutoScrollY(Math.max(minScrollY, nextHeight));
  }, [autoFitViewport, minScrollY, showPagination, viewportBottomOffset]);

  const recomputeHorizontalOverflow = useCallback(() => {
    if (!autoPinHorizontalEdges || !rootRef.current || typeof window === "undefined") {
      setHasHorizontalOverflow(false);
      return;
    }

    const scrollContainer = rootRef.current.querySelector<HTMLElement>(".ant-table-body")
      || rootRef.current.querySelector<HTMLElement>(".ant-table-content");

    if (!scrollContainer) {
      setHasHorizontalOverflow(false);
      return;
    }

    setHasHorizontalOverflow(scrollContainer.scrollWidth - scrollContainer.clientWidth > 1);
  }, [autoPinHorizontalEdges]);

  useEffect(() => {
    if ((!autoFitViewport && !autoPinHorizontalEdges) || typeof window === "undefined") return;

    const frame = window.requestAnimationFrame(() => {
      recomputeAutoScrollY();
      recomputeHorizontalOverflow();
    });
    const handleResize = () => {
      recomputeAutoScrollY();
      recomputeHorizontalOverflow();
    };
    window.addEventListener("resize", handleResize);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        recomputeAutoScrollY();
        recomputeHorizontalOverflow();
      });
      if (rootRef.current) observer.observe(rootRef.current);
      if (titleRef.current) observer.observe(titleRef.current);
      if (toolbarRef.current) observer.observe(toolbarRef.current);
    }

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleResize);
      observer?.disconnect();
    };
  }, [
    autoFitViewport,
    autoPinHorizontalEdges,
    hasHorizontalOverflow,
    recomputeAutoScrollY,
    recomputeHorizontalOverflow,
    dataSize,
    pageSize,
    current,
    total,
    tableProps.loading,
  ]);

  const resolvedScroll = autoFitViewport
    ? {
        ...(typeof tableProps.scroll === "object" && tableProps.scroll ? tableProps.scroll : {}),
        x: typeof tableProps.scroll === "object" && tableProps.scroll ? (tableProps.scroll.x || "max-content") : "max-content",
        y: autoScrollY || minScrollY,
      }
    : (tableProps.scroll || { x: "max-content", y: "calc(100vh - 320px)" });

  const resolvedColumns = useMemo(() => {
    if (!Array.isArray(columns) || !autoPinHorizontalEdges || !hasHorizontalOverflow) return columns;

    const nextColumns = [...columns];
    if (nextColumns.length === 0) return nextColumns;

    const firstColumnIndex = nextColumns.findIndex(column => Boolean(column) && !("children" in column && column.children?.length));
    if (firstColumnIndex >= 0) {
      const firstColumn = nextColumns[firstColumnIndex];
      if (firstColumn && firstColumn.fixed === undefined) {
        nextColumns[firstColumnIndex] = {
          ...firstColumn,
          fixed: "left",
          width: firstColumn.width || 180,
        };
      }
    }

    let actionColumnIndex = -1;
    for (let index = nextColumns.length - 1; index >= 0; index -= 1) {
      const column = nextColumns[index];
      if (!column || ("children" in column && column.children?.length)) continue;

      const title = typeof column.title === "string" ? column.title : "";
      const key = String(column.key || "");
      const rawDataIndex = "dataIndex" in column ? column.dataIndex : undefined;
      const dataIndex = Array.isArray(rawDataIndex)
        ? rawDataIndex.join(".")
        : String(rawDataIndex || "");

      if (title.includes("操作") || key === "action" || dataIndex === "action") {
        actionColumnIndex = index;
        break;
      }
    }

    if (actionColumnIndex >= 0) {
      const actionColumn = nextColumns[actionColumnIndex];
      if (actionColumn && actionColumn.fixed === undefined) {
        nextColumns[actionColumnIndex] = {
          ...actionColumn,
          fixed: "right",
          width: actionColumn.width || 180,
        };
      }
    }

    return nextColumns;
  }, [autoPinHorizontalEdges, columns, hasHorizontalOverflow]);

  const resolvedRowSelection = useMemo(() => {
    if (!rowSelection || !autoPinHorizontalEdges || !hasHorizontalOverflow) return rowSelection;
    if (rowSelection.fixed !== undefined) return rowSelection;

    return {
      ...rowSelection,
      fixed: true,
    };
  }, [autoPinHorizontalEdges, rowSelection, hasHorizontalOverflow]);

  return (
    <div
      ref={rootRef}
      style={{
        background: token.colorBgContainer,
        borderRadius: 16,
        border: `1px solid ${token.colorBorderSecondary}`,
        boxShadow: `0 12px 28px ${withAlpha(token.colorText, 0.05)}`,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
        ...style,
      }}
    >
      {cardTitle ? (
        <div
          ref={titleRef}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 10,
            padding: "12px 14px",
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            background: `linear-gradient(135deg, ${token.colorBgContainer} 0%, ${token.colorFillAlter} 100%)`,
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 14, color: token.colorTextHeading }}>{cardTitle}</span>
          {cardExtra}
        </div>
      ) : null}

      {cardToolbar ? (
        <div
          ref={toolbarRef}
          style={{
            padding: "10px 14px",
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            background: `linear-gradient(180deg, ${token.colorBgContainer} 0%, ${token.colorFillQuaternary} 100%)`,
          }}
        >
          {cardToolbar}
        </div>
      ) : null}

      <Table<T>
        className={["app-data-table", className].filter(Boolean).join(" ")}
        size="middle"
        bordered
        columns={resolvedColumns}
        rowSelection={resolvedRowSelection}
        scroll={resolvedScroll}
        tableLayout={tableLayout || "auto"}
        pagination={
          showPagination
            ? {
                pageSize,
                total: isRemotePagination ? total : undefined,
                current: isRemotePagination ? current : undefined,
                onChange: onPageChange,
                showTotal: value => (
                  <span style={{ fontSize: 13, color: token.colorTextSecondary }}>
                    共 <strong style={{ color: token.colorPrimary }}>{value}</strong> 条
                  </span>
                ),
                style: { marginRight: 16, marginBottom: 8 },
                showSizeChanger: true,
                showQuickJumper: true,
              }
            : false
        }
        {...tableProps}
      />
    </div>
  );
}
