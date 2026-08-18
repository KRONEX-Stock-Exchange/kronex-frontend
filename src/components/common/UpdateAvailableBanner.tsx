import { useEffect, useState } from "react";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

function getCurrentScriptSrc() {
  return (
    document.querySelector('script[type="module"]')?.getAttribute("src") ??
    null
  );
}

// 이미 열려있는 탭이 옛 번들을 계속 쓰고 있을 때, 새 배포가 감지되면
// 새로고침을 안내한다 (자동 새로고침은 입력 중인 주문을 날릴 수 있어 하지 않는다).
export function UpdateAvailableBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const currentSrc = getCurrentScriptSrc();
    if (!currentSrc) return;

    const checkForUpdate = async () => {
      try {
        const res = await fetch("/index.html", { cache: "no-store" });
        const html = await res.text();
        const match = html.match(
          /<script[^>]*type="module"[^>]*src="([^"]+)"/,
        );
        if (match && match[1] !== currentSrc) {
          setUpdateAvailable(true);
        }
      } catch {
        // 네트워크 오류는 무시하고 다음 주기에 재시도
      }
    };

    const interval = setInterval(checkForUpdate, CHECK_INTERVAL_MS);
    window.addEventListener("focus", checkForUpdate);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", checkForUpdate);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[9999] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-[#2b2f36] bg-[#181a20] px-4 py-2.5 text-sm text-zinc-200 shadow-2xl">
      새 버전이 있습니다.
      <button
        onClick={() => window.location.reload()}
        className="rounded-md bg-[#F59E0B] px-3 py-1 text-xs font-semibold text-gray-900"
      >
        새로고침
      </button>
    </div>
  );
}
