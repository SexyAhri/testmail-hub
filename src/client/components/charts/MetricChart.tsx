import { Card, Empty, theme } from "antd";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { useMemo } from "react";

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

export interface MetricChartDatum {
  time: string;
  value: number;
}

interface MetricChartProps {
  color?: string;
  data: MetricChartDatum[];
  emptyText?: string;
  height?: number;
  max?: number;
  title?: string;
  valueFormatter?: string;
}

export function MetricChart({
  color = "#1890ff",
  data,
  emptyText = "No metrics available",
  height = 200,
  max,
  title,
  valueFormatter = "{value}",
}: MetricChartProps) {
  const { token } = theme.useToken();

  const option = useMemo(
    () => ({
      tooltip: {
        trigger: "axis",
        backgroundColor: token.colorBgElevated,
        borderColor: token.colorBorder,
        textStyle: { color: token.colorText },
      },
      grid: { left: 48, right: 24, top: 16, bottom: 32 },
      xAxis: {
        type: "category",
        data: data.map(item => item.time),
        axisLine: { lineStyle: { color: token.colorBorder } },
        axisLabel: { color: token.colorTextTertiary, fontSize: 11 },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        max,
        minInterval: 1,
        axisLine: { show: false },
        splitLine: { lineStyle: { color: token.colorBorderSecondary } },
        axisLabel: {
          color: token.colorTextTertiary,
          fontSize: 11,
          formatter: valueFormatter,
        },
      },
      series: [
        {
          type: "line",
          data: data.map(item => item.value),
          smooth: true,
          symbol: "none",
          lineStyle: { color, width: 2 },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: `${color}30` },
                { offset: 1, color: `${color}05` },
              ],
            },
          },
        },
      ],
    }),
    [color, data, max, token, valueFormatter],
  );

  const chart = data.length > 0 ? (
    <ReactEChartsCore echarts={echarts} option={option} notMerge lazyUpdate style={{ height }} />
  ) : (
    <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />
    </div>
  );

  if (title) {
    return (
      <Card title={title} size="small" style={{ borderRadius: 12 }}>
        {chart}
      </Card>
    );
  }

  return chart;
}
