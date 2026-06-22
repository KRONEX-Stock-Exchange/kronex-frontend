import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../services/api/client";
import { useAccount } from "../contexts/AccountContext";

const BENEFITS = [
  { icon: "🔒", title: "안전한 자산 보관", desc: "분리된 계좌로 자산을 안전하게 관리해요" },
  { icon: "⚡", title: "빠른 체결", desc: "실시간 호가로 즉시 매수·매도가 가능해요" },
  { icon: "📊", title: "실시간 시세", desc: "라이브 차트로 시장 흐름을 한눈에 확인해요" },
];

export function OpenAccountPage() {
  const navigate = useNavigate();
  const { fetchAccounts } = useAccount();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError("");
    setLoading(true);

    try {
      const response = await apiClient.post("/accounts");

      if (response.success) {
        await fetchAccounts();
        navigate("/");
      } else {
        const errorMsg =
          typeof response.error === "object" && response.error !== null
            ? (response.error as { message?: string }).message || "계좌 개설에 실패했습니다."
            : response.error || "계좌 개설에 실패했습니다.";
        setError(errorMsg);
      }
    } catch {
      setError("서버 연결에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f12] px-4">
      <div className="w-full max-w-100">
        {/* 헤더 */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#78350F] mb-4">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <polygon points="3,25 14,3 25,25 14,16" fill="white"/>
            </svg>
          </div>
          <p className="text-xs font-bold tracking-widest mb-1"><span className="text-[#F59E0B]">K</span><span className="text-white">RONEX</span></p>
          <h1 className="text-2xl font-bold text-white">계좌 개설</h1>
          <p className="text-[#8e8e93] text-sm mt-1">지금 바로 투자를 시작하세요</p>
        </div>

        {/* 혜택 카드 */}
        <div className="bg-[#1c1c1f] rounded-3xl p-6 border border-[#2a2a2d] mb-4">
          <p className="text-xs font-semibold text-[#8e8e93] uppercase tracking-wider mb-4">개설 혜택</p>
          <div className="flex flex-col gap-4">
            {BENEFITS.map((item) => (
              <div key={item.title} className="flex items-start gap-4">
                <div className="shrink-0 w-10 h-10 rounded-2xl bg-[#242427] flex items-center justify-center text-lg">
                  {item.icon}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                  <p className="text-xs text-[#8e8e93] mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 에러 */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#2c0a0a] border border-[#FF3B30]/30 mb-4">
            <span className="text-[#FF3B30]">⚠</span>
            <p className="text-[#FF3B30] text-sm">{error}</p>
          </div>
        )}

        {/* 개설 버튼 */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-4 bg-[#D97706] hover:bg-[#B45309] active:bg-[#92400E] text-white font-bold rounded-2xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm"
        >
          {loading ? "개설 중..." : "계좌 개설하기"}
        </button>

        <p className="text-center text-xs text-[#48484a] mt-4">
          계좌 개설 후 바로 거래를 시작할 수 있어요
        </p>
      </div>
    </div>
  );
}
