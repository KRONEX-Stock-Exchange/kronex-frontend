import type { StockInfo } from "../../hooks/useOrderbook";

interface StockHeaderProps {
  stockInfo: StockInfo | null;
}

export function StockHeader({ stockInfo }: StockHeaderProps) {
  if (!stockInfo) return null;

  const price = parseFloat(stockInfo.price);
  const previousClose = parseFloat(stockInfo.previousClose);
  const change = price - previousClose;
  const changePercent = (change / previousClose) * 100;

  const isPositive = change >= 0;
  const priceColor =
    change > 0
      ? "text-[#f6465d]"
      : change < 0
        ? "text-[#2563eb]"
        : "text-white";

  return (
    <div className="flex items-center gap-4 px-4 py-2 mx-7 mt-2 bg-[#181a20] rounded-xl">
      {/* 주식 이미지 + 이름 */}
      <div className="flex items-center gap-2">
        <img
          src="https://picsum.photos/32/32"
          alt={stockInfo.name}
          className="w-8 h-8 rounded-full"
        />
        <span className="text-white font-bold">{stockInfo.name}</span>
        <span className="text-zinc-500 text-xs">#{stockInfo.id}</span>
      </div>

      {/* 현재가 */}
      <span className={`text-xl font-bold ${priceColor}`}>
        {price.toLocaleString()}
      </span>

      {/* 변동률 */}
      <span className={`text-sm ${priceColor}`}>
        {isPositive ? "+" : ""}
        {changePercent.toFixed(2)}%
      </span>
    </div>
  );
}
