import { useState, useEffect, useRef, useMemo, Fragment } from "react";
import { Toast, type ToastData } from "../components/common/Toast";
import {
  useTransferHistory,
  type TransferDirectionFilter,
  type TransferStatus,
} from "../hooks/useTransferHistory";
import { OrderBook } from "../components/orderbook/orderbook";
import { StockHeader } from "../components/stock/StockHeader";
import { CandlestickChart } from "../components/chart/CandlestickChart";
import { useOrderbook } from "../hooks/useOrderbook";
import { useAccountData, type OrderItem } from "../hooks/useAccountData";
import { useAccount } from "../contexts/AccountContext";
import { apiClient } from "../services/api/client";
import { getTickSize, stepPrice } from "../utils/tick";

interface StockItem {
  id: number;
  name: string;
  price: string;
  changeRate: number;
}

interface RankingItem {
  rank: number;
  username: string;
  totalAssets: string;
}

const RANKING_TOP_N = 10;

const fmtWon = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const fmtTime = (value?: string) =>
  value ? new Date(value).toLocaleTimeString("ko-KR") : "-";

// 송금 내역은 여러 날에 걸쳐 페이지를 넘기므로 날짜까지 보여준다
const fmtTransferTime = (value: string) => {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// COMPLETED는 정상 흐름이라 배지를 달지 않는다
const TRANSFER_STATUS_LABEL: Partial<Record<TransferStatus, string>> = {
  RECEIVED: "처리중",
  REJECTED: "거부됨",
};

const TRANSFER_REJECT_LABEL: Record<string, string> = {
  INSUFFICIENT_BALANCE: "잔액 부족",
  INVALID_RECIPIENT: "받는 계좌 없음",
  INVALID_SENDER: "보내는 계좌 없음",
  SENDER_NOT_ACTIVE: "보내는 계좌 비활성",
  RECIPIENT_NOT_ACTIVE: "받는 계좌 비활성",
  SELF_TRANSFER: "본인 계좌 송금",
  INVALID_REQUEST: "잘못된 요청",
};

const TRANSFER_FILTERS: { key: TransferDirectionFilter; label: string }[] = [
  { key: "ALL", label: "전체" },
  { key: "SENT", label: "보냄" },
  { key: "RECEIVED", label: "받음" },
];

// 큰 금액을 조/억/만 단위로 줄여 쓴다. (예: 123456789 → "1억 2,345만 KRW")
const WON_UNITS = [
  { size: 1000000000000n, label: "조" },
  { size: 100000000n, label: "억" },
  { size: 10000n, label: "만" },
];

// 서버가 BigInt를 문자열로 주므로 정수부만 사용한다
const toWonInt = (value: string | number) => String(value).split(".")[0];

const fmtCompactWon = (value: string) => {
  let amount: bigint;
  try {
    amount = BigInt(value);
  } catch {
    return "-";
  }
  const negative = amount < 0n;
  if (negative) amount = -amount;

  const unitIndex = WON_UNITS.findIndex((u) => amount >= u.size);
  if (unitIndex === -1)
    return `${negative ? "-" : ""}${amount.toLocaleString("ko-KR")} KRW`;

  // 최상위 단위와 그 바로 아래 단위까지만 남겨서 한눈에 읽히게 한다
  const unit = WON_UNITS[unitIndex];
  const head = amount / unit.size;
  const sub = WON_UNITS[unitIndex + 1];
  const subValue = sub ? (amount % unit.size) / sub.size : 0n;

  const text =
    subValue > 0n
      ? `${head.toLocaleString("ko-KR")}${unit.label} ${subValue.toLocaleString("ko-KR")}${sub!.label}`
      : `${head.toLocaleString("ko-KR")}${unit.label}`;
  return `${negative ? "-" : ""}${text} KRW`;
};

// 휴장 시간대: UTC 0시 0분 ~ 0시 5분 (자정 포함, 5분 정각에 개장)
const MARKET_CLOSE_MINUTES = 5;

// 주어진 시각 기준으로 휴장 여부와, 휴장이라면 개장(00:05:00 UTC)까지 남은 초를 계산한다
function getMarketCloseState(now: Date): {
  isClosed: boolean;
  secondsUntilOpen: number;
} {
  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  const isClosed = utcH === 0 && utcM < MARKET_CLOSE_MINUTES;
  if (!isClosed) return { isClosed: false, secondsUntilOpen: 0 };

  const openAt = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    MARKET_CLOSE_MINUTES,
    0,
    0,
  );
  const secondsUntilOpen = Math.max(
    0,
    Math.round((openAt - now.getTime()) / 1000),
  );
  return { isClosed: true, secondsUntilOpen };
}

const PERCENT_SNAP_POINTS = [0, 25, 50, 75, 100];
const PERCENT_SNAP_THRESHOLD = 4;
// 슬라이더 thumb(w-3.5 = 14px)의 중심은 트랙 양 끝에서 반지름만큼 안쪽에서 움직이므로
// 눈금/채움 위치도 같은 공식으로 계산해야 thumb과 픽셀 단위로 어긋나지 않는다.
const SLIDER_THUMB_SIZE = 14;
const sliderThumbLeft = (pct: number) =>
  `calc(${SLIDER_THUMB_SIZE / 2}px + (100% - ${SLIDER_THUMB_SIZE}px) * ${pct / 100})`;

type OrderTypeTab = "매수" | "매도" | "정정" | "취소";
type AccountTab = "계좌" | "체결" | "미체결" | "송금";
type MarketTab = "실시간 등락률" | "랭킹";
type AmountMode = "원본" | "간략";
// 모바일 하단 탭바 — lg 미만에서 차트/계좌/호가/주문/시세 패널 중 하나만 보여줄 때 쓴다.
// (데스크톱에서는 다섯 패널이 모두 항상 보이므로 이 상태는 lg 미만에서만 의미가 있다)
type MobileTab = "차트" | "호가" | "주문" | "계좌" | "시세";
const MOBILE_TABS: MobileTab[] = ["차트", "호가", "주문", "계좌", "시세"];

// 직전 스냅샷과 비교해 각 항목이 몇 계단 오르내렸는지 계산한다.
// prevRanksRef가 null이면(첫 조회) 비교 기준이 없으므로 빈 Map을 돌려주고 기준만 세운다.
// (두 목록 다 고정된 항목 집합이라 이전 스냅샷에 없던 키가 새로 나타날 일은 없다)
function computeRankChanges<T, K>(
  items: T[],
  getKey: (item: T) => K,
  getRank: (item: T, index: number) => number,
  prevRanksRef: { current: Map<K, number> | null },
): Map<K, number> {
  const changes = new Map<K, number>();
  const nextRanks = new Map<K, number>();
  const prev = prevRanksRef.current;
  items.forEach((item, i) => {
    const key = getKey(item);
    const rank = getRank(item, i);
    nextRanks.set(key, rank);
    const prevRank = prev?.get(key);
    if (prevRank !== undefined) changes.set(key, prevRank - rank);
  });
  prevRanksRef.current = nextRanks;
  return changes;
}

// 순위 옆에 붙는 변동 배지 (▲N/▼N/변동없음)
function RankBadge({ change }: { change: number | undefined }) {
  if (change === undefined) return null;
  const base =
    "inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full text-[10px] font-bold leading-none";
  if (change === 0) return <span className={`${base} text-zinc-500`}>–</span>;
  const up = change > 0;
  return (
    <span
      className={`${base} ${up ? "text-[#f6465d] bg-[#f6465d]/15" : "text-[#2563eb] bg-[#2563eb]/15"}`}
    >
      {up ? "▲" : "▼"}
      {Math.abs(change)}
    </span>
  );
}

// 계좌 요약에서 현금 항목과 평가 항목을 구분하는 세로 구분자
function GroupDivider() {
  return (
    <span
      aria-hidden
      className="-mx-3 select-none self-center text-sm leading-none text-[#3b3f46]"
    >
      │
    </span>
  );
}

// 표 데이터를 기다리는 동안 실제 행과 같은 자리에 회색 막대를 깔아둔다
function TableSkeleton({
  columns,
  rows = 6,
}: {
  columns: number;
  rows?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-[#2b2f36]">
          {Array.from({ length: columns }).map((_, c) => (
            <td key={c} className="py-2">
              <span
                className="block h-2.5 animate-pulse rounded bg-[#2b2f36]"
                style={{
                  // 컬럼마다 폭을 조금씩 다르게 해 실제 데이터처럼 보이게 한다
                  width: `${55 + ((r + c * 3) % 4) * 10}%`,
                  marginLeft: c === 0 ? 0 : "auto",
                  animationDelay: `${r * 80}ms`,
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// 우측 위/아래 화살표로 증감하는 숫자 입력 (방향키도 동일하게 동작)
function StepperInput({
  label,
  value,
  onChange,
  onStep,
  hint,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  onStep: (current: number, dir: 1 | -1) => number;
  hint?: string;
}) {
  const step = (dir: 1 | -1) =>
    onChange(String(onStep(parseInt(value) || 0, dir)));

  return (
    <>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <label className="text-xs text-zinc-500">{label}</label>
        {hint && (
          <span className="text-[10px] text-zinc-600 shrink-0">{hint}</span>
        )}
      </div>
      <div className="flex items-center bg-[#1f232b] rounded-lg">
        <input
          type="number"
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              step(1);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              step(-1);
            }
          }}
          className="w-full min-w-0 bg-transparent text-white text-base lg:text-xs px-3 py-2 outline-none"
        />
        <div className="flex flex-col shrink-0 pr-2 -space-y-0.5">
          <button
            type="button"
            onClick={() => step(1)}
            className="flex items-center justify-center w-5 h-3 text-zinc-500 hover:text-white transition-colors"
          >
            <svg
              className="w-2.5 h-2.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 15l7-7 7 7"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => step(-1)}
            className="flex items-center justify-center w-5 h-3 text-zinc-500 hover:text-white transition-colors"
          >
            <svg
              className="w-2.5 h-2.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}

// 모바일 하단 탭바 아이콘. Header.tsx의 MenuIcon과 같은 시각 언어(24 viewBox, currentColor stroke,
// strokeWidth 2, round cap/join)를 쓰되 하단 탭바에 맞게 20px로 그린다.
function TabIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

// 차트: 캔들스틱 3개 (몸통 + 위아래 꼬리)
function ChartTabIcon() {
  return (
    <TabIcon>
      <line x1="6" y1="3" x2="6" y2="8" />
      <rect x="4" y="8" width="4" height="7" rx="1" />
      <line x1="6" y1="15" x2="6" y2="20" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <rect x="10" y="6" width="4" height="10" rx="1" />
      <line x1="12" y1="16" x2="12" y2="21" />
      <line x1="18" y1="6" x2="18" y2="9" />
      <rect x="16" y="9" width="4" height="6" rx="1" />
      <line x1="18" y1="15" x2="18" y2="18" />
    </TabIcon>
  );
}

// 호가: 길이가 다른 가로 막대 4줄 — 호가창의 매수/매도 잔량 사다리를 단순화한 모양
function OrderBookTabIcon() {
  return (
    <TabIcon>
      <line x1="3" y1="5" x2="21" y2="5" />
      <line x1="3" y1="10" x2="15" y2="10" />
      <line x1="3" y1="15" x2="19" y2="15" />
      <line x1="3" y1="20" x2="11" y2="20" />
    </TabIcon>
  );
}

// 주문: 매수(위쪽 화살표)와 매도(아래쪽 화살표)를 나란히
function OrderTabIcon() {
  return (
    <TabIcon>
      <line x1="7" y1="20" x2="7" y2="4" />
      <polyline points="4 8 7 4 10 8" />
      <line x1="17" y1="4" x2="17" y2="20" />
      <polyline points="14 16 17 20 20 16" />
    </TabIcon>
  );
}

// 계좌: 카드/지갑 (테두리 + 상단 슬롯 라인)
function AccountTabIcon() {
  return (
    <TabIcon>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </TabIcon>
  );
}

// 시세: 트로피 — 실시간 등락률/랭킹을 의미상 대표하면서, 다른 네 아이콘과 실루엣이 겹치지 않는다.
// (별은 StockHeader.tsx의 관심종목 토글이 이미 쓰고 있어 "즐겨찾기"로 읽히므로 피했다)
function MarketTabIcon() {
  return (
    <TabIcon>
      <path d="M7 4h10" />
      <path d="M7 4v3a5 5 0 0 0 10 0V4" />
      <path d="M7 5H5a2 2 0 0 0-2 2v1a3 3 0 0 0 3 3h1" />
      <path d="M17 5h2a2 2 0 0 1 2 2v1a3 3 0 0 1-3 3h-1" />
      <line x1="12" y1="12" x2="12" y2="16" />
      <path d="M9 21h6l-1-4h-4l-1 4z" />
    </TabIcon>
  );
}

const MOBILE_TAB_ICONS: Record<MobileTab, () => React.JSX.Element> = {
  차트: ChartTabIcon,
  호가: OrderBookTabIcon,
  주문: OrderTabIcon,
  계좌: AccountTabIcon,
  시세: MarketTabIcon,
};

export function TradingPage() {
  const [chartPanel, setChartPanel] = useState<HTMLDivElement | null>(null);
  // 모바일 하단 탭바에서 선택된 패널. lg 이상에서는 쓰이지 않는다(다섯 패널 모두 표시).
  const [mobileTab, setMobileTab] = useState<MobileTab>("차트");
  const [stockId, setStockId] = useState<number | null>(null);
  const { data, loading: orderbookLoading } = useOrderbook(stockId);
  const { accounts, selectedAccount, setSelectedAccount } = useAccount();
  const {
    data: accountData,
    orderData,
    loading: accountLoading,
    loadMoreOpenOrders,
    loadMoreFilledOrders,
    loadingMoreOpen,
    loadingMoreFilled,
  } = useAccountData(selectedAccount?.id ?? null);

  const holdingsSummary = useMemo(() => {
    const holdings = accountData?.holdings ?? [];
    const totalBuyAmount = holdings.reduce(
      (sum, h) => sum + Number(h.totalBuyAmount),
      0,
    );
    const totalEvalAmount = holdings.reduce(
      (sum, h) => sum + Number(h.stock.price) * Number(h.quantity),
      0,
    );
    const totalProfit = totalEvalAmount - totalBuyAmount;
    const totalProfitRate =
      totalBuyAmount > 0 ? (totalProfit / totalBuyAmount) * 100 : 0;
    return { totalBuyAmount, totalEvalAmount, totalProfit, totalProfitRate };
  }, [accountData?.holdings]);

  const currentHolding = accountData?.holdings?.find(
    (h) => h.stock.id === stockId,
  );
  const currentAvgPrice = currentHolding
    ? Number(currentHolding.average)
    : null;

  const [accountTab, setAccountTab] = useState<AccountTab>("계좌");
  const [orderType, setOrderType] = useState<OrderTypeTab>("매수");
  const [priceType, setPriceType] = useState<"지정가" | "시장가">("지정가");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [orderPercent, setOrderPercent] = useState(0);
  const [orderLoading, setOrderLoading] = useState(false);
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [stocksLoading, setStocksLoading] = useState(true);
  const stockRanksRef = useRef<Map<number, number> | null>(null);
  const [stockRankChanges, setStockRankChanges] = useState<Map<number, number>>(
    new Map(),
  );

  const [toast, setToast] = useState<ToastData | null>(null);
  const [toastLeaving, setToastLeaving] = useState(false);
  const toastTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);
  const [amendPrice, setAmendPrice] = useState("");
  const [amendLoading, setAmendLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  const [transferTarget, setTransferTarget] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferAlias, setTransferAlias] = useState("");
  const [transferLoading, setTransferLoading] = useState(false);
  const {
    items: transferHistory,
    page: transferPage,
    totalPages: transferTotalPages,
    total: transferTotal,
    loading: transferHistoryLoading,
    direction: transferDirection,
    setDirection: setTransferDirection,
    sort: transferSort,
    setSort: setTransferSort,
    goToPage: goToTransferPage,
    refresh: refreshTransferHistory,
  } = useTransferHistory(
    selectedAccount?.accountNumber ?? null,
    accountTab === "송금",
  );

  const [marketTab, setMarketTab] = useState<MarketTab>("실시간 등락률");
  const [amountMode, setAmountMode] = useState<AmountMode>("원본");
  const [rankings, setRankings] = useState<RankingItem[] | null>(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const rankingRanksRef = useRef<Map<string, number> | null>(null);
  const [rankingRankChanges, setRankingRankChanges] = useState<
    Map<string, number>
  >(new Map());

  // 계좌 패널 스크롤이 바닥에 가까워지면 현재 탭(체결/미체결)의 다음 페이지를 불러옴
  const handleAccountPanelScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (!nearBottom) return;

    if (accountTab === "체결") loadMoreFilledOrders();
    else if (accountTab === "미체결") loadMoreOpenOrders();
  };

  // 종목이 바뀌면 주문가격을 그 종목의 현재가로 1회 초기화한다.
  // (렌더 중 상태 조정 패턴 — 이후 사용자가 입력한 값은 덮어쓰지 않는다)
  const [pricedStockId, setPricedStockId] = useState<number | null>(null);
  // 종목 전환 직후 첫 렌더에서는 useOrderbook의 초기화 effect가 아직 실행되지 않아
  // data.stockInfo가 이전 종목의 값을 그대로 들고 있을 수 있으므로 id가 일치할 때만 신뢰한다.
  const livePrice =
    data?.stockInfo?.id === stockId ? data.stockInfo.price : undefined;
  if (stockId !== null && livePrice && pricedStockId !== stockId) {
    setPricedStockId(stockId);
    setPrice(String(Math.trunc(Number(livePrice))));
  }

  // 퍼센트 슬라이더 값에 따른 주문 수량 계산 (슬라이더 조작 시, 종목 전환 시 공용으로 쓴다)
  const computeQuantityForPercent = (pct: number) => {
    // 매도는 가격과 무관하게 보유수량만으로 계산하므로, 가격(상한가 등)은
    // 매수일 때만 계산한다 — 안 그러면 매도 시장가에서도 상한가를 참조하는 것처럼 보인다.
    if (orderType === "매수") {
      const orderPrice =
        priceType === "지정가"
          ? parseInt(price)
          : parseFloat(data?.stockInfo?.upperLimit ?? "0");
      const availableBalance = accountData?.account?.availableBalance ?? "0";
      if (orderPrice <= 0) return null;
      return String(
        (BigInt(availableBalance) * BigInt(pct)) / 100n / BigInt(orderPrice),
      );
    }
    const holding = accountData?.holdings?.find((s) => s.stock.id === stockId);
    const canSell = parseInt(holding?.availableQuantity ?? "0");
    return String(Math.floor((canSell * pct) / 100));
  };

  // 총 주문 금액: 지정가는 입력한 가격, 시장가는 현재가를 기준으로 한 예상 금액이다.
  const orderTotalAmount =
    (priceType === "지정가"
      ? parseInt(price) || 0
      : Number(livePrice ?? data?.stockInfo?.price ?? 0)) *
    (parseInt(quantity) || 0);

  // 종목이 바뀌면(가격 초기화가 끝난 뒤) 퍼센트바로 잡아둔 수량도 새 종목 기준으로 다시 계산한다.
  // (퍼센트를 아직 안 건드렸으면 0%라 재계산할 의미가 없으므로 건너뛴다)
  useEffect(() => {
    if (orderPercent <= 0) return;
    const qty = computeQuantityForPercent(orderPercent);
    if (qty !== null) setQuantity(qty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricedStockId]);

  useEffect(() => {
    const fetchStocks = async () => {
      const response = await apiClient.get<StockItem[]>("/stocks");
      if (response.success && response.data) {
        setStocks(response.data);
        setStockRankChanges(
          computeRankChanges(
            response.data,
            (s) => s.id,
            (_s, i) => i + 1,
            stockRanksRef,
          ),
        );
        setStockId((prev) => prev ?? response.data![0]?.id ?? null);
      }
      setStocksLoading(false);
    };
    fetchStocks();
    const interval = setInterval(fetchStocks, 30000);
    return () => clearInterval(interval);
  }, []);

  // 랭킹은 탭이 열려 있을 때만 주기적으로 갱신한다
  useEffect(() => {
    if (marketTab !== "랭킹") return;

    let canceled = false;
    const fetchRankings = async () => {
      try {
        const response = await apiClient.get<{ rankings: RankingItem[] }>(
          `/rankings/assets?page=1&size=${RANKING_TOP_N}`,
        );
        if (canceled) return;
        const list =
          response.success && response.data ? response.data.rankings : [];
        setRankings(list);
        setRankingRankChanges(
          computeRankChanges(
            list,
            (r) => r.username,
            (r) => r.rank,
            rankingRanksRef,
          ),
        );
      } catch {
        if (canceled) return;
        setRankings([]);
      }
      setRankingLoading(false);
    };
    setRankingLoading(true);
    fetchRankings();
    const interval = setInterval(fetchRankings, 30000);
    return () => {
      canceled = true;
      clearInterval(interval);
    };
  }, [marketTab]);

  const clearToastTimers = () => {
    toastTimers.current.forEach(clearTimeout);
    toastTimers.current = [];
  };

  const hideToast = () => {
    clearToastTimers();
    setToastLeaving(true);
    // 사라지는 애니메이션(300ms)이 끝난 뒤 언마운트
    toastTimers.current.push(setTimeout(() => setToast(null), 300));
  };

  const showToast = (message: string, type: "success" | "error") => {
    clearToastTimers();
    setToastLeaving(false);
    setToast({ id: Date.now(), message, type });
    toastTimers.current.push(setTimeout(hideToast, 3000));
  };

  useEffect(() => clearToastTimers, []);

  const getErrorMsg = (error: unknown, fallback: string) =>
    typeof error === "object" && error !== null
      ? ((error as { message?: string }).message ?? fallback)
      : ((error as string) ?? fallback);

  const handleOrder = async () => {
    const qty = parseInt(quantity);
    const prc = parseInt(price);
    if (!quantity || qty < 1)
      return showToast("수량은 1주 이상 입력해주세요.", "error");
    if (priceType === "지정가" && (!price || prc < 1))
      return showToast("가격은 1 KRW 이상 입력해주세요.", "error");
    setOrderLoading(true);
    try {
      const endpoint =
        orderType === "매수"
          ? `/stocks/${stockId}/orders/buy`
          : `/stocks/${stockId}/orders/sell`;
      const response = await apiClient.post(endpoint, {
        accountNumber: selectedAccount?.accountNumber,
        price: priceType === "지정가" ? prc : 0,
        quantity: qty,
        orderType: priceType === "지정가" ? "LIMIT" : "MARKET",
      });
      if (response.success)
        showToast(`${orderType} 주문이 완료되었습니다.`, "success");
      else
        showToast(getErrorMsg(response.error, "주문에 실패했습니다."), "error");
    } catch {
      showToast("서버 연결에 실패했습니다.", "error");
    } finally {
      setOrderLoading(false);
    }
  };

  const handleAmend = async () => {
    if (!selectedOrder || !amendPrice || parseInt(amendPrice) < 1)
      return showToast("정정 가격을 입력해주세요.", "error");
    if (parseInt(amendPrice) === Math.trunc(Number(selectedOrder.price)))
      return showToast("기존 주문과 다른 가격으로 정정해주세요.", "error");
    if (amendInsufficientBalance)
      return showToast("주문 가능 금액이 부족합니다.", "error");
    setAmendLoading(true);
    try {
      const response = await apiClient.put(`/orders/${selectedOrder.id}`, {
        accountNumber: selectedAccount?.accountNumber,
        price: parseInt(amendPrice),
      });
      if (response.success) {
        showToast("주문이 정정되었습니다.", "success");
        setSelectedOrder(null);
        setAmendPrice("");
      } else {
        showToast(getErrorMsg(response.error, "정정에 실패했습니다."), "error");
      }
    } catch {
      showToast("서버 연결에 실패했습니다.", "error");
    } finally {
      setAmendLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!selectedOrder) return;
    setCancelLoading(true);
    try {
      const response = await apiClient.delete(`/orders/${selectedOrder.id}`, {
        accountNumber: selectedAccount?.accountNumber,
      });
      if (response.success) {
        showToast("주문이 취소되었습니다.", "success");
        setSelectedOrder(null);
        setAmendPrice("");
      } else {
        showToast(getErrorMsg(response.error, "취소에 실패했습니다."), "error");
      }
    } catch {
      showToast("서버 연결에 실패했습니다.", "error");
    } finally {
      setCancelLoading(false);
    }
  };

  const handleTransfer = async () => {
    const amount = parseInt(transferAmount);
    if (!transferTarget.trim())
      return showToast("받는 계좌번호를 입력해주세요.", "error");
    if (!amount || amount < 1)
      return showToast("송금 금액을 입력해주세요.", "error");
    if (transferTarget.trim() === String(selectedAccount?.accountNumber ?? ""))
      return showToast("보내는 계좌와 받는 계좌가 같습니다.", "error");
    if (BigInt(amount) > BigInt(accountData?.account?.availableBalance ?? "0"))
      return showToast("주문 가능 금액이 부족합니다.", "error");
    setTransferLoading(true);
    try {
      const response = await apiClient.post(
        `/accounts/${selectedAccount?.accountNumber}/transfers`,
        {
          recipientAccountNumber: Number(transferTarget),
          amount,
          ...(transferAlias.trim()
            ? { senderAlias: transferAlias.trim() }
            : {}),
        },
      );
      if (response.success) {
        // 접수 단계라 잔액 반영·최종 상태는 엔진 처리 후에 확정된다
        showToast("송금이 접수되었습니다.", "success");
        setTransferTarget("");
        setTransferAmount("");
        setTransferAlias("");
        refreshTransferHistory();
      } else {
        showToast(getErrorMsg(response.error, "송금에 실패했습니다."), "error");
      }
    } catch {
      showToast("서버 연결에 실패했습니다.", "error");
    } finally {
      setTransferLoading(false);
    }
  };

  const transferAmountInt = parseInt(transferAmount) || 0;
  const transferInsufficientBalance =
    transferAmountInt > 0 &&
    BigInt(transferAmountInt) >
      BigInt(accountData?.account?.availableBalance ?? "0");

  // 매수 정정은 미체결 잔량에 새 가격을 곱한 만큼 잔고가 필요하다.
  // (가격을 내리면 추가로 필요한 금액이 없으므로 0으로 취급)
  const amendRemainingQty = selectedOrder
    ? BigInt(selectedOrder.quantity) - BigInt(selectedOrder.filledQuantity)
    : 0n;
  const amendPriceDiff = selectedOrder
    ? BigInt(parseInt(amendPrice) || 0) -
      BigInt(Math.trunc(Number(selectedOrder.price)))
    : 0n;
  const amendExtraCost =
    selectedOrder?.tradingType === "BUY" && amendPriceDiff > 0n
      ? amendPriceDiff * amendRemainingQty
      : 0n;
  const amendInsufficientBalance =
    amendExtraCost > BigInt(accountData?.account?.availableBalance ?? "0");

  const selectOrder = (order: OrderItem) => {
    setSelectedOrder(order);
    if (orderType === "매수" || orderType === "매도") {
      setOrderType("정정");
      setAmendPrice(order.price);
    } else if (orderType === "정정") {
      setAmendPrice(order.price);
    }
  };

  // UTC 0시~0시5분 휴장: 매초 실제 UTC 시각을 확인해 휴장 여부와 개장까지 남은 시간을 계산한다.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  const { isClosed: isMarketClosed, secondsUntilOpen } =
    getMarketCloseState(now);
  const closedCountdownLabel = `${String(Math.floor(secondsUntilOpen / 60)).padStart(2, "0")}:${String(secondsUntilOpen % 60).padStart(2, "0")}`;

  return (
    <div className="flex flex-col h-full w-full">
      {/* 종목 선택 바는 거래 화면 전체 폭을 사용한다. */}
      <div className="shrink-0 px-3 lg:px-5 pt-2.5">
        <StockHeader
          stockInfo={data?.stockInfo ?? null}
          stocks={stocks}
          selectedStockId={stockId}
          onSelectStock={setStockId}
          contentWidthTarget={chartPanel}
          isMarketClosed={isMarketClosed}
        />
      </div>

      {/*
        모바일(lg 미만)에서는 다섯 패널(차트/호가/주문/계좌/시세)을 모두 마운트한 채
        absolute inset-x-3 inset-y-2.5로 이 컨테이너 위에 거터를 두고 겹쳐두고, 선택된 탭만 visible로 보여준다.
        display:none 대신 visibility를 쓰는 이유는 CandlestickChart가 컨테이너 크기 변화를
        window resize 이벤트로만 감지하기 때문 — display:none이면 크기가 0이 되어 탭 전환 시
        차트가 깨질 수 있다. absolute + visibility는 항상 실제 크기를 유지해 이 문제를 피한다.
        lg 이상에서는 static/relative flex 배치로 되돌아가 데스크톱 3열 레이아웃을 그대로 유지한다.
      */}
      <div className="relative flex flex-1 min-h-0 gap-2.5 lg:px-5 lg:pt-2.5 lg:pb-2.5">
        {/* 좌: 차트 + 계좌 (모바일에서는 서로 다른 탭이라 wrapper를 contents로 지워 형제로 만든다) */}
        <div
          ref={setChartPanel}
          className="contents lg:flex lg:flex-5 lg:min-w-0 lg:min-h-0 lg:flex-col lg:gap-2.5"
        >
          <div
            className={`absolute inset-x-3 inset-y-2.5 lg:static lg:flex-52 lg:min-h-0 ${mobileTab === "차트" ? "visible" : "invisible pointer-events-none"} lg:visible lg:pointer-events-auto`}
          >
            <CandlestickChart stockId={stockId} avgPrice={currentAvgPrice} />
          </div>
          <div
            className={`absolute inset-x-3 inset-y-2.5 lg:static lg:flex-48 lg:min-h-0 bg-[#181a20] rounded-xl p-4 flex flex-col ${mobileTab === "계좌" ? "visible" : "invisible pointer-events-none"} lg:visible lg:pointer-events-auto`}
          >
            <div className="flex items-center gap-4 mb-3 shrink-0">
              {(["계좌", "체결", "미체결", "송금"] as AccountTab[]).map(
                (tab) => (
                  <button
                    key={tab}
                    onClick={() => setAccountTab(tab)}
                    className={`text-sm ${accountTab === tab ? "text-white" : "text-zinc-400"}`}
                  >
                    {tab}
                  </button>
                ),
              )}
            </div>

            {accountTab === "계좌" && (
              <div className="mb-3 flex items-center gap-6 overflow-x-auto pb-2.5 shrink-0 cursor-text">
                {!accountData?.account &&
                  accountLoading &&
                  [
                    ["예수금", "w-24"],
                    ["주문가능금액", "w-24"],
                    ["총매입금액", "w-24"],
                    ["총평가금액", "w-24"],
                    ["평가손익", "w-20"],
                    ["총수익률", "w-12"],
                  ].map(([label, width]) => (
                    <Fragment key={label}>
                      {/* 현금 그룹과 평가 그룹 사이 구분 */}
                      {label === "총매입금액" && <GroupDivider />}
                      <div className="flex min-w-0 flex-col gap-1 mt-1.5">
                        <span className="text-[10px] leading-none text-zinc-500 whitespace-nowrap">
                          {label}
                        </span>
                        <span
                          className={`mt-0.5 h-3 ${width} animate-pulse rounded bg-[#2b2f36]`}
                        />
                      </div>
                    </Fragment>
                  ))}
                {accountData?.account && (
                  <>
                    <div className="flex shrink-0 flex-col gap-1 mt-1.5">
                      <span className="text-[10px] leading-none text-zinc-500 whitespace-nowrap">
                        예수금
                      </span>
                      <span className="text-sm lg:text-xs leading-none text-white font-semibold tabular-nums pt-0.5 whitespace-nowrap">
                        {fmtWon(accountData.account.balance)} KRW
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1 mt-1.5">
                      <span className="text-[10px] leading-none text-zinc-500 whitespace-nowrap">
                        주문가능금액
                      </span>
                      <span className="text-sm lg:text-xs leading-none text-zinc-200 font-semibold tabular-nums pt-0.5 whitespace-nowrap">
                        {fmtWon(accountData.account.availableBalance)} KRW
                      </span>
                    </div>
                    <GroupDivider />
                    <div className="flex shrink-0 flex-col gap-1 mt-1.5">
                      <span className="text-[10px] leading-none text-zinc-500 whitespace-nowrap">
                        총매입금액
                      </span>
                      <span className="text-sm lg:text-xs leading-none text-zinc-200 font-semibold tabular-nums pt-0.5 whitespace-nowrap">
                        {holdingsSummary.totalBuyAmount.toLocaleString("ko-KR")}{" "}
                        KRW
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1 mt-1.5">
                      <span className="text-[10px] leading-none text-zinc-500 whitespace-nowrap">
                        총평가금액
                      </span>
                      <span className="text-sm lg:text-xs leading-none text-zinc-200 font-semibold tabular-nums pt-0.5 whitespace-nowrap">
                        {holdingsSummary.totalEvalAmount.toLocaleString(
                          "ko-KR",
                        )}{" "}
                        KRW
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1 mt-1.5">
                      <span className="text-[10px] leading-none text-zinc-500 whitespace-nowrap">
                        평가손익
                      </span>
                      <span
                        className={`text-sm lg:text-xs leading-none font-semibold tabular-nums pt-0.5 whitespace-nowrap ${
                          holdingsSummary.totalProfit > 0
                            ? "text-[#f6465d]"
                            : holdingsSummary.totalProfit < 0
                              ? "text-[#2563eb]"
                              : "text-zinc-200"
                        }`}
                      >
                        {holdingsSummary.totalProfit > 0 ? "+" : ""}
                        {holdingsSummary.totalProfit.toLocaleString(
                          "ko-KR",
                        )}{" "}
                        KRW
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1 mt-1.5">
                      <span className="text-[10px] leading-none text-zinc-500 whitespace-nowrap">
                        총수익률
                      </span>
                      <span
                        className={`text-sm lg:text-xs leading-none font-semibold tabular-nums pt-0.5 whitespace-nowrap ${
                          holdingsSummary.totalProfitRate > 0
                            ? "text-[#f6465d]"
                            : holdingsSummary.totalProfitRate < 0
                              ? "text-[#2563eb]"
                              : "text-zinc-200"
                        }`}
                      >
                        {holdingsSummary.totalProfitRate > 0 ? "+" : ""}
                        {holdingsSummary.totalProfitRate.toFixed(2)}%
                      </span>
                    </div>
                  </>
                )}
                <div className="ml-auto flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] text-zinc-500">현재 계좌</span>
                  <select
                    value={selectedAccount?.id ?? ""}
                    onChange={(e) => {
                      const account = accounts.find(
                        (a) => a.id === Number(e.target.value),
                      );
                      if (account) setSelectedAccount(account);
                    }}
                    className="bg-[#1f232b] text-white text-base lg:text-xs px-3 py-1 rounded-lg outline-none w-fit hover:bg-[#252a33] transition-colors"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.accountNumber}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div
              className="flex-1 min-h-0 overflow-auto scrollbar-thin"
              onScroll={handleAccountPanelScroll}
            >
              {accountTab === "계좌" && (
                <table className="w-full min-w-126.25 table-fixed text-sm lg:text-xs">
                  {/* 각 컬럼 실측 내용 폭을 기준으로 남는 공간을 8개 컬럼에 균등 배분한 비율 */}
                  <colgroup>
                    <col className="w-[16.7%]" />
                    <col className="w-[8.95%]" />
                    <col className="w-[8.95%]" />
                    <col className="w-[12.65%]" />
                    <col className="w-[12.65%]" />
                    <col className="w-[14.75%]" />
                    <col className="w-[11.6%]" />
                    <col className="w-[13.75%]" />
                  </colgroup>
                  <thead className="text-zinc-500 border-b border-[#2b2f36]">
                    <tr>
                      <th className="text-left py-2">종목명</th>
                      <th className="text-right py-2">보유</th>
                      <th className="text-right py-2">가능</th>
                      <th className="text-right py-2">매입가</th>
                      <th className="text-right py-2">현재가</th>
                      <th className="text-right py-2">매수금액</th>
                      <th className="text-right py-2">수익률</th>
                      <th className="text-right py-2">수익금액</th>
                    </tr>
                  </thead>
                  <tbody className="text-white">
                    {accountData?.holdings.map((stock) => {
                      const cur = Number(stock.stock.price);
                      const avg = Number(stock.average);
                      const qty = Number(stock.quantity);
                      const rate = avg > 0 ? ((cur - avg) / avg) * 100 : 0;
                      const amount = (cur - avg) * qty;
                      const color =
                        rate > 0
                          ? "text-[#f6465d]"
                          : rate < 0
                            ? "text-[#2563eb]"
                            : "text-white";
                      return (
                        <tr
                          key={stock.stock.id}
                          onClick={() => {
                            if (stock.stock.id !== stockId)
                              setStockId(stock.stock.id);
                          }}
                          className={`border-b border-[#2b2f36] cursor-pointer hover:bg-[#2b2f36] transition-colors ${stock.stock.id === stockId ? "bg-[#1f232b]" : ""}`}
                        >
                          <td className="py-2 pr-2 truncate">
                            {stock.stock.name}
                          </td>
                          <td className="text-right py-2 tabular-nums">
                            {qty.toLocaleString("ko-KR")}
                          </td>
                          <td className="text-right py-2 tabular-nums">
                            {Number(stock.availableQuantity).toLocaleString(
                              "ko-KR",
                            )}
                          </td>
                          <td className="text-right py-2 tabular-nums">
                            {avg.toLocaleString("ko-KR")}
                          </td>
                          <td className="text-right py-2 tabular-nums">
                            {cur.toLocaleString("ko-KR")}
                          </td>
                          <td className="text-right py-2 tabular-nums">
                            {Number(stock.totalBuyAmount).toLocaleString(
                              "ko-KR",
                            )}
                          </td>
                          <td
                            className={`text-right py-2 tabular-nums ${color}`}
                          >
                            {rate > 0 ? "+" : ""}
                            {rate.toFixed(2)}%
                          </td>
                          <td
                            className={`text-right py-2 tabular-nums ${color}`}
                          >
                            {amount > 0 ? "+" : ""}
                            {amount.toLocaleString("ko-KR")}
                          </td>
                        </tr>
                      );
                    })}
                    {accountLoading && !accountData && (
                      <TableSkeleton columns={8} rows={3} />
                    )}
                    {!accountLoading &&
                      (!accountData || accountData.holdings.length === 0) && (
                        <tr>
                          <td
                            colSpan={8}
                            className="pt-12 pb-4 text-center text-zinc-500"
                          >
                            보유 종목이 없습니다
                          </td>
                        </tr>
                      )}
                  </tbody>
                </table>
              )}

              {accountTab === "체결" && (
                <table className="w-full table-fixed text-sm lg:text-xs">
                  <colgroup>
                    <col className="w-[9%]" />
                    <col className="w-[16%]" />
                    <col className="w-[8%]" />
                    <col className="w-[10%]" />
                    <col className="w-[10%]" />
                    <col className="w-[10%]" />
                    <col className="w-[11%]" />
                    <col className="w-[13%]" />
                    <col className="w-[13%]" />
                  </colgroup>
                  <thead className="text-zinc-500 border-b border-[#2b2f36]">
                    <tr>
                      <th className="text-left py-2">주문ID</th>
                      <th className="text-left py-2">종목명</th>
                      <th className="text-right py-2">유형</th>
                      <th className="text-right py-2">주문구분</th>
                      <th className="text-right py-2">주문수량</th>
                      <th className="text-right py-2">체결수량</th>
                      <th className="text-right py-2">주문가격</th>
                      <th className="text-right py-2">접수시각</th>
                      <th className="text-right py-2">전량체결 시각</th>
                    </tr>
                  </thead>
                  <tbody className="text-white">
                    {orderData?.filledOrders.map((order) => (
                      <tr key={order.id} className="border-b border-[#2b2f36]">
                        <td className="py-2">{order.id}</td>
                        <td className="py-2">{order.stockName}</td>
                        <td
                          className={`text-right py-2 ${order.tradingType === "BUY" ? "text-[#f6465d]" : "text-[#2563eb]"}`}
                        >
                          {order.tradingType === "BUY" ? "매수" : "매도"}
                        </td>
                        <td className="text-right py-2">
                          {order.orderType === "MARKET" ? "시장가" : "지정가"}
                        </td>
                        <td className="text-right py-2">
                          {Number(order.quantity).toLocaleString("ko-KR")}
                        </td>
                        <td className="text-right py-2">
                          {Number(order.filledQuantity).toLocaleString("ko-KR")}
                        </td>
                        <td className="text-right py-2">
                          {order.orderType === "MARKET"
                            ? "-"
                            : Number(order.price).toLocaleString("ko-KR")}
                        </td>
                        <td className="text-right py-2 text-[11px] text-zinc-400 tabular-nums">
                          {fmtTime(order.createdAt)}
                        </td>
                        <td className="text-right py-2 text-[11px] text-zinc-400 tabular-nums">
                          {fmtTime(
                            order.fullyFilledAt ??
                              order.completedAt ??
                              order.updatedAt,
                          )}
                        </td>
                      </tr>
                    ))}
                    {accountLoading && !orderData && (
                      <TableSkeleton columns={9} />
                    )}
                    {!accountLoading &&
                      (!orderData || orderData.filledOrders.length === 0) && (
                        <tr>
                          <td
                            colSpan={9}
                            className="pt-12 pb-4 text-center text-zinc-500"
                          >
                            체결 내역이 없습니다
                          </td>
                        </tr>
                      )}
                    {loadingMoreFilled && (
                      <TableSkeleton columns={9} rows={3} />
                    )}
                  </tbody>
                </table>
              )}

              {accountTab === "미체결" && (
                <table className="w-full table-fixed text-sm lg:text-xs">
                  <colgroup>
                    <col className="w-[9%]" />
                    <col className="w-[16%]" />
                    <col className="w-[9%]" />
                    <col className="w-[12%]" />
                    <col className="w-[13%]" />
                    <col className="w-[12%]" />
                    <col className="w-[14%]" />
                    <col className="w-[15%]" />
                  </colgroup>
                  <thead className="text-zinc-500 border-b border-[#2b2f36]">
                    <tr>
                      <th className="text-left py-2">주문ID</th>
                      <th className="text-left py-2">종목명</th>
                      <th className="text-right py-2">유형</th>
                      <th className="text-right py-2">주문구분</th>
                      <th className="text-right py-2">주문수량</th>
                      <th className="text-right py-2">체결수량</th>
                      <th className="text-right py-2">주문가격</th>
                      <th className="text-right py-2">접수시각</th>
                    </tr>
                  </thead>
                  <tbody className="text-white">
                    {orderData?.openOrders.map((order) => {
                      const isSelected = selectedOrder?.id === order.id;
                      return (
                        <tr
                          key={order.id}
                          onClick={() => selectOrder(order)}
                          className={`border-b border-[#2b2f36] cursor-pointer transition-colors ${isSelected ? "bg-[#2b2f36]" : "hover:bg-[#1f232b]"}`}
                        >
                          <td className="py-2">{order.id}</td>
                          <td className="py-2">{order.stockName}</td>
                          <td
                            className={`text-right py-2 ${order.tradingType === "BUY" ? "text-[#f6465d]" : "text-[#2563eb]"}`}
                          >
                            {order.tradingType === "BUY" ? "매수" : "매도"}
                          </td>
                          <td className="text-right py-2">
                            {order.orderType === "MARKET" ? "시장가" : "지정가"}
                          </td>
                          <td className="text-right py-2">
                            {Number(order.quantity).toLocaleString("ko-KR")}
                          </td>
                          <td className="text-right py-2">
                            {Number(order.filledQuantity).toLocaleString(
                              "ko-KR",
                            )}
                          </td>
                          <td className="text-right py-2">
                            {order.orderType === "MARKET"
                              ? "-"
                              : Number(order.price).toLocaleString("ko-KR")}
                          </td>
                          <td className="text-right py-2 text-[11px] text-zinc-400 tabular-nums">
                            {fmtTime(order.createdAt)}
                          </td>
                        </tr>
                      );
                    })}
                    {accountLoading && !orderData && (
                      <TableSkeleton columns={8} />
                    )}
                    {!accountLoading &&
                      (!orderData || orderData.openOrders.length === 0) && (
                        <tr>
                          <td
                            colSpan={8}
                            className="pt-12 pb-4 text-center text-zinc-500"
                          >
                            미체결 내역이 없습니다
                          </td>
                        </tr>
                      )}
                    {loadingMoreOpen && <TableSkeleton columns={8} rows={3} />}
                  </tbody>
                </table>
              )}

              {accountTab === "송금" && (
                <div className="flex flex-col lg:flex-row gap-4 lg:gap-8 items-start">
                  <div className="flex-4 min-w-0 w-full flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-zinc-500">
                        보내는 계좌
                      </label>
                      <select
                        value={selectedAccount?.id ?? ""}
                        onChange={(e) => {
                          const account = accounts.find(
                            (a) => a.id === Number(e.target.value),
                          );
                          if (account) setSelectedAccount(account);
                        }}
                        className="w-full bg-[#1f232b] text-white text-base lg:text-sm px-3 py-2.5 rounded-lg outline-none appearance-none text-left"
                      >
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.accountNumber}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-zinc-500">
                        받는 계좌번호
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={transferTarget}
                        onChange={(e) =>
                          setTransferTarget(e.target.value.replace(/\D/g, ""))
                        }
                        placeholder="계좌번호를 입력하세요"
                        className="w-full bg-[#1f232b] text-white placeholder-zinc-600 text-base lg:text-sm px-3 py-2.5 rounded-lg outline-none text-left"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between">
                        <label className="text-xs text-zinc-500">
                          송금 금액
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setTransferAmount(
                              accountData?.account?.availableBalance ?? "0",
                            )
                          }
                          className="text-[10px] text-[#F59E0B] hover:underline"
                        >
                          전액
                        </button>
                      </div>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={transferAmount}
                        onChange={(e) =>
                          setTransferAmount(e.target.value.replace(/\D/g, ""))
                        }
                        className="w-full bg-[#1f232b] text-white placeholder-zinc-600 text-base lg:text-sm px-3 py-2.5 rounded-lg outline-none tabular-nums text-left"
                      />
                      <span className="text-[10px] text-zinc-600">
                        주문가능금액{" "}
                        {fmtWon(accountData?.account?.availableBalance ?? "0")}{" "}
                        KRW
                      </span>
                      {transferInsufficientBalance && (
                        <p className="text-[11px] text-[#f6465d]">
                          주문 가능 금액이 부족합니다.
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between">
                        <label className="text-xs text-zinc-500">
                          보내는 사람 이름
                        </label>
                        <span className="text-[10px] text-zinc-600">선택</span>
                      </div>
                      <input
                        type="text"
                        maxLength={20}
                        value={transferAlias}
                        onChange={(e) => setTransferAlias(e.target.value)}
                        placeholder={
                          selectedAccount
                            ? String(selectedAccount.accountNumber)
                            : "계좌번호로 표시됩니다"
                        }
                        className="w-full bg-[#1f232b] text-white placeholder-zinc-600 text-base lg:text-sm px-3 py-2.5 rounded-lg outline-none text-left"
                      />
                      <span className="text-[10px] text-zinc-600">
                        받는 사람에게 이 이름으로 표시됩니다
                      </span>
                    </div>

                    <button
                      onClick={handleTransfer}
                      disabled={
                        transferLoading ||
                        !transferTarget ||
                        transferAmountInt < 1 ||
                        transferInsufficientBalance
                      }
                      className="py-3 rounded-lg text-sm font-bold disabled:opacity-50 bg-[#F59E0B] text-gray-900 shrink-0"
                    >
                      {transferLoading ? "처리중..." : "송금"}
                    </button>
                  </div>

                  <div className="flex-6 min-w-0 w-full flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">
                        송금 내역
                        {transferTotal > 0 && (
                          <span className="ml-1.5 text-zinc-600 tabular-nums">
                            {transferTotal}
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setTransferSort(
                              transferSort === "LATEST" ? "OLDEST" : "LATEST",
                            )
                          }
                          className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          {transferSort === "LATEST" ? "최신순" : "오래된순"} ⇅
                        </button>
                        <button
                          type="button"
                          onClick={refreshTransferHistory}
                          disabled={transferHistoryLoading}
                          aria-label="송금 내역 새로고침"
                          className="flex items-center justify-center w-5 h-5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-[#1f232b] disabled:hover:bg-transparent transition-colors"
                        >
                          <svg
                            className={`w-3 h-3 ${transferHistoryLoading ? "animate-spin" : ""}`}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                            <polyline points="21 3 21 9 15 9" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* 보낸/받은 필터 */}
                    <div className="flex items-center gap-1">
                      {TRANSFER_FILTERS.map((f) => (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => setTransferDirection(f.key)}
                          className={`px-2.5 py-1 rounded-md text-[11px] transition-colors ${
                            transferDirection === f.key
                              ? "bg-[#1f232b] text-white"
                              : "text-zinc-500 hover:text-zinc-300"
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>

                    <div className="rounded-lg border border-[#2b2f36] divide-y divide-[#2b2f36]">
                      {transferHistoryLoading ? (
                        <p className="py-10 text-center text-xs text-zinc-500">
                          불러오는 중...
                        </p>
                      ) : transferHistory.length === 0 ? (
                        <p className="py-10 text-center text-xs text-zinc-500">
                          송금 내역이 없습니다
                        </p>
                      ) : (
                        transferHistory.map((t) => {
                          const sent = t.direction === "SENT";
                          const statusLabel = TRANSFER_STATUS_LABEL[t.status];
                          return (
                            <div
                              key={t.id}
                              className="flex items-center justify-between px-3 py-2.5 text-xs"
                            >
                              <div className="flex flex-col gap-0.5 min-w-0">
                                <span className="text-white truncate">
                                  <span className="text-zinc-500 mr-1">
                                    {sent ? "→" : "←"}
                                  </span>
                                  {sent
                                    ? t.recipientAccountNumber
                                    : t.senderName}
                                </span>
                                <span className="text-zinc-500">
                                  {fmtTransferTime(t.createdAt)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {statusLabel && (
                                  <span
                                    title={
                                      t.rejectReason
                                        ? (TRANSFER_REJECT_LABEL[
                                            t.rejectReason
                                          ] ?? t.rejectReason)
                                        : undefined
                                    }
                                    className={`px-1.5 py-0.5 rounded text-[10px] ${
                                      t.status === "REJECTED"
                                        ? "bg-[#f6465d]/10 text-[#f6465d]"
                                        : "bg-[#1f232b] text-zinc-400"
                                    }`}
                                  >
                                    {statusLabel}
                                  </span>
                                )}
                                <span
                                  className={`tabular-nums ${
                                    t.status === "REJECTED"
                                      ? "text-zinc-600 line-through"
                                      : sent
                                        ? "text-[#f6465d]"
                                        : "text-[#0ecb81]"
                                  }`}
                                >
                                  {sent ? "-" : "+"}
                                  {fmtWon(t.amount)} KRW
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* 페이지 이동 */}
                    {transferTotalPages > 1 && (
                      <div className="flex items-center justify-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => goToTransferPage(transferPage - 1)}
                          disabled={transferPage <= 1 || transferHistoryLoading}
                          className="px-2 py-1 rounded-md text-xs text-zinc-500 hover:text-white hover:bg-[#1f232b] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-500 transition-colors"
                        >
                          ‹
                        </button>
                        <span className="text-[11px] text-zinc-500 tabular-nums">
                          {transferPage} / {transferTotalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => goToTransferPage(transferPage + 1)}
                          disabled={
                            transferPage >= transferTotalPages ||
                            transferHistoryLoading
                          }
                          className="px-2 py-1 rounded-md text-xs text-zinc-500 hover:text-white hover:bg-[#1f232b] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-500 transition-colors"
                        >
                          ›
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 중: 호가창 (기존 렌더 폭 유지) */}
        <div
          className={`absolute inset-x-3 inset-y-2.5 lg:static lg:w-[calc(30%-16px)] lg:shrink-0 ${mobileTab === "호가" ? "visible" : "invisible pointer-events-none"} lg:visible lg:pointer-events-auto`}
        >
          <OrderBook
            data={data}
            loading={orderbookLoading}
            isMarketClosed={isMarketClosed}
          />
        </div>

        {/* 우: 주문 + 등락률 (모바일에서는 서로 다른 탭이라 wrapper를 contents로 지워 형제로 만든다) */}
        <div className="contents lg:flex lg:flex-2 lg:min-w-0 lg:flex-col lg:gap-2.5">
          <div
            className={`absolute inset-x-3 inset-y-2.5 lg:static lg:flex-58 lg:min-h-0 bg-[#181a20] rounded-xl p-4 flex flex-col ${mobileTab === "주문" ? "visible" : "invisible pointer-events-none"} lg:visible lg:pointer-events-auto`}
          >
            <div className="flex items-center gap-3 mb-2 shrink-0 pb-2">
              <button
                onClick={() => setOrderType("매수")}
                className={`text-sm ${orderType === "매수" ? "text-[#f6465d] font-bold" : "text-zinc-400"}`}
              >
                매수
              </button>
              <button
                onClick={() => setOrderType("매도")}
                className={`text-sm ${orderType === "매도" ? "text-[#2563eb] font-bold" : "text-zinc-400"}`}
              >
                매도
              </button>
              <div className="w-px h-3 bg-[#2b2f36]" />
              <button
                onClick={() => setOrderType("정정")}
                className={`text-sm ${orderType === "정정" ? "text-[#F59E0B] font-bold" : "text-zinc-400"}`}
              >
                정정
              </button>
              <button
                onClick={() => setOrderType("취소")}
                className={`text-sm ${orderType === "취소" ? "text-zinc-300 font-bold" : "text-zinc-400"}`}
              >
                취소
              </button>
            </div>

            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex flex-col gap-2 flex-1 overflow-y-auto scrollbar-thin min-h-0">
                {(orderType === "매수" || orderType === "매도") && (
                  <>
                    <div className="shrink-0">
                      <label className="text-xs text-zinc-500 mb-1 block">
                        주문계좌
                      </label>
                      <select
                        value={selectedAccount?.id ?? ""}
                        onChange={(e) => {
                          const account = accounts.find(
                            (a) => a.id === Number(e.target.value),
                          );
                          if (account) setSelectedAccount(account);
                        }}
                        className="w-full bg-[#1f232b] text-white text-base lg:text-xs px-3 py-2 rounded-lg outline-none"
                      >
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.accountNumber}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="shrink-0">
                      <label className="text-xs text-zinc-500 mb-1 block">
                        주문유형
                      </label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setPriceType("지정가")}
                          className={`flex-1 py-2 text-xs rounded-lg ${priceType === "지정가" ? "bg-[#1f232b] text-white font-semibold" : "bg-transparent text-zinc-500 hover:text-zinc-300"}`}
                        >
                          지정가
                        </button>
                        <button
                          onClick={() => setPriceType("시장가")}
                          className={`flex-1 py-2 text-xs rounded-lg ${priceType === "시장가" ? "bg-[#1f232b] text-white font-semibold" : "bg-transparent text-zinc-500 hover:text-zinc-300"}`}
                        >
                          시장가
                        </button>
                      </div>
                    </div>

                    {priceType === "지정가" && (
                      <div className="shrink-0">
                        <StepperInput
                          label="주문가격"
                          value={price}
                          onChange={setPrice}
                          onStep={stepPrice}
                          hint={`호가 단위 ${getTickSize(parseInt(price) || 0).toLocaleString("ko-KR")} KRW`}
                        />
                      </div>
                    )}

                    <div className="shrink-0">
                      <StepperInput
                        label="주문수량"
                        value={quantity}
                        onChange={setQuantity}
                        onStep={(current, dir) => Math.max(0, current + dir)}
                      />
                    </div>

                    <div className="shrink-0 pt-1 pb-0.5">
                      <div className="relative flex items-center h-3.5">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={orderPercent}
                          onChange={(e) => {
                            const raw = Number(e.target.value);
                            const pct =
                              PERCENT_SNAP_POINTS.find(
                                (p) =>
                                  Math.abs(raw - p) <= PERCENT_SNAP_THRESHOLD,
                              ) ?? raw;
                            setOrderPercent(pct);
                            const qty = computeQuantityForPercent(pct);
                            if (qty !== null) setQuantity(qty);
                          }}
                          style={{
                            background: `linear-gradient(to right, ${orderType === "매수" ? "#f6465d" : "#2563eb"} ${sliderThumbLeft(orderPercent)}, #2b2f36 ${sliderThumbLeft(orderPercent)})`,
                          }}
                          className="relative z-10 w-full h-1.5 rounded-full appearance-none cursor-pointer outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:cursor-pointer"
                        />
                        {PERCENT_SNAP_POINTS.map(
                          (tick) =>
                            orderPercent < tick && (
                              <div
                                key={tick}
                                className="absolute top-1/2 z-20 -translate-y-1/2 -translate-x-1/2 pointer-events-none w-2 h-2 rounded-full"
                                style={{
                                  left: sliderThumbLeft(tick),
                                  backgroundColor: "#54585f",
                                }}
                              />
                            ),
                        )}
                      </div>
                      <div className="relative h-3 mt-1">
                        {PERCENT_SNAP_POINTS.map((tick) =>
                          tick === 0 ? (
                            <span
                              key={tick}
                              className="absolute left-0 text-[10px] text-zinc-500"
                            >
                              {tick}%
                            </span>
                          ) : tick === 100 ? (
                            <span
                              key={tick}
                              className="absolute right-0 text-[10px] text-zinc-500"
                            >
                              {tick}%
                            </span>
                          ) : (
                            <span
                              key={tick}
                              className="absolute -translate-x-1/2 text-[10px] text-zinc-500"
                              style={{ left: sliderThumbLeft(tick) }}
                            >
                              {tick}%
                            </span>
                          ),
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between shrink-0 px-1 text-sm lg:text-xs">
                      <span className="text-zinc-500">총 주문 금액</span>
                      <span className="text-white font-semibold tabular-nums">
                        {orderTotalAmount.toLocaleString("ko-KR")} KRW
                      </span>
                    </div>
                  </>
                )}

                {orderType === "정정" &&
                  (selectedOrder ? (
                    <>
                      <div className="px-3 py-2 bg-[#1f232b] rounded-lg text-sm lg:text-xs flex flex-col gap-1.5 shrink-0">
                        <div className="flex justify-between">
                          <span className="text-zinc-400">주문 ID</span>
                          <span className="text-white">
                            #{selectedOrder.id}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-400">종목</span>
                          <span className="text-white">
                            {selectedOrder.stockName}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-400">유형</span>
                          <span
                            className={
                              selectedOrder.tradingType === "BUY"
                                ? "text-[#f6465d]"
                                : "text-[#2563eb]"
                            }
                          >
                            {selectedOrder.tradingType === "BUY"
                              ? "매수"
                              : "매도"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-400">현재 가격</span>
                          <span className="text-white">
                            {Number(selectedOrder.price).toLocaleString(
                              "ko-KR",
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0">
                        <StepperInput
                          label="정정 가격"
                          value={amendPrice}
                          onChange={setAmendPrice}
                          onStep={stepPrice}
                          hint={`호가 단위 ${getTickSize(parseInt(amendPrice) || 0).toLocaleString("ko-KR")} KRW`}
                        />
                        {amendInsufficientBalance && (
                          <p className="mt-1.5 text-[11px] text-[#f6465d]">
                            주문 가능 금액이 부족합니다. (추가로 필요한 금액{" "}
                            {amendExtraCost.toLocaleString("ko-KR")} KRW)
                          </p>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-zinc-500 text-center py-6">
                      미체결 탭에서 주문을 선택하세요
                    </p>
                  ))}

                {orderType === "취소" &&
                  (selectedOrder ? (
                    <div className="px-3 py-2 bg-[#1f232b] rounded-lg text-xs flex flex-col gap-1.5 shrink-0">
                      <div className="flex justify-between">
                        <span className="text-zinc-400">주문 ID</span>
                        <span className="text-white">#{selectedOrder.id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">종목</span>
                        <span className="text-white">
                          {selectedOrder.stockName}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">유형</span>
                        <span
                          className={
                            selectedOrder.tradingType === "BUY"
                              ? "text-[#f6465d]"
                              : "text-[#2563eb]"
                          }
                        >
                          {selectedOrder.tradingType === "BUY"
                            ? "매수"
                            : "매도"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">수량</span>
                        <span className="text-white">
                          {Number(selectedOrder.quantity).toLocaleString(
                            "ko-KR",
                          )}
                          주
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">가격</span>
                        <span className="text-white">
                          {Number(selectedOrder.price) === 0
                            ? "시장가"
                            : Number(selectedOrder.price).toLocaleString(
                                "ko-KR",
                              )}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500 text-center py-6">
                      미체결 탭에서 주문을 선택하세요
                    </p>
                  ))}
              </div>

              {(orderType === "매수" || orderType === "매도") && (
                <>
                  {priceType === "시장가" && (
                    <div className="shrink-0 mt-3 text-[10px] leading-relaxed text-zinc-500">
                      시장가 주문은 주문가격이 상한가/하한가로 지정되며, 체결할
                      주문이 없을 시 남은 잔량은 자동으로 취소됩니다.
                    </div>
                  )}
                  <div className="relative group mt-3 shrink-0">
                    <button
                      onClick={handleOrder}
                      disabled={orderLoading || isMarketClosed}
                      className={`w-full py-3 rounded-lg text-sm font-bold tabular-nums disabled:opacity-50 disabled:cursor-not-allowed ${orderType === "매수" ? "bg-[#f6465d] text-white" : "bg-[#2563eb] text-white"}`}
                    >
                      {orderLoading
                        ? "처리중..."
                        : isMarketClosed
                          ? closedCountdownLabel
                          : orderType}
                    </button>
                    {isMarketClosed && (
                      <div className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#2b2f36] px-2.5 py-1.5 text-[11px] text-zinc-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                        지금 휴장 중입니다. 재개까지 {closedCountdownLabel}
                      </div>
                    )}
                  </div>
                </>
              )}
              {orderType === "정정" && selectedOrder && (
                <div className="relative group mt-3 shrink-0">
                  <button
                    onClick={handleAmend}
                    disabled={
                      amendLoading ||
                      amendInsufficientBalance ||
                      isMarketClosed ||
                      parseInt(amendPrice) ===
                        Math.trunc(Number(selectedOrder.price))
                    }
                    className="w-full py-3 rounded-lg text-sm font-bold tabular-nums disabled:opacity-50 disabled:cursor-not-allowed bg-[#F59E0B] text-gray-900"
                  >
                    {amendLoading
                      ? "처리중..."
                      : isMarketClosed
                        ? closedCountdownLabel
                        : "정정 확인"}
                  </button>
                  {isMarketClosed && (
                    <div className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#2b2f36] px-2.5 py-1.5 text-[11px] text-zinc-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                      지금 휴장 중입니다. 재개까지 {closedCountdownLabel}
                    </div>
                  )}
                </div>
              )}
              {orderType === "취소" && selectedOrder && (
                <div className="relative group mt-3 shrink-0">
                  <button
                    onClick={handleCancel}
                    disabled={cancelLoading || isMarketClosed}
                    className="w-full py-3 rounded-lg text-sm font-bold tabular-nums disabled:opacity-50 disabled:cursor-not-allowed bg-[#f6465d] hover:bg-[#e03650] text-white"
                  >
                    {cancelLoading
                      ? "처리중..."
                      : isMarketClosed
                        ? closedCountdownLabel
                        : "주문 취소 확인"}
                  </button>
                  {isMarketClosed && (
                    <div className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#2b2f36] px-2.5 py-1.5 text-[11px] text-zinc-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                      지금 휴장 중입니다. 재개까지 {closedCountdownLabel}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div
            className={`absolute inset-x-3 inset-y-2.5 lg:static lg:flex-42 lg:min-h-0 bg-[#181a20] rounded-xl p-4 flex flex-col ${mobileTab === "시세" ? "visible" : "invisible pointer-events-none"} lg:visible lg:pointer-events-auto`}
          >
            <div className="flex items-center gap-3 mb-3 shrink-0">
              <button
                onClick={() => setMarketTab("실시간 등락률")}
                className={`text-sm ${marketTab === "실시간 등락률" ? "text-white" : "text-zinc-400"}`}
              >
                실시간 등락률
              </button>
              <div className="w-px h-3 bg-[#2b2f36]" />
              <button
                onClick={() => setMarketTab("랭킹")}
                className={`flex items-center gap-1 text-sm ${marketTab === "랭킹" ? "text-white" : "text-zinc-400"}`}
              >
                랭킹
                <span className="px-1 py-0.5 rounded text-[9px] font-semibold leading-none bg-[#2b2f36] text-zinc-400">
                  TOP 10
                </span>
              </button>
              {/* 금액 표기 방식은 큰 숫자가 나오는 랭킹 탭에서만 고른다 */}
              <div
                className={`ml-auto flex items-center gap-1 shrink-0 ${marketTab === "랭킹" ? "" : "invisible"}`}
              >
                {(["원본", "간략"] as AmountMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setAmountMode(mode)}
                    title={
                      mode === "원본"
                        ? "숫자를 원래 자릿수 그대로 표시"
                        : "만/억/조 단위로 줄여서 표시"
                    }
                    className={`px-2 py-0.5 rounded text-[10px] ${amountMode === mode ? "bg-[#1f232b] text-white font-semibold" : "text-zinc-500 hover:text-zinc-300"}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-auto scrollbar-thin">
              {marketTab === "실시간 등락률" && (
                <table className="w-full text-sm lg:text-xs">
                  <thead className="text-zinc-500 border-b border-[#2b2f36]">
                    <tr>
                      <th className="text-left py-1 w-11">순위</th>
                      <th className="text-left py-1">종목명</th>
                      <th className="text-right py-1">현재가</th>
                      <th className="text-right py-1">등락률</th>
                    </tr>
                  </thead>
                  <tbody className="text-white">
                    {stocks.map((stock, i) => {
                      const per = stock.changeRate;
                      const color =
                        per > 0
                          ? "text-[#f6465d]"
                          : per < 0
                            ? "text-[#2563eb]"
                            : "text-white";
                      return (
                        <tr
                          key={stock.id}
                          className="border-b border-[#2b2f36]"
                        >
                          <td className="py-1.5">
                            <div className="flex items-center gap-1">
                              <span>{i + 1}</span>
                              <RankBadge
                                change={stockRankChanges.get(stock.id)}
                              />
                            </div>
                          </td>
                          <td className="py-1.5">{stock.name}</td>
                          <td className="text-right py-1.5">
                            {Number(stock.price).toLocaleString("ko-KR")}
                          </td>
                          <td className={`text-right py-1.5 ${color}`}>
                            {per > 0 ? "+" : ""}
                            {per.toFixed(2)}%
                          </td>
                        </tr>
                      );
                    })}
                    {stocksLoading && stocks.length === 0 && (
                      <TableSkeleton columns={4} rows={5} />
                    )}
                    {!stocksLoading && stocks.length === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="pt-12 pb-4 text-center text-zinc-500"
                        >
                          종목 데이터 없음
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              {marketTab === "랭킹" && (
                <table className="w-full table-fixed text-sm lg:text-xs">
                  <colgroup>
                    <col className="w-11" />
                    <col />
                    <col className="w-[42%]" />
                  </colgroup>
                  <thead className="text-zinc-500 border-b border-[#2b2f36]">
                    <tr>
                      <th className="text-left py-1">순위</th>
                      <th className="text-left py-1">아이디</th>
                      <th className="text-right py-1">평가자산</th>
                    </tr>
                  </thead>
                  <tbody className="text-white">
                    {rankings?.map((item) => (
                      <tr key={item.rank} className="border-b border-[#2b2f36]">
                        <td className="py-1.5 tabular-nums">
                          <div className="flex items-center gap-1">
                            <span>{item.rank}</span>
                            <RankBadge
                              change={rankingRankChanges.get(item.username)}
                            />
                          </div>
                        </td>
                        {/* 아이디가 길면 잘리지만, 드래그해서 가로로 밀면 끝까지 볼 수 있다 */}
                        <td className="py-1.5 pr-2">
                          <div
                            title={item.username}
                            className="overflow-x-auto whitespace-nowrap cursor-text"
                          >
                            {item.username}
                          </div>
                        </td>
                        <td className="text-right py-1.5 tabular-nums">
                          {amountMode === "원본"
                            ? `${fmtWon(toWonInt(item.totalAssets))} KRW`
                            : fmtCompactWon(toWonInt(item.totalAssets))}
                        </td>
                      </tr>
                    ))}
                    {rankingLoading && !rankings && (
                      <TableSkeleton columns={3} rows={5} />
                    )}
                    {!rankingLoading && rankings?.length === 0 && (
                      <tr>
                        <td
                          colSpan={3}
                          className="pt-12 pb-4 text-center text-zinc-500"
                        >
                          랭킹 데이터 없음
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 모바일 하단 탭바 — lg 이상에서는 완전히 숨기고(데스크톱은 다섯 패널 모두 상시 표시),
          그 아래 iOS 홈 인디케이터 영역만큼 safe-area 패딩을 더해준다. */}
      <div className="shrink-0 lg:hidden flex items-stretch bg-[#181a20] border-t border-[#21242b] pb-[env(safe-area-inset-bottom)]">
        {MOBILE_TABS.map((tab) => {
          const active = mobileTab === tab;
          const Icon = MOBILE_TAB_ICONS[tab];
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setMobileTab(tab)}
              aria-label={tab}
              aria-current={active ? "page" : undefined}
              className="flex-1 flex items-center justify-center min-h-12"
            >
              <span
                className={`flex items-center justify-center px-4 py-1.5 rounded-lg transition-colors ${
                  active ? "bg-[#F59E0B]/12 text-[#F59E0B]" : "text-zinc-500"
                }`}
              >
                <Icon />
              </span>
            </button>
          );
        })}
      </div>

      {toast && (
        <Toast toast={toast} leaving={toastLeaving} onClose={hideToast} />
      )}
    </div>
  );
}
