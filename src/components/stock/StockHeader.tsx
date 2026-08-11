import { useState, useEffect, useRef } from "react";
import type { StockInfo } from "../../hooks/useOrderbook";

interface StockListItem {
  id: number;
  name: string;
  price: string;
  changeRate: number;
}

interface StockHeaderProps {
  stockInfo: StockInfo | null;
  stocks: StockListItem[];
  selectedStockId: number | null;
  onSelectStock: (id: number) => void;
}

export function StockHeader({ stockInfo, stocks, selectedStockId, onSelectStock }: StockHeaderProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
    else setQuery("");
  }, [open]);

  const price = stockInfo ? parseFloat(stockInfo.price) : 0;
  const prevClose = stockInfo ? parseFloat(stockInfo.prevClose) : 0;
  const change = price - prevClose;
  const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;
  const priceColor = change > 0 ? "text-[#f6465d]" : change < 0 ? "text-[#2563eb]" : "text-white";

  const filtered = stocks.filter((s) =>
    s.name.toLowerCase().includes(query.toLowerCase()) ||
    String(s.id).includes(query)
  );

  return (
    <div ref={containerRef} className="relative mx-7 mt-2">
      {/* 트리거 버튼 */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-2.5 bg-[#1e2026] rounded-xl hover:bg-[#2b2f36] transition-colors border border-transparent hover:border-[#3d4047]"
      >
        {stockInfo ? (
          <>
            <div className="w-8 h-8 rounded-full bg-[#2b2f36] flex items-center justify-center text-xs font-bold text-white shrink-0">
              {stockInfo.name.charAt(0)}
            </div>
            <div className="flex flex-col items-start leading-tight">
              <span className="text-white font-semibold text-sm">{stockInfo.name}</span>
              <span className="text-zinc-500 text-[11px]">#{stockInfo.id}</span>
            </div>
            <div className="flex items-baseline gap-2 ml-2">
              <span className={`text-xl font-bold ${priceColor}`}>
                {price.toLocaleString("ko-KR")}
              </span>
              <span className={`text-xs font-medium ${priceColor}`}>
                {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
              </span>
            </div>
            <svg
              className={`ml-auto w-4 h-4 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </>
        ) : (
          <>
            <div className="w-8 h-8 rounded-full bg-[#2b2f36] shrink-0" />
            <span className="text-zinc-500 text-sm">종목을 선택하세요</span>
            <svg className="ml-auto w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </>
        )}
      </button>

      {/* 드롭다운 */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#1e2026] border border-[#2b2f36] rounded-xl z-50 shadow-2xl overflow-hidden">
          {/* 검색 */}
          <div className="p-3 border-b border-[#2b2f36]">
            <div className="flex items-center gap-2 bg-[#2b2f36] rounded-lg px-3 py-2">
              <svg className="w-3.5 h-3.5 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="종목 검색"
                className="bg-transparent text-white text-xs placeholder-zinc-500 outline-none w-full"
              />
            </div>
          </div>

          {/* 컬럼 헤더 */}
          <div className="grid grid-cols-[1fr_auto_auto] px-4 py-1.5 text-[11px] text-zinc-600">
            <span>종목</span>
            <span className="text-right w-24">현재가</span>
            <span className="text-right w-16">등락률</span>
          </div>

          {/* 리스트 */}
          <div className="max-h-64 overflow-y-auto">
            {filtered.length > 0 ? filtered.map((stock) => {
              const per = stock.changeRate;
              const isUp = per > 0;
              const isDown = per < 0;
              const isSelected = stock.id === selectedStockId;
              const badgeColor = isUp
                ? "bg-[#f6465d]/10 text-[#f6465d]"
                : isDown
                ? "bg-[#2563eb]/10 text-[#2563eb]"
                : "bg-zinc-700/30 text-zinc-400";

              return (
                <button
                  key={stock.id}
                  onClick={() => { onSelectStock(stock.id); setOpen(false); }}
                  className={`w-full grid grid-cols-[1fr_auto_auto] items-center px-4 py-2.5 hover:bg-[#2b2f36] transition-colors ${
                    isSelected ? "bg-[#2b2f36]" : ""
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                      isSelected ? "bg-[#F59E0B]/20 text-[#F59E0B]" : "bg-[#2b2f36] text-zinc-400"
                    }`}>
                      {stock.name.charAt(0)}
                    </div>
                    <div className="flex flex-col items-start leading-tight">
                      <span className={`text-xs font-semibold ${isSelected ? "text-[#F59E0B]" : "text-white"}`}>
                        {stock.name}
                      </span>
                      <span className="text-[10px] text-zinc-600">#{stock.id}</span>
                    </div>
                  </div>

                  <span className="text-xs text-white font-medium text-right w-24">
                    {Number(stock.price).toLocaleString("ko-KR")}
                  </span>

                  <span className={`text-[11px] font-semibold text-right w-16 px-1.5 py-0.5 rounded ${badgeColor}`}>
                    {isUp ? "+" : ""}{per.toFixed(2)}%
                  </span>
                </button>
              );
            }) : (
              <div className="py-8 text-center text-zinc-600 text-xs">검색 결과 없음</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
