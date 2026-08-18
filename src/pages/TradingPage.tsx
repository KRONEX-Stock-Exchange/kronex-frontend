import { useState, useEffect, useRef, useMemo, Fragment } from "react";
import { Toast, type ToastData } from "../components/common/Toast";
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

const fmtWon = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const fmtTime = (value?: string) =>
  value ? new Date(value).toLocaleTimeString("ko-KR") : "-";

const PERCENT_SNAP_POINTS = [0, 25, 50, 75, 100];
const PERCENT_SNAP_THRESHOLD = 4;
// 슬라이더 thumb(w-3.5 = 14px)의 중심은 트랙 양 끝에서 반지름만큼 안쪽에서 움직이므로
// 눈금/채움 위치도 같은 공식으로 계산해야 thumb과 픽셀 단위로 어긋나지 않는다.
const SLIDER_THUMB_SIZE = 14;
const sliderThumbLeft = (pct: number) =>
  `calc(${SLIDER_THUMB_SIZE / 2}px + (100% - ${SLIDER_THUMB_SIZE}px) * ${pct / 100})`;

type OrderTypeTab = "매수" | "매도" | "정정" | "취소";
type AccountTab = "계좌" | "체결" | "미체결" | "송금";

// 계좌 요약에서 현금 항목과 평가 항목을 구분하는 세로 구분자
function GroupDivider() {
  return (
    <span
      aria-hidden
      className="select-none self-center text-sm leading-none text-[#3b3f46]"
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
          className="w-full min-w-0 bg-transparent text-white text-xs px-3 py-2 outline-none"
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

export function TradingPage() {
  const [chartPanel, setChartPanel] = useState<HTMLDivElement | null>(null);
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

  const [accountTab, setAccountTab] = useState<AccountTab>("계좌");
  const [orderType, setOrderType] = useState<OrderTypeTab>("매수");
  const [priceType, setPriceType] = useState<"지정가" | "시장가">("지정가");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [orderPercent, setOrderPercent] = useState(0);
  const [orderLoading, setOrderLoading] = useState(false);
  const [stocks, setStocks] = useState<StockItem[]>([]);

  const [toast, setToast] = useState<ToastData | null>(null);
  const [toastLeaving, setToastLeaving] = useState(false);
  const toastTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);
  const [amendPrice, setAmendPrice] = useState("");
  const [amendLoading, setAmendLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

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

  useEffect(() => {
    const fetchStocks = async () => {
      const response = await apiClient.get<StockItem[]>("/stocks");
      if (response.success && response.data) {
        setStocks(response.data);
        setStockId((prev) => prev ?? response.data![0]?.id ?? null);
      }
    };
    fetchStocks();
    const interval = setInterval(fetchStocks, 30000);
    return () => clearInterval(interval);
  }, []);

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
      return showToast("가격은 1원 이상 입력해주세요.", "error");
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

  const selectOrder = (order: OrderItem) => {
    setSelectedOrder(order);
    if (orderType === "매수" || orderType === "매도") {
      setOrderType("정정");
      setAmendPrice(order.price);
    } else if (orderType === "정정") {
      setAmendPrice(order.price);
    }
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* 종목 선택 바는 거래 화면 전체 폭을 사용한다. */}
      <div className="shrink-0 px-5 pt-2.5">
        <StockHeader
          stockInfo={data?.stockInfo ?? null}
          stocks={stocks}
          selectedStockId={stockId}
          onSelectStock={setStockId}
          contentWidthTarget={chartPanel}
        />
      </div>

      <div className="flex flex-1 min-h-0 gap-2.5 px-5 pt-2.5 pb-2.5">
        {/* 좌: 차트 + 계좌 */}
        <div
          ref={setChartPanel}
          className="flex-5 min-w-0 min-h-0 flex flex-col gap-2.5"
        >
          <div className="flex-52 min-h-0">
            <CandlestickChart stockId={stockId} />
          </div>
          <div className="flex-48 min-h-0 bg-[#181a20] rounded-xl p-4 flex flex-col">
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

            <div
              className="flex-1 min-h-0 overflow-auto scrollbar-thin"
              onScroll={handleAccountPanelScroll}
            >
              {accountTab === "계좌" && (
                <>
                  <div className="mb-3 flex items-center gap-6 pb-2.5">
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
                            <span className="text-[10px] leading-none text-zinc-500">
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
                        <div className="flex min-w-0 flex-col gap-1 mt-1.5">
                          <span className="text-[10px] leading-none text-zinc-500">
                            예수금
                          </span>
                          <span className="inline-block whitespace-nowrap text-xs leading-none text-white font-semibold tabular-nums pt-0.5">
                            {fmtWon(accountData.account.balance)} KRW
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-col gap-1 mt-1.5">
                          <span className="text-[10px] leading-none text-zinc-500">
                            주문가능금액
                          </span>
                          <span className="inline-block whitespace-nowrap text-xs leading-none text-zinc-200 font-semibold tabular-nums pt-0.5">
                            {fmtWon(accountData.account.availableBalance)} KRW
                          </span>
                        </div>
                        <GroupDivider />
                        <div className="flex min-w-0 flex-col gap-1 mt-1.5">
                          <span className="text-[10px] leading-none text-zinc-500">
                            총매입금액
                          </span>
                          <span className="inline-block whitespace-nowrap text-xs leading-none text-zinc-200 font-semibold tabular-nums pt-0.5">
                            {holdingsSummary.totalBuyAmount.toLocaleString(
                              "ko-KR",
                            )}{" "}
                            KRW
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-col gap-1 mt-1.5">
                          <span className="text-[10px] leading-none text-zinc-500">
                            총평가금액
                          </span>
                          <span className="inline-block whitespace-nowrap text-xs leading-none text-zinc-200 font-semibold tabular-nums pt-0.5">
                            {holdingsSummary.totalEvalAmount.toLocaleString(
                              "ko-KR",
                            )}{" "}
                            KRW
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-col gap-1 mt-1.5">
                          <span className="text-[10px] leading-none text-zinc-500">
                            평가손익
                          </span>
                          <span
                            className={`inline-block whitespace-nowrap text-xs leading-none font-semibold tabular-nums pt-0.5 ${
                              holdingsSummary.totalProfit > 0
                                ? "text-[#f6465d]"
                                : holdingsSummary.totalProfit < 0
                                  ? "text-[#2563eb]"
                                  : "text-zinc-200"
                            }`}
                          >
                            {holdingsSummary.totalProfit > 0 ? "+" : ""}
                            {holdingsSummary.totalProfit.toLocaleString("ko-KR")}{" "}
                            KRW
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-col gap-1 mt-1.5">
                          <span className="text-[10px] leading-none text-zinc-500">
                            총수익률
                          </span>
                          <span
                            className={`inline-block whitespace-nowrap text-xs leading-none font-semibold tabular-nums pt-0.5 ${
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
                      <span className="text-[10px] text-zinc-500">
                        현재 계좌
                      </span>
                      <select
                        value={selectedAccount?.id ?? ""}
                        onChange={(e) => {
                          const account = accounts.find(
                            (a) => a.id === Number(e.target.value),
                          );
                          if (account) setSelectedAccount(account);
                        }}
                        className="bg-transparent text-white text-xs px-3 py-1 rounded-lg border border-[#3b3f46] outline-none w-fit"
                      >
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.accountNumber}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <table className="w-full min-w-126.25 table-fixed text-xs">
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
                        <th className="text-right py-2">평균가</th>
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
                </>
              )}

              {accountTab === "체결" && (
                <table className="w-full table-fixed text-xs">
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
                    {loadingMoreFilled && <TableSkeleton columns={9} rows={3} />}
                  </tbody>
                </table>
              )}

              {accountTab === "미체결" && (
                <table className="w-full table-fixed text-xs">
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
                <div className="w-full py-12 text-center text-zinc-500 text-sm">
                  아직 지원하지 않는 기능입니다
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 중: 호가창 (기존 렌더 폭 유지) */}
        <div className="w-[calc(30%-16px)] shrink-0">
          <OrderBook data={data} loading={orderbookLoading} />
        </div>

        {/* 우: 주문 + 등락률 */}
        <div className="flex-2 min-w-0 flex flex-col gap-2.5">
          <div className="flex-58 min-h-0 bg-[#181a20] rounded-xl p-4 flex flex-col">
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
                        className="w-full bg-[#1f232b] text-white text-xs px-3 py-2 rounded-lg outline-none"
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
                          hint={`호가 단위 ${getTickSize(parseInt(price) || 0).toLocaleString("ko-KR")}원`}
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
                            const orderPrice =
                              priceType === "지정가"
                                ? parseInt(price)
                                : parseFloat(
                                    data?.stockInfo?.upperLimit ?? "0",
                                  );
                            if (orderType === "매수") {
                              const availableBalance =
                                accountData?.account?.availableBalance ?? "0";
                              if (orderPrice > 0)
                                setQuantity(
                                  String(
                                    (BigInt(availableBalance) * BigInt(pct)) /
                                      100n /
                                      BigInt(orderPrice),
                                  ),
                                );
                            } else {
                              const holding = accountData?.holdings?.find(
                                (s) => s.stock.id === stockId,
                              );
                              const canSell = parseInt(
                                holding?.availableQuantity ?? "0",
                              );
                              setQuantity(
                                String(Math.floor((canSell * pct) / 100)),
                              );
                            }
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
                  </>
                )}

                {orderType === "정정" &&
                  (selectedOrder ? (
                    <>
                      <div className="px-3 py-2 bg-[#1f232b] rounded-lg text-xs flex flex-col gap-1.5 shrink-0">
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
                          hint={`호가 단위 ${getTickSize(parseInt(amendPrice) || 0).toLocaleString("ko-KR")}원`}
                        />
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
                  <button
                    onClick={handleOrder}
                    disabled={orderLoading}
                    className={`mt-3 py-3 rounded-lg text-sm font-bold disabled:opacity-50 shrink-0 ${orderType === "매수" ? "bg-[#f6465d] text-white" : "bg-[#2563eb] text-white"}`}
                  >
                    {orderLoading ? "처리중..." : orderType}
                  </button>
                </>
              )}
              {orderType === "정정" && selectedOrder && (
                <button
                  onClick={handleAmend}
                  disabled={
                    amendLoading ||
                    parseInt(amendPrice) ===
                      Math.trunc(Number(selectedOrder.price))
                  }
                  className="mt-3 py-3 rounded-lg text-sm font-bold disabled:opacity-50 bg-[#F59E0B] text-gray-900 shrink-0"
                >
                  {amendLoading ? "처리중..." : "정정 확인"}
                </button>
              )}
              {orderType === "취소" && selectedOrder && (
                <button
                  onClick={handleCancel}
                  disabled={cancelLoading}
                  className="mt-3 py-3 rounded-lg text-sm font-bold disabled:opacity-50 bg-[#f6465d] hover:bg-[#e03650] text-white shrink-0"
                >
                  {cancelLoading ? "처리중..." : "주문 취소 확인"}
                </button>
              )}
            </div>
          </div>

          <div className="flex-42 min-h-0 bg-[#181a20] rounded-xl p-4 flex flex-col">
            <div className="text-sm text-zinc-400 mb-3">실시간 등락률</div>
            <div className="flex-1 overflow-auto scrollbar-thin">
              <table className="w-full text-xs">
                <thead className="text-zinc-500 border-b border-[#2b2f36]">
                  <tr>
                    <th className="text-left py-1 w-8">순위</th>
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
                      <tr key={stock.id} className="border-b border-[#2b2f36]">
                        <td className="py-1.5">{i + 1}</td>
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
                  {stocks.length === 0 && (
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
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <Toast toast={toast} leaving={toastLeaving} onClose={hideToast} />
      )}
    </div>
  );
}
