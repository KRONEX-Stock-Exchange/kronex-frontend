import { useEffect, useState } from "react";

export interface ToastData {
  id: number;
  message: string;
  type: "success" | "error";
}

// 손익·등락률 표기와 같은 계열의 색을 쓴다
const ACCENT = {
  success: "#0ecb81",
  error: "#f6465d",
} as const;

function Icon({ type }: { type: ToastData["type"] }) {
  return (
    <svg
      className="w-3 h-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
    >
      {type === "success" ? (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 12.5l5.5 5.5L20 7"
        />
      ) : (
        <>
          <path strokeLinecap="round" d="M12 6v8" />
          <path strokeLinecap="round" d="M12 18h.01" />
        </>
      )}
    </svg>
  );
}

export function Toast({
  toast,
  leaving,
  onClose,
}: {
  toast: ToastData;
  leaving: boolean;
  onClose: () => void;
}) {
  // 새 토스트가 뜰 때마다 아래에서 올라오는 등장 애니메이션을 다시 재생한다
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    setEntered(false);
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [toast.id]);

  const accent = ACCENT[toast.type];
  const visible = entered && !leaving;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:bottom-5 left-1/2 z-50 flex max-w-[90vw] items-center gap-2.5 rounded-xl border border-[#21242b] bg-[#181a20] pl-3.5 pr-2 py-2.5 shadow-lg shadow-black/40 transition-[opacity,transform] duration-300 ease-out ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      style={{
        transform: `translateX(-50%) translateY(${visible ? "0px" : "8px"})`,
      }}
    >
      {/* 상태는 아이콘 색으로만 알린다 (다른 패널처럼 색은 최소한으로) */}
      <span className="shrink-0" style={{ color: accent }}>
        <Icon type={toast.type} />
      </span>

      <p className="text-xs leading-snug text-zinc-200">{toast.message}</p>

      <button
        onClick={onClose}
        aria-label="닫기"
        className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-[#1f232b] hover:text-zinc-300"
      >
        <svg
          className="w-2.5 h-2.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
