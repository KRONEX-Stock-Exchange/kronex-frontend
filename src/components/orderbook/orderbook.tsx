import { useRef, useEffect, useState } from "react";
import { useOrderbook } from "../../hooks/useOrderbook";
import type { StockInfo, OrderbookItem } from "../../hooks/useOrderbook";
import { Tick, EmptyTick } from "./tick";

const MAX_TICKS = 10; // 호가창 최대 행 수

interface OrderBookProps {
  stockId?: number;
}

// 체결 현황 컴포넌트
interface MatchItem {
  price: string;
  number: string;
  type: string;
}

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

  const getNumberColor = (type: string) => {
    return type === "buy" ? "text-[#f6465d]" : "text-[#2563eb]";
  };

  return (
    <div className="w-full h-full flex flex-col p-2 px-4 overflow-hidden">
      <div className="text-xs text-zinc-400 mb-2 border-b border-[#2b2f36] pb-1">
        체결
      </div>
      <div className="flex-1 overflow-y-auto">
        {matches.slice(0, 50).map((match, i) => {
          const priceNum = parseFloat(match.price);
          const numberNum = parseFloat(match.number);
          return (
            <div key={i} className="flex justify-between text-xs py-0.5">
              <span className={getPriceColor(priceNum)}>
                {priceNum.toLocaleString()}
              </span>
              <span className={getNumberColor(match.type)}>
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

  const prev = parseFloat(stockInfo.previousClose);
  const getPercent = (val: string) => {
    const v = parseFloat(val);
    return prev > 0 ? ((v - prev) / prev) * 100 : 0;
  };
  const getColor = (pct: number) => {
    if (pct > 0) return "text-[#f6465d]";
    if (pct < 0) return "text-[#2563eb]";
    return "text-white";
  };

  const items = [
    { label: "전일종가", value: stockInfo.previousClose, showPercent: false },
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
            className="flex justify-between text-xs py-1 border-b border-[#2b2f36]"
          >
            <span className="text-zinc-500">{item.label}</span>
            <span className="flex gap-2">
              {item.showPercent && (
                <span className={color}>
                  {pct > 0 ? "+" : ""}
                  {pct.toFixed(2)}%
                </span>
              )}
              <span className={item.showPercent ? color : "text-white"}>
                {parseFloat(item.value).toLocaleString()}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function OrderBook({ stockId = 1 }: OrderBookProps) {
  const { data } = useOrderbook(stockId);
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
        prevSellRef.current.map((o) => [o.price, parseFloat(o.number)]),
      );
      const prevBuyMap = new Map(
        prevBuyRef.current.map((o) => [o.price, parseFloat(o.number)]),
      );

      // 매도 diff 병합
      for (const order of sellOrders) {
        const prev = prevSellMap.get(order.price);
        if (prev !== undefined) {
          const diff = parseFloat(order.number) - prev;
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
          const diff = parseFloat(order.number) - prev;
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
  const basePrice = data?.stockInfo?.price
    ? parseFloat(data.stockInfo.price)
    : 9500;

  // 전일종가
  const previousClose = data?.stockInfo?.previousClose
    ? parseFloat(data.stockInfo.previousClose)
    : basePrice;

  // 고가/저가
  const highPrice = data?.stockInfo?.high
    ? parseFloat(data.stockInfo.high)
    : undefined;
  const lowPrice = data?.stockInfo?.low
    ? parseFloat(data.stockInfo.low)
    : undefined;

  // 매도/매수 데이터
  const sellOrders = data?.sellOrderbookData || [];
  const buyOrders = data?.buyOrderbookData || [];

  // 최대 수량 계산 (바 너비용)
  const allNumbers = [
    ...sellOrders.map((o) => parseFloat(o.number)),
    ...buyOrders.map((o) => parseFloat(o.number)),
  ];
  const maxNumber = Math.max(...allNumbers, 1);

  // 매도는 가격 높은 순으로 정렬 (높은 가격이 위)
  const sortedSellOrders = [...sellOrders]
    .sort((a, b) => parseFloat(b.price) - parseFloat(a.price))
    .slice(0, MAX_TICKS);

  // 매수는 가격 높은 순으로 정렬 (높은 가격이 위)
  const sortedBuyOrders = [...buyOrders]
    .sort((a, b) => parseFloat(b.price) - parseFloat(a.price))
    .slice(0, MAX_TICKS);

  // 총 잔량
  const sellTotal = sellOrders.reduce((sum, o) => sum + parseFloat(o.number), 0);
  const buyTotal = buyOrders.reduce((sum, o) => sum + parseFloat(o.number), 0);

  // 빈 틱 채우기
  const emptySellCount = MAX_TICKS - sortedSellOrders.length;
  const emptyBuyCount = MAX_TICKS - sortedBuyOrders.length;

  return (
    <div className="h-full bg-[#181a20] rounded-2xl overflow-hidden relative">
      {/* 주식 정보 패널 (매도 영역 오른쪽) */}
      <div className="absolute right-0 top-0 w-[38%] h-[48%]">
        <StockInfoPanel stockInfo={data?.stockInfo || null} />
      </div>

      {/* 체결 현황 패널 (매수 영역 왼쪽) */}
      <div className="absolute left-0 bottom-[4%] w-[38%] h-[48%]">
        <MatchHistory
          matches={data?.match || []}
          previousClose={
            data?.stockInfo?.previousClose
              ? parseFloat(data.stockInfo.previousClose)
              : basePrice
          }
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
            number={order.number}
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
            number={order.number}
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
          <span className="text-xs text-[#2563eb]">
            {sellTotal.toLocaleString()}
          </span>
        </div>
        <div className="w-[15%]" />
        <div className="w-[24%] flex justify-center items-center">
          <span className="text-[10px] text-zinc-500">총 잔량</span>
        </div>
        <div className="w-[15%]" />
        <div className="w-[23%] flex justify-start items-center pl-2">
          <span className="text-xs text-[#f6465d]">
            {buyTotal.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
