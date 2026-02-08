import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../services/api/client";

export function OpenAccountPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError("");
    setLoading(true);

    try {
      const response = await apiClient.post("/accounts");

      if (response.success) {
        alert("계좌가 개설되었습니다.");
        navigate("/");
      } else {
        const errorMsg =
          typeof response.error === "object" && response.error !== null
            ? (response.error as { message?: string }).message ||
              "계좌 개설에 실패했습니다."
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
    <div className="min-h-screen flex items-center justify-center bg-[#0b0e11]">
      <div className="w-full max-w-md p-8 bg-[#181a20] rounded-2xl">
        <h1 className="text-2xl font-bold text-white mb-6 text-center">
          Open Account
        </h1>

        <p className="text-zinc-400 text-sm text-center mb-6">
          Click the button below to open a new trading account.
        </p>

        {/* 에러 메시지 */}
        {error && (
          <div className="text-[#f6465d] text-sm text-center mb-4">{error}</div>
        )}

        {/* 개설 버튼 */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-3 bg-[#f6465d] text-white font-bold rounded-lg hover:bg-[#d63850] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Processing..." : "Open Account"}
        </button>
      </div>
    </div>
  );
}
