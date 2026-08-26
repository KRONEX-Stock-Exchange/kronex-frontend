import { useRef, useEffect, useState } from "react";
import type {
  OrderbookData,
  OrderbookItem,
  MatchItem,
  StockInfo,
} from "../../hooks/useOrderbook";
import { Tick, EmptyTick, SkeletonTick } from "./tick";

const toNum = (s: string | undefined | null) => {
  const n = parseFloat(s ?? "");
  return isNaN(n) ? 0 : n;
};

const MAX_TICKS = 10; // 호가창 최대 행 수
const MARKET_CLOSED_TICKS = 3; // 휴장 시간대엔 위아래 3호가만 보여준다

interface OrderBookProps {
  data: OrderbookData;
  loading?: boolean;
  // UTC 0시~0시5분(자정 직후 5분) 휴장 시간대 여부. true면 호가를 3단만 보여주고 배지를 띄운다.
  isMarketClosed?: boolean;
}

// 체결 현황 컴포넌트
function MatchHistory({
  matches,
  previousClose,
}: {
  matches: MatchItem[];
  previousClose: number;
}) {
  const getPriceColor = (price: number) => {
    if (price > previousClose) return "text-[#f6465d]";
    if (price < previousClose) return "text-[#2563eb]";
    return "text-white";
  };

  const getNumberColor = (type: "BUY" | "SELL") => {
    return type === "BUY" ? "text-[#f6465d]" : "text-[#2563eb]";
  };

  return (
    <div className="w-full h-full flex flex-col p-2 px-4 overflow-hidden">
      <div className="text-sm lg:text-xs text-zinc-400 mb-2 border-b border-[#2b2f36] pb-1">
        체결
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {matches.slice(0, 50).map((match, i) => {
          const priceNum = toNum(match.price);
          const numberNum = toNum(match.quantity);
          return (
            <div
              key={i}
              className="flex justify-between text-sm lg:text-xs py-0.5 tabular-nums lg:normal-nums"
            >
              <span className={`${getPriceColor(priceNum)} whitespace-nowrap`}>
                {priceNum.toLocaleString()}
              </span>
              <span
                className={`${getNumberColor(match.type)} whitespace-nowrap`}
              >
                {numberNum.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 주식 정보 컴포넌트
function StockInfoPanel({ stockInfo }: { stockInfo: StockInfo | null }) {
  if (!stockInfo) return null;

  const prev = toNum(stockInfo.prevClose);
  const getPercent = (val: string) => {
    const v = toNum(val);
    return prev > 0 ? ((v - prev) / prev) * 100 : 0;
  };
  const getColor = (pct: number) => {
    if (pct > 0) return "text-[#f6465d]";
    if (pct < 0) return "text-[#2563eb]";
    return "text-white";
  };

  const items = [
    { label: "전일종가", value: stockInfo.prevClose, showPercent: false },
    { label: "시가", value: stockInfo.open, showPercent: false },
    { label: "고가", value: stockInfo.high, showPercent: true },
    { label: "저가", value: stockInfo.low, showPercent: true },
    { label: "상한가", value: stockInfo.upperLimit, showPercent: true },
    { label: "하한가", value: stockInfo.lowerLimit, showPercent: true },
  ];

  return (
    <div className="w-full h-full flex flex-col justify-end p-2 px-4">
      {items.map((item, i) => {
        const pct = getPercent(item.value);
        const color = getColor(pct);
        return (
          <div
            key={i}
            className="flex justify-between text-sm lg:text-xs py-1 border-b border-[#2b2f36] tabular-nums lg:normal-nums"
          >
            <span className="text-zinc-500 whitespace-nowrap">
              {item.label}
            </span>
            <span className="flex gap-2 whitespace-nowrap">
              {item.showPercent && (
                <span className={color}>
                  {pct > 0 ? "+" : ""}
                  {pct.toFixed(2)}%
                </span>
              )}
              <span className={item.showPercent ? color : "text-white"}>
                {toNum(item.value).toLocaleString()}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function OrderBook({ data, loading, isMarketClosed }: OrderBookProps) {
  const tickCount = isMarketClosed ? MARKET_CLOSED_TICKS : MAX_TICKS;
  const prevSellRef = useRef<OrderbookItem[]>([]);
  const prevBuyRef = useRef<OrderbookItem[]>([]);
  const [sellDiffs, setSellDiffs] = useState<Map<string, number>>(new Map());
  const [buyDiffs, setBuyDiffs] = useState<Map<string, number>>(new Map());
  const diffTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  // 호가 데이터 변경 시 diff 계산 + 가격별 10초 후 제거
  useEffect(() => {
    const sellOrders = data?.sellOrderbookData || [];
    const buyOrders = data?.buyOrderbookData || [];

    if (prevSellRef.current.length > 0 || prevBuyRef.current.length > 0) {
      const prevSellMap = new Map(
        prevSellRef.current.map((o) => [o.price, toNum(o.quantity)]),
      );
      const prevBuyMap = new Map(
        prevBuyRef.current.map((o) => [o.price, toNum(o.quantity)]),
      );

      // 매도 diff 병합
      for (const order of sellOrders) {
        const prev = prevSellMap.get(order.price);
        if (prev !== undefined) {
          const diff = toNum(order.quantity) - prev;
          if (diff !== 0) {
            const key = `sell_${order.price}`;
            // 기존 타이머 제거
            if (diffTimersRef.current.has(key)) {
              clearTimeout(diffTimersRef.current.get(key)!);
            }
            // 기존 diff에 누적
            setSellDiffs((prev) => {
              const next = new Map(prev);
              next.set(order.price, (next.get(order.price) ?? 0) + diff);
              return next;
            });
            // 10초 후 해당 가격만 제거
            diffTimersRef.current.set(
              key,
              setTimeout(() => {
                setSellDiffs((prev) => {
                  const next = new Map(prev);
                  next.delete(order.price);
                  return next;
                });
                diffTimersRef.current.delete(key);
              }, 10000),
            );
          }
        }
      }

      // 매수 diff 병합
      for (const order of buyOrders) {
        const prev = prevBuyMap.get(order.price);
        if (prev !== undefined) {
          const diff = toNum(order.quantity) - prev;
          if (diff !== 0) {
            const key = `buy_${order.price}`;
            if (diffTimersRef.current.has(key)) {
              clearTimeout(diffTimersRef.current.get(key)!);
            }
            setBuyDiffs((prev) => {
              const next = new Map(prev);
              next.set(order.price, (next.get(order.price) ?? 0) + diff);
              return next;
            });
            diffTimersRef.current.set(
              key,
              setTimeout(() => {
                setBuyDiffs((prev) => {
                  const next = new Map(prev);
                  next.delete(order.price);
                  return next;
                });
                diffTimersRef.current.delete(key);
              }, 10000),
            );
          }
        }
      }
    }

    prevSellRef.current = sellOrders.map((o) => ({ ...o }));
    prevBuyRef.current = buyOrders.map((o) => ({ ...o }));
  }, [data]);

  // 언마운트 시 모든 타이머 정리
  useEffect(() => {
    return () => {
      for (const timer of diffTimersRef.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  // 현재가 (stockInfo.price 기준)
  const basePrice = toNum(data?.stockInfo?.price) || 9500;

  // 전일종가
  const previousClose = toNum(data?.stockInfo?.prevClose) || basePrice;

  // 고가/저가 (0이면 undefined로 처리해 하이라이트 비활성화)
  const highPrice = toNum(data?.stockInfo?.high) || undefined;
  const lowPrice = toNum(data?.stockInfo?.low) || undefined;

  // 매도/매수 데이터
  const sellOrders = data?.sellOrderbookData || [];
  const buyOrders = data?.buyOrderbookData || [];

  // 최대 수량 계산 (바 너비용)
  const allNumbers = [
    ...sellOrders.map((o) => toNum(o.quantity)),
    ...buyOrders.map((o) => toNum(o.quantity)),
  ];
  const maxNumber = Math.max(...allNumbers, 1);

  // 매도는 가격 높은 순으로 정렬 (높은 가격이 위, 현재가에 가까울수록 아래)
  // 휴장 중엔 내용을 3단으로만 줄이되, 현재가에서 먼 호가부터 잘라내야 하므로
  // 정렬된 배열의 앞쪽(가격이 먼 쪽)이 아니라 뒤쪽(현재가에 가까운 쪽)을 남긴다.
  const sortedSellOrdersFull = [...sellOrders].sort(
    (a, b) => toNum(b.price) - toNum(a.price),
  );
  const sortedSellOrders = sortedSellOrdersFull.slice(-tickCount);

  // 매수는 가격 높은 순으로 정렬 (높은 가격이 위 = 현재가에 가까움) — 앞쪽을 남기면 된다
  const sortedBuyOrders = [...buyOrders]
    .sort((a, b) => toNum(b.price) - toNum(a.price))
    .slice(0, tickCount);

  // 총 잔량
  const sellTotal = sellOrders.reduce((sum, o) => sum + toNum(o.quantity), 0);
  const buyTotal = buyOrders.reduce((sum, o) => sum + toNum(o.quantity), 0);

  // 빈 틱 채우기 — 내용 칸 수와 무관하게 항상 MAX_TICKS만큼 행 자체는 유지해
  // 휴장 중에도 호가창 뒷배경/행 구조가 사라지지 않게 한다 (내용만 비워짐)
  const emptySellCount = MAX_TICKS - sortedSellOrders.length;
  const emptyBuyCount = MAX_TICKS - sortedBuyOrders.length;

  // 종목 전환 중에는 실제 호가창과 같은 규격의 스켈레톤을 보여준다
  if (loading) {
    return (
      <div className="h-full bg-[#181a20] rounded-xl overflow-hidden">
        <div className="h-[48%]">
          {Array.from({ length: MAX_TICKS }).map((_, i) => (
            <SkeletonTick key={`sk-sell-${i}`} type="sell" index={i} />
          ))}
        </div>
        <div className="h-[48%]">
          {Array.from({ length: MAX_TICKS }).map((_, i) => (
            <SkeletonTick key={`sk-buy-${i}`} type="buy" index={i} />
          ))}
        </div>
        <div className="h-[4%] flex items-center border-t border-[#2b2f36]">
          <div className="w-[23%] flex justify-end pr-2">
            <span className="h-3.5 w-10 animate-pulse rounded-sm bg-[#2b2f36]" />
          </div>
          <div className="w-[15%]" />
          <div className="w-[24%] flex justify-center">
            <span className="h-3.5 w-10 animate-pulse rounded-sm bg-[#2b2f36]" />
          </div>
          <div className="w-[15%]" />
          <div className="w-[23%] flex justify-start pl-2">
            <span className="h-3.5 w-10 animate-pulse rounded-sm bg-[#2b2f36]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-[#181a20] rounded-xl overflow-hidden relative">
      {/* 주식 정보 패널 (매도 영역 오른쪽) */}
      <div className="absolute right-0 top-0 w-[38%] h-[48%]">
        <StockInfoPanel stockInfo={data?.stockInfo || null} />
      </div>

      {/* 체결 현황 패널 (매수 영역 왼쪽) */}
      <div className="absolute left-0 bottom-[4%] w-[38%] h-[48%]">
        <MatchHistory
          matches={data?.match || []}
          previousClose={toNum(data?.stockInfo?.prevClose) || basePrice}
        />
      </div>

      {/* sell */}
      <div className="h-[48%]">
        {/* 빈 틱 (위쪽) */}
        {Array.from({ length: emptySellCount }).map((_, i) => (
          <EmptyTick key={`empty-sell-${i}`} type="sell" />
        ))}
        {/* 매도 호가 */}
        {sortedSellOrders.map((order, i) => (
          <Tick
            key={`sell-${i}`}
            type="sell"
            price={order.price}
            number={order.quantity}
            basePrice={basePrice}
            previousClose={previousClose}
            maxNumber={maxNumber}
            diff={sellDiffs.get(order.price) ?? null}
            highPrice={highPrice}
            lowPrice={lowPrice}
          />
        ))}
      </div>
      {/* buy */}
      <div className="h-[48%]">
        {/* 매수 호가 */}
        {sortedBuyOrders.map((order, i) => (
          <Tick
            key={`buy-${i}`}
            type="buy"
            price={order.price}
            number={order.quantity}
            basePrice={basePrice}
            previousClose={previousClose}
            maxNumber={maxNumber}
            diff={buyDiffs.get(order.price) ?? null}
            highPrice={highPrice}
            lowPrice={lowPrice}
          />
        ))}
        {/* 빈 틱 (아래쪽) */}
        {Array.from({ length: emptyBuyCount }).map((_, i) => (
          <EmptyTick key={`empty-buy-${i}`} type="buy" />
        ))}
      </div>
      {/* 총 잔량 */}
      <div className="h-[4%] flex items-center border-t border-[#2b2f36]">
        <div className="w-[23%] flex justify-end items-center pr-2">
          <span className="text-sm lg:text-xs text-[#2563eb] whitespace-nowrap tabular-nums lg:normal-nums">
            {sellTotal.toLocaleString()}
          </span>
        </div>
        <div className="w-[15%]" />
        <div className="w-[24%] flex justify-center items-center">
          <span className="text-xs lg:text-[10px] text-zinc-500 whitespace-nowrap">
            총 잔량
          </span>
        </div>
        <div className="w-[15%]" />
        <div className="w-[23%] flex justify-start items-center pl-2">
          <span className="text-sm lg:text-xs text-[#f6465d] whitespace-nowrap tabular-nums lg:normal-nums">
            {buyTotal.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
