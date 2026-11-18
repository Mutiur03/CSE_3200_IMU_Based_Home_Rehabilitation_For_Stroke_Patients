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
    const axis = { color: muted, fontSize: 12 };
    const line = { lineStyle: { color: border, width: 1 } };
    chart.setOption({
      animation: false,
      textStyle: { color: text },
      color: [cssColor("--chart-1"), cssColor("--chart-2")],
      grid: { left: 44, right: 12, top: 36, bottom: 64 },
      legend: { top: 0, right: 0, icon: "roundRect", itemWidth: 14, itemHeight: 3, textStyle: { color: muted, fontSize: 12 } },
      tooltip: {
        trigger: "axis",
        backgroundColor: cssColor("--popover"),
        borderColor: border,
        borderWidth: 1,
        extraCssText: "box-shadow:none;border-radius:8px;",
        textStyle: { color: text, fontSize: 12 },
        axisPointer: { lineStyle: { color: border } },
      },
      xAxis: { type: "value", name: "time (s)", nameLocation: "middle", nameGap: 28, nameTextStyle: axis, axisLabel: axis, axisLine: line, axisTick: { show: false }, splitLine: { show: false } },
      yAxis: { type: "value", name: "deg", nameTextStyle: axis, axisLabel: axis, axisLine: { show: false }, axisTick: { show: false }, splitLine: line },
      dataZoom: [
        { type: "inside" },
        {
          type: "slider",
          height: 14,
          bottom: 6,
          showDetail: false,
          borderColor: "transparent",
          backgroundColor: cssColor("--muted"),
          fillerColor: border,
          dataBackground: { lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } },
          selectedDataBackground: { lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } },
          handleStyle: { color: cssColor("--card"), borderColor: cssColor("--input") },
          moveHandleSize: 0,
          brushSelect: false,
        },
      ],
      series: [
        { name: "Pitch", type: "line", showSymbol: false, sampling: "lttb", lineStyle: { width: 1.5 }, data: trace.points.map((p) => [p.t_s, p.pitch]) },
        { name: "Roll", type: "line", showSymbol: false, sampling: "lttb", lineStyle: { width: 1.5 }, data: trace.points.map((p) => [p.t_s, p.roll]) },
      ],
    });
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.dispose();
    };
  }, [trace]);
  return <div ref={ref} className="h-[26rem] w-full break-inside-avoid md:h-[30rem]" role="img" aria-label={`Pitch and roll over time, ${trace.points.length} samples at ${trace.rate_hz} Hz. Scroll or drag the slider to zoom.`} />;
}
