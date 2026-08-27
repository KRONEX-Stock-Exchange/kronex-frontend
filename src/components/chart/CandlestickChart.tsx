import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  CrosshairMode,
  TickMarkType,
  LineStyle,
} from "lightweight-charts";
import type {
  IChartApi,
  ISeriesApi,
  LogicalRange,
  IPriceLine,
} from "lightweight-charts";
import { io, Socket } from "socket.io-client";
import { apiClient } from "../../services/api/client";
import { REALTIME_URL } from "../../constants";
import { tokenManager } from "../../services/auth/tokenManager";
import {
  DrawingsPrimitive,
  DEFAULT_DRAWING_COLOR,
  DEFAULT_DRAWING_WIDTH,
  DEFAULT_EMOJI_SIZE,
  DEFAULT_TEXT_SIZE,
  type DrawingPoint,
  type Drawing,
} from "./plugins/DrawingsPrimitive";
import { DrawingToolbar, type ToolId } from "./DrawingToolbar";

const EMOJI_OPTIONS = [
  "🚀",
  "📈",
  "📉",
  "🔥",
  "💎",
  "👉",
  "🔥",
  "⭐",
  "✅",
  "❌",
  "👍",
  "👎",
  "🔨",
  "🧲",
];

const DRAWING_COLORS = [
  "#f0b90b",
  "#f6465d",
  "#2563eb",
  "#22c55e",
  "#a855f7",
  "#ffffff",
];
const DRAWING_WIDTHS = [1, 2, 3, 4];
const TEXT_SIZES = [12, 16, 20, 28, 36];

type ChartType = "1m" | "5m" | "15m" | "30m" | "1h" | "1d";

const CHART_TYPES: { label: string; value: ChartType }[] = [
  { label: "1분", value: "1m" },
  { label: "5분", value: "5m" },
  { label: "15분", value: "15m" },
  { label: "30분", value: "30m" },
  { label: "1시간", value: "1h" },
  { label: "1일", value: "1d" },
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
    return (
      closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period
    );
  });
}

// lightweight-charts가 day 타입일 때 param.time을 {year,month,day} 객체로 줌
function newDrawingStyle() {
  return {
    color: DEFAULT_DRAWING_COLOR,
    width: DEFAULT_DRAWING_WIDTH,
    locked: false,
  };
}

// 종목별로 그려둔 드로잉을 localStorage에 저장/복원한다 (키: 종목 ID)
const DRAWINGS_STORAGE_PREFIX = "chart-drawings-";

function drawingsStorageKey(stockId: number): string {
  return `${DRAWINGS_STORAGE_PREFIX}${stockId}`;
}

// localStorage에는 logical index 대신 **절대 시각(unix ms) + 가격**을 저장한다.
// logical 0의 의미는 로드 구간/시간대(30분·1일 등)에 따라 매번 달라지므로 그대로
// 저장하면 다른 봉으로 전환했을 때 드로잉이 엉뚱한 곳에 붙는다. 절대 시각을 저장하면
// 어떤 시간대의 봉이든 그 시각이 위치한 자리(봉 사이도 보간)로 환산돼 모든 봉에서
// 같은 날짜/가격 자리에 그려진다.
// (구버전 candleTime/offset 형식도 읽어들여 같은 시간대에서는 계속 보이게 한다.)
interface StoredPoint {
  t: number; // 절대 시각 (unix ms)
  price: number;
  // legacy
  candleTime?: string;
  offset?: number;
}

// 정렬된 봉 배열 → 각 봉의 절대 시각(ms) 배열. 시각↔logical 변환의 기준.
function candleTimesMs(sorted: ParsedCandle[]): number[] {
  return sorted.map((c) => Date.parse(c.candleTime));
}

// 소수 logical(봉 사이 위치 포함) → 절대 시각(ms). 범위 밖은 봉 간격으로 외삽한다.
function logicalToTimeMs(logical: number, times: number[]): number | null {
  const n = times.length;
  if (n === 0) return null;
  if (n === 1) return times[0];
  if (logical <= 0) return times[0] + (times[1] - times[0]) * logical;
  if (logical >= n - 1)
    return times[n - 1] + (times[n - 1] - times[n - 2]) * (logical - (n - 1));
  const lo = Math.floor(logical);
  return times[lo] + (times[lo + 1] - times[lo]) * (logical - lo);
}

// 절대 시각(ms) → 소수 logical. 범위 밖은 봉 간격으로 외삽한다.
function timeMsToLogical(t: number, times: number[]): number | null {
  const n = times.length;
  if (n === 0) return null;
  if (n === 1) return 0;
  if (t <= times[0]) {
    const bar = times[1] - times[0];
    return bar > 0 ? (t - times[0]) / bar : 0;
  }
  if (t >= times[n - 1]) {
    const bar = times[n - 1] - times[n - 2];
    return n - 1 + (bar > 0 ? (t - times[n - 1]) / bar : 0);
  }
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  const span = times[hi] - times[lo];
  return lo + (span > 0 ? (t - times[lo]) / span : 0);
}

type StoredDrawingShape =
  | { id: number; type: "trendline"; p1: StoredPoint; p2: StoredPoint }
  | { id: number; type: "hline"; price: number }
  | { id: number; type: "polyline"; points: StoredPoint[] }
  | { id: number; type: "pattern"; points: StoredPoint[] }
  | {
      id: number;
      type: "channel";
      p1: StoredPoint;
      p2: StoredPoint;
      offsetPrice: number;
    }
  | { id: number; type: "brush"; points: StoredPoint[] }
  | {
      id: number;
      type: "text";
      point: StoredPoint;
      text: string;
      size: number;
      angle: number;
      flipped: boolean;
    }
  | {
      id: number;
      type: "emoji";
      point: StoredPoint;
      emoji: string;
      size: number;
      angle: number;
      flipped: boolean;
    };

type StoredDrawing = StoredDrawingShape & {
  color: string;
  width: number;
  locked: boolean;
};

function pointToStored(p: DrawingPoint, times: number[]): StoredPoint | null {
  const t = logicalToTimeMs(p.logical, times);
  if (t === null) return null;
  return { t, price: p.price };
}

function storedToPoint(
  sp: StoredPoint,
  times: number[],
  legacyIndex: Map<string, number>,
): DrawingPoint | null {
  // 신형: 절대 시각 → logical 보간
  if (typeof sp.t === "number" && Number.isFinite(sp.t)) {
    const logical = timeMsToLogical(sp.t, times);
    return logical === null ? null : { logical, price: sp.price };
  }
  // 구형(candleTime/offset): 같은 시간대일 때만 그 봉을 찾아 복원
  if (sp.candleTime !== undefined) {
    const idx = legacyIndex.get(sp.candleTime);
    if (idx === undefined) return null;
    return { logical: idx + (sp.offset ?? 0), price: sp.price };
  }
  return null;
}

// Drawing(logical 기반, 메모리) → StoredDrawing(절대 시각 기반, localStorage 저장용).
// 방어적으로 변환에 실패하면 그 도형은 저장을 건너뛴다.
function drawingToStored(d: Drawing, times: number[]): StoredDrawing | null {
  if (d.type === "hline") return { ...d };
  if (d.type === "trendline" || d.type === "channel") {
    const p1 = pointToStored(d.p1, times);
    const p2 = pointToStored(d.p2, times);
    if (!p1 || !p2) return null;
    return { ...d, p1, p2 };
  }
  if (d.type === "polyline" || d.type === "brush" || d.type === "pattern") {
    const points = d.points.map((p) => pointToStored(p, times));
    if (points.some((p) => p === null)) return null;
    return { ...d, points: points as StoredPoint[] };
  }
  const point = pointToStored(d.point, times);
  if (!point) return null;
  return { ...d, point };
}

// StoredDrawing → Drawing. 봉 데이터가 아직 없으면(times 비어있음) null을 반환해
// 호출부가 pending으로 보류하도록 한다.
function storedToDrawing(
  sd: StoredDrawing,
  times: number[],
  legacyIndex: Map<string, number>,
): Drawing | null {
  if (sd.type === "hline") return { ...sd };
  if (times.length === 0) return null;
  const conv = (sp: StoredPoint) => storedToPoint(sp, times, legacyIndex);
  if (sd.type === "trendline" || sd.type === "channel") {
    const p1 = conv(sd.p1);
    const p2 = conv(sd.p2);
    if (!p1 || !p2) return null;
    return { ...sd, p1, p2 };
  }
  if (sd.type === "polyline" || sd.type === "brush" || sd.type === "pattern") {
    const points = sd.points.map(conv);
    if (points.some((p) => p === null)) return null;
    return { ...sd, points: points as DrawingPoint[] };
  }
  const point = conv(sd.point);
  if (!point) return null;
  return { ...sd, point };
}

function paramTimeToKey(t: unknown): string {
  if (typeof t === "object" && t !== null) {
    const { year, month, day } = t as {
      year: number;
      month: number;
      day: number;
    };
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return String(t);
}

interface CandlestickChartProps {
  stockId: number | null;
  avgPrice?: number | null;
  // 전체화면은 이 컴포넌트가 직접 fixed로 덮지 않고 부모(TradingPage)에게 알린다.
  // 종목 정보 바(StockHeader)는 전체화면에서도 남아야 하는데, 그 바는 부모가 갖고
  // 있어서 여기서 화면을 덮어버리면 같이 가려지기 때문이다.
  onFullscreenChange?: (fullscreen: boolean) => void;
}

// 설정 패널용 토글 스위치. 네이티브 체크박스(accent-color)는 켜졌을 때 통짜 색으로
// 칠해져 앰버 하나만 있어도 튀는데, 7개가 한꺼번에 켜지면 패널 전체가 번쩍여서
// "표시 방향" 세그먼트 버튼과 같은 톤(무채색 회색조)으로 통일한다.
function ToggleSwitch({ checked }: { checked: boolean }) {
  return (
    <span
      className={`relative inline-flex h-4.5 w-8 shrink-0 rounded-full transition-colors ${
        checked ? "bg-zinc-500" : "bg-[#2b2f36]"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-white transition-transform ${
          checked ? "translate-x-3.5" : ""
        }`}
      />
    </span>
  );
}

export function CandlestickChart({
  stockId,
  avgPrice,
  onFullscreenChange,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const avgPriceLineRef = useRef<IPriceLine | null>(null);
  const drawingsPluginRef = useRef<DrawingsPrimitive | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const maSeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const legendRef = useRef<HTMLDivElement>(null);
  // 캔들 데이터 저장소
  const candleMapRef = useRef<Map<string, ParsedCandle>>(new Map()); // key: candleTime(ISO)
  const sortedRef = useRef<ParsedCandle[]>([]); // 시간순 정렬 배열 (시리즈 업데이트용)
  // chartTime 문자열 키 → sortedRef 인덱스. rAF 루프와 크로스헤어 핸들러가 매 프레임/
  // 매 이동마다 sorted.findIndex(...)로 전체를 훑던 것(O(n))을 Map 조회(O(1))로 대체해
  // 버벅임을 줄인다 (문제 6). applyAllData가 sortedRef를 새로 만들 때마다 함께 갱신한다.
  const chartTimeIndexRef = useRef<Map<string, number>>(new Map());
  // candleTime 앵커를 아직 logical로 못 바꾼(해당 봉이 아직 로드 안 된) 드로잉들.
  // 데이터가 더 로드될 때마다(resolvePendingDrawings) 다시 시도한다.
  const pendingStoredDrawingsRef = useRef<StoredDrawing[]>([]);
  // 직전에 데이터를 로드한 (종목, 시간대). 시간대만 바뀐 경우를 구분해 드로잉을
  // 전환 직전에 절대 시각으로 굳혀 저장하기 위해 쓴다.
  const prevDataKeyRef = useRef<{
    stockId: number | null;
    chartType: ChartType;
  }>({ stockId: null, chartType: "1d" });
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
  // 크로스헤어(선택한 캔들) 가격축 라벨을 직접 HTML로 그린다. lightweight-charts의
  // 기본 라벨은 캔버스에 그려져 HTML인 현재가 배지 밑에 깔리는데, 이걸 HTML로 올려
  // 현재가 배지보다 위에 두면 겹칠 때 선택 캔들 라벨이 우선한다.
  const crosshairLabelRef = useRef<HTMLDivElement>(null);
  // 크로스헤어가 자석 스냅된 가격. null이면 크로스헤어가 차트 밖.
  const crosshairSnapPriceRef = useRef<number | null>(null);
  const lastPriceValueRef = useRef<HTMLSpanElement>(null);
  const lastPricePctRef = useRef<HTMLSpanElement>(null);
  const avgPriceLabelRef = useRef<HTMLDivElement>(null);
  // 선택 팔레트 — 오른쪽 가격축을 덮지 않도록 축 너비만큼 안쪽으로 띄운다
  const paletteRef = useRef<HTMLDivElement>(null);
  const [chartType, setChartType] = useState<ChartType>("1d");
  const [chartLoading, setChartLoading] = useState(true);
  const [showMinMax, setShowMinMax] = useState(true);
  const showMinMaxRef = useRef(showMinMax);
  const [showAvgPrice, setShowAvgPrice] = useState(false);
  const showAvgPriceRef = useRef(showAvgPrice);
  // 수평선 오른쪽 끝에 그 선의 가격 + 현재가 대비 등락률 라벨 표시
  const [showHlinePrice, setShowHlinePrice] = useState(false);
  const showHlinePriceRef = useRef(showHlinePrice);
  const avgPriceRef = useRef(avgPrice);
  const [legendOptions, setLegendOptions] = useState<LegendOptions>({
    ma: false,
    high: true,
    low: true,
    open: true,
    close: true,
    volume: true,
  });
  const legendOptionsRef = useRef(legendOptions);
  const [legendLayout, setLegendLayout] = useState<"horizontal" | "vertical">(
    "horizontal",
  );
  const legendLayoutRef = useRef(legendLayout);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  // 설정 드롭다운 스크롤 영역 — 작은 화면에서 차트 하단(전체화면 버튼)을 침범하지
  // 않도록 남은 높이에 맞춰 maxHeight를 매 프레임 계산한다
  const settingsScrollRef = useRef<HTMLDivElement>(null);
  // 스크롤로 더 볼 내용이 있을 때 위/아래 끝에 페이드(그림자)를 띄운다
  const settingsFadeTopRef = useRef<HTMLDivElement>(null);
  const settingsFadeBottomRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // 콜백을 ref로 들고 있어야 부모가 매 렌더 새 함수를 넘겨도 알림 effect가 재실행되지 않는다
  const onFullscreenChangeRef = useRef(onFullscreenChange);
  onFullscreenChangeRef.current = onFullscreenChange;

  // 드로잉 툴바 상태
  const [showDrawingToolbar, setShowDrawingToolbar] = useState(true);
  const [activeTool, setActiveTool] = useState<ToolId>("cursor");
  const activeToolRef = useRef<ToolId>("cursor");
  const [justSaved, setJustSaved] = useState(false);
  const justSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (justSavedTimerRef.current) clearTimeout(justSavedTimerRef.current);
    };
  }, []);
  const [magnetOn, setMagnetOn] = useState(false);
  const magnetOnRef = useRef(false);
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  const [drawingsVisible, setDrawingsVisible] = useState(true);
  const [hasDrawings, setHasDrawings] = useState(false);
  const resetDrawStateRef = useRef<() => void>(() => {});
  const [textInputAt, setTextInputAt] = useState<{
    point: DrawingPoint;
    x: number;
    y: number;
  } | null>(null);
  const textInputAtRef = useRef(textInputAt);
  const [emojiPickerAt, setEmojiPickerAt] = useState<{
    point: DrawingPoint;
    x: number;
    y: number;
  } | null>(null);
  const emojiPickerAtRef = useRef(emojiPickerAt);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  // 측정자 도구 정보 박스 — pointermove마다 React state로 갱신하면 무거운 컴포넌트
  // 전체가 매 프레임 리렌더되어 버벅임의 원인이 되므로(문제 6), 다른 오버레이
  // 라벨들(고점/저점, 현재가 등)과 같은 방식으로 ref를 통해 DOM을 직접 갱신한다.
  const measureBoxRef = useRef<HTMLDivElement>(null);
  const measureBarsRef = useRef<HTMLDivElement>(null);
  const measureDiffRef = useRef<HTMLDivElement>(null);
  const updateMeasureBox = (
    info: {
      x: number;
      y: number;
      bars: number;
      priceDiff: number;
      pricePct: number;
    } | null,
  ) => {
    const box = measureBoxRef.current;
    if (!box) return;
    if (!info) {
      box.style.display = "none";
      return;
    }
    box.style.display = "block";
    box.style.left = `${info.x + 12}px`;
    box.style.top = `${info.y - 12}px`;
    if (measureBarsRef.current)
      measureBarsRef.current.textContent = `${info.bars}봉`;
    if (measureDiffRef.current) {
      const el = measureDiffRef.current;
      el.textContent = `${info.priceDiff >= 0 ? "+" : ""}${Math.round(info.priceDiff).toLocaleString("ko-KR")} (${info.pricePct >= 0 ? "+" : ""}${info.pricePct.toFixed(2)}%)`;
      el.className = info.priceDiff >= 0 ? "text-[#f6465d]" : "text-[#2563eb]";
    }
  };

  // 해당 종목에 저장된 드로잉을 불러와 플러그인에 반영한다 (없으면 비운다).
  // candleTime 앵커를 아직 로드되지 않은 항목은 pending에 남겨 resolvePendingDrawings가
  // 이후 데이터 로드 시점에 다시 시도하게 한다.
  const loadSavedDrawings = (id: number | null) => {
    const plugin = drawingsPluginRef.current;
    if (!plugin) return;
    let stored: StoredDrawing[] = [];
    if (id !== null) {
      try {
        const raw = localStorage.getItem(drawingsStorageKey(id));
        if (raw) stored = JSON.parse(raw) as StoredDrawing[];
      } catch {
        stored = [];
      }
    }
    const times = candleTimesMs(sortedRef.current);
    const legacyIndex = new Map<string, number>();
    sortedRef.current.forEach((c, i) => legacyIndex.set(c.candleTime, i));
    const resolved: Drawing[] = [];
    const pending: StoredDrawing[] = [];
    for (const sd of stored) {
      const d = storedToDrawing(sd, times, legacyIndex);
      if (d) resolved.push(d);
      else pending.push(sd);
    }
    pendingStoredDrawingsRef.current = pending;
    plugin.setDrawings(resolved);
    setHasDrawings(stored.length > 0);
  };

  // 새 캔들 데이터가 로드될 때마다(초기 로드/과거 스크롤/실시간 신규 봉) 호출해,
  // 그때는 candleTime을 못 찾아 pending으로 남아있던 드로잉 중 이제 로드된 것들을
  // 마저 그려 넣는다. addDrawing으로 기존 선택 상태는 건드리지 않되, 여러 개가 한꺼번에
  // 풀리는 경우(예: 과거 스크롤로 옛 봉 무더기가 로드) 트랜잭션으로 묶어 Ctrl+Z 한 번에
  // 다 같이 취소되게 한다.
  const resolvePendingDrawings = () => {
    const plugin = drawingsPluginRef.current;
    if (!plugin || pendingStoredDrawingsRef.current.length === 0) return;
    const times = candleTimesMs(sortedRef.current);
    const legacyIndex = new Map<string, number>();
    sortedRef.current.forEach((c, i) => legacyIndex.set(c.candleTime, i));
    const stillPending: StoredDrawing[] = [];
    const newlyResolved: Drawing[] = [];
    for (const sd of pendingStoredDrawingsRef.current) {
      const d = storedToDrawing(sd, times, legacyIndex);
      if (d) newlyResolved.push(d);
      else stillPending.push(sd);
    }
    if (newlyResolved.length === 0) return;
    pendingStoredDrawingsRef.current = stillPending;
    plugin.beginHistoryTransaction();
    newlyResolved.forEach((d) => plugin.addDrawing(d));
    plugin.endHistoryTransaction();
  };

  // 현재 드로잉을 종목별 localStorage 키에 절대 시각 기준으로 써넣는다 (토스트 없음).
  // 시간대 전환 직전에도 호출해, 아직 옛 봉 데이터가 살아있을 때 in-memory logical을
  // 절대 시각으로 굳혀둔다 → 새 시간대에서 같은 자리로 되살아난다.
  const persistDrawings = (id: number | null) => {
    const plugin = drawingsPluginRef.current;
    if (!plugin || id === null) return;
    try {
      const times = candleTimesMs(sortedRef.current);
      const stored = plugin.drawings
        .map((d) => drawingToStored(d, times))
        .filter((d): d is StoredDrawing => d !== null);
      // 아직 로드 안 된 구간이라 화면엔 없지만 보류 중인 드로잉도 같이 보존한다
      // (안 그러면 데이터 로딩 중에 시간대를 바꾸면 그 드로잉들이 사라진다).
      localStorage.setItem(
        drawingsStorageKey(id),
        JSON.stringify([...stored, ...pendingStoredDrawingsRef.current]),
      );
    } catch {
      // 용량 초과 등은 조용히 무시 — 저장 실패해도 그리기 자체엔 지장 없음
    }
  };

  // 현재 드로잉을 저장하고 "저장됨" 표시를 띄운다 (저장 버튼 / Ctrl+S).
  const saveDrawings = () => {
    if (drawingsPluginRef.current === null || stockId === null) return;
    persistDrawings(stockId);
    setJustSaved(true);
    if (justSavedTimerRef.current) clearTimeout(justSavedTimerRef.current);
    justSavedTimerRef.current = setTimeout(() => setJustSaved(false), 1500);
  };
  // Ctrl/Cmd+S 핸들러는 마운트 시 한 번만 등록되는 effect 안에서 호출되는데, saveDrawings는
  // stockId가 바뀔 때마다 새로 만들어지는 클로저라 effect가 캡처한 옛 버전을 그대로 쓰면
  // 항상 마운트 시점의(대개 null인) stockId로 저장을 시도하게 된다. ref로 최신 버전을
  // 항상 가리키게 해 이 stale closure 문제를 피한다.
  const saveDrawingsRef = useRef(saveDrawings);
  saveDrawingsRef.current = saveDrawings;

  // 선택된 드로잉(바이낸스처럼 커서 모드에서 클릭해 선택 → 점 드래그로 이동/리사이즈,
  // 뜨는 미니 툴바에서 색상/두께/잠금/삭제)
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedIdRef = useRef<number | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<{
    color: string;
    width: number;
    locked: boolean;
    contentSize?: number;
    contentType?: "emoji" | "text";
    contentFlipped?: boolean;
  } | null>(null);
  const [contentTransformId, setContentTransformId] = useState<number | null>(
    null,
  );

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
    // range.to를 직접 floor하면 봉 경계의 소수점 오차로 옆 봉을 가리킬 수 있어
    // 라이브러리가 제공하는 barsInLogicalRange로 실제 마지막 가시 봉의 시각을 구한다.
    const sorted = sortedRef.current;
    const range = chart.timeScale().getVisibleLogicalRange();
    let lastIndex = -1;
    if (!range) {
      lastIndex = sorted.length - 1;
    } else {
      const barsInfo = series.barsInLogicalRange(range);
      const toKey =
        barsInfo?.to !== undefined ? paramTimeToKey(barsInfo.to) : undefined;
      lastIndex =
        toKey !== undefined ? (chartTimeIndexRef.current.get(toKey) ?? -1) : -1;
    }
    const last = lastIndex >= 0 ? sorted[lastIndex] : undefined;
    if (!last) {
      badge.style.display = "none";
      return;
    }

    const y = series.priceToCoordinate(last.close);
    if (y === null) {
      badge.style.display = "none";
      return;
    }

    // 등락은 크로스헤어 범례와 같은 기준(직전 봉 종가 대비)으로 계산하고, 색도 그 부호를 따른다.
    // 첫 봉은 비교할 직전 봉이 없으므로 자기 시가를 기준으로 둔다.
    const baseline = lastIndex > 0 ? sorted[lastIndex - 1].close : last.open;
    const isUp = last.close >= baseline;
    const pct = baseline > 0 ? ((last.close - baseline) / baseline) * 100 : 0;

    badge.style.display = "flex";
    badge.style.left = `${container.clientWidth - chart.priceScale("right").width()}px`;
    badge.style.top = `${y}px`;
    badge.style.backgroundColor = isUp ? "#f6465d" : "#2563eb";
    if (lastPriceValueRef.current) {
      lastPriceValueRef.current.textContent = Math.round(
        last.close,
      ).toLocaleString("ko-KR");
    }
    if (lastPricePctRef.current) {
      lastPricePctRef.current.textContent = `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
    }
  };

  // 크로스헤어(선택 캔들) 가격축 라벨 — 직접 그려서 현재가 배지 위에 올린다.
  const updateCrosshairLabel = () => {
    const series = candleSeriesRef.current;
    const chart = chartRef.current;
    const container = containerRef.current;
    const el = crosshairLabelRef.current;
    if (!series || !chart || !container || !el) return;

    const price = crosshairSnapPriceRef.current;
    if (price === null) {
      el.style.display = "none";
      return;
    }
    const y = series.priceToCoordinate(price);
    if (y === null || y < 0 || y > container.clientHeight) {
      el.style.display = "none";
      return;
    }
    el.style.display = "block";
    el.style.left = `${container.clientWidth - chart.priceScale("right").width()}px`;
    el.style.top = `${y}px`;
    el.textContent = price.toLocaleString("ko-KR");
  };

  // 평단가 선의 왼쪽 끝에 "매입가" 태그를 띄운다 (가격 자체는 오른쪽 가격축에 표시)
  const updateAvgPriceLabel = () => {
    const series = candleSeriesRef.current;
    const label = avgPriceLabelRef.current;
    const container = containerRef.current;
    if (!series || !label || !container) return;

    const price = avgPriceRef.current;
    if (!showAvgPriceRef.current || !price || price <= 0) {
      label.style.display = "none";
      return;
    }

    const y = series.priceToCoordinate(price);
    // 매입가가 현재 화면에 보이는 가격대 범위를 완전히 벗어났으면(스크롤/줌으로
    // 캔들 가격대가 바뀐 경우) 엉뚱한 위치에 걸쳐 보이지 않도록 라벨을 숨긴다
    if (y === null || y < 0 || y > container.clientHeight) {
      label.style.display = "none";
      return;
    }

    // translateY(-50%)로 중앙 정렬되므로, 값이 차트 상/하단 끝에 가까우면
    // 라벨 절반이 차트 영역 밖(툴바 쪽)으로 튀어나가지 않도록 위치를 clamp한다
    const half = label.offsetHeight / 2;
    const clampedY = Math.min(Math.max(y, half), container.clientHeight - half);

    label.style.display = "block";
    label.style.left = "0px";
    label.style.top = `${clampedY}px`;
  };

  // 화면에 보이는 구간의 최고/최저 캔들 위치에 작은 화살표 라벨을 띄운다
  const updateMinMaxLines = () => {
    updateLastPriceBadge();
    updateCrosshairLabel();
    updateAvgPriceLabel();

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

    // 여기도 range.from/to를 직접 ceil/floor하면 봉 경계에서 옆 봉이 섞여 들어갈 수 있어
    // badge와 동일하게 barsInLogicalRange가 알려주는 실제 첫/마지막 가시 봉의 시각으로 인덱스를 찾는다.
    const barsInfo = series.barsInLogicalRange(range);
    const fromKey =
      barsInfo?.from !== undefined ? paramTimeToKey(barsInfo.from) : undefined;
    const toKey =
      barsInfo?.to !== undefined ? paramTimeToKey(barsInfo.to) : undefined;
    const from =
      fromKey !== undefined
        ? (chartTimeIndexRef.current.get(fromKey) ?? -1)
        : -1;
    const to =
      toKey !== undefined ? (chartTimeIndexRef.current.get(toKey) ?? -1) : -1;
    if (from < 0 || to < 0 || from > to) {
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
    const plotRight =
      (containerRef.current?.clientWidth ?? 0) -
      chart.priceScale("right").width();

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
      else if (!preferLeft && x + w > plotRight && x - w >= plotLeft)
        onLeft = true;

      el.style.flexDirection = onLeft ? "row" : "row-reverse";
      el.style.transform = onLeft
        ? "translate(-100%, -50%)"
        : "translate(0, -50%)";
      if (arrowEl) arrowEl.style.transform = onLeft ? "" : "scaleX(-1)";
      // 화살표 끝이 봉에 딱 닿지 않도록 살짝 띄운다
      el.style.left = `${onLeft ? x - MARKER_GAP : x + MARKER_GAP}px`;
      el.style.top = `${y}px`;
    };

    const highX = chart
      .timeScale()
      .timeToCoordinate(highCandle.chartTime as never);
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

    const lowX = chart
      .timeScale()
      .timeToCoordinate(lowCandle.chartTime as never);
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
    showAvgPriceRef.current = showAvgPrice;
    avgPriceRef.current = avgPrice;
    updateMinMaxLines();
  }, [showAvgPrice, avgPrice]);

  useEffect(() => {
    showHlinePriceRef.current = showHlinePrice;
    drawingsPluginRef.current?.setPriceTag(
      showHlinePrice,
      sortedRef.current[sortedRef.current.length - 1]?.close ?? null,
    );
  }, [showHlinePrice]);

  useEffect(() => {
    legendOptionsRef.current = legendOptions;
  }, [legendOptions]);

  useEffect(() => {
    legendLayoutRef.current = legendLayout;
  }, [legendLayout]);

  // 드로잉 도구 선택: 커서 모드가 아니면 차트 위 드래그가 그리기 동작이므로
  // 드래그 패닝(pressedMouseMove)만 꺼서 그리기 제스처와 충돌하지 않게 한다.
  // 마우스 휠 줌/스크롤(mouseWheel)과 핀치 줌은 도구를 쓰는 중에도 그대로 둔다.
  useEffect(() => {
    activeToolRef.current = activeTool;
    resetDrawStateRef.current();
    const chart = chartRef.current;
    if (!chart) return;
    const isCursor = activeTool === "cursor";
    chart.applyOptions({
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: isCursor,
        horzTouchDrag: isCursor,
        vertTouchDrag: isCursor,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: isCursor ? { price: true, time: true } : false,
        axisDoubleClickReset: true,
      },
    });
  }, [activeTool]);

  useEffect(() => {
    magnetOnRef.current = magnetOn;
  }, [magnetOn]);

  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  useEffect(() => {
    drawingsPluginRef.current?.setVisible(drawingsVisible);
  }, [drawingsVisible]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    drawingsPluginRef.current?.setSelected(selectedId);
  }, [selectedId]);

  // 선택된 드로잉이 있을 때 Delete/Backspace로 삭제
  useEffect(() => {
    if (selectedId === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        const plugin = drawingsPluginRef.current;
        if (!plugin) return;
        const drawing = plugin.drawings.find((d) => d.id === selectedId);
        if (drawing?.locked || lockedRef.current) return;
        plugin.removeDrawing(selectedId);
        setHasDrawings(plugin.drawings.length > 0);
        setSelectedId(null);
        setSelectedStyle(null);
        setContentTransformId(null);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedId]);

  useEffect(() => {
    textInputAtRef.current = textInputAt;
  }, [textInputAt]);

  useEffect(() => {
    emojiPickerAtRef.current = emojiPickerAt;
  }, [emojiPickerAt]);

  // 이모지 피커 바깥을 클릭하면 취소
  useEffect(() => {
    if (!emojiPickerAt) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(e.target as Node)
      ) {
        setEmojiPickerAt(null);
        setActiveTool("cursor");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [emojiPickerAt]);

  // 종목이 바뀌면 이전 종목 가격대에 그려둔 드로잉은 의미가 없으므로 그 종목에
  // 저장해둔 드로잉으로 교체한다 (저장된 게 없으면 비운다)
  useEffect(() => {
    // 실제 로드는 데이터 effect가 새 봉을 받은 뒤 loadSavedDrawings/resolvePendingDrawings로
    // 처리한다. 여기서는 이전 종목의 드로잉만 즉시 걷어낸다(엉뚱한 자리에 한 프레임
    // 비치는 것 방지).
    drawingsPluginRef.current?.setDrawings([]);
    pendingStoredDrawingsRef.current = [];
    setActiveTool("cursor");
    setTextInputAt(null);
    setEmojiPickerAt(null);
    updateMeasureBox(null);
    setSelectedId(null);
    setSelectedStyle(null);
    setContentTransformId(null);
  }, [stockId]);

  useEffect(() => {
    if (!settingsOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        settingsRef.current &&
        !settingsRef.current.contains(e.target as Node)
      ) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [settingsOpen]);

  // 부모와 같은 사용자 이벤트 안에서 상태를 바꿔야 공유 요소 전환이 차트의 전후
  // 화면을 정확히 스냅샷할 수 있다.
  const setFullscreenMode = (fullscreen: boolean) => {
    setIsFullscreen(fullscreen);
    onFullscreenChangeRef.current?.(fullscreen);
  };

  // Esc로 전체화면 해제. 텍스트 도구의 인라인 입력창이 열려 있으면 그 입력 취소가
  // 우선이므로(입력창 자체의 onKeyDown이 처리) 여기서는 건드리지 않는다.
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (textInputAtRef.current) return;
      setFullscreenMode(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  // 차트 초기화 (마운트 1회)
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const fmtDatePart = (time: unknown) => {
      if (typeof time === "object" && time !== null) {
        const { year, month, day } = time as {
          year: number;
          month: number;
          day: number;
        };
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
        // 가격축 라벨은 캔버스라 HTML 현재가 배지 밑에 깔린다. 끄고 직접 HTML로
        // 그려(updateCrosshairLabel) 배지 위에 올린다.
        horzLine: {
          color: "#505050",
          labelBackgroundColor: "#2b2f36",
          labelVisible: false,
        },
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
        formatter: (price: number) =>
          price < 0 ? "" : price.toLocaleString("ko-KR"),
        minMove: 1,
      },
      // 가격+등락률을 한 네모로 직접 그리므로 기본 라벨은 끈다 (updateLastPriceBadge 참고)
      lastValueVisible: false,
    });
    // right 스케일: 하단 30% 비워서 volume 영역 확보
    candleSeries
      .priceScale()
      .applyOptions({ scaleMargins: { top: 0.05, bottom: 0.3 } });
    candleSeriesRef.current = candleSeries;

    const drawingsPlugin = new DrawingsPrimitive();
    candleSeries.attachPrimitive(drawingsPlugin);
    drawingsPluginRef.current = drawingsPlugin;
    // 이 effect는 마운트 시 한 번만 도는데, 그보다 먼저 선언된 stockId-change
    // effect는 이 시점엔 plugin이 아직 없어 아무 것도 못하므로, 초기 종목의
    // 저장된 드로잉은 여기서 직접 불러온다.
    loadSavedDrawings(stockId);

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
      }),
    );
    maSeriesRef.current = maSeries;

    // 크로스헤어 범례: 시·고·저·종 + 등락률 + 거래량 + MA값 + % 레이블 갱신
    chart.subscribeCrosshairMove((param) => {
      const legend = legendRef.current;
      if (!legend) return;
      if (!param.time || !param.seriesData.has(candleSeries)) {
        legend.style.display = "none";
        crosshairSnapPriceRef.current = null;
        return;
      }
      const ohlc = param.seriesData.get(candleSeries) as {
        open: number;
        high: number;
        low: number;
        close: number;
      };
      const vol =
        (param.seriesData.get(volumeSeries) as { value: number } | undefined)
          ?.value ?? 0;
      if (!ohlc) {
        legend.style.display = "none";
        crosshairSnapPriceRef.current = null;
        return;
      }

      // CrosshairMode.Magnet은 커서에서 가장 가까운 시리즈의 "종가"(캔들=close,
      // 라인=value)로 스냅한다. 우리 HTML 가격 라벨도 그 값에 맞춰 그리기 위해 기록.
      const rawY = param.point?.y;
      const rawPrice =
        rawY !== undefined ? candleSeries.coordinateToPrice(rawY) : null;
      if (rawPrice !== null) {
        let snapped = ohlc.close;
        let bestDiff = Math.abs(ohlc.close - rawPrice);
        for (const ma of maSeries) {
          const mv = param.seriesData.get(ma) as { value: number } | undefined;
          if (mv && Math.abs(mv.value - rawPrice) < bestDiff) {
            bestDiff = Math.abs(mv.value - rawPrice);
            snapped = mv.value;
          }
        }
        crosshairSnapPriceRef.current = snapped;
      } else {
        crosshairSnapPriceRef.current = null;
      }

      const key = paramTimeToKey(param.time);
      const idx = chartTimeIndexRef.current.get(key) ?? -1;
      const prevClose = idx > 0 ? sortedRef.current[idx - 1].close : ohlc.open;
      const pct = (v: number) =>
        prevClose > 0 ? ((v - prevClose) / prevClose) * 100 : 0;
      const fmtPct = (p: number) => `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`;
      const col = (p: number) => (p >= 0 ? "#f6465d" : "#2563eb");

      const opts = legendOptionsRef.current;
      const layout = legendLayoutRef.current;

      // 항목(시/고/저/종/거래량/MA) 하나를 나타내는 html 조각. 항목 간 간격은
      // 부모 컨테이너의 gap이 담당하므로 여기서는 margin을 쓰지 않는다.
      const cell = (label: string, v: number) => {
        const p = pct(v);
        const c = col(p);
        return (
          `<div style="display:flex;align-items:center;gap:2px">` +
          `<span style="color:#848e9c">${label}</span>` +
          `<span style="color:${c}">${v.toLocaleString()}</span>` +
          `<span style="color:${c};font-size:10px">(${fmtPct(p)})</span>` +
          `</div>`
        );
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
            `</div>`,
        );
      }
      if (opts.ma) {
        const maSpans = MA_CONFIGS.map((ma, i) => {
          const v = param.seriesData.get(maSeries[i]) as
            { value: number } | undefined;
          return v
            ? `<span style="color:${ma.color}">MA${ma.period} ${Math.round(v.value).toLocaleString()}</span>`
            : "";
        }).filter(Boolean);
        // 세로 배치일 땐 다른 항목들처럼 MA값도 하나씩 각자 줄을 차지하게 한다
        if (layout === "vertical") {
          items.push(...maSpans);
        } else if (maSpans.length > 0) {
          items.push(
            `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${maSpans.join("")}</div>`,
          );
        }
      }

      if (items.length === 0) {
        legend.style.display = "none";
        return;
      }

      legend.style.display = "flex";
      legend.style.flexDirection = layout === "vertical" ? "column" : "row";
      legend.style.alignItems = layout === "vertical" ? "flex-start" : "center";
      legend.style.flexWrap = layout === "vertical" ? "nowrap" : "wrap";
      legend.style.gap = layout === "vertical" ? "2px" : "8px";
      legend.innerHTML = items.join("");
    });

    // ResizeObserver로 컨테이너 크기 변화를 추적한다. window resize 이벤트만 쓰면
    // 모바일 탭 전환처럼 컨테이너가 display:none → 다시 보이는 경우 리사이즈가 감지되지
    // 않아 차트가 0x0으로 굳어버릴 수 있는데, ResizeObserver는 그 전환에도 콜백이 온다.
    // 0 크기(숨김 상태)일 때는 리사이즈를 건너뛰어 차트 내부 상태가 깨지지 않게 한다.
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width === 0 || height === 0) return;
      // applyOptions({ width, height }) 대신 resize(w, h, true)를 쓴다. 둘 다 크기는
      // 같게 바꾸지만, applyOptions는 캔버스 엘리먼트의 CSS 크기만 즉시 바꿔놓고 실제
      // 다시 그리기는 다음 애니메이션 프레임으로 미룬다. 그래서 "그리기 도구" 토글처럼
      // 폭이 한 번에 바뀌는 순간엔, 새 크기의 영역에 옛 비트맵이 늘어나거나 잘린 채로
      // 한 프레임 비쳤다가 제자리를 찾는 게 번쩍임(차트가 다시 로딩되는 듯한 느낌)으로
      // 보였다. 세 번째 인자 forceRepaint=true는 이 콜백 안에서 전체 페인트를 동기로
      // 끝낸다. ResizeObserver 콜백은 레이아웃 이후 · 페인트 이전에 실행되므로, 브라우저가
      // 새 레이아웃을 처음 그릴 때 이미 차트도 새 크기로 그려져 있어 중간 프레임이 없다.
      chart.resize(width, height, true);
    });
    resizeObserver.observe(container);

    // 가격축 드래그 리스케일, 자동 배율(autoScale) 애니메이션 등 위치가 바뀔 수 있는
    // 모든 경우를 일일이 추적하는 대신 매 프레임 라벨 좌표를 다시 계산해 항상 따라오게 한다
    let minMaxRafId = requestAnimationFrame(function tick() {
      updateMinMaxLines();
      // 수평선 가격 태그의 현재가/옵션 상태를 매 프레임 넘긴다. 값이 안 바뀌면
      // setPriceTag 내부에서 재렌더를 건너뛰므로 부담은 거의 없다.
      drawingsPluginRef.current?.setPriceTag(
        showHlinePriceRef.current,
        sortedRef.current[sortedRef.current.length - 1]?.close ?? null,
      );
      if (paletteRef.current) {
        const axisW = chartRef.current?.priceScale("right").width() ?? 0;
        paletteRef.current.style.right = `${axisW + 8}px`;
      }
      if (settingsScrollRef.current && container) {
        const sc = settingsScrollRef.current;
        const top = sc.getBoundingClientRect().top;
        const bottom = container.getBoundingClientRect().bottom;
        sc.style.maxHeight = `${Math.min(290, Math.max(140, bottom - top - 12))}px`;
        const hidden = sc.scrollHeight - sc.clientHeight;
        if (settingsFadeTopRef.current)
          settingsFadeTopRef.current.style.opacity =
            sc.scrollTop > 4 ? "1" : "0";
        if (settingsFadeBottomRef.current)
          settingsFadeBottomRef.current.style.opacity =
            hidden > 4 && sc.scrollTop < hidden - 4 ? "1" : "0";
      }
      minMaxRafId = requestAnimationFrame(tick);
    });

    // ── 드로잉 도구 인터랙션 ──
    // 클릭 지점을 논리 인덱스(logical index)/가격으로 변환한다. time 기반
    // coordinateToTime()은 마지막 봉 너머의 빈 여백에서 null을 반환해 그 영역에는
    // 아무것도 그릴 수 없었는데(문제 4), coordinateToLogical()은 여백에서도 분수
    // 인덱스를 계속 내주므로 오른쪽 여백에도 자유롭게 그릴 수 있다.
    // 자석 모드가 켜져 있으면(브러시 제외) 화면상 가장 가까운 캔들의 OHLC 값으로 스냅한다.
    // 픽셀 x → 소수 logical. lightweight-charts의 coordinateToLogical은 정수 봉
    // 인덱스로 스냅해서(브러시·자유선이 봉 폭만큼 계단처럼 각짐), 근처 정수 인덱스를
    // 구한 뒤 양옆 봉의 x좌표로 역보간해 봉 사이 위치도 픽셀 단위로 되살린다.
    const xToLogicalPrecise = (px: number): number | null => {
      const ts = chartRef.current?.timeScale();
      if (!ts) return null;
      const nearInt = ts.coordinateToLogical(px);
      if (nearInt === null) return null;
      const x0 = ts.logicalToCoordinate(nearInt as never);
      const x1 = ts.logicalToCoordinate((nearInt + 1) as never);
      if (x0 === null || x1 === null || x1 === x0) return nearInt;
      return nearInt + (px - x0) / (x1 - x0);
    };

    const rawTimePrice = (
      clientX: number,
      clientY: number,
    ): DrawingPoint | null => {
      const series = candleSeriesRef.current;
      if (!chartRef.current || !series) return null;
      const rect = container.getBoundingClientRect();
      const logical = xToLogicalPrecise(clientX - rect.left);
      const price = series.coordinateToPrice(clientY - rect.top);
      if (logical === null || price === null) return null;
      return { logical, price };
    };
    // 가장 가까운 캔들 찾기: sortedRef는 logical index와 1:1로 대응하는 시간순
    // 배열이므로, 예전처럼 모든 봉을 순회하며 timeToCoordinate를 호출할 필요 없이
    // (O(n), pointermove마다 호출되어 버벅임의 원인이었다 — 문제 6) 분수 인덱스를
    // 반올림하기만 하면 된다(O(1)).
    const snapToCandle = (raw: DrawingPoint): DrawingPoint => {
      const sorted = sortedRef.current;
      if (sorted.length === 0) return raw;
      const idx = Math.max(
        0,
        Math.min(sorted.length - 1, Math.round(raw.logical)),
      );
      const nearest = sorted[idx];
      const candidates = [
        nearest.open,
        nearest.high,
        nearest.low,
        nearest.close,
      ];
      let bestPrice = candidates[0];
      let bestDiff = Infinity;
      for (const p of candidates) {
        const diff = Math.abs(p - raw.price);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestPrice = p;
        }
      }
      return { logical: idx, price: bestPrice };
    };
    const toTimePrice = (
      clientX: number,
      clientY: number,
    ): DrawingPoint | null => {
      const raw = rawTimePrice(clientX, clientY);
      if (!raw || !magnetOnRef.current) return raw;
      return snapToCandle(raw);
    };
    // 기준선 위 임의 logical 위치의 가격을 선형 보간으로 구한다. logical index와
    // 픽셀 x좌표는 선형 관계이므로 좌표 변환 없이 인덱스만으로 바로 계산할 수 있다.
    const priceOnLine = (
      base: { p1: DrawingPoint; p2: DrawingPoint },
      logical: number,
    ): number => {
      const { p1, p2 } = base;
      if (p2.logical === p1.logical) return p1.price;
      const t = (logical - p1.logical) / (p2.logical - p1.logical);
      return p1.price + t * (p2.price - p1.price);
    };
    const pointsFar = (a: DrawingPoint, b: DrawingPoint): boolean => {
      const plugin = drawingsPluginRef.current;
      const c1 = plugin?.toCoordinate(a);
      const c2 = plugin?.toCoordinate(b);
      if (!c1 || !c2) return false;
      return Math.hypot(c2.x - c1.x, c2.y - c1.y) >= 4;
    };

    // 점 하나를 픽셀 델타(dx,dy)만큼 옮긴 새 logical/price를 구한다 (전체 도형 이동에 사용).
    // 변환 실패(차트 밖으로 나가는 등) 시 원래 점을 그대로 반환한다.
    const movePointByPixels = (
      p: DrawingPoint,
      dx: number,
      dy: number,
    ): DrawingPoint => {
      const chartApi = chartRef.current;
      const series = candleSeriesRef.current;
      const plugin = drawingsPluginRef.current;
      if (!chartApi || !series || !plugin) return p;
      const c = plugin.toCoordinate(p);
      if (!c) return p;
      const logical = xToLogicalPrecise(c.x + dx);
      const price = series.coordinateToPrice(c.y + dy);
      if (logical === null || price === null) return p;
      return { logical, price };
    };

    // 선택된 도형 전체를 픽셀 델타만큼 이동한 patch를 만든다
    const buildMovePatch = (
      d: Drawing,
      dx: number,
      dy: number,
    ): Partial<Drawing> => {
      if (d.type === "hline") {
        const y = drawingsPluginRef.current?.priceToCoordinate(d.price);
        const price =
          y !== undefined && y !== null
            ? candleSeriesRef.current?.coordinateToPrice(y + dy)
            : null;
        return price !== null && price !== undefined ? { price } : {};
      }
      if (d.type === "trendline")
        return {
          p1: movePointByPixels(d.p1, dx, dy),
          p2: movePointByPixels(d.p2, dx, dy),
        };
      if (d.type === "channel")
        return {
          p1: movePointByPixels(d.p1, dx, dy),
          p2: movePointByPixels(d.p2, dx, dy),
        };
      if (d.type === "polyline" || d.type === "brush" || d.type === "pattern")
        return { points: d.points.map((p) => movePointByPixels(p, dx, dy)) };
      if (d.type === "text" || d.type === "emoji")
        return { point: movePointByPixels(d.point, dx, dy) };
      return {};
    };

    // 선택된 도형의 핸들 하나(index)를 새 점으로 옮긴 patch를 만든다
    const buildResizePatch = (
      d: Drawing,
      index: number,
      newPoint: DrawingPoint,
    ): Partial<Drawing> => {
      if (d.type === "trendline")
        return index === 0 ? { p1: newPoint } : { p2: newPoint };
      if (d.type === "channel") {
        if (index === 0) return { p1: newPoint };
        if (index === 1) return { p2: newPoint };
        // 세 번째 핸들(평행선 쪽)은 시간은 고정하고 오프셋 가격만 바꾼다
        return { offsetPrice: newPoint.price - d.p2.price };
      }
      if (d.type === "polyline" || d.type === "brush" || d.type === "pattern") {
        const points = [...d.points];
        points[index] = newPoint;
        return { points };
      }
      if (d.type === "text" || d.type === "emoji") return { point: newPoint };
      return {};
    };

    let dragStart: DrawingPoint | null = null;
    let cursorDownPos: { x: number; y: number } | null = null;
    let brushPoints: DrawingPoint[] = [];
    let channelBase: { p1: DrawingPoint; p2: DrawingPoint } | null = null;
    let polylinePoints: DrawingPoint[] = [];
    let patternPoints: DrawingPoint[] = [];
    let measureStart: DrawingPoint | null = null;
    // 지우개 드래그 중인지 + 히스토리 트랜잭션이 열렸는지. 드래그 한 번(누르고
    // 슥슥 문지르다 떼기)을 undo 한 번으로 묶되, 허공만 문지른 경우엔 undo 항목을
    // 만들지 않도록 "첫 실제 삭제" 시점에 트랜잭션을 연다.
    let erasing = false;
    let eraseTxnOpen = false;
    const ERASER_RADIUS = 14;
    const isEraserTool = (t: ToolId) => t === "eraser" || t === "eraserStroke";
    const eraseAtPixel = (px: number, py: number): boolean => {
      const plugin = drawingsPluginRef.current;
      if (!plugin) return false;
      const mode =
        activeToolRef.current === "eraserStroke" ? "stroke" : "partial";
      const changed = plugin.eraseAt(px, py, ERASER_RADIUS, mode);
      if (changed) {
        setHasDrawings(plugin.drawings.length > 0);
        if (!eraseTxnOpen) {
          // 첫 삭제는 방금 eraseAt이 스냅샷을 남겼으므로 그게 undo 지점.
          // 이후 드래그 중의 삭제는 히스토리에서 제외한다.
          plugin.suspendHistory();
          eraseTxnOpen = true;
        }
      }
      return changed;
    };
    // 선택된 드로잉의 편집(이동/리사이즈/텍스트·이모지 변형) 드래그 상태
    let dragMode: "move" | "resize" | "contentResize" | "contentRotate" | null =
      null;
    let dragOriginal: Drawing | null = null;
    let dragPointIndex: number | null = null;
    let dragOriginPixel: { x: number; y: number } | null = null;
    let contentTransformToggledAt = 0;
    // Ctrl/Cmd+C, +V로 선택한 드로잉을 복사·붙여넣기하기 위한 클립보드
    let drawingClipboard: Drawing | null = null;

    // 드로잉을 드래그(이동/리사이즈)하는 동안에는 차트 자체의 패닝
    // (handleScroll.pressedMouseMove)을 꺼서, 도형을 옮기는 동시에 차트가 같이
    // 스크롤되는 문제(문제 3)를 막는다. 드래그가 끝나면 현재 도구에 맞는 옵션으로 복원한다.
    const setChartPanEnabled = (enabled: boolean) => {
      chart.applyOptions({
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: enabled,
          horzTouchDrag: enabled,
          vertTouchDrag: enabled,
        },
      });
    };
    // 드래그(이동/리사이즈/회전) 한 번은 pointermove마다 updateDrawing을 여러 번
    // 부르지만, undo 한 번으로 드래그 전체를 되돌릴 수 있어야 하므로 드래그
    // 시작~끝을 하나의 히스토리 트랜잭션으로 묶는다.
    const beginDrawingDrag = () => {
      setChartPanEnabled(false);
      drawingsPluginRef.current?.beginHistoryTransaction();
    };
    const endDrawingDrag = () => {
      setChartPanEnabled(activeToolRef.current === "cursor");
      drawingsPluginRef.current?.endHistoryTransaction();
    };

    const toggleContentTransform = (
      drawing: Extract<Drawing, { type: "emoji" | "text" }>,
    ) => {
      const plugin = drawingsPluginRef.current;
      if (!plugin) return;
      plugin.setSelected(drawing.id);
      const isOpening = !plugin.isContentTransforming(drawing);
      plugin.setContentTransform(isOpening ? drawing.id : null);
      setSelectedId(drawing.id);
      setSelectedStyle({
        color: drawing.color,
        width: drawing.width,
        locked: drawing.locked,
        contentSize: drawing.size,
        contentType: drawing.type,
        contentFlipped: drawing.flipped,
      });
      setContentTransformId(isOpening ? drawing.id : null);
      contentTransformToggledAt = Date.now();
    };

    resetDrawStateRef.current = () => {
      dragStart = null;
      cursorDownPos = null;
      brushPoints = [];
      channelBase = null;
      polylinePoints = [];
      patternPoints = [];
      measureStart = null;
      if (eraseTxnOpen) {
        drawingsPluginRef.current?.endHistoryTransaction();
        eraseTxnOpen = false;
      }
      erasing = false;
      drawingsPluginRef.current?.setEraserCursor(null);
      if (dragMode) endDrawingDrag();
      dragMode = null;
      dragOriginal = null;
      dragPointIndex = null;
      dragOriginPixel = null;
      drawingsPluginRef.current?.setDraft(null);
      updateMeasureBox(null);
      setSelectedId(null);
      setSelectedStyle(null);
      setContentTransformId(null);
    };

    const onDrawPointerDown = (e: PointerEvent) => {
      const tool = activeToolRef.current;
      const rect = container.getBoundingClientRect();
      if (tool === "cursor") {
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        cursorDownPos = { x: clickX, y: clickY };

        const plugin = drawingsPluginRef.current;
        if (plugin && !lockedRef.current) {
          const selected = plugin.selected;
          // 더블 클릭으로 변형 모드가 열린 텍스트·이모지는 네 모서리로 크기를, 위쪽 핸들로
          // 회전을 조절한다. 본문을 누른 경우에는 아래의 일반 이동 처리로 넘긴다.
          if (
            (selected?.type === "emoji" || selected?.type === "text") &&
            !selected.locked &&
            plugin.isContentTransforming(selected)
          ) {
            const handles = plugin.getContentTransformHandles(selected);
            if (handles) {
              const cornerHit = handles.corners.some(
                (handle) =>
                  Math.hypot(clickX - handle.x, clickY - handle.y) <= 9,
              );
              if (cornerHit) {
                dragMode = "contentResize";
                dragOriginal = selected;
                beginDrawingDrag();
                return;
              }
              if (
                Math.hypot(
                  clickX - handles.rotate.x,
                  clickY - handles.rotate.y,
                ) <= 9
              ) {
                dragMode = "contentRotate";
                dragOriginal = selected;
                beginDrawingDrag();
                return;
              }
            }
          }
          // 이미 선택된 도형이 있으면 먼저 그 도형의 핸들을 잡았는지 확인 (리사이즈)
          if (
            selected &&
            selected.type !== "emoji" &&
            selected.type !== "text" &&
            !selected.locked
          ) {
            const points = plugin.getControlPoints(selected);
            for (let i = 0; i < points.length; i++) {
              const c = plugin.toCoordinate(points[i]);
              if (c && Math.hypot(clickX - c.x, clickY - c.y) <= 8) {
                dragMode = "resize";
                dragOriginal = selected;
                dragPointIndex = i;
                beginDrawingDrag();
                return;
              }
            }
          }
          // 핸들이 아니면 클릭 지점 아래 도형을 찾아 곧바로 선택 + 이동을 시작한다.
          // 기존엔 먼저 클릭해 선택한 뒤에만 드래그가 가능했는데(문제 2), 선택 여부와
          // 무관하게 항상 히트테스트를 해서 "잡자마자 바로 드래그"가 되도록 한다.
          const hit = plugin.findDrawingNear(clickX, clickY, 8);
          if (hit && !hit.locked) {
            if (selected?.id !== hit.id) {
              plugin.setSelected(hit.id);
              setContentTransformId(null);
              setSelectedId(hit.id);
              setSelectedStyle({
                color: hit.color,
                width: hit.width,
                locked: hit.locked,
                contentSize:
                  hit.type === "emoji" || hit.type === "text"
                    ? hit.size
                    : undefined,
                contentType:
                  hit.type === "emoji" || hit.type === "text"
                    ? hit.type
                    : undefined,
                contentFlipped:
                  hit.type === "emoji" || hit.type === "text"
                    ? hit.flipped
                    : undefined,
              });
            }
            dragMode = "move";
            dragOriginal = hit;
            dragOriginPixel = { x: clickX, y: clickY };
            beginDrawingDrag();
            return;
          }
        }
        return;
      }
      // 추세선/채널 기준선은 눌러서 드래그하는 대신 바이낸스처럼 클릭-클릭 방식으로
      // 그린다(문제 1). 첫 클릭에서 점을 찍는 것은 pointerup에서 처리하므로
      // (커서 도구의 클릭 판정과 동일하게) pointerdown에서는 아무것도 하지 않는다.
      if (tool === "brush") {
        const p = rawTimePrice(e.clientX, e.clientY);
        if (p) {
          dragStart = p;
          brushPoints = [p];
        }
        return;
      }
      if (isEraserTool(tool)) {
        const plugin = drawingsPluginRef.current;
        if (!plugin) return;
        erasing = true;
        const ex = e.clientX - rect.left;
        const ey = e.clientY - rect.top;
        plugin.setEraserCursor({ x: ex, y: ey, r: ERASER_RADIUS });
        eraseAtPixel(ex, ey);
        return;
      }
      if (tool === "measure") {
        const p = toTimePrice(e.clientX, e.clientY);
        if (p) measureStart = p;
        return;
      }
    };

    const onDrawPointerMove = (e: PointerEvent) => {
      const tool = activeToolRef.current;
      const plugin = drawingsPluginRef.current;
      if (!plugin) return;

      if (tool === "cursor" && dragMode && dragOriginal) {
        const rect = container.getBoundingClientRect();
        const curX = e.clientX - rect.left;
        const curY = e.clientY - rect.top;
        if (
          dragMode === "contentResize" &&
          (dragOriginal.type === "emoji" || dragOriginal.type === "text")
        ) {
          const handles = plugin.getContentTransformHandles(dragOriginal);
          if (handles) {
            const startDistance = Math.hypot(
              handles.corners[0].x - handles.center.x,
              handles.corners[0].y - handles.center.y,
            );
            const currentDistance = Math.hypot(
              curX - handles.center.x,
              curY - handles.center.y,
            );
            const size = Math.round(
              Math.max(
                12,
                Math.min(
                  120,
                  dragOriginal.size * (currentDistance / startDistance),
                ),
              ),
            );
            plugin.updateDrawing(dragOriginal.id, { size });
          }
        } else if (
          dragMode === "contentRotate" &&
          (dragOriginal.type === "emoji" || dragOriginal.type === "text")
        ) {
          const center = plugin.toCoordinate(dragOriginal.point);
          if (center) {
            const angle =
              ((Math.atan2(curY - center.y, curX - center.x) * 180) / Math.PI +
                450) %
              360;
            plugin.updateDrawing(dragOriginal.id, { angle });
          }
        } else if (dragMode === "resize" && dragPointIndex !== null) {
          const newPoint = toTimePrice(e.clientX, e.clientY);
          if (newPoint)
            plugin.updateDrawing(
              dragOriginal.id,
              buildResizePatch(dragOriginal, dragPointIndex, newPoint),
            );
        } else if (dragMode === "move" && dragOriginPixel) {
          const dx = curX - dragOriginPixel.x;
          const dy = curY - dragOriginPixel.y;
          plugin.updateDrawing(
            dragOriginal.id,
            buildMovePatch(dragOriginal, dx, dy),
          );
        }
        return;
      }

      if (tool === "trendline" && dragStart) {
        const p = toTimePrice(e.clientX, e.clientY);
        if (p) plugin.setDraft({ type: "trendline", p1: dragStart, p2: p });
        return;
      }
      if (tool === "channel") {
        if (dragStart && !channelBase) {
          const p = toTimePrice(e.clientX, e.clientY);
          if (p)
            plugin.setDraft({
              type: "channel",
              p1: dragStart,
              p2: p,
              offsetPrice: 0,
            });
          return;
        }
        if (channelBase) {
          const p = toTimePrice(e.clientX, e.clientY);
          if (p) {
            const offsetPrice = p.price - priceOnLine(channelBase, p.logical);
            plugin.setDraft({
              type: "channel",
              p1: channelBase.p1,
              p2: channelBase.p2,
              offsetPrice,
            });
          }
          return;
        }
        return;
      }
      if (isEraserTool(tool)) {
        const rect = container.getBoundingClientRect();
        const ex = e.clientX - rect.left;
        const ey = e.clientY - rect.top;
        plugin.setEraserCursor({ x: ex, y: ey, r: ERASER_RADIUS });
        if (erasing) {
          // 마우스가 빨리 움직여도 지나온 경로를 다 지우도록 coalesced 이벤트를 훑는다
          const events =
            typeof e.getCoalescedEvents === "function"
              ? e.getCoalescedEvents()
              : [];
          for (const ev of events.length ? events : [e]) {
            eraseAtPixel(ev.clientX - rect.left, ev.clientY - rect.top);
          }
        }
        return;
      }
      if (tool === "brush" && dragStart) {
        // 커서가 빨리 움직일 때 계단처럼 끊기지 않도록 coalesced 이벤트까지 점으로 받는다
        const events =
          typeof e.getCoalescedEvents === "function"
            ? e.getCoalescedEvents()
            : [e];
        let appended = false;
        for (const ev of events.length ? events : [e]) {
          const p = rawTimePrice(ev.clientX, ev.clientY);
          if (!p) continue;
          const last = brushPoints[brushPoints.length - 1];
          const lastCoord = plugin.toCoordinate(last);
          const curCoord = plugin.toCoordinate(p);
          if (!lastCoord || !curCoord) {
            brushPoints = [...brushPoints, p];
            appended = true;
            continue;
          }
          const dist = Math.hypot(
            curCoord.x - lastCoord.x,
            curCoord.y - lastCoord.y,
          );
          if (dist < 2) continue;
          // 샘플이 뜸하게 들어와 점 사이가 멀면(마우스) 중간 점을 채워 스플라인이
          // 흐르듯 이어지게 한다 — 약 6px 간격으로 보간.
          const steps = Math.min(8, Math.floor(dist / 6));
          for (let s = 1; s <= steps; s++) {
            const t = s / (steps + 1);
            brushPoints = [
              ...brushPoints,
              {
                logical: last.logical + (p.logical - last.logical) * t,
                price: last.price + (p.price - last.price) * t,
              },
            ];
          }
          brushPoints = [...brushPoints, p];
          appended = true;
        }
        if (appended) plugin.setDraft({ type: "brush", points: brushPoints });
        return;
      }
      if (tool === "polyline" && polylinePoints.length > 0) {
        const p = toTimePrice(e.clientX, e.clientY);
        if (p)
          plugin.setDraft({ type: "polyline", points: [...polylinePoints, p] });
        return;
      }
      if (tool === "pattern" && patternPoints.length > 0) {
        const p = toTimePrice(e.clientX, e.clientY);
        if (p)
          plugin.setDraft({ type: "pattern", points: [...patternPoints, p] });
        return;
      }
      if (tool === "measure" && measureStart) {
        const p = toTimePrice(e.clientX, e.clientY);
        if (p) {
          const rect = container.getBoundingClientRect();
          const curX = e.clientX - rect.left;
          const curY = e.clientY - rect.top;
          // logical index는 이미 저장돼 있으므로(measureStart.logical) 좌표 변환 없이
          // 바로 뺄셈으로 봉 개수를 구한다.
          const bars = Math.round(p.logical - measureStart.logical);
          const priceDiff = p.price - measureStart.price;
          const pricePct =
            measureStart.price !== 0
              ? (priceDiff / measureStart.price) * 100
              : 0;
          updateMeasureBox({ x: curX, y: curY, bars, priceDiff, pricePct });
        }
        return;
      }
    };

    const onDrawPointerUp = (e: PointerEvent) => {
      const tool = activeToolRef.current;
      const plugin = drawingsPluginRef.current;
      if (!plugin) return;
      const rect = container.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      if (tool === "cursor") {
        if (dragMode) {
          const clickDistance = cursorDownPos
            ? Math.hypot(clickX - cursorDownPos.x, clickY - cursorDownPos.y)
            : Infinity;
          if (
            e.detail >= 2 &&
            clickDistance < 4 &&
            dragMode === "move" &&
            dragOriginal &&
            (dragOriginal.type === "emoji" || dragOriginal.type === "text")
          ) {
            toggleContentTransform(dragOriginal);
          }
          const updated = plugin.selected;
          if (updated) {
            setSelectedStyle({
              color: updated.color,
              width: updated.width,
              locked: updated.locked,
              contentSize:
                updated.type === "emoji" || updated.type === "text"
                  ? updated.size
                  : undefined,
              contentType:
                updated.type === "emoji" || updated.type === "text"
                  ? updated.type
                  : undefined,
              contentFlipped:
                updated.type === "emoji" || updated.type === "text"
                  ? updated.flipped
                  : undefined,
            });
          }
          dragMode = null;
          dragOriginal = null;
          dragPointIndex = null;
          dragOriginPixel = null;
          cursorDownPos = null;
          endDrawingDrag();
          return;
        }
        if (!cursorDownPos) return;
        const dist = Math.hypot(
          clickX - cursorDownPos.x,
          clickY - cursorDownPos.y,
        );
        cursorDownPos = null;
        if (dist < 4) {
          const hit = plugin.findDrawingNear(clickX, clickY);
          setSelectedId(hit ? hit.id : null);
          setContentTransformId(null);
          setSelectedStyle(
            hit
              ? {
                  color: hit.color,
                  width: hit.width,
                  locked: hit.locked,
                  contentSize:
                    hit.type === "emoji" || hit.type === "text"
                      ? hit.size
                      : undefined,
                  contentType:
                    hit.type === "emoji" || hit.type === "text"
                      ? hit.type
                      : undefined,
                  contentFlipped:
                    hit.type === "emoji" || hit.type === "text"
                      ? hit.flipped
                      : undefined,
                }
              : null,
          );
        }
        return;
      }

      if (tool === "trendline") {
        // 바이낸스처럼 클릭-클릭 방식(문제 1): 첫 클릭으로 시작점만 찍고, 두 번째
        // 클릭에서 끝점을 확정한다. 드래그(누른 채 이동)는 필요 없다 — 클릭 사이의
        // pointermove 미리보기는 위 onDrawPointerMove가 dragStart만 보고 그린다.
        if (!dragStart) {
          dragStart = toTimePrice(e.clientX, e.clientY);
          return;
        }
        const start = dragStart;
        const end = toTimePrice(e.clientX, e.clientY);
        if (end && pointsFar(start, end)) {
          plugin.addDrawing({
            ...newDrawingStyle(),
            id: Date.now(),
            type: "trendline",
            p1: start,
            p2: end,
          });
          setHasDrawings(true);
          dragStart = null;
          plugin.setDraft(null);
          setActiveTool("cursor");
        }
        // 너무 가까운 곳을 다시 클릭한 경우(사실상 같은 지점)는 아직 두 번째 점을
        // 찍지 않은 것으로 보고 첫 점을 유지한 채 다음 클릭을 기다린다.
        return;
      }

      if (tool === "hline") {
        const price = candleSeriesRef.current?.coordinateToPrice(clickY);
        if (price !== null && price !== undefined) {
          plugin.addDrawing({
            ...newDrawingStyle(),
            id: Date.now(),
            type: "hline",
            price,
          });
          setHasDrawings(true);
        }
        setActiveTool("cursor");
        return;
      }

      if (tool === "polyline") {
        // 더블클릭 종료는 별도 dblclick 리스너(onDrawDoubleClick)에서 처리한다.
        // PointerEvent.detail은 브라우저마다 더블클릭 카운트를 신뢰성 있게 반영하지
        // 않아(네이티브 dblclick과 달리) 여기서 클릭 횟수로 종료를 판단하지 않는다.
        const p = toTimePrice(e.clientX, e.clientY);
        if (!p) return;
        polylinePoints = [...polylinePoints, p];
        plugin.setDraft({ type: "polyline", points: polylinePoints });
        return;
      }

      if (tool === "pattern") {
        const p = toTimePrice(e.clientX, e.clientY);
        if (!p) return;
        patternPoints = [...patternPoints, p];
        plugin.setDraft({ type: "pattern", points: patternPoints });
        if (patternPoints.length >= 3) {
          plugin.addDrawing({
            ...newDrawingStyle(),
            id: Date.now(),
            type: "pattern",
            points: patternPoints,
          });
          setHasDrawings(true);
          patternPoints = [];
          plugin.setDraft(null);
          setActiveTool("cursor");
        }
        return;
      }

      if (tool === "channel") {
        // 클릭-클릭 3단계(문제 1): ① 기준선 시작점 ② 기준선 끝점(평행선 미리보기 시작)
        // ③ 평행 이동 거리 확정. 폴리라인/패턴과 같은 느낌으로 드래그 없이 클릭만으로 그린다.
        if (!dragStart && !channelBase) {
          dragStart = toTimePrice(e.clientX, e.clientY);
          return;
        }
        if (dragStart && !channelBase) {
          const p1 = dragStart;
          const p2 = toTimePrice(e.clientX, e.clientY);
          if (p2 && pointsFar(p1, p2)) {
            channelBase = { p1, p2 };
            plugin.setDraft({
              type: "channel",
              p1: channelBase.p1,
              p2: channelBase.p2,
              offsetPrice: 0,
            });
          }
          // 너무 가까운 지점이면 아직 기준선을 확정하지 않고 첫 점을 유지한다
          return;
        }
        if (channelBase) {
          const p = toTimePrice(e.clientX, e.clientY);
          if (p) {
            const offsetPrice = p.price - priceOnLine(channelBase, p.logical);
            plugin.addDrawing({
              ...newDrawingStyle(),
              id: Date.now(),
              type: "channel",
              p1: channelBase.p1,
              p2: channelBase.p2,
              offsetPrice,
            });
            setHasDrawings(true);
          }
          channelBase = null;
          dragStart = null;
          plugin.setDraft(null);
          setActiveTool("cursor");
        }
        return;
      }

      if (isEraserTool(tool)) {
        erasing = false;
        if (eraseTxnOpen) {
          plugin.endHistoryTransaction();
          eraseTxnOpen = false;
        }
        // 커서(원)는 계속 hover 표시로 남겨둔다 — 도구를 바꿀 때 reset에서 지운다
        return;
      }

      if (tool === "brush") {
        if (!dragStart) return;
        dragStart = null;
        if (brushPoints.length >= 2) {
          plugin.addDrawing({
            ...newDrawingStyle(),
            id: Date.now(),
            type: "brush",
            points: brushPoints,
          });
          setHasDrawings(true);
        }
        brushPoints = [];
        plugin.setDraft(null);
        // 색연필처럼 계속 그릴 수 있도록 브러시 도구를 유지한다 (커서로 안 바꿈)
        return;
      }

      if (tool === "text") {
        if (textInputAtRef.current) return;
        const p = toTimePrice(e.clientX, e.clientY);
        if (p) setTextInputAt({ point: p, x: clickX, y: clickY });
        return;
      }

      if (tool === "emoji") {
        if (emojiPickerAtRef.current) return;
        const p = toTimePrice(e.clientX, e.clientY);
        if (p) setEmojiPickerAt({ point: p, x: clickX, y: clickY });
        return;
      }

      if (tool === "measure") {
        measureStart = null;
        updateMeasureBox(null);
        return;
      }

      if (tool === "zoom") {
        const chartApi = chartRef.current;
        if (!chartApi) return;
        const ts = chartApi.timeScale();
        const range = ts.getVisibleLogicalRange();
        const logical = ts.coordinateToLogical(clickX);
        if (!range || logical === null) return;
        const factor = e.shiftKey ? 1 / 0.7 : 0.7;
        ts.setVisibleLogicalRange({
          from: logical - (logical - range.from) * factor,
          to: logical + (range.to - logical) * factor,
        });
        return;
      }
    };

    // 커서 모드에서 텍스트·이모지를 더블 클릭하면 변형 핸들을 토글한다. 폴리라인은 기존처럼
    // 더블 클릭으로 종료하며, 둘은 활성 도구가 달라 충돌하지 않는다.
    const onDrawDoubleClick = (e: MouseEvent) => {
      const tool = activeToolRef.current;
      const plugin = drawingsPluginRef.current;
      if (!plugin) return;
      if (tool === "cursor") {
        if (Date.now() - contentTransformToggledAt < 500) return;
        const rect = container.getBoundingClientRect();
        const hit = plugin.findDrawingNear(
          e.clientX - rect.left,
          e.clientY - rect.top,
        );
        if (
          !hit ||
          (hit.type !== "emoji" && hit.type !== "text") ||
          hit.locked ||
          lockedRef.current
        )
          return;
        e.preventDefault();
        toggleContentTransform(hit);
        return;
      }
      if (tool !== "polyline") return;
      e.preventDefault();
      const pts =
        polylinePoints.length >= 2
          ? polylinePoints.slice(0, -1)
          : polylinePoints;
      if (pts.length >= 2) {
        plugin.addDrawing({
          ...newDrawingStyle(),
          id: Date.now(),
          type: "polyline",
          points: pts,
        });
        setHasDrawings(true);
      }
      polylinePoints = [];
      plugin.setDraft(null);
      setActiveTool("cursor");
    };

    // 지우개 원 커서는 차트 밖으로 나가면 지운다 (드래그 중이면 트랜잭션도 정리)
    const onDrawPointerLeave = () => {
      if (!isEraserTool(activeToolRef.current)) return;
      erasing = false;
      if (eraseTxnOpen) {
        drawingsPluginRef.current?.endHistoryTransaction();
        eraseTxnOpen = false;
      }
      drawingsPluginRef.current?.setEraserCursor(null);
    };

    container.addEventListener("pointerdown", onDrawPointerDown);
    container.addEventListener("pointermove", onDrawPointerMove);
    container.addEventListener("pointerup", onDrawPointerUp);
    // 터치 취소/포인터 캡처 유실 등으로 pointerup 없이 드래그가 끊기는 경우에도
    // dragMode를 정리하고 차트 패닝을 복원해야 하므로(문제 3) pointerup과 동일하게 처리한다.
    container.addEventListener("pointercancel", onDrawPointerUp);
    container.addEventListener("pointerleave", onDrawPointerLeave);
    container.addEventListener("dblclick", onDrawDoubleClick);

    // 되돌리기/다시 실행 이후 선택 상태를 primitive와 다시 맞춘다. undo/redo로
    // 선택된 도형 자체가 사라지거나 나타날 수 있어 매번 plugin.selected를 다시 읽는다.
    const syncSelectionAfterHistoryChange = () => {
      const plugin = drawingsPluginRef.current;
      const updated = plugin?.selected ?? null;
      if (updated) {
        setSelectedId(updated.id);
        setSelectedStyle({
          color: updated.color,
          width: updated.width,
          locked: updated.locked,
          contentSize:
            updated.type === "emoji" || updated.type === "text"
              ? updated.size
              : undefined,
          contentType:
            updated.type === "emoji" || updated.type === "text"
              ? updated.type
              : undefined,
          contentFlipped:
            updated.type === "emoji" || updated.type === "text"
              ? updated.flipped
              : undefined,
        });
        setContentTransformId(
          plugin?.isContentTransforming(updated) ? updated.id : null,
        );
      } else {
        setSelectedId(null);
        setSelectedStyle(null);
        setContentTransformId(null);
      }
      setHasDrawings((plugin?.drawings.length ?? 0) > 0);
    };

    // 선택된 드로잉을 Ctrl/Cmd+C로 복사, Ctrl/Cmd+V로 (살짝 오프셋을 줘서) 붙여넣고,
    // Ctrl/Cmd+Z로 되돌리기, Ctrl/Cmd+Shift+Z(또는 Ctrl/Cmd+Y)로 다시 실행하고,
    // Ctrl/Cmd+S로 현재 드로잉을 저장한다(브라우저 기본 "페이지 저장"은 막는다).
    // 텍스트 입력창처럼 실제 입력 요소에 포커스가 있을 때는 브라우저 기본 복사/붙여넣기/
    // 되돌리기가 그대로 동작해야 하므로 건드리지 않는다.
    const PASTE_OFFSET_PX = 24;
    const onDrawKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (
        key !== "c" &&
        key !== "v" &&
        key !== "z" &&
        key !== "y" &&
        key !== "s"
      )
        return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;

      if (key === "s") {
        e.preventDefault();
        saveDrawingsRef.current();
        return;
      }

      const plugin = drawingsPluginRef.current;
      if (!plugin) return;

      if (key === "z" || key === "y") {
        e.preventDefault();
        const isRedo = key === "y" || (key === "z" && e.shiftKey);
        const changed = isRedo ? plugin.redo() : plugin.undo();
        if (changed) syncSelectionAfterHistoryChange();
        return;
      }

      if (key === "c") {
        const id = selectedIdRef.current;
        const drawing =
          id !== null ? plugin.drawings.find((d) => d.id === id) : null;
        if (drawing) drawingClipboard = { ...drawing };
        return;
      }

      if (!drawingClipboard) return;
      e.preventDefault();
      const moved = buildMovePatch(
        drawingClipboard,
        PASTE_OFFSET_PX,
        PASTE_OFFSET_PX,
      );
      const pasted = {
        ...drawingClipboard,
        ...moved,
        id: Date.now(),
      } as Drawing;
      plugin.addDrawing(pasted);
      setHasDrawings(true);
      setSelectedId(pasted.id);
      setSelectedStyle({
        color: pasted.color,
        width: pasted.width,
        locked: pasted.locked,
        contentSize:
          pasted.type === "emoji" || pasted.type === "text"
            ? pasted.size
            : undefined,
        contentType:
          pasted.type === "emoji" || pasted.type === "text"
            ? pasted.type
            : undefined,
        contentFlipped:
          pasted.type === "emoji" || pasted.type === "text"
            ? pasted.flipped
            : undefined,
      });
      // 클립보드를 방금 붙여넣은 도형으로 갱신해두면, 연속으로 Ctrl+V를 눌렀을 때
      // 계속 같은 자리에 겹치지 않고 대각선으로 어긋나며 붙는다(피그마 등과 동일한 관례).
      drawingClipboard = pasted;
    };
    document.addEventListener("keydown", onDrawKeyDown);

    return () => {
      cancelAnimationFrame(minMaxRafId);
      resizeObserver.disconnect();
      container.removeEventListener("pointerdown", onDrawPointerDown);
      container.removeEventListener("pointermove", onDrawPointerMove);
      container.removeEventListener("pointerup", onDrawPointerUp);
      container.removeEventListener("pointercancel", onDrawPointerUp);
      container.removeEventListener("pointerleave", onDrawPointerLeave);
      container.removeEventListener("dblclick", onDrawDoubleClick);
      document.removeEventListener("keydown", onDrawKeyDown);
      candleSeries.detachPrimitive(drawingsPlugin);
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  // 평단가 선: 옵션이 켜져 있고 보유 중인 종목(avgPrice 존재)이면 가격선을 그리고,
  // 아니면 지워둔다. 종목 전환으로 avgPrice가 바뀌면 선 위치만 갱신한다.
  // 가격 값은 오른쪽 가격축 라벨 박스(axisLabelVisible)로, "매입가" 태그는 왼쪽에 별도로 띄운다.
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    if (!showAvgPrice || !avgPrice || avgPrice <= 0) {
      if (avgPriceLineRef.current) {
        series.removePriceLine(avgPriceLineRef.current);
        avgPriceLineRef.current = null;
      }
      return;
    }

    if (avgPriceLineRef.current) {
      avgPriceLineRef.current.applyOptions({ price: avgPrice });
    } else {
      avgPriceLineRef.current = series.createPriceLine({
        price: avgPrice,
        color: "#6b7280",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        axisLabelColor: "#6b7280",
        axisLabelTextColor: "#ffffff",
      });
    }
  }, [showAvgPrice, avgPrice]);

  // 데이터 로딩 + 소켓 (stockId, chartType 변경 시 재실행)
  useEffect(() => {
    if (stockId === null) return;
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const maSeries = maSeriesRef.current;
    if (!candleSeries || !volumeSeries || maSeries.length === 0) return;

    setChartLoading(true);

    // 분봉/시간봉은 시간 표시
    chartRef.current?.applyOptions({
      timeScale: { timeVisible: chartType !== "1d" },
    });

    // 시간대만 바뀐 경우: 아직 옛 봉 데이터(sortedRef)가 살아있는 지금 in-memory
    // 드로잉을 절대 시각으로 굳혀 저장해둔다. 종목이 바뀐 경우엔 in-memory 드로잉이
    // 이전 종목 것이므로 저장하지 않는다(새 종목 키를 오염시키면 안 됨).
    if (prevDataKeyRef.current.stockId === stockId) {
      persistDrawings(stockId);
    }
    prevDataKeyRef.current = { stockId, chartType };

    candleMapRef.current.clear();
    sortedRef.current = [];
    nextCursorRef.current = null;
    loadingMoreRef.current = false;
    stickToLiveRef.current = true;
    // 봉(시간대)이 바뀌면 메모리상 드로잉의 logical 인덱스는 옛 봉 기준이라 엉뚱한
    // 곳을 가리킨다. 저장본을 다시 pending으로 올려두고, 새 봉 데이터가 로드된 뒤
    // resolvePendingDrawings가 절대 시각 기준으로 다시 앉힌다.
    loadSavedDrawings(stockId);

    // 전체 데이터를 정렬 후 모든 시리즈에 setData
    // scrollToLatest: 과거 데이터 추가 로드(무한 스크롤) 시에는 false로 호출해 스크롤 위치 유지
    const applyAllData = (scrollToLatest = true) => {
      const sorted = Array.from(candleMapRef.current.values()).sort((a, b) => {
        if (
          typeof a.chartTime === "number" &&
          typeof b.chartTime === "number"
        ) {
          return a.chartTime - b.chartTime;
        }
        return String(a.chartTime).localeCompare(String(b.chartTime));
      });
      sortedRef.current = sorted;
      // rAF 루프/크로스헤어 핸들러가 O(n) findIndex 대신 O(1)로 인덱스를 찾을 수 있도록
      // chartTime → 배열 인덱스 Map을 함께 갱신한다 (문제 6).
      const indexMap = new Map<string, number>();
      sorted.forEach((c, i) => indexMap.set(String(c.chartTime), i));
      chartTimeIndexRef.current = indexMap;

      const closes = sorted.map((c) => c.close);
      const maArrays = MA_CONFIGS.map((ma) => computeMA(closes, ma.period));

      candleSeries.setData(
        sorted.map((c) => ({
          time: c.chartTime as never,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })),
      );
      volumeSeries.setData(
        sorted.map((c) => ({
          time: c.chartTime as never,
          value: c.volume,
          color:
            c.close >= c.open ? "rgba(246,70,93,0.5)" : "rgba(37,99,235,0.5)",
        })),
      );
      maArrays.forEach((arr, i) => {
        maSeries[i].setData(
          sorted
            .map((c, j) =>
              arr[j] !== null
                ? { time: c.chartTime as never, value: arr[j]! }
                : null,
            )
            .filter((d): d is NonNullable<typeof d> => d !== null),
        );
      });

      if (scrollToLatest) {
        chartRef.current?.timeScale().scrollToRealTime();
      }
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
        resolvePendingDrawings();
        return;
      }

      // 기존 봉 업데이트: sortedRef에서 해당 항목 찾아 교체
      const existingIdx = sortedRef.current.findIndex(
        (c) => c.candleTime === item.candleTime,
      );
      if (existingIdx >= 0) sortedRef.current[existingIdx] = parsed;

      const sorted = sortedRef.current;
      const closes = sorted.map((c) => c.close);
      const idx = existingIdx >= 0 ? existingIdx : sorted.length - 1;

      try {
        candleSeries.update({
          time: parsed.chartTime as never,
          open: parsed.open,
          high: parsed.high,
          low: parsed.low,
          close: parsed.close,
        });
        volumeSeries.update({
          time: parsed.chartTime as never,
          value: parsed.volume,
          color:
            parsed.close >= parsed.open
              ? "rgba(246,70,93,0.5)"
              : "rgba(37,99,235,0.5)",
        });
        MA_CONFIGS.forEach((ma, i) => {
          if (idx >= ma.period - 1) {
            const slice = closes.slice(idx - ma.period + 1, idx + 1);
            maSeries[i].update({
              time: parsed.chartTime as never,
              value: slice.reduce((a, b) => a + b, 0) / ma.period,
            });
          }
        });
      } catch {
        // update 실패 시 안전하게 전체 재빌드
        applyAllData();
        resolvePendingDrawings();
      }
    };

    let active = true;
    let lastCandleTime = "";

    // API 서버 과거 데이터와 realtime 서버의 현재 봉이 모두 도착해야 차트를 보여준다.
    // (둘 중 하나라도 없으면 계속 로딩 — realtime 서버가 죽어 있으면 차트는 뜨지 않는다)
    let apiReady = false;
    let realtimeReady = false;
    const revealIfReady = () => {
      if (active && apiReady && realtimeReady) setChartLoading(false);
    };

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
      // 재연결 등으로 이 이벤트가 늦게 도착했을 때 사용자가 이미 과거/여백 쪽으로
      // 스크롤해뒀다면 그 위치를 존중해야 하므로(문제 5), 무조건 최신으로 스크롤하지
      // 않고 chartUpdated와 동일하게 stickToLiveRef를 따른다.
      socket.on("chartInit", (candles: CandleItem[]) => {
        for (const c of candles) {
          candleMapRef.current.set(c.candleTime, parseCandle(c, chartType));
        }
        applyAllData(stickToLiveRef.current);
        resolvePendingDrawings();
        realtimeReady = true;
        revealIfReady();
      });

      // 3. 실시간 체결 업데이트
      socket.on("chartUpdated", (candle: CandleItem) => {
        realtimeReady = true;
        revealIfReady();
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
          `/stocks/${stockId}/chart?type=${chartType}&cursor=${cursor}`,
        );
        if (!active || !res.success || !res.data) return;

        const prevBarCount = sortedRef.current.length;
        const visibleRange =
          chartRef.current?.timeScale().getVisibleLogicalRange() ?? null;

        for (const c of res.data.candles) {
          candleMapRef.current.set(c.candleTime, parseCandle(c, chartType));
        }
        nextCursorRef.current = res.data.nextCursor;
        applyAllData(false);

        // 과거 봉이 앞쪽에 추가되면서 밀린 만큼 logical range를 보정해 스크롤 위치 유지.
        // 이미 그려둔 드로잉들도 같은 양만큼 logical이 밀려야 원래 봉에 계속 붙어
        // 있으므로(문제 4) 함께 보정한다.
        const addedBars = sortedRef.current.length - prevBarCount;
        if (addedBars > 0) {
          drawingsPluginRef.current?.shiftLogical(addedBars);
          if (visibleRange) {
            chartRef.current?.timeScale().setVisibleLogicalRange({
              from: visibleRange.from + addedBars,
              to: visibleRange.to + addedBars,
            });
          }
        }
        // shiftLogical로 기존 드로잉을 보정한 "다음"에 시도해야 한다 — 방금 이 프리펜드로
        // 새로 로드된 봉을 앵커로 하는 pending 드로잉은 이미 최신 sortedRef 기준의 올바른
        // logical로 계산되므로, 먼저 resolve하면 뒤이은 shiftLogical에 한 번 더 밀려버린다.
        resolvePendingDrawings();
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
      // barsAfter는 "가시 영역의 오른쪽 끝(to) 뒤로 남은 봉 수"다: 0이면 마지막 봉이
      // 딱 화면 끝에 걸쳐 있는(진짜 실시간을 보고 있는) 상태이고, 양수면 과거로
      // 스크롤해 아직 안 보인 최신 봉들이 남아있는 상태, 음수면 사용자가 마지막 봉보다
      // 더 오른쪽으로 스크롤해 빈 여백을 만들어둔 상태다. 예전엔 "<= 0"으로 두 음/양
      // 경우를 모두 "실시간 추적 중"으로 오판해, 여백을 만들어 둔 채로 새 봉이 오면
      // scrollToRealTime이 그 여백을 지우며 뷰가 되돌아갔다(문제 5). 이제는 정확히
      // "여백 없이 마지막 봉에 걸쳐 있을 때"만 실시간을 따라가도록 좁힌다.
      stickToLiveRef.current = barsInfo.barsAfter === 0;
      if (barsInfo.barsBefore < 10) {
        loadMoreHistory();
      }
    };
    chartRef.current
      ?.timeScale()
      .subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);

    const init = async () => {
      candleMapRef.current.clear();
      sortedRef.current = [];
      const res = await apiClient.get<ChartApiResponse>(
        `/stocks/${stockId}/chart?type=${chartType}`,
      );
      if (!active) return;

      if (res.success && res.data) {
        for (const c of res.data.candles) {
          candleMapRef.current.set(c.candleTime, parseCandle(c, chartType));
        }
        lastCandleTime = res.data.lastCandleTime;
        nextCursorRef.current = res.data.nextCursor;
        applyAllData();
        resolvePendingDrawings();
      }
      apiReady = true;
      revealIfReady();

      const token = tokenManager.getToken();
      if (token) connectSocket(token);
    };

    init();

    return () => {
      active = false;
      chartRef.current
        ?.timeScale()
        .unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
      if (socketRef.current) {
        socketRef.current.emit("leaveChartRoom", { stockId, type: chartType });
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [stockId, chartType]);

  return (
    <div
      className={`w-full h-full bg-[#181a20] overflow-hidden p-2 flex gap-1.5 ${
        isFullscreen ? "rounded-none" : "rounded-xl"
      }`}
    >
      {showDrawingToolbar && (
        <DrawingToolbar
          activeTool={activeTool}
          onSelectTool={setActiveTool}
          magnetOn={magnetOn}
          onToggleMagnet={() => setMagnetOn((v) => !v)}
          locked={locked}
          onToggleLocked={() => setLocked((v) => !v)}
          drawingsVisible={drawingsVisible}
          onToggleVisible={() => setDrawingsVisible((v) => !v)}
          onClearAll={() => {
            drawingsPluginRef.current?.clear();
            setHasDrawings(false);
          }}
          hasDrawings={hasDrawings}
          onSave={saveDrawings}
          justSaved={justSaved}
        />
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* 상단 툴바: 시간대 선택 + MA 범례 */}
        <div className="flex items-center gap-1 mb-1 shrink-0">
          {/* 시간대 버튼 + MA 범례만 가로 스크롤 대상으로 묶는다. 설정 버튼/드롭다운은
            이 스크롤 컨테이너 밖에 둬야 드롭다운이 overflow에 잘리지 않는다. */}
          <div className="flex items-center gap-1 min-w-0 overflow-x-auto">
            <div className="flex gap-0.5 shrink-0">
              {CHART_TYPES.map((ct) => (
                <button
                  key={ct.value}
                  onClick={() => setChartType(ct.value)}
                  className={`px-3 py-3.5 lg:px-2 lg:py-0.5 text-xs rounded-md transition-colors whitespace-nowrap ${
                    chartType === ct.value
                      ? "bg-[#2b2f36] text-white"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {ct.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 ml-3 border-l border-[#2b2f36] pl-3 shrink-0">
              {MA_CONFIGS.map((ma) => (
                <span
                  key={ma.period}
                  className="text-[10px] whitespace-nowrap"
                  style={{ color: ma.color }}
                >
                  MA{ma.period}
                </span>
              ))}
            </div>
          </div>

          <div ref={settingsRef} className="relative ml-auto shrink-0">
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              aria-label="차트 설정"
              className={`flex items-center justify-center w-11 h-11 lg:w-6 lg:h-6 rounded-md transition-colors ${
                settingsOpen
                  ? "bg-[#2b2f36] text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 15a3 3 0 100-6 3 3 0 000 6z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"
                />
              </svg>
            </button>

            <div
              className={`absolute top-full right-0 mt-1.5 z-50 grid w-44 transition-[grid-template-rows,opacity] duration-200 ease-out ${
                settingsOpen
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0 pointer-events-none"
              }`}
            >
              <div className="overflow-hidden bg-[#181a20] border border-[#2b2f36] rounded-lg shadow-2xl">
                <div className="relative">
                  {/* 옵션이 많아지면 패널이 길어지므로 최대 높이(rAF에서 남은 높이로
                  갱신, 아래 55vh는 첫 프레임 폴백)를 잡고 넘치면 스크롤한다 */}
                  <div
                    ref={settingsScrollRef}
                    className="max-h-[55vh] overflow-y-auto overscroll-contain p-2"
                  >
                    {/* ── 차트 위 가격 표시 ── */}
                    <div className="px-1.5 pb-0.5 pt-0.5 text-[10px] font-medium text-zinc-500">
                      가격 표시
                    </div>
                    <div
                      onClick={() => setShowMinMax((v) => !v)}
                      className="flex items-center justify-between gap-2 px-1.5 py-1 lg:py-0.5 text-[11px] text-zinc-300 cursor-pointer"
                    >
                      고점/저점 표시
                      <ToggleSwitch checked={showMinMax} />
                    </div>
                    <div
                      onClick={() => setShowAvgPrice((v) => !v)}
                      className="flex items-center justify-between gap-2 px-1.5 py-1 lg:py-0.5 text-[11px] text-zinc-300 cursor-pointer"
                    >
                      매입가 표시
                      <ToggleSwitch checked={showAvgPrice} />
                    </div>
                    <div
                      onClick={() => setShowHlinePrice((v) => !v)}
                      className="flex items-center justify-between gap-2 px-1.5 py-1 lg:py-0.5 text-[11px] text-zinc-300 cursor-pointer"
                    >
                      수평선 가격/등락률 표시
                      <ToggleSwitch checked={showHlinePrice} />
                    </div>

                    <div className="my-1 border-t border-[#2b2f36]" />
                    {/* ── 그리기 도구 ── */}
                    <div className="px-1.5 pb-0.5 pt-0.5 text-[10px] font-medium text-zinc-500">
                      그리기
                    </div>
                    <div
                      onClick={() =>
                        setShowDrawingToolbar((v) => {
                          const next = !v;
                          if (!next) setActiveTool("cursor");
                          return next;
                        })
                      }
                      className="flex items-center justify-between gap-2 px-1.5 py-1 lg:py-0.5 text-[11px] text-zinc-300 cursor-pointer"
                    >
                      그리기 도구 표시
                      <ToggleSwitch checked={showDrawingToolbar} />
                    </div>

                    <div className="my-1 border-t border-[#2b2f36]" />
                    {/* ── 범례(크로스헤어 정보) ── */}
                    <div className="px-1.5 pb-0.5 pt-0.5 text-[10px] font-medium text-zinc-500">
                      범례
                    </div>
                    <div className="flex items-center justify-between gap-2 px-1.5 py-1 lg:py-0.5 text-[11px] text-zinc-300">
                      표시 방향
                      <div className="flex gap-0.5 bg-[#0d0e11] rounded-md p-0.5">
                        <button
                          onClick={() => setLegendLayout("horizontal")}
                          className={`px-2 py-2 lg:px-1.5 lg:py-0.5 rounded text-[10px] transition-colors ${
                            legendLayout === "horizontal"
                              ? "bg-[#2b2f36] text-white"
                              : "text-zinc-500 hover:text-zinc-300"
                          }`}
                        >
                          가로
                        </button>
                        <button
                          onClick={() => setLegendLayout("vertical")}
                          className={`px-2 py-2 lg:px-1.5 lg:py-0.5 rounded text-[10px] transition-colors ${
                            legendLayout === "vertical"
                              ? "bg-[#2b2f36] text-white"
                              : "text-zinc-500 hover:text-zinc-300"
                          }`}
                        >
                          세로
                        </button>
                      </div>
                    </div>
                    {LEGEND_TOGGLES.map(({ key, label }) => (
                      <div
                        key={key}
                        onClick={() =>
                          setLegendOptions((prev) => ({
                            ...prev,
                            [key]: !prev[key],
                          }))
                        }
                        className="flex items-center justify-between gap-2 px-1.5 py-1 lg:py-0.5 text-[11px] text-zinc-300 cursor-pointer"
                      >
                        {label}
                        <ToggleSwitch checked={legendOptions[key]} />
                      </div>
                    ))}
                  </div>
                  <div
                    ref={settingsFadeTopRef}
                    className="pointer-events-none absolute inset-x-0 top-0 h-5 bg-linear-to-b from-[#181a20] to-transparent opacity-0 transition-opacity duration-150"
                  />
                  <div
                    ref={settingsFadeBottomRef}
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-linear-to-t from-[#181a20] to-transparent opacity-0 transition-opacity duration-150"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 차트 영역 */}
        <div className="relative flex-1 min-h-0">
          {/* 선택된 드로잉 편집 팔레트 — 도형을 따라다니면 위로 빠르게 그릴 때
            커서가 바에 걸려 드래그가 끊겼다. 차트 오른쪽 위에 고정된 오버레이로
            띄워 플롯을 밀어내지도, 그리기를 방해하지도 않게 한다. */}
          {selectedId !== null &&
            selectedStyle &&
            (!selectedStyle.contentType ||
              contentTransformId === selectedId) && (
              <div
                ref={paletteRef}
                style={{ right: 63 }}
                className="absolute top-2 z-30 flex max-w-[calc(100%-5rem)] items-center gap-1.5 overflow-x-auto rounded-lg border border-[#2b2f36] bg-[#1e2026] px-2 py-1.5 shadow-lg"
              >
                {selectedStyle.contentType !== "emoji" && (
                  <>
                    {DRAWING_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => {
                          drawingsPluginRef.current?.updateDrawing(selectedId, {
                            color,
                          });
                          setSelectedStyle((s) => (s ? { ...s, color } : s));
                        }}
                        aria-label={`색상 ${color}`}
                        className={`h-4.5 w-4.5 shrink-0 rounded-full border-2 transition-transform ${
                          selectedStyle.color === color
                            ? "border-white scale-110"
                            : "border-transparent"
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <div className="mx-0.5 h-5 w-px shrink-0 bg-[#2b2f36]" />
                    {(selectedStyle.contentType === "text"
                      ? TEXT_SIZES
                      : DRAWING_WIDTHS
                    ).map((w) => (
                      <button
                        key={w}
                        onClick={() => {
                          if (selectedStyle.contentType === "text") {
                            drawingsPluginRef.current?.updateDrawing(
                              selectedId,
                              { size: w },
                            );
                            setSelectedStyle((s) =>
                              s ? { ...s, contentSize: w } : s,
                            );
                          } else {
                            drawingsPluginRef.current?.updateDrawing(
                              selectedId,
                              { width: w },
                            );
                            setSelectedStyle((s) =>
                              s ? { ...s, width: w } : s,
                            );
                          }
                        }}
                        aria-label={
                          selectedStyle.contentType === "text"
                            ? `텍스트 크기 ${w}px`
                            : `선 굵기 ${w}px`
                        }
                        className={`flex h-6 shrink-0 items-center justify-center rounded transition-colors ${
                          selectedStyle.contentType === "text" ? "w-6" : "w-8"
                        } ${
                          (selectedStyle.contentType === "text"
                            ? selectedStyle.contentSize
                            : selectedStyle.width) === w
                            ? "bg-[#2b2f36] text-white"
                            : "text-zinc-500 hover:text-zinc-300"
                        } ${
                          selectedStyle.contentType === "text"
                            ? "font-serif"
                            : "text-[9px] tabular-nums"
                        }`}
                        style={
                          selectedStyle.contentType === "text"
                            ? { fontSize: `${Math.round(w * 0.45)}px` }
                            : undefined
                        }
                      >
                        {selectedStyle.contentType === "text" ? "A" : `${w}px`}
                      </button>
                    ))}
                    <div className="mx-0.5 h-5 w-px shrink-0 bg-[#2b2f36]" />
                  </>
                )}
                {(selectedStyle.contentType === "text" ||
                  selectedStyle.contentType === "emoji") && (
                  <>
                    <button
                      onClick={() => {
                        const nextFlipped = !selectedStyle.contentFlipped;
                        drawingsPluginRef.current?.updateDrawing(selectedId, {
                          flipped: nextFlipped,
                        });
                        setSelectedStyle((s) =>
                          s ? { ...s, contentFlipped: nextFlipped } : s,
                        );
                      }}
                      aria-label={
                        selectedStyle.contentFlipped
                          ? "좌우반전 해제"
                          : "좌우반전"
                      }
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors ${
                        selectedStyle.contentFlipped
                          ? "bg-[#2b2f36] text-white"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {/* 가운데 점선 축을 기준으로 서로 반대쪽을 가리키는 화살표 —
                      "좌우로 뒤집는다"는 동작 자체를 아이콘으로 표현한다. */}
                      <svg
                        className="w-3.5 h-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                      >
                        <path d="M12 3v18" strokeDasharray="2.2 2.2" />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M16.5 8l3 4-3 4"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M7.5 8l-3 4 3 4"
                        />
                      </svg>
                    </button>
                    <div className="mx-0.5 h-5 w-px shrink-0 bg-[#2b2f36]" />
                  </>
                )}
                <button
                  onClick={() => {
                    const nextLocked = !selectedStyle.locked;
                    drawingsPluginRef.current?.updateDrawing(selectedId, {
                      locked: nextLocked,
                    });
                    setSelectedStyle((s) =>
                      s ? { ...s, locked: nextLocked } : s,
                    );
                  }}
                  aria-label={selectedStyle.locked ? "잠금 해제" : "잠금"}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors ${
                    selectedStyle.locked
                      ? "text-[#f0b90b]"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <svg
                    className="w-3.5 h-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                  >
                    <rect x="5" y="11" width="14" height="9" rx="1.5" />
                    {selectedStyle.locked ? (
                      <path d="M8 11V7a4 4 0 018 0v4" />
                    ) : (
                      <path d="M8 11V7a4 4 0 017.5-2" />
                    )}
                  </svg>
                </button>
                <button
                  onClick={() => {
                    const plugin = drawingsPluginRef.current;
                    plugin?.removeDrawing(selectedId);
                    setHasDrawings((plugin?.drawings.length ?? 0) > 0);
                    setSelectedId(null);
                    setSelectedStyle(null);
                    setContentTransformId(null);
                  }}
                  aria-label="선택한 드로잉 삭제"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-500 transition-colors hover:text-[#f6465d]"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z"
                    />
                  </svg>
                </button>
              </div>
            )}

          {/* OHLCV + MA 범례 (크로스헤어 이동 시 표시) */}
          <div
            ref={legendRef}
            className="absolute top-1 left-1 z-30 text-xs pointer-events-none"
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
              style={{
                textShadow: "0 0 4px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.9)",
              }}
            />
            <svg
              ref={highArrowRef}
              className="w-3 h-3 shrink-0"
              viewBox="0 0 12 12"
              fill="none"
            >
              <path
                d="M1 6H10.6M10.6 6L7.4 3.9M10.6 6L7.4 8.1"
                stroke="#f6465d"
                strokeWidth={1.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          {/* 화면에 보이는 구간의 최저가 화살표 라벨 (기본: 캔들 오른쪽) */}
          <div
            ref={lowMarkerRef}
            className="absolute z-20 flex items-center gap-0.5 pointer-events-none"
            style={{
              display: "none",
              flexDirection: "row-reverse",
              transform: "translate(0, -50%)",
            }}
          >
            <span
              ref={lowMarkerLabelRef}
              className="whitespace-nowrap text-[9px] font-medium text-[#2563eb]"
              style={{
                textShadow: "0 0 4px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.9)",
              }}
            />
            <svg
              ref={lowArrowRef}
              className="w-3 h-3 shrink-0"
              viewBox="0 0 12 12"
              fill="none"
              style={{ transform: "scaleX(-1)" }}
            >
              <path
                d="M1 6H10.6M10.6 6L7.4 3.9M10.6 6L7.4 8.1"
                stroke="#2563eb"
                strokeWidth={1.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          {/* 현재가 라벨 — 가격 + 등락률을 한 네모에 두 줄로 */}
          <div
            ref={lastPriceMarkerRef}
            className="absolute z-20 flex flex-col items-center justify-center rounded-none px-1.5 py-0.5 pointer-events-none"
            style={{ display: "none", transform: "translateY(-50%)" }}
          >
            <span
              ref={lastPriceValueRef}
              className="whitespace-nowrap text-[11px] font-bold leading-tight text-white"
            />
            <span
              ref={lastPricePctRef}
              className="whitespace-nowrap text-[11px] font-bold leading-tight text-white"
            />
          </div>
          {/* 크로스헤어(선택 캔들) 가격축 라벨 — z를 현재가 배지보다 높게 둬서 겹치면 위로 */}
          <div
            ref={crosshairLabelRef}
            className="absolute z-30 whitespace-nowrap rounded-none bg-[#2b2f36] px-1.5 py-0.5 text-[11px] leading-tight text-zinc-200 pointer-events-none"
            style={{ display: "none", transform: "translateY(-50%)" }}
          />
          {/* 평단가 선 왼쪽 끝에 뜨는 "매입가" 태그 (가격 값은 오른쪽 가격축 라벨에 표시) */}
          <div
            ref={avgPriceLabelRef}
            className="absolute z-20 whitespace-nowrap rounded-none bg-[#6b7280] px-1.5 py-0.5 text-[11px] font-bold text-white pointer-events-none"
            style={{ display: "none", transform: "translateY(-50%)" }}
          >
            매입가
          </div>
          {/* touch-none: lightweight-charts가 팬/핀치줌을 자체 처리하므로, 차트 위 세로
            스와이프가 브라우저 네이티브 스크롤(페이지 전체 스크롤)로 새는 것을 막는다.
            touch-action은 렌더링에 영향이 없어 데스크톱 픽셀에는 아무 변화가 없다. */}
          <div
            ref={containerRef}
            className={`w-full h-full touch-none ${activeTool !== "cursor" ? "cursor-crosshair" : ""}`}
          />

          {/* 텍스트 도구: 클릭한 지점에 인라인 입력창을 띄운다 */}
          {textInputAt && (
            <input
              autoFocus
              className="absolute z-30 rounded-sm border border-[#f0b90b] bg-[#0d0e11] px-1.5 py-0.5 text-xs text-white outline-none"
              style={{
                left: textInputAt.x,
                top: textInputAt.y,
                transform: "translate(0, -50%)",
              }}
              onKeyDown={(e) => {
                const el = e.target as HTMLInputElement;
                if (e.key === "Enter") el.blur();
                else if (e.key === "Escape") {
                  el.value = "";
                  el.blur();
                }
              }}
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value) {
                  drawingsPluginRef.current?.addDrawing({
                    ...newDrawingStyle(),
                    id: Date.now(),
                    type: "text",
                    point: textInputAt.point,
                    text: value,
                    size: DEFAULT_TEXT_SIZE,
                    angle: 0,
                    flipped: false,
                  });
                  setHasDrawings(true);
                }
                setTextInputAt(null);
                setActiveTool("cursor");
              }}
            />
          )}

          {/* 이모지 도구: 클릭한 지점 근처에 이모지 선택 패널을 띄운다 */}
          {emojiPickerAt && (
            <div
              ref={emojiPickerRef}
              className="absolute z-30 grid grid-cols-4 gap-1 rounded-lg border border-[#2b2f36] bg-[#181a20] p-2 shadow-2xl"
              style={{ left: emojiPickerAt.x, top: emojiPickerAt.y }}
            >
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    drawingsPluginRef.current?.addDrawing({
                      ...newDrawingStyle(),
                      id: Date.now(),
                      type: "emoji",
                      point: emojiPickerAt.point,
                      emoji,
                      size: DEFAULT_EMOJI_SIZE,
                      angle: 0,
                      flipped: false,
                    });
                    setHasDrawings(true);
                    setEmojiPickerAt(null);
                    setActiveTool("cursor");
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded text-base hover:bg-[#2b2f36]"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {/* 측정자 도구: 드래그하는 동안 봉 개수·가격 변화를 보여주고 놓으면 사라진다.
            pointermove마다 React state를 바꾸는 대신(문제 6) updateMeasureBox가
            ref를 통해 DOM을 직접 갱신하므로 항상 마운트해두고 표시만 토글한다. */}
          <div
            ref={measureBoxRef}
            className="absolute z-30 whitespace-nowrap rounded-md border border-[#f0b90b] bg-[#181a20] px-2 py-1 text-[11px] text-white pointer-events-none"
            style={{ display: "none" }}
          >
            <div ref={measureBarsRef} />
            <div ref={measureDiffRef} />
          </div>

          {/* 전체화면 토글: 우하단 고정. 다시 누르거나 Esc로 원래대로 돌아온다.
            z는 다른 차트 오버레이와 같은 z-30 — 종목 검색 드롭다운(z-50)이나
            로딩 오버레이(z-40)가 내려오면 그 아래로 깔려야 한다(예전엔 z-50이라
            드롭다운을 뚫고 올라왔다). */}
          <button
            onClick={() => setFullscreenMode(!isFullscreen)}
            aria-label={isFullscreen ? "전체화면 종료" : "전체화면"}
            className="absolute bottom-2 right-2 z-50 flex items-center justify-center w-11 h-11 lg:w-8 lg:h-8 rounded-full border border-[#2b2f36] bg-[#181a20]/90 text-zinc-400 hover:text-white transition-colors"
          >
            {isFullscreen ? (
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 3v4a2 2 0 01-2 2H3M21 9h-4a2 2 0 01-2-2V3M3 15h4a2 2 0 012 2v4M15 21v-4a2 2 0 012-2h4"
                />
              </svg>
            ) : (
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3M16 21h3a2 2 0 002-2v-3"
                />
              </svg>
            )}
          </button>

          {/* API 서버 + realtime 서버 데이터가 모두 도착할 때까지 덮어둔다 */}
          {chartLoading && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#181a20]">
              <div className="h-7 w-7 rounded-full border-2 border-[#2b2f36] border-t-[#F59E0B] animate-spin" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
