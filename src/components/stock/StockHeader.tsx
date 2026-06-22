import { useState, useEffect, useRef } from "react";
import type { StockInfo } from "../../hooks/useOrderbook";

interface StockListItem {
  id: number;
  name: string;
  price: string;
  per: string;
}

interface StockHeaderProps {
  stockInfo: StockInfo | null;
  stocks: StockListItem[];
  selectedStockId: number;
  onSelectStock: (id: number) => void;
}

export function StockHeader({ stockInfo, stocks, selectedStockId, onSelectStock }: StockHeaderProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const price = stockInfo ? parseFloat(stockInfo.price) : 0;
  const previousClose = stockInfo ? parseFloat(stockInfo.previousClose) : 0;
  const change = price - previousClose;
  const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;
  const isPositive = change >= 0;
  const priceColor = change > 0 ? "text-[#f6465d]" : change < 0 ? "text-[#2563eb]" : "text-white";

  return (
    <div ref={containerRef} className="relative mx-7 mt-2">
      {/* 헤더 바 */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 px-4 py-2 bg-[#181a20] rounded-xl hover:bg-[#1f2230] transition-colors"
      >
        {stockInfo ? (
          <>
            <div className="flex items-center gap-2">
              <img
                src="https://picsum.photos/32/32"
                alt={stockInfo.name}
                className="w-8 h-8 rounded-full"
              />
              <span className="text-white font-bold">{stockInfo.name}</span>
              <span className="text-zinc-500 text-xs">#{stockInfo.id}</span>
            </div>
            <span className={`text-xl font-bold ${priceColor}`}>
              {price.toLocaleString()}
            </span>
            <span className={`text-sm ${priceColor}`}>
              {isPositive ? "+" : ""}{changePercent.toFixed(2)}%
            </span>
            <span className="ml-auto text-zinc-500 text-xs">▼ 종목 선택</span>
          </>
        ) : (
          <span className="text-zinc-500 text-sm">종목을 선택하세요 ▼</span>
        )}
      </button>

      {/* 드롭다운 종목 리스트 */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#181a20] border border-[#2b2f36] rounded-xl z-50 overflow-hidden shadow-2xl">
          <div className="max-h-72 overflow-y-auto scrollbar-thin">
            {/* 헤더 */}
            <div className="grid grid-cols-4 px-4 py-2 border-b border-[#2b2f36] text-xs text-zinc-500">
              <span>종목명</span>
              <span className="text-right">현재가</span>
              <span className="text-right">등락률</span>
              <span className="text-right">ID</span>
            </div>
            {stocks.map((stock) => {
              const per = parseFloat(stock.per);
              const perColor = per > 0 ? "text-[#f6465d]" : per < 0 ? "text-[#2563eb]" : "text-white";
              const isSelected = stock.id === selectedStockId;
              return (
                <button
                  key={stock.id}
                  onClick={() => {
                    onSelectStock(stock.id);
                    setOpen(false);
                  }}
                  className={`w-full grid grid-cols-4 px-4 py-2.5 text-xs hover:bg-[#2b2f36] transition-colors ${
                    isSelected ? "bg-[#23272f]" : ""
                  }`}
                >
                  <span className={`text-left font-medium ${isSelected ? "text-[#F59E0B]" : "text-white"}`}>
                    {stock.name}
                  </span>
                  <span className="text-right text-white">
                    {Number(stock.price).toLocaleString("ko-KR")}
                  </span>
                  <span className={`text-right ${perColor}`}>
                    {per > 0 ? "+" : ""}{per.toFixed(2)}%
                  </span>
                  <span className="text-right text-zinc-500">#{stock.id}</span>
                </button>
              );
            })}
            {stocks.length === 0 && (
              <div className="px-4 py-6 text-center text-zinc-500 text-xs">종목 데이터 없음</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
