import { useEffect } from "react";

interface PatchNoteGroup {
  version: string;
  date: string;
  added?: string[];
  fixed?: string[];
}

const PATCH_NOTES: PatchNoteGroup[] = [
  {
    version: "v0.6.0",
    date: "2026-08-24",
    added: [
      "패치노트 기능 추가",
      "휴장 시간 추가 (매일 UTC 00:00~00:05, KST 09:00 ~ 09:05 거래 제한)",
      "차트 매입가 표시 옵션 추가 (보유 종목의 평균 매입가 위치에 가격선 표시)",
      "주문 패널에 총 주문 금액 표시 추가 (시장가는 현재가 기준 예상 금액)",
    ],
    fixed: [
      "차트 현재 봉의 등락률·색 기준을 직전 봉 종가로 변경",
      "금액 단위 표기를 KRW로 통일",
      "계좌 탭 보유 종목 표의 컬럼명을 평균가에서 매입가로 변경",
      "상단 헤더·알림 메시지·계좌 선택 영역 UI/UX 개선",
      "계좌 요약 영역·차트 설정 패널 UI/UX 개선",
    ],
  },
  {
    version: "v0.5.0",
    date: "2026-08-24",
  },
];

export function PatchNotesModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  return (
    <div
      className={`fixed inset-0 z-100 flex justify-end bg-black/60 transition-opacity duration-300 ${
        open ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      onClick={onClose}
    >
      <div
        className={`h-full w-full max-w-4xl flex flex-col bg-[#181a20] border-l border-[#2b2f36] shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#2b2f36]">
          <h2 className="text-lg font-semibold text-white">패치노트</h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-400 hover:text-white hover:bg-[#1f232b] transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="4" y1="4" x2="20" y2="20" />
              <line x1="20" y1="4" x2="4" y2="20" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="relative">
            <div className="absolute left-1.25 top-2 bottom-2 w-px bg-[#2b2f36]" />
            <div className="space-y-10">
              {PATCH_NOTES.map((group, i) => {
                const isLatest = i === 0;
                // 비어 있는 구분(추가/수정)은 렌더하지 않는다
                const sections = [
                  { label: "추가", items: group.added ?? [] },
                  { label: "수정", items: group.fixed ?? [] },
                ].filter((s) => s.items.length > 0);
                return (
                  <div key={group.version} className="relative pl-9">
                    <div
                      className={`absolute left-0 top-1.5 w-2.75 h-2.75 rounded-full border-2 ${
                        isLatest
                          ? "bg-[#F59E0B] border-[#F59E0B]"
                          : "bg-[#181a20] border-[#3a3f4a]"
                      }`}
                    />
                    <div className="flex items-center gap-2.5 mb-3">
                      <span
                        className={`px-2 py-0.5 rounded-md text-xs font-mono font-semibold ${
                          isLatest
                            ? "bg-[#F59E0B]/12 text-[#F59E0B]"
                            : "bg-[#1f232b] text-zinc-400"
                        }`}
                      >
                        {group.version}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {group.date}
                      </span>
                    </div>
                    {sections.length > 0 ? (
                      <div className="space-y-4">
                        {sections.map(({ label, items }) => (
                          <div key={label}>
                            <span className="block mb-2 text-[11px] font-semibold text-zinc-500">
                              {label}
                            </span>
                            <ul className="space-y-2">
                              {items.map((text, idx) => (
                                <li
                                  key={idx}
                                  className="flex items-start gap-2.5 text-sm text-zinc-300 leading-relaxed"
                                >
                                  <span className="mt-2 w-1 h-1 rounded-full bg-zinc-600 shrink-0" />
                                  <span>{text}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-500"></p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
