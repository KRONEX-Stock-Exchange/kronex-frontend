import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  CrosshairMode,
} from "lightweight-charts";
import type { IChartApi, ISeriesApi, LogicalRange } from "lightweight-charts";
import { io, Socket } from "socket.io-client";
import { apiClient } from "../../services/api/client";
import { REALTIME_URL } from "../../constants";
import { tokenManager } from "../../services/auth/tokenManager";

type ChartType = "1m" | "5m" | "15m" | "30m" | "1h" | "1d";

const CHART_TYPES: { label: string; value: ChartType }[] = [
  { label: "1분", value: "1m" },
  { label: "5분", value: "5m" },
  { label: "15분", value: "15m" },
  { label: "30분", value: "30m" },
  { label: "1시간", value: "1h" },
  { label: "일", value: "1d" },
];

const MA_CONFIGS = [
  { period: 5, color: "#F3BA2F" },
  { period: 20, color: "#8B5CF6" },
  { period: 60, color: "#06B6D4" },
  { period: 120, color: "#F97316" },
] as const;

interface CandleItem {
  candleTime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

interface ChartApiResponse {
  candles: CandleItem[];
  lastCandleTime: string;
  nextCursor: string | null;
}

interface ParsedCandle {
  candleTime: string;
  chartTime: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const KST_OFFSET = 9 * 3600;

function toChartTime(candleTime: string, type: ChartType): string | number {
  const d = new Date(candleTime);
  if (type === "1d") {
    const kst = new Date(d.getTime() + KST_OFFSET * 1000);
    return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
  }
  // raw UTC timestamp — KST 변환은 tickMarkFormatter/timeFormatter에서 처리
  return Math.floor(d.getTime() / 1000);
}

function parseCandle(item: CandleItem, type: ChartType): ParsedCandle {
  return {
    candleTime: item.candleTime,
    chartTime: toChartTime(item.candleTime, type),
    open: parseFloat(item.open),
    high: parseFloat(item.high),
    low: parseFloat(item.low),
    close: parseFloat(item.close),
    volume: parseFloat(item.volume),
  };
}

function computeMA(closes: number[], period: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    return closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
  });
}

// lightweight-charts가 day 타입일 때 param.time을 {year,month,day} 객체로 줌
function paramTimeToKey(t: unknown): string {
  if (typeof t === "object" && t !== null) {
    const { year, month, day } = t as { year: number; month: number; day: number };
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return String(t);
}

interface CandlestickChartProps {
  stockId: number | null;
}

export function CandlestickChart({ stockId }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const maSeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const legendRef = useRef<HTMLDivElement>(null);
  const autoScaleRangeRef = useRef<number | null>(null); // 초기 자동 배율 범위 (줌인 한계)
  // 캔들 데이터 저장소
  const candleMapRef = useRef<Map<string, ParsedCandle>>(new Map()); // key: candleTime(ISO)
  const sortedRef = useRef<ParsedCandle[]>([]); // 시간순 정렬 배열 (시리즈 업데이트용)
  const nextCursorRef = useRef<string | null>(null); // 다음(과거) 페이지 커서, 없으면 null
  const loadingMoreRef = useRef(false); // 과거 데이터 중복 요청 방지
  const socketRef = useRef<Socket | null>(null);
  const [chartType, setChartType] = useState<ChartType>("1d");

  // 차트 초기화 (마운트 1회)
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const fmtKst = (time: unknown) => {
      if (typeof time === "object" && time !== null) {
        const { year, month, day } = time as { year: number; month: number; day: number };
        return `${year}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}`;
      }
      if (typeof time === "number") {
        const d = new Date((time + KST_OFFSET) * 1000);
        return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
      }
      return String(time);
    };

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "#181a20" },
        textColor: "#848e9c",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#2b2f36" },
        horzLines: { color: "#2b2f36" },
      },
      localization: {
        locale: "ko-KR",
        timeFormatter: fmtKst,
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: "#505050", labelBackgroundColor: "#2b2f36" },
        horzLine: { color: "#505050", labelBackgroundColor: "#2b2f36" },
      },
      timeScale: {
        borderColor: "#2b2f36",
        timeVisible: false,
        secondsVisible: false,
        tickMarkFormatter: fmtKst,
      },
      rightPriceScale: { borderColor: "#2b2f36" },
      handleScale: {
        axisPressedMouseMove: { price: true, time: true },
      },

      width: container.clientWidth,
      height: container.clientHeight,
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#f6465d",
      downColor: "#2563eb",
      borderUpColor: "#f6465d",
      borderDownColor: "#2563eb",
      wickUpColor: "#f6465d",
      wickDownColor: "#2563eb",
      priceFormat: {
        type: "custom",
        formatter: (price: number) => price < 0 ? "" : price.toLocaleString("ko-KR"),
        minMove: 1,
      },
    });
    // right 스케일: 하단 30% 비워서 volume 영역 확보
    candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.30 } });
    candleSeriesRef.current = candleSeries;

    // 거래량: left 스케일 사용 + 레이블 숨김 → right 축에 아무 영향 없음
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "left",
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
      visible: false,
      borderVisible: false,
    });
    volumeSeriesRef.current = volumeSeries;

    // 이동평균선 MA5/MA20/MA60/MA120 — 스케일 자동범위 계산에서 제외 (캔들 기준으로만 스케일)
    const maSeries = MA_CONFIGS.map((ma) =>
      chart.addSeries(LineSeries, {
        color: ma.color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        autoscaleInfoProvider: () => null,
      })
    );
    maSeriesRef.current = maSeries;

    // 크로스헤어 범례: 시·고·저·종 + 등락률 + 거래량 + MA값 + % 레이블 갱신
    chart.subscribeCrosshairMove((param) => {
      const legend = legendRef.current;
      if (!legend) return;
      if (!param.time || !param.seriesData.has(candleSeries)) {
        legend.style.display = "none";
        return;
      }
      const ohlc = param.seriesData.get(candleSeries) as { open: number; high: number; low: number; close: number };
      const vol = (param.seriesData.get(volumeSeries) as { value: number } | undefined)?.value ?? 0;
      if (!ohlc) { legend.style.display = "none"; return; }

      const key = paramTimeToKey(param.time);
      const idx = sortedRef.current.findIndex((c) => String(c.chartTime) === key);
      const prevClose = idx > 0 ? sortedRef.current[idx - 1].close : ohlc.open;
      const pct = (v: number) => prevClose > 0 ? ((v - prevClose) / prevClose) * 100 : 0;
      const fmtPct = (p: number) => `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`;
      const col = (p: number) => (p >= 0 ? "#f6465d" : "#2563eb");

      const maHtml = MA_CONFIGS.map((ma, i) => {
        const v = param.seriesData.get(maSeries[i]) as { value: number } | undefined;
        return v
          ? `<span style="color:${ma.color};margin-left:8px">MA${ma.period} ${Math.round(v.value).toLocaleString()}</span>`
          : "";
      }).join("");

      const cell = (label: string, v: number, first = false) => {
        const p = pct(v); const c = col(p);
        return `<span style="color:#848e9c${first ? "" : ";margin-left:8px"}">${label}</span>` +
          `<span style="color:${c};margin-left:2px">${v.toLocaleString()}</span>` +
          `<span style="color:${c};margin-left:2px;font-size:10px">(${fmtPct(p)})</span>`;
      };

      legend.style.display = "flex";
      legend.innerHTML =
        cell("시", ohlc.open, true) +
        cell("고", ohlc.high) +
        cell("저", ohlc.low) +
        cell("종", ohlc.close) +
        `<span style="color:#848e9c;margin-left:8px">거래량</span><span style="color:#aaa;margin-left:2px">${Math.round(vol).toLocaleString()}</span>` +
        maHtml;

    });

    const handleResize = () => {
      chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
    };
    window.addEventListener("resize", handleResize);

    // 가격 축 줌인 차단: 자동 배율보다 범위가 줄어들면 auto-scale 복구
    let draggingPriceAxis = false;
    const onPointerDown = (e: PointerEvent) => {
      const axisW = chartRef.current?.priceScale("right").width() ?? 55;
      draggingPriceAxis = e.clientX >= container.getBoundingClientRect().right - axisW;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!draggingPriceAxis || !(e.buttons & 1)) { draggingPriceAxis = false; return; }
      const cs = candleSeriesRef.current;
      const minRange = autoScaleRangeRef.current;
      if (!cs || minRange === null) return;
      requestAnimationFrame(() => {
        const h = container.clientHeight;
        const top = cs.coordinateToPrice(0);
        const bot = cs.coordinateToPrice(h);
        if (top !== null && bot !== null && Math.abs(top - bot) < minRange * 0.97) {
          cs.priceScale().applyOptions({ autoScale: true });
        }
      });
    };
    const onPointerUp = () => { draggingPriceAxis = false; };
    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerUp);

    return () => {
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  // 데이터 로딩 + 소켓 (stockId, chartType 변경 시 재실행)
  useEffect(() => {
    if (stockId === null) return;
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const maSeries = maSeriesRef.current;
    if (!candleSeries || !volumeSeries || maSeries.length === 0) return;

    // 분봉/시간봉은 시간 표시
    chartRef.current?.applyOptions({
      timeScale: { timeVisible: chartType !== "1d" },
    });

    candleMapRef.current.clear();
    sortedRef.current = [];
    nextCursorRef.current = null;
    loadingMoreRef.current = false;

    // 전체 데이터를 정렬 후 모든 시리즈에 setData
    const applyAllData = () => {
      const sorted = Array.from(candleMapRef.current.values()).sort((a, b) => {
        if (typeof a.chartTime === "number" && typeof b.chartTime === "number") {
          return a.chartTime - b.chartTime;
        }
        return String(a.chartTime).localeCompare(String(b.chartTime));
      });
      sortedRef.current = sorted;

      const closes = sorted.map((c) => c.close);
      const maArrays = MA_CONFIGS.map((ma) => computeMA(closes, ma.period));

      candleSeries.setData(
        sorted.map((c) => ({ time: c.chartTime as never, open: c.open, high: c.high, low: c.low, close: c.close }))
      );
      volumeSeries.setData(
        sorted.map((c) => ({
          time: c.chartTime as never,
          value: c.volume,
          color: c.close >= c.open ? "rgba(246,70,93,0.5)" : "rgba(37,99,235,0.5)",
        }))
      );
      maArrays.forEach((arr, i) => {
        maSeries[i].setData(
          sorted
            .map((c, j) => (arr[j] !== null ? { time: c.chartTime as never, value: arr[j]! } : null))
            .filter((d): d is NonNullable<typeof d> => d !== null)
        );
      });

      chartRef.current?.timeScale().scrollToRealTime();
      // 자동 배율 범위 캡처 (줌인 한계 기준)
      requestAnimationFrame(() => {
        const cs = candleSeriesRef.current;
        const cont = containerRef.current;
        if (!cs || !cont) return;
        const top = cs.coordinateToPrice(0);
        const bot = cs.coordinateToPrice(cont.clientHeight);
        if (top !== null && bot !== null) autoScaleRangeRef.current = Math.abs(top - bot);
      });
    };

    // chartUpdated: 새 candleTime이면 applyAllData, 같은 candleTime이면 마지막 봉 update
    const updateLastCandle = (item: CandleItem) => {
      const isNew = !candleMapRef.current.has(item.candleTime);
      const parsed = parseCandle(item, chartType);
      candleMapRef.current.set(item.candleTime, parsed);

      if (isNew) {
        // 새 봉: gap-fill과 충돌 가능성 있으므로 전체 재빌드
        applyAllData();
        return;
      }

      // 기존 봉 업데이트: sortedRef에서 해당 항목 찾아 교체
      const existingIdx = sortedRef.current.findIndex((c) => c.candleTime === item.candleTime);
      if (existingIdx >= 0) sortedRef.current[existingIdx] = parsed;

      const sorted = sortedRef.current;
      const closes = sorted.map((c) => c.close);
      const idx = existingIdx >= 0 ? existingIdx : sorted.length - 1;

      try {
        candleSeries.update({ time: parsed.chartTime as never, open: parsed.open, high: parsed.high, low: parsed.low, close: parsed.close });
        volumeSeries.update({
          time: parsed.chartTime as never,
          value: parsed.volume,
          color: parsed.close >= parsed.open ? "rgba(246,70,93,0.5)" : "rgba(37,99,235,0.5)",
        });
        MA_CONFIGS.forEach((ma, i) => {
          if (idx >= ma.period - 1) {
            const slice = closes.slice(idx - ma.period + 1, idx + 1);
            maSeries[i].update({ time: parsed.chartTime as never, value: slice.reduce((a, b) => a + b, 0) / ma.period });
          }
        });
      } catch {
        // update 실패 시 안전하게 전체 재빌드
        applyAllData();
      }
    };

    let active = true;
    let lastCandleTime = "";

    const connectSocket = (token: string) => {
      const socket = io(`${REALTIME_URL}/stock`, {
        transports: ["websocket"],
        auth: { token },
      });
      socketRef.current = socket;

      // 1. GET 완료 후 lastCandleTime을 from으로 입장 (없으면 생략 — 진행 중인 봉만 수신)
      socket.on("connect", () => {
        socket.emit("joinChartRoom", {
          stockId,
          type: chartType,
          ...(lastCandleTime ? { from: lastCandleTime } : {}),
        });
      });

      // 2. GET과 소켓 사이 누락된 봉 보충 (같은 candleTime은 chartInit 데이터로 덮어씌움)
      socket.on("chartInit", (candles: CandleItem[]) => {
        for (const c of candles) {
          candleMapRef.current.set(c.candleTime, parseCandle(c, chartType));
        }
        applyAllData();
      });

      // 3. 실시간 체결 업데이트
      socket.on("chartUpdated", (candle: CandleItem) => {
        updateLastCandle(candle);
      });

      socket.on("errorCustom", async ({ message }: { message: string }) => {
        socket.disconnect();
        if (message === "AccessToken이 만료되었습니다.") {
          const newToken = await tokenManager.refresh();
          if (active && newToken) connectSocket(newToken);
        } else {
          tokenManager.redirectToLogin();
        }
      });

      socket.on("exception", (err: { message: string; errorCode: string }) => {
        console.error(`[WS] ${err.errorCode}: ${err.message}`);
      });
    };

    // 과거 데이터 추가 로드 (왼쪽 끝 스크롤 시 subscribeVisibleLogicalRangeChange에서 호출)
    const loadMoreHistory = async () => {
      if (loadingMoreRef.current || !nextCursorRef.current) return;
      loadingMoreRef.current = true;
      try {
        const cursor = encodeURIComponent(nextCursorRef.current);
        const res = await apiClient.get<ChartApiResponse>(
          `/stocks/${stockId}/chart?type=${chartType}&cursor=${cursor}`
        );
        if (!active || !res.success || !res.data) return;

        for (const c of res.data.candles) {
          candleMapRef.current.set(c.candleTime, parseCandle(c, chartType));
        }
        nextCursorRef.current = res.data.nextCursor;
        applyAllData();
      } finally {
        loadingMoreRef.current = false;
      }
    };

    // 차트 왼쪽 끝에 근접하면(barsBefore < 10) 과거 데이터 추가 로드
    const handleVisibleRangeChange = (logicalRange: LogicalRange | null) => {
      if (!logicalRange) return;
      const barsInfo = candleSeries.barsInLogicalRange(logicalRange);
      if (barsInfo !== null && barsInfo.barsBefore < 10) {
        loadMoreHistory();
      }
    };
    chartRef.current?.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);

    const init = async () => {
      candleMapRef.current.clear();
      sortedRef.current = [];
      const res = await apiClient.get<ChartApiResponse>(`/stocks/${stockId}/chart?type=${chartType}`);
      if (!active) return;

      if (res.success && res.data) {
        for (const c of res.data.candles) {
          candleMapRef.current.set(c.candleTime, parseCandle(c, chartType));
        }
        lastCandleTime = res.data.lastCandleTime;
        nextCursorRef.current = res.data.nextCursor;
        applyAllData();
      }

      const token = tokenManager.getToken();
      if (token) connectSocket(token);
    };

    init();

    return () => {
      active = false;
      chartRef.current?.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
      if (socketRef.current) {
        socketRef.current.emit("leaveChartRoom", { stockId, type: chartType });
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [stockId, chartType]);

  return (
    <div className="w-full h-full bg-[#181a20] rounded-2xl overflow-hidden p-2 flex flex-col">
      {/* 상단 툴바: 시간대 선택 + MA 범례 */}
      <div className="flex items-center gap-1 mb-1 shrink-0">
        <div className="flex gap-0.5">
          {CHART_TYPES.map((ct) => (
            <button
              key={ct.value}
              onClick={() => setChartType(ct.value)}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                chartType === ct.value
                  ? "bg-[#2b2f36] text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {ct.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 ml-3 border-l border-[#2b2f36] pl-3">
          {MA_CONFIGS.map((ma) => (
            <span key={ma.period} className="text-[10px]" style={{ color: ma.color }}>
              MA{ma.period}
            </span>
          ))}
        </div>
      </div>
      {/* 차트 영역 */}
      <div className="relative flex-1 min-h-0">
        {/* OHLCV + MA 범례 (크로스헤어 이동 시 표시) */}
        <div
          ref={legendRef}
          className="absolute top-1 left-1 z-10 text-xs pointer-events-none items-center flex-wrap gap-0.5"
          style={{ display: "none" }}
        />
<div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  );
}
