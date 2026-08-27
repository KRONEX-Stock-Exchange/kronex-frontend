import { useState, useEffect, useLayoutEffect, useRef } from "react";
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
  // 종목 선택 영역(드롭다운 포함)을 차트 패널 폭에 맞춘다.
  contentWidthTarget?: HTMLDivElement | null;
  // 측정한 폭에 곱할 비율. 차트 전체화면에서는 차트 패널이 화면 전체 폭이 되는데,
  // 종목 바까지 쫙 늘리지 않고 평소(호가/주문 패널이 있을 때)처럼 절반만 쓰도록 0.5를 넘긴다.
  contentWidthScale?: number;
  // UTC 0시~0시5분 휴장 시간대 여부. true면 종목 바 옆 빈 공간에 배지를 띄운다.
  isMarketClosed?: boolean;
}

type Category = "전체" | "관심" | "상승" | "하락";
type SortKey = "name" | "price" | "changeRate";

// lg(1024px) 이상을 데스크톱으로 취급. contentWidthTarget 강제 폭 적용 여부를 결정하는 데 쓴다.
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(min-width: 1024px)").matches
      : true,
  );

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return isDesktop;
}

function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
  return (
    <svg className="w-2.5 h-2.5 shrink-0" viewBox="0 0 10 12" fill="none">
      <path
        d="M5 1L8 4.5H2L5 1z"
        fill={active && asc ? "#F59E0B" : "currentColor"}
        opacity={active && !asc ? 0.3 : 1}
      />
      <path
        d="M5 11L2 7.5h6L5 11z"
        fill={active && !asc ? "#F59E0B" : "currentColor"}
        opacity={active && asc ? 0.3 : 1}
      />
    </svg>
  );
}

export function StockHeader({
  stockInfo,
  stocks,
  selectedStockId,
  onSelectStock,
  contentWidthTarget,
  contentWidthScale = 1,
  isMarketClosed,
}: StockHeaderProps) {
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const [contentWidth, setContentWidth] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("전체");
  const [sortKey, setSortKey] = useState<SortKey>("changeRate");
  const [sortAsc, setSortAsc] = useState(false);
  const [favorites, setFavorites] = useState<number[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("stock-favorites") ?? "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const toggleFavorite = (id: number) => {
    setFavorites((prev) => {
      const next = prev.includes(id)
        ? prev.filter((f) => f !== id)
        : [...prev, id];
      localStorage.setItem("stock-favorites", JSON.stringify(next));
      return next;
    });
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const closeDropdown = () => {
    setOpen(false);
    setQuery("");
    setCategory("전체");
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        closeDropdown();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  useLayoutEffect(() => {
    if (!contentWidthTarget) return;

    const update = () =>
      setContentWidth(
        contentWidthTarget.getBoundingClientRect().width * contentWidthScale,
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(contentWidthTarget);
    return () => observer.disconnect();
  }, [contentWidthTarget, contentWidthScale]);

  const price = stockInfo ? parseFloat(stockInfo.price) : 0;
  const prevClose = stockInfo ? parseFloat(stockInfo.prevClose) : 0;
  const change = price - prevClose;
  const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;
  const priceColor =
    change > 0
      ? "text-[#f6465d]"
      : change < 0
        ? "text-[#2563eb]"
        : "text-white";

  const filtered = stocks
    .filter(
      (s) =>
        s.name.toLowerCase().includes(query.toLowerCase()) ||
        String(s.id).includes(query),
    )
    .filter((s) =>
      category === "관심"
        ? favorites.includes(s.id)
        : category === "상승"
          ? s.changeRate > 0
          : category === "하락"
            ? s.changeRate < 0
            : true,
    )
    .sort((a, b) => {
      const dir = sortAsc ? 1 : -1;
      if (sortKey === "name") return a.name.localeCompare(b.name, "ko") * dir;
      if (sortKey === "price") return (Number(a.price) - Number(b.price)) * dir;
      return (a.changeRate - b.changeRate) * dir;
    });

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-[#181a20] py-1 rounded-xl"
    >
      {isMarketClosed && (
        <span className="absolute right-4 top-1/2 -translate-y-1/2 shrink-0 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#2b2f36] text-zinc-400">
          휴장
        </span>
      )}
      <div
        className="relative w-full"
        style={isDesktop && contentWidth ? { width: contentWidth } : undefined}
      >
        {/* 트리거 버튼 */}
        <button
          onClick={() => (open ? closeDropdown() : setOpen(true))}
          className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg bg-transparent hover:bg-[#1f232b]/40 transition-colors"
        >
          {stockInfo ? (
            <>
              <div className="w-8 h-8 rounded-lg bg-[#1f232b] flex items-center justify-center text-xs font-bold text-white shrink-0">
                {stockInfo.name.charAt(0)}
              </div>
              <div className="flex flex-col items-start leading-tight min-w-0">
                <span className="text-white font-semibold text-sm truncate max-w-full">
                  {stockInfo.name}
                </span>
                <span className="text-zinc-500 text-[11px] hidden sm:block">
                  #{stockInfo.id}
                </span>
              </div>
              <div className="flex items-baseline gap-2 ml-2 shrink-0">
                <span className={`text-xl font-bold ${priceColor}`}>
                  {price.toLocaleString("ko-KR")}
                </span>
                <span className={`text-xs font-medium ${priceColor}`}>
                  {changePct >= 0 ? "+" : ""}
                  {changePct.toFixed(2)}%
                </span>
              </div>
              <svg
                className={`ml-auto self-center w-4 h-4 text-zinc-500 transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </>
          ) : (
            <>
              <div className="w-8 h-8 rounded-lg bg-[#1f232b] shrink-0" />
              <span className="text-zinc-500 text-sm">종목을 선택하세요</span>
              <svg
                className="ml-auto w-4 h-4 text-zinc-500 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </>
          )}
        </button>

        {/* 드롭다운 */}
        <div
          className={`absolute top-full left-0 right-0 mt-1.5 z-60 grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
            open
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0 pointer-events-none"
          }`}
        >
          <div className="overflow-hidden bg-[#181a20] rounded-xl shadow-2xl">
            {/* 검색 */}
            <div className="px-3 pt-3 pb-2.5">
              <div className="flex items-center gap-2.5 bg-[#1f232b] rounded-lg px-3.5 py-2.5 transition-colors">
                <svg
                  className="w-4 h-4 text-zinc-500 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
                  />
                </svg>
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="종목 검색"
                  className="bg-transparent text-white text-base lg:text-sm placeholder-zinc-500 outline-none w-full"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    className="text-zinc-600 hover:text-white shrink-0 transition-colors p-2 -m-2"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* 카테고리 칩 */}
            <div className="flex items-center gap-1.5 px-3 pb-2.5">
              {(["전체", "관심", "상승", "하락"] as Category[]).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-2.5 lg:py-1 text-[11px] rounded-lg transition-colors ${
                    category === cat
                      ? "bg-[#1f232b] text-white font-semibold"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {cat}
                </button>
              ))}
              <span className="ml-auto text-[11px] text-zinc-600 pr-1">
                {filtered.length}종목
              </span>
            </div>

            {/* 컬럼 헤더 */}
            <div className="grid grid-cols-[1fr_auto_auto] items-center pl-3 pr-4 py-1.5 text-[11px] text-zinc-600">
              <button
                onClick={() => toggleSort("name")}
                className="flex items-center gap-1 py-1.5 lg:py-0 hover:text-zinc-300 transition-colors justify-self-start pl-9"
              >
                종목
                <SortIcon active={sortKey === "name"} asc={sortAsc} />
              </button>
              <button
                onClick={() => toggleSort("price")}
                className="flex items-center justify-end gap-1 w-24 py-1.5 lg:py-0 hover:text-zinc-300 transition-colors"
              >
                현재가
                <SortIcon active={sortKey === "price"} asc={sortAsc} />
              </button>
              <button
                onClick={() => toggleSort("changeRate")}
                className="flex items-center justify-end gap-1 w-16 py-1.5 lg:py-0 hover:text-zinc-300 transition-colors"
              >
                등락률
                <SortIcon active={sortKey === "changeRate"} asc={sortAsc} />
              </button>
            </div>

            {/* 리스트 */}
            <div className="max-h-[60vh] lg:max-h-108 overflow-y-auto overscroll-contain">
              {filtered.length > 0 ? (
                filtered.map((stock) => {
                  const per = stock.changeRate;
                  const isUp = per > 0;
                  const isDown = per < 0;
                  const isSelected = stock.id === selectedStockId;
                  const isFav = favorites.includes(stock.id);
                  const perColor = isUp
                    ? "text-[#f6465d]"
                    : isDown
                      ? "text-[#2563eb]"
                      : "text-zinc-400";

                  return (
                    <div
                      key={stock.id}
                      className={`flex items-center pl-3 pr-4 hover:bg-[#1f232b] transition-colors ${
                        isSelected ? "bg-[#1f232b]" : ""
                      }`}
                    >
                      <button
                        onClick={() => toggleFavorite(stock.id)}
                        className={`shrink-0 p-3 -m-3 transition-colors ${
                          isFav
                            ? "text-[#F59E0B]"
                            : "text-zinc-700 hover:text-zinc-500"
                        }`}
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          viewBox="0 0 24 24"
                          fill={isFav ? "currentColor" : "none"}
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinejoin="round"
                            d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.8l6.5-.9L12 3z"
                          />
                        </svg>
                      </button>

                      <button
                        onClick={() => {
                          onSelectStock(stock.id);
                          closeDropdown();
                        }}
                        className="flex-1 grid grid-cols-[1fr_auto_auto] items-center py-2.5 pl-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 bg-[#1f232b] text-zinc-300">
                            {stock.name.charAt(0)}
                          </div>
                          <div className="flex flex-col items-start leading-tight min-w-0">
                            <span className="text-sm font-semibold truncate text-white">
                              {stock.name}
                            </span>
                            <span className="text-[10px] text-zinc-600">
                              #{stock.id}
                            </span>
                          </div>
                        </div>

                        <span className="text-xs text-white font-medium text-right w-24 tabular-nums">
                          {Number(stock.price).toLocaleString("ko-KR")}
                        </span>

                        <span
                          className={`text-xs font-semibold text-right w-16 tabular-nums ${perColor}`}
                        >
                          {isUp ? "+" : ""}
                          {per.toFixed(2)}%
                        </span>
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="pt-16 pb-10 text-center text-zinc-600 text-xs">
                  {category === "관심" && !query
                    ? "관심 종목이 없습니다"
                    : "검색 결과 없음"}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
