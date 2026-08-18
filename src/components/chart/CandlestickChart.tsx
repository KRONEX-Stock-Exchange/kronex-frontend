import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  CrosshairMode,
  TickMarkType,
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
  { period: 5, color: "#c98500" },
  { period: 20, color: "#9085e9" },
  { period: 60, color: "#199e70" },
  { period: 120, color: "#d95926" },
] as const;

interface LegendOptions {
  ma: boolean;
  high: boolean;
  low: boolean;
  open: boolean;
  close: boolean;
  volume: boolean;
}

const LEGEND_TOGGLES: { key: keyof LegendOptions; label: string }[] = [
  { key: "ma", label: "이동평균선 정보" },
  { key: "high", label: "고가" },
  { key: "low", label: "저가" },
  { key: "open", label: "시가" },
  { key: "close", label: "종가" },
  { key: "volume", label: "거래량" },
];

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

// 차트 폰트 크기 (createChart의 layout.fontSize)
const AXIS_FONT_SIZE = 11;

// 최고/최저 마커 화살표 끝과 봉 사이 여백(px)
const MARKER_GAP = 5;

function toChartTime(candleTime: string, type: ChartType): string | number {
  const d = new Date(candleTime);
  if (type === "1d") {
    const kst = new Date(d.getTime() + KST_OFFSET * 1000);
    return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
  }
  // raw UTC timestamp — KST 변환은 tickMarkFormatter/timeFormatter에서 처리
  return Math.floor(d.getTime() / 1000);
}

// 최고/최저 마커 라벨에 쓰는 짧은 날짜 표기 (MM/DD)
function fmtMarkerDate(chartTime: string | number): string {
  if (typeof chartTime === "string") {
    const [, m, d] = chartTime.split("-");
    return m && d ? `${m}/${d}` : chartTime;
  }
  const d = new Date((chartTime + KST_OFFSET) * 1000);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
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
  const stickToLiveRef = useRef(true); // 최신 봉이 보이는 상태인지 (과거 스크롤 중엔 false)
  const socketRef = useRef<Socket | null>(null);
  const highMarkerRef = useRef<HTMLDivElement>(null);
  const highMarkerLabelRef = useRef<HTMLSpanElement>(null);
  const highArrowRef = useRef<SVGSVGElement>(null);
  const lowMarkerRef = useRef<HTMLDivElement>(null);
  const lowMarkerLabelRef = useRef<HTMLSpanElement>(null);
  const lowArrowRef = useRef<SVGSVGElement>(null);
  const lastPriceMarkerRef = useRef<HTMLDivElement>(null);
  const lastPriceValueRef = useRef<HTMLSpanElement>(null);
  const lastPricePctRef = useRef<HTMLSpanElement>(null);
  const [chartType, setChartType] = useState<ChartType>("1d");
  const [showMinMax, setShowMinMax] = useState(true);
  const showMinMaxRef = useRef(showMinMax);
  const [legendOptions, setLegendOptions] = useState<LegendOptions>({
    ma: true,
    high: true,
    low: true,
    open: true,
    close: true,
    volume: true,
  });
  const legendOptionsRef = useRef(legendOptions);
  const [legendLayout, setLegendLayout] = useState<"horizontal" | "vertical">("vertical");
  const legendLayoutRef = useRef(legendLayout);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  // 현재가 라벨 — 가격과 등락률을 한 네모 안에 두 줄로 그린다.
  // 기본 라벨과 똑같이 가격축 영역의 왼쪽 가장자리에서 시작해 가격 좌표를 세로 중심으로 놓으므로
  // 기본 라벨이 있던 자리에 그대로 붙어 같이 움직인다.
  const updateLastPriceBadge = () => {
    const series = candleSeriesRef.current;
    const chart = chartRef.current;
    const container = containerRef.current;
    const badge = lastPriceMarkerRef.current;
    if (!series || !chart || !container || !badge) return;

    // 기본 라벨과 동일하게 "화면에 보이는 마지막 캔들"을 기준으로 한다.
    // (과거로 스크롤하면 그 시점의 캔들 정보가 떠야 하므로 배열의 최신 캔들이 아니다)
    const sorted = sortedRef.current;
    const range = chart.timeScale().getVisibleLogicalRange();
    const lastVisibleIdx = range
      ? Math.min(sorted.length - 1, Math.floor(range.to))
      : sorted.length - 1;
    const last = lastVisibleIdx >= 0 ? sorted[lastVisibleIdx] : undefined;
    if (!last) {
      badge.style.display = "none";
      return;
    }

    const y = series.priceToCoordinate(last.close);
    if (y === null) {
      badge.style.display = "none";
      return;
    }

    // 캔들 색과 같은 기준(종가 vs 시가)으로 색을 정해야 봉 색과 라벨 색이 어긋나지 않는다
    const isUp = last.close >= last.open;
    const pct = last.open > 0 ? ((last.close - last.open) / last.open) * 100 : 0;

    badge.style.display = "flex";
    badge.style.left = `${container.clientWidth - chart.priceScale("right").width()}px`;
    badge.style.top = `${y}px`;
    badge.style.backgroundColor = isUp ? "#f6465d" : "#2563eb";
    if (lastPriceValueRef.current) {
      lastPriceValueRef.current.textContent = Math.round(last.close).toLocaleString("ko-KR");
    }
    if (lastPricePctRef.current) {
      lastPricePctRef.current.textContent = `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
    }
  };

  // 화면에 보이는 구간의 최고/최저 캔들 위치에 작은 화살표 라벨을 띄운다
  const updateMinMaxLines = () => {
    updateLastPriceBadge();

    const series = candleSeriesRef.current;
    const chart = chartRef.current;
    const highEl = highMarkerRef.current;
    const lowEl = lowMarkerRef.current;
    if (!series || !chart || !highEl || !lowEl) return;

    if (!showMinMaxRef.current) {
      highEl.style.display = "none";
      lowEl.style.display = "none";
      return;
    }

    const sorted = sortedRef.current;
    const range = chart.timeScale().getVisibleLogicalRange();
    if (!range || sorted.length === 0) {
      highEl.style.display = "none";
      lowEl.style.display = "none";
      return;
    }

    const from = Math.max(0, Math.ceil(range.from));
    const to = Math.min(sorted.length - 1, Math.floor(range.to));
    if (from > to) {
      highEl.style.display = "none";
      lowEl.style.display = "none";
      return;
    }

    let highCandle = sorted[from];
    let lowCandle = sorted[from];
    for (let i = from + 1; i <= to; i++) {
      if (sorted[i].high > highCandle.high) highCandle = sorted[i];
      if (sorted[i].low < lowCandle.low) lowCandle = sorted[i];
    }

    const lastClose = sorted[sorted.length - 1].close;
    const fmtPct = (v: number) => {
      if (lastClose <= 0) return "";
      const p = ((v - lastClose) / lastClose) * 100;
      return ` (${p >= 0 ? "+" : ""}${p.toFixed(2)}%)`;
    };

    // 캔들이 화면 가장자리에 있으면 라벨이 밖으로 잘리므로, 공간이 없는 쪽이면 반대편으로 뒤집는다.
    // (DOM 순서는 [라벨, 화살표] 고정. row-reverse로 좌우를 바꾸고 화살표는 scaleX로 뒤집는다)
    const plotLeft = 0;
    const plotRight = (containerRef.current?.clientWidth ?? 0) - chart.priceScale("right").width();

    const placeMarker = (
      el: HTMLDivElement,
      labelEl: HTMLSpanElement | null,
      arrowEl: SVGSVGElement | null,
      x: number,
      y: number,
      text: string,
      preferLeft: boolean,
    ) => {
      el.style.display = "flex";
      if (labelEl) labelEl.textContent = text;

      const w = el.offsetWidth + MARKER_GAP;
      // 선호하는 쪽에 공간이 없고 반대쪽에는 있으면 뒤집는다
      let onLeft = preferLeft;
      if (preferLeft && x - w < plotLeft && x + w <= plotRight) onLeft = false;
      else if (!preferLeft && x + w > plotRight && x - w >= plotLeft) onLeft = true;

      el.style.flexDirection = onLeft ? "row" : "row-reverse";
      el.style.transform = onLeft ? "translate(-100%, -50%)" : "translate(0, -50%)";
      if (arrowEl) arrowEl.style.transform = onLeft ? "" : "scaleX(-1)";
      // 화살표 끝이 봉에 딱 닿지 않도록 살짝 띄운다
      el.style.left = `${onLeft ? x - MARKER_GAP : x + MARKER_GAP}px`;
      el.style.top = `${y}px`;
    };

    const highX = chart.timeScale().timeToCoordinate(highCandle.chartTime as never);
    const highY = series.priceToCoordinate(highCandle.high);
    if (highX === null || highY === null) {
      highEl.style.display = "none";
    } else {
      placeMarker(
        highEl,
        highMarkerLabelRef.current,
        highArrowRef.current,
        highX,
        highY,
        `최고 ${Math.round(highCandle.high).toLocaleString("ko-KR")}${fmtPct(highCandle.high)} (${fmtMarkerDate(highCandle.chartTime)})`,
        true,
      );
    }

    const lowX = chart.timeScale().timeToCoordinate(lowCandle.chartTime as never);
    const lowY = series.priceToCoordinate(lowCandle.low);
    if (lowX === null || lowY === null) {
      lowEl.style.display = "none";
    } else {
      placeMarker(
        lowEl,
        lowMarkerLabelRef.current,
        lowArrowRef.current,
        lowX,
        lowY,
        `최저 ${Math.round(lowCandle.low).toLocaleString("ko-KR")}${fmtPct(lowCandle.low)} (${fmtMarkerDate(lowCandle.chartTime)})`,
        false,
      );
    }
  };

  useEffect(() => {
    showMinMaxRef.current = showMinMax;
    updateMinMaxLines();
  }, [showMinMax]);

  useEffect(() => {
    legendOptionsRef.current = legendOptions;
  }, [legendOptions]);

  useEffect(() => {
    legendLayoutRef.current = legendLayout;
  }, [legendLayout]);

  useEffect(() => {
    if (!settingsOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [settingsOpen]);

  // 차트 초기화 (마운트 1회)
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const fmtDatePart = (time: unknown) => {
      if (typeof time === "object" && time !== null) {
        const { year, month, day } = time as { year: number; month: number; day: number };
        return `${year}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}`;
      }
      // 일봉은 "yyyy-mm-dd" 형식의 BusinessDay 문자열로 넘어올 수 있다
      if (typeof time === "string") {
        const [y, m, d] = time.split("-");
        if (y && m && d) return `${y}.${m}.${d}`;
      }
      if (typeof time === "number") {
        const d = new Date((time + KST_OFFSET) * 1000);
        return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
      }
      return "";
    };

    const fmtTimePart = (time: unknown) => {
      if (typeof time !== "number") return "";
      const d = new Date((time + KST_OFFSET) * 1000);
      return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
    };

    // 크로스헤어에 뜨는 시각 — 몇 시인지뿐 아니라 며칠인지도 함께 보여준다
    // (object/string 형태의 BusinessDay는 일봉이라 시각 없이 날짜만 표시)
    const fmtKst = (time: unknown) => {
      if (typeof time !== "number") return fmtDatePart(time);
      return `${fmtDatePart(time)} ${fmtTimePart(time)}`;
    };

    // 시간축 눈금 — 평소엔 시각만, 날짜가 바뀌는 눈금에서만 날짜를 보여줘 눈금이 빽빽해지지 않게 한다
    const fmtTickMark = (time: unknown, tickMarkType: TickMarkType) => {
      if (typeof time !== "number") return fmtDatePart(time);
      if (
        tickMarkType === TickMarkType.Time ||
        tickMarkType === TickMarkType.TimeWithSeconds
      ) {
        return fmtTimePart(time);
      }
      return fmtDatePart(time);
    };

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "#181a20" },
        textColor: "#848e9c",
        fontSize: AXIS_FONT_SIZE,
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
        tickMarkFormatter: fmtTickMark,
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
      // 가격+등락률을 한 네모로 직접 그리므로 기본 라벨은 끈다 (updateLastPriceBadge 참고)
      lastValueVisible: false,
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

      const opts = legendOptionsRef.current;
      const layout = legendLayoutRef.current;

      // 항목(시/고/저/종/거래량/MA) 하나를 나타내는 html 조각. 항목 간 간격은
      // 부모 컨테이너의 gap이 담당하므로 여기서는 margin을 쓰지 않는다.
      const cell = (label: string, v: number) => {
        const p = pct(v); const c = col(p);
        return `<div style="display:flex;align-items:center;gap:2px">` +
          `<span style="color:#848e9c">${label}</span>` +
          `<span style="color:${c}">${v.toLocaleString()}</span>` +
          `<span style="color:${c};font-size:10px">(${fmtPct(p)})</span>` +
          `</div>`;
      };

      const items: string[] = [];
      if (opts.open) items.push(cell("시", ohlc.open));
      if (opts.high) items.push(cell("고", ohlc.high));
      if (opts.low) items.push(cell("저", ohlc.low));
      if (opts.close) items.push(cell("종", ohlc.close));
      if (opts.volume) {
        items.push(
          `<div style="display:flex;align-items:center;gap:2px">` +
            `<span style="color:#848e9c">거래량</span>` +
            `<span style="color:#aaa">${Math.round(vol).toLocaleString()}</span>` +
            `</div>`
        );
      }
      if (opts.ma) {
        const maHtml = MA_CONFIGS.map((ma, i) => {
          const v = param.seriesData.get(maSeries[i]) as { value: number } | undefined;
          return v
            ? `<span style="color:${ma.color}">MA${ma.period} ${Math.round(v.value).toLocaleString()}</span>`
            : "";
        }).join("");
        if (maHtml) {
          items.push(`<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${maHtml}</div>`);
        }
      }

      if (items.length === 0) { legend.style.display = "none"; return; }

      legend.style.display = "flex";
      legend.style.flexDirection = layout === "vertical" ? "column" : "row";
      legend.style.alignItems = layout === "vertical" ? "flex-start" : "center";
      legend.style.flexWrap = layout === "vertical" ? "nowrap" : "wrap";
      legend.style.gap = layout === "vertical" ? "2px" : "8px";
      legend.innerHTML = items.join("");
    });

    const handleResize = () => {
      chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
    };
    window.addEventListener("resize", handleResize);

    // 가격축 드래그 리스케일, 자동 배율(autoScale) 애니메이션 등 위치가 바뀔 수 있는
    // 모든 경우를 일일이 추적하는 대신 매 프레임 라벨 좌표를 다시 계산해 항상 따라오게 한다
    let minMaxRafId = requestAnimationFrame(function tick() {
      updateMinMaxLines();
      minMaxRafId = requestAnimationFrame(tick);
    });

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
      cancelAnimationFrame(minMaxRafId);
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
    stickToLiveRef.current = true;

    // 전체 데이터를 정렬 후 모든 시리즈에 setData
    // scrollToLatest: 과거 데이터 추가 로드(무한 스크롤) 시에는 false로 호출해 스크롤 위치 유지
    const applyAllData = (scrollToLatest = true) => {
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

      if (scrollToLatest) {
        chartRef.current?.timeScale().scrollToRealTime();
      }
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
        // 과거 스크롤 중이면(stickToLiveRef=false) 최신으로 튕기지 않도록 스크롤 유지
        applyAllData(stickToLiveRef.current);
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

        const prevBarCount = sortedRef.current.length;
        const visibleRange = chartRef.current?.timeScale().getVisibleLogicalRange() ?? null;

        for (const c of res.data.candles) {
          candleMapRef.current.set(c.candleTime, parseCandle(c, chartType));
        }
        nextCursorRef.current = res.data.nextCursor;
        applyAllData(false);

        // 과거 봉이 앞쪽에 추가되면서 밀린 만큼 logical range를 보정해 스크롤 위치 유지
        const addedBars = sortedRef.current.length - prevBarCount;
        if (visibleRange && addedBars > 0) {
          chartRef.current?.timeScale().setVisibleLogicalRange({
            from: visibleRange.from + addedBars,
            to: visibleRange.to + addedBars,
          });
        }
      } finally {
        loadingMoreRef.current = false;
      }
    };

    // 차트 왼쪽 끝에 근접하면(barsBefore < 10) 과거 데이터 추가 로드,
    // 오른쪽 끝(최신 봉)이 보이는지도 함께 추적해 실시간 업데이트가 스크롤을 되돌리지 않게 한다
    const handleVisibleRangeChange = (logicalRange: LogicalRange | null) => {
      if (!logicalRange) return;
      const barsInfo = candleSeries.barsInLogicalRange(logicalRange);
      if (barsInfo === null) return;
      stickToLiveRef.current = barsInfo.barsAfter <= 0;
      if (barsInfo.barsBefore < 10) {
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
    <div className="w-full h-full bg-[#181a20] rounded-xl overflow-hidden p-2 flex flex-col">
      {/* 상단 툴바: 시간대 선택 + MA 범례 */}
      <div className="flex items-center gap-1 mb-1 shrink-0">
        <div className="flex gap-0.5">
          {CHART_TYPES.map((ct) => (
            <button
              key={ct.value}
              onClick={() => setChartType(ct.value)}
              className={`px-2 py-0.5 text-xs rounded-md transition-colors ${
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

        <div ref={settingsRef} className="relative ml-auto">
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            aria-label="차트 설정"
            className={`flex items-center justify-center w-6 h-6 rounded-md transition-colors ${
              settingsOpen ? "bg-[#2b2f36] text-white" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>

          {settingsOpen && (
            <div className="absolute top-full right-0 mt-1.5 w-44 bg-[#181a20] border border-[#2b2f36] rounded-lg shadow-2xl overflow-hidden z-50 p-2">
              <label className="flex items-center justify-between gap-2 px-1.5 py-1 text-xs text-zinc-300 cursor-pointer">
                고점/저점 표시
                <input
                  type="checkbox"
                  checked={showMinMax}
                  onChange={(e) => setShowMinMax(e.target.checked)}
                  className="accent-[#F59E0B]"
                />
              </label>
              <div className="my-1 border-t border-[#2b2f36]" />
              <div className="flex items-center justify-between gap-2 px-1.5 py-1 text-xs text-zinc-300">
                표시 방향
                <div className="flex gap-0.5 bg-[#0d0e11] rounded-md p-0.5">
                  <button
                    onClick={() => setLegendLayout("horizontal")}
                    className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                      legendLayout === "horizontal" ? "bg-[#2b2f36] text-white" : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    가로
                  </button>
                  <button
                    onClick={() => setLegendLayout("vertical")}
                    className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                      legendLayout === "vertical" ? "bg-[#2b2f36] text-white" : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    세로
                  </button>
                </div>
              </div>
              <div className="my-1 border-t border-[#2b2f36]" />
              {LEGEND_TOGGLES.map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center justify-between gap-2 px-1.5 py-1 text-xs text-zinc-300 cursor-pointer"
                >
                  {label}
                  <input
                    type="checkbox"
                    checked={legendOptions[key]}
                    onChange={(e) =>
                      setLegendOptions((prev) => ({ ...prev, [key]: e.target.checked }))
                    }
                    className="accent-[#F59E0B]"
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* 차트 영역 */}
      <div className="relative flex-1 min-h-0">
        {/* OHLCV + MA 범례 (크로스헤어 이동 시 표시) */}
        <div
          ref={legendRef}
          className="absolute top-1 left-1 z-10 text-xs pointer-events-none"
          style={{ display: "none" }}
        />
        {/* 화면에 보이는 구간의 최고가 화살표 라벨 (기본: 캔들 왼쪽) */}
        <div
          ref={highMarkerRef}
          className="absolute z-20 flex items-center gap-0.5 pointer-events-none"
          style={{ display: "none", transform: "translate(-100%, -50%)" }}
        >
          <span
            ref={highMarkerLabelRef}
            className="whitespace-nowrap text-[9px] font-medium text-[#f6465d]"
            style={{ textShadow: "0 0 4px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.9)" }}
          />
          <svg ref={highArrowRef} className="w-3 h-3 shrink-0" viewBox="0 0 12 12" fill="none">
            <path d="M1 6H10.6M10.6 6L7.4 3.9M10.6 6L7.4 8.1" stroke="#f6465d" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        {/* 화면에 보이는 구간의 최저가 화살표 라벨 (기본: 캔들 오른쪽) */}
        <div
          ref={lowMarkerRef}
          className="absolute z-20 flex items-center gap-0.5 pointer-events-none"
          style={{ display: "none", flexDirection: "row-reverse", transform: "translate(0, -50%)" }}
        >
          <span
            ref={lowMarkerLabelRef}
            className="whitespace-nowrap text-[9px] font-medium text-[#2563eb]"
            style={{ textShadow: "0 0 4px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.9)" }}
          />
          <svg ref={lowArrowRef} className="w-3 h-3 shrink-0" viewBox="0 0 12 12" fill="none" style={{ transform: "scaleX(-1)" }}>
            <path d="M1 6H10.6M10.6 6L7.4 3.9M10.6 6L7.4 8.1" stroke="#2563eb" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        {/* 현재가 라벨 — 가격 + 등락률을 한 네모에 두 줄로 */}
        <div
          ref={lastPriceMarkerRef}
          className="absolute z-20 flex flex-col items-center justify-center rounded-none px-1.5 py-0.5 pointer-events-none"
          style={{ display: "none", transform: "translateY(-50%)" }}
        >
          <span ref={lastPriceValueRef} className="whitespace-nowrap text-[11px] font-bold leading-tight text-white" />
          <span ref={lastPricePctRef} className="whitespace-nowrap text-[11px] font-bold leading-tight text-white" />
        </div>
<div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  );
}
