import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../services/api/client";
import { useAccount } from "../contexts/AccountContext";


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
    <div className="min-h-dvh flex items-center justify-center bg-[#14161b] px-4">
      <div className="w-full max-w-100">
        {/* 헤더 */}
        <div className="mb-10 text-center">
          <p className="text-3xl tracking-tight mb-4 font-['Archivo_Black']"><span className="text-[#F59E0B]">K</span><span className="text-white">RONEX</span></p>
          <h1 className="text-2xl font-bold text-white">계좌 개설</h1>
        </div>

        {/* 에러 */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[#d03b3b]/10 border border-[#d03b3b]/30 mb-4">
            <span className="text-[#e2685f]">⚠</span>
            <p className="text-[#e2685f] text-sm">{error}</p>
          </div>
        )}

        {/* 개설 버튼 */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-4 bg-[#D97706] hover:bg-[#B45309] active:bg-[#92400E] text-white font-bold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm"
        >
          {loading ? "개설 중..." : "계좌 개설하기"}
        </button>

      </div>
    </div>
  );
}
