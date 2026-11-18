"use client";
import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { Schemas } from "@/lib/api";

/** Resolve a theme CSS variable to a concrete color string the chart can use. */
function cssColor(v: string): string {
  const el = document.createElement("span");
  el.style.color = `var(${v})`;
  document.body.appendChild(el);
  const c = getComputedStyle(el).color;
  el.remove();
  return c;
}

export function TracePlot({ trace }: { trace: Schemas["Trace"] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = echarts.init(el, undefined, { renderer: "svg" });
    const text = cssColor("--foreground");
    const muted = cssColor("--muted-foreground");
    const border = cssColor("--border");
    chart.setOption({
      animation: false,
      textStyle: { color: text },
      color: [cssColor("--chart-4"), cssColor("--destructive")],
      grid: { left: 48, right: 16, top: 40, bottom: 72 },
      legend: { top: 0, textStyle: { color: text } },
      tooltip: { trigger: "axis" },
      xAxis: { type: "value", name: "time (s)", nameLocation: "middle", nameGap: 26, axisLabel: { color: muted }, splitLine: { lineStyle: { color: border } } },
      yAxis: { type: "value", name: "deg", axisLabel: { color: muted }, splitLine: { lineStyle: { color: border } } },
      dataZoom: [{ type: "inside" }, { type: "slider", height: 20, bottom: 8 }],
      series: [
        { name: "Pitch", type: "line", showSymbol: false, sampling: "lttb", data: trace.points.map((p) => [p.t_s, p.pitch]) },
        { name: "Roll", type: "line", showSymbol: false, sampling: "lttb", data: trace.points.map((p) => [p.t_s, p.roll]) },
      ],
    });
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.dispose();
    };
  }, [trace]);
  return <div ref={ref} className="h-80 w-full" role="img" aria-label={`Pitch and roll over time, ${trace.points.length} samples at ${trace.rate_hz} Hz. Scroll or drag the slider to zoom.`} />;
}
