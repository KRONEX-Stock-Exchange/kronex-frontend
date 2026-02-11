import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
} from "lightweight-charts";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { io } from "socket.io-client";
import { apiClient } from "../../services/api/client";

type ChartType = "1m" | "5m" | "15m" | "30m" | "60m" | "1d";

interface ChartItem {
  time: string;
  high: string;
  low: string;
  close: string;
  open: string;
  volume: string;
}

const CHART_TYPES: { label: string; value: ChartType }[] = [
  { label: "1분", value: "1m" },
  { label: "5분", value: "5m" },
  { label: "15분", value: "15m" },
  { label: "30분", value: "30m" },
  { label: "1시간", value: "60m" },
  { label: "1일", value: "1d" },
];

function toChartTime(timeStr: string, type: ChartType) {
  const d = new Date(timeStr);
  if (type === "1d") {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return Math.floor(d.getTime() / 1000);
}

interface CandlestickChartProps {
  stockId?: number;
}

export function CandlestickChart({ stockId = 1 }: CandlestickChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const prevCloseMapRef = useRef<Map<string, number>>(new Map());
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const pctLabelRef = useRef<HTMLDivElement>(null);
  const lastCandleInfoRef = useRef<{ close: number; prevClose: number }>({
    close: 0,
    prevClose: 0,
  });
  const [chartType, setChartType] = useState<ChartType>("1d");

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const container = chartContainerRef.current;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "#181a20" },
        textColor: "#848e9c",
      },
      grid: {
        vertLines: { color: "#2b2f36" },
        horzLines: { color: "#2b2f36" },
      },
      localization: {
        locale: "ko-KR",
        dateFormat: "yyyy.MM.dd",
      },
      width: container.clientWidth,
      height: container.clientHeight,
      crosshair: {
        mode: 1,
        vertLine: {
          color: "#505050",
          labelBackgroundColor: "#2b2f36",
        },
        horzLine: {
          color: "#505050",
          labelBackgroundColor: "#2b2f36",
        },
      },
      timeScale: {
        borderColor: "#2b2f36",
        timeVisible: chartType !== "1d",
        secondsVisible: false,
        tickMarkFormatter: (time: any) => {
          if (typeof time === "object" && time.year) {
            const m = String(time.month).padStart(2, "0");
            const d = String(time.day).padStart(2, "0");
            return `${m}/${d}`;
          }
          if (typeof time === "string" && time.includes("-")) {
            const [, m, d] = time.split("-");
            return `${m}/${d}`;
          }
          const date = new Date(time * 1000);
          const hh = String(date.getHours()).padStart(2, "0");
          const min = String(date.getMinutes()).padStart(2, "0");
          return `${hh}:${min}`;
        },
      },
      rightPriceScale: {
        borderColor: "#2b2f36",
      },
    });

    chartRef.current = chart;

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#f6465d",
      downColor: "#2563eb",
      borderUpColor: "#f6465d",
      borderDownColor: "#2563eb",
      wickUpColor: "#f6465d",
      wickDownColor: "#2563eb",
    });
    candleSeriesRef.current = candlestickSeries;

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    volumeSeriesRef.current = volumeSeries;

    // 현재가 퍼센트 표시 업데이트
    const updatePctLabel = () => {
      if (!pctLabelRef.current || !candleSeriesRef.current) return;
      const { close, prevClose } = lastCandleInfoRef.current;
      if (close === 0) return;
      const pct = prevClose > 0 ? ((close - prevClose) / prevClose) * 100 : 0;
      const y = candleSeriesRef.current.priceToCoordinate(close);
      if (y === null) {
        pctLabelRef.current.style.display = "none";
        return;
      }
      const text = `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
      const color = pct >= 0 ? "#f6465d" : "#2563eb";
      pctLabelRef.current.textContent = text;
      pctLabelRef.current.style.color = color;
      pctLabelRef.current.style.top = `${y + 14}px`;
      pctLabelRef.current.style.display = "block";
    };

    // API에서 차트 데이터 가져오기
    const fetchChart = async () => {
      const response = await apiClient.get<ChartItem[]>(
        `/stocks/${stockId}/chart?type=${chartType}`,
      );
      if (response.success && response.data) {
        const candleData = response.data.map((item) => ({
          time: toChartTime(item.time, chartType) as never,
          open: parseFloat(item.open),
          high: parseFloat(item.high),
          low: parseFloat(item.low),
          close: parseFloat(item.close),
        }));

        const volumeData = response.data.map((item) => {
          const open = parseFloat(item.open);
          const close = parseFloat(item.close);
          return {
            time: toChartTime(item.time, chartType) as never,
            value: parseFloat(item.volume),
            color:
              close >= open
                ? "rgba(246, 70, 93, 0.5)"
                : "rgba(37, 99, 235, 0.5)",
          };
        });

        // 전봉 종가 맵 구축 (time key → 이전 봉의 close)
        const map = new Map<string, number>();
        for (let i = 0; i < candleData.length; i++) {
          const key = String(candleData[i].time);
          map.set(key, i > 0 ? candleData[i - 1].close : candleData[i].open);
        }
        prevCloseMapRef.current = map;

        candlestickSeries.setData(candleData);
        volumeSeries.setData(volumeData);
        chart.timeScale().fitContent();

        // 현재가 퍼센트 업데이트
        if (candleData.length > 0) {
          const last = candleData[candleData.length - 1];
          const prevC =
            candleData.length > 1
              ? candleData[candleData.length - 2].close
              : last.open;
          lastCandleInfoRef.current = {
            close: last.close,
            prevClose: prevC,
          };
          requestAnimationFrame(updatePctLabel);
        }
      }
    };

    fetchChart();

    // 차트 스크롤/줌 시 퍼센트 레이블 위치 업데이트
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      requestAnimationFrame(updatePctLabel);
    });

    // WebSocket 실시간 차트 업데이트
    const ws = io("ws://localhost:3003/stock", {
      transports: ["websocket"],
      withCredentials: true,
    });

    ws.on("connect", () => {
      ws.emit("joinChartRoom", { stockId: 1, type: chartType });
    });

    ws.on(`chartUpdated_${chartType}`, (items: ChartItem[]) => {
      if (!items || items.length === 0) return;

      for (const item of items) {
        const time = toChartTime(item.time, chartType) as never;
        const open = parseFloat(item.open);
        const high = parseFloat(item.high);
        const low = parseFloat(item.low);
        const close = parseFloat(item.close);
        const volume = parseFloat(item.volume);

        candlestickSeries.update({ time, open, high, low, close });
        volumeSeries.update({
          time,
          value: volume,
          color:
            close >= open ? "rgba(246, 70, 93, 0.5)" : "rgba(37, 99, 235, 0.5)",
        });
      }

      // 마지막 봉 퍼센트 업데이트
      const lastItem = items[items.length - 1];
      const lastClose = parseFloat(lastItem.close);
      lastCandleInfoRef.current = {
        ...lastCandleInfoRef.current,
        close: lastClose,
      };
      requestAnimationFrame(updatePctLabel);
    });

    // 크로스헤어 이동 시 범례 업데이트
    chart.subscribeCrosshairMove((param) => {
      if (!legendRef.current) return;
      const legend = legendRef.current;

      if (!param.time || !param.seriesData.has(candlestickSeries)) {
        legend.style.display = "none";
        return;
      }

      const data = param.seriesData.get(candlestickSeries) as {
        open: number;
        high: number;
        low: number;
        close: number;
      };
      if (!data) {
        legend.style.display = "none";
        return;
      }

      const prevClose =
        prevCloseMapRef.current.get(String(param.time)) ?? data.open;
      const pctFn = (v: number) =>
        prevClose > 0 ? ((v - prevClose) / prevClose) * 100 : 0;
      const fmtPct = (p: number) => `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`;
      const pctColor = (p: number) => (p >= 0 ? "#f6465d" : "#2563eb");

      const closePct = pctFn(data.close);
      const highPct = pctFn(data.high);
      const lowPct = pctFn(data.low);
      const color = closePct >= 0 ? "#f6465d" : "#2563eb";

      legend.style.display = "flex";
      legend.innerHTML =
        `<span style="color:#848e9c">시</span> <span style="color:${color}">${data.open.toLocaleString()}</span>` +
        `<span style="color:#848e9c;margin-left:8px">고</span> <span style="color:${pctColor(highPct)}">${data.high.toLocaleString()}</span>` +
        `<span style="color:${pctColor(highPct)};margin-left:2px;font-size:10px">${fmtPct(highPct)}</span>` +
        `<span style="color:#848e9c;margin-left:8px">저</span> <span style="color:${pctColor(lowPct)}">${data.low.toLocaleString()}</span>` +
        `<span style="color:${pctColor(lowPct)};margin-left:2px;font-size:10px">${fmtPct(lowPct)}</span>` +
        `<span style="color:#848e9c;margin-left:8px">종</span> <span style="color:${pctColor(closePct)}">${data.close.toLocaleString()}</span>` +
        `<span style="color:${pctColor(closePct)};margin-left:2px;font-size:10px">${fmtPct(closePct)}</span>`;
    });

    // 리사이즈 핸들러
    const handleResize = () => {
      chart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };

    window.addEventListener("resize", handleResize);

    return () => {
      ws.disconnect();
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [stockId, chartType]);

  return (
    <div className="w-full h-full bg-[#181a20] rounded-2xl overflow-hidden p-2 flex flex-col">
      {/* 차트 타입 선택 */}
      <div className="flex gap-1 mb-1">
        {CHART_TYPES.map((ct) => (
          <button
            key={ct.value}
            onClick={() => setChartType(ct.value)}
            className={`px-2 py-0.5 text-xs rounded ${
              chartType === ct.value
                ? "bg-[#2b2f36] text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {ct.label}
          </button>
        ))}
      </div>
      {/* 차트 */}
      <div className="relative w-full flex-1">
        <div
          ref={legendRef}
          className="absolute top-1 left-1 z-10 gap-1 text-xs pointer-events-none"
          style={{ display: "none" }}
        />
        <div
          ref={pctLabelRef}
          className="absolute right-1.25 z-10 text-[10px] font-bold pointer-events-none"
          style={{ display: "none" }}
        />
        <div ref={chartContainerRef} className="w-full h-full" />
      </div>
    </div>
  );
}
