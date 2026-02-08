import { useOrderbook } from "../../hooks/useOrderbook";
import type { StockInfo } from "../../hooks/useOrderbook";
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
  basePrice,
}: {
  matches: MatchItem[];
  basePrice: number;
}) {
  const getPriceColor = (price: number) => {
    if (price > basePrice) return "text-[#f6465d]";
    if (price < basePrice) return "text-[#2563eb]";
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
        {matches.slice(0, 10).map((match, i) => {
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

  const items = [
    { label: "전일종가", value: stockInfo.previousClose },
    { label: "시가", value: stockInfo.open },
    { label: "고가", value: stockInfo.high },
    { label: "저가", value: stockInfo.low },
    { label: "종가", value: stockInfo.close },
  ];

  return (
    <div className="w-full h-full flex flex-col justify-end p-2 px-4">
      {items.map((item, i) => (
        <div
          key={i}
          className="flex justify-between text-xs py-1 border-b border-[#2b2f36]"
        >
          <span className="text-zinc-500">{item.label}</span>
          <span className="text-white">
            {parseFloat(item.value).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

export function OrderBook({ stockId = 1 }: OrderBookProps) {
  const { data } = useOrderbook(stockId);

  // 현재가 (stockInfo.price 기준)
  const basePrice = data?.stockInfo?.price
    ? parseFloat(data.stockInfo.price)
    : 9500;

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

  // 빈 틱 채우기
  const emptySellCount = MAX_TICKS - sortedSellOrders.length;
  const emptyBuyCount = MAX_TICKS - sortedBuyOrders.length;

  return (
    <div className="h-full bg-[#181a20] rounded-2xl overflow-hidden relative">
      {/* 주식 정보 패널 (매도 영역 오른쪽) */}
      <div className="absolute right-0 top-0 w-[38%] h-[50%]">
        <StockInfoPanel stockInfo={data?.stockInfo || null} />
      </div>

      {/* 체결 현황 패널 (매수 영역 왼쪽) */}
      <div className="absolute left-0 bottom-0 w-[38%] h-[50%]">
        <MatchHistory matches={data?.match || []} basePrice={basePrice} />
      </div>

      {/* sell */}
      <div className="h-[50%]">
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
            maxNumber={maxNumber}
          />
        ))}
      </div>
      {/* buy */}
      <div className="h-[50%]">
        {/* 매수 호가 */}
        {sortedBuyOrders.map((order, i) => (
          <Tick
            key={`buy-${i}`}
            type="buy"
            price={order.price}
            number={order.number}
            basePrice={basePrice}
            maxNumber={maxNumber}
          />
        ))}
        {/* 빈 틱 (아래쪽) */}
        {Array.from({ length: emptyBuyCount }).map((_, i) => (
          <EmptyTick key={`empty-buy-${i}`} type="buy" />
        ))}
      </div>
    </div>
  );
}
