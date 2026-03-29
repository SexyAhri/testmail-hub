import type { CSSProperties, ReactNode } from "react";

interface MetricGridProps {
  children: ReactNode;
  gap?: number;
  minItemWidth?: number;
  style?: CSSProperties;
}

export function MetricGrid({
  children,
  gap = 16,
  minItemWidth = 280,
  style,
}: MetricGridProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(${minItemWidth}px, 1fr))`,
        gap,
        marginBottom: 16,
        width: "100%",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
