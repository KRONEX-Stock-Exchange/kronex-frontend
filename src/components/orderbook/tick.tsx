const toNum = (s: string) => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };

type TickProps = {
  type: "sell" | "buy";
  price: string;
  number: string;
  basePrice: number;
  previousClose: number;
  maxNumber: number;
  diff: number | null;
  highPrice?: number;
  lowPrice?: number;
};

export function Tick({
  type,
  price,
  number,
  basePrice,
  previousClose,
  maxNumber,
  diff,
  highPrice,
  lowPrice,
}: TickProps) {
  const priceNum = toNum(price);
  const numberNum = toNum(number);

  // 등락률 계산 (전일종가 대비)
  const changePercent =
    previousClose > 0 ? ((priceNum - previousClose) / previousClose) * 100 : 0;
  const changeText =
    changePercent >= 0
      ? `+${changePercent.toFixed(2)}%`
      : `${changePercent.toFixed(2)}%`;

  // 수량 바 너비 계산 (최대 수량 대비 비율)
  const barWidth = maxNumber > 0 ? (numberNum / maxNumber) * 100 : 0;

  // 색상 결정: 0%면 흰색, +면 빨간색, -면 파란색
  const getTextColor = () => {
    if (changePercent === 0) return "text-white";
    if (changePercent > 0) return "text-[#f6465d]";
    return "text-[#2563eb]";
  };

  // 현재가/고점/저점 테두리
  const getPriceBoxRing = () => {
    if (priceNum === basePrice) return "ring-1 ring-inset ring-white";
    if (highPrice !== undefined && priceNum === highPrice)
      return "ring-1 ring-inset ring-[#f6465d]";
    if (lowPrice !== undefined && priceNum === lowPrice)
      return "ring-1 ring-inset ring-[#2563eb]";
    return "";
  };

  // diff 표시
  const diffText =
    diff != null && diff !== 0
      ? diff > 0
        ? `+${diff.toLocaleString()}`
        : diff.toLocaleString()
      : null;
  const diffColor =
    diff != null && diff > 0 ? "text-[#f6465d]" : "text-[#2563eb]";

  if (type === "sell") {
    return (
      <div className="w-full h-[10%]">
        <div className="flex h-full">
          <div className="w-[23%] h-full flex justify-end items-center bg-[#181a20] relative">
            <div
              className="absolute right-0 h-[90%] bg-[#2563eb]/15"
              style={{ width: `${barWidth}%` }}
            ></div>
            {diffText && (
              <span className={`absolute left-1 z-10 text-xs font-medium ${diffColor}`}>
                {diffText}
              </span>
            )}
            <div className="relative z-10 m-2 text-sm text-white">
              {numberNum.toLocaleString()}
            </div>
          </div>
          <div className="w-[15%] h-full border-r flex justify-center items-center border-[rgb(43,47,54)] bg-[#1e2329]">
            <div className={`text-sm ${getTextColor()}`}>{changeText}</div>
          </div>
          <div className={`w-[24%] h-full flex justify-center items-center bg-[#1e2329] ${getPriceBoxRing()}`}>
            <div className={`text-sm font-medium ${getTextColor()}`}>
              {priceNum.toLocaleString()}
            </div>
          </div>
          <div className="w-[38%] h-full bg-[#181a20]"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-[10%]">
      <div className="flex h-full">
        <div className="w-[38%] h-full bg-[#181a20]"></div>
        <div className={`w-[24%] h-full flex justify-center items-center bg-[#1e2329] ${getPriceBoxRing()}`}>
          <div className={`text-sm font-medium ${getTextColor()}`}>
            {priceNum.toLocaleString()}
          </div>
        </div>
        <div className="w-[15%] h-full border-l flex justify-center items-center border-[rgb(43,47,54)] bg-[#1e2329]">
          <div className={`text-sm ${getTextColor()}`}>{changeText}</div>
        </div>
        <div className="w-[23%] h-full flex justify-start items-center bg-[#181a20] relative">
          <div
            className="absolute left-0 h-[90%] bg-[#f6465d]/15"
            style={{ width: `${barWidth}%` }}
          ></div>
          <div className="relative z-10 m-2 text-sm text-white">
            {numberNum.toLocaleString()}
          </div>
          {diffText && (
            <span className={`absolute right-1 z-10 text-xs font-medium ${diffColor}`}>
              {diffText}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// 로딩 틱 — EmptyTick과 같은 칸 규격을 그대로 쓰고 내용만 회색 막대로 대체
function SkeletonBar({ w, delay }: { w: string; delay: number }) {
  return (
    <span
      className="block h-3.5 animate-pulse rounded-sm bg-[#2b2f36]"
      style={{ width: w, animationDelay: `${delay}ms` }}
    />
  );
}

export function SkeletonTick({
  type,
  index = 0,
}: {
  type: "sell" | "buy";
  index?: number;
}) {
  const delay = (index % 5) * 100;
  const qtyWidth = `${45 + ((index * 7) % 4) * 12}%`;

  if (type === "sell") {
    return (
      <div className="w-full h-[10%]">
        <div className="flex h-full">
          <div className="w-[23%] h-full flex justify-end items-center px-2 bg-[#181a20]">
            <SkeletonBar w={qtyWidth} delay={delay} />
          </div>
          <div className="w-[15%] h-full border-r flex justify-center items-center px-2 border-[rgb(43,47,54)] bg-[#1e2329]">
            <SkeletonBar w="70%" delay={delay} />
          </div>
          <div className="w-[24%] h-full flex justify-center items-center px-3 bg-[#1e2329]">
            <SkeletonBar w="75%" delay={delay} />
          </div>
          <div className="w-[38%] h-full bg-[#181a20]"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-[10%]">
      <div className="flex h-full">
        <div className="w-[38%] h-full bg-[#181a20]"></div>
        <div className="w-[24%] h-full flex justify-center items-center px-3 bg-[#1e2329]">
          <SkeletonBar w="75%" delay={delay} />
        </div>
        <div className="w-[15%] h-full border-l flex justify-center items-center px-2 border-[rgb(43,47,54)] bg-[#1e2329]">
          <SkeletonBar w="70%" delay={delay} />
        </div>
        <div className="w-[23%] h-full flex justify-start items-center px-2 bg-[#181a20]">
          <SkeletonBar w={qtyWidth} delay={delay} />
        </div>
      </div>
    </div>
  );
}

// 빈 틱 (데이터 없을 때)
export function EmptyTick({ type }: { type: "sell" | "buy" }) {
  if (type === "sell") {
    return (
      <div className="w-full h-[10%]">
        <div className="flex h-full">
          <div className="w-[23%] h-full bg-[#181a20]"></div>
          <div className="w-[15%] h-full border-r border-[rgb(43,47,54)] bg-[#1e2329]"></div>
          <div className="w-[24%] h-full bg-[#1e2329]"></div>
          <div className="w-[38%] h-full bg-[#181a20]"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-[10%]">
      <div className="flex h-full">
        <div className="w-[38%] h-full bg-[#181a20]"></div>
        <div className="w-[24%] h-full bg-[#1e2329]"></div>
        <div className="w-[15%] h-full border-l border-[rgb(43,47,54)] bg-[#1e2329]"></div>
        <div className="w-[23%] h-full bg-[#181a20]"></div>
      </div>
    </div>
  );
}
