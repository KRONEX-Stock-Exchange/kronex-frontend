import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../services/api/client";
import { tokenManager } from "../services/auth/tokenManager";
import { useAccount } from "../contexts/AccountContext";

interface LoginForm {
  username: string;
  password: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const { fetchAccounts } = useAccount();
  const [form, setForm] = useState<LoginForm>({ username: "", password: "" });
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const message = sessionStorage.getItem("authMessage");
    if (message) {
      setInfo(message);
      sessionStorage.removeItem("authMessage");
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (!form.username || !form.password) {
      setError("아이디와 비밀번호를 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.post("/auth/signin", {
        username: form.username,
        password: form.password,
      });

      if (response.success) {
        const token = (response.data as { accessToken: string })?.accessToken;
        if (token) tokenManager.setToken(token);
        const accounts = await fetchAccounts();
        if (accounts && accounts.length > 0) {
          navigate("/");
        } else {
          navigate("/open-account");
        }
      } else {
        const errorMsg =
          typeof response.error === "object" && response.error !== null
            ? (response.error as { message?: string }).message || "로그인에 실패했습니다."
            : response.error || "로그인에 실패했습니다.";
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
        {/* 로고 */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#78350F] mb-4">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <polygon points="3,25 14,3 25,25 14,16" fill="white"/>
            </svg>
          </div>
          <p className="text-xs font-bold tracking-widest mb-1"><span className="text-[#F59E0B]">K</span><span className="text-white">RONEX</span></p>
          <h1 className="text-2xl font-bold text-white">다시 만나서 반가워요</h1>
          <p className="text-[#8e8e93] text-sm mt-1">로그인하고 거래를 시작하세요</p>
        </div>

        {/* 세션 만료 안내 */}
        {info && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#2c2300] border border-[#f6a609]/30">
            <span className="text-[#f6a609] text-lg">⚠</span>
            <p className="text-[#f6a609] text-sm">{info}</p>
          </div>
        )}

        {/* 폼 카드 */}
        <div className="bg-[#1c1c1f] rounded-3xl p-6 border border-[#2a2a2d]">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[#8e8e93]">아이디</label>
              <input
                type="text"
                name="username"
                value={form.username}
                onChange={handleChange}
                placeholder="아이디를 입력하세요"
                autoComplete="username"
                className="w-full bg-[#242427] text-white placeholder-[#48484a] px-4 py-3.5 rounded-xl border border-[#3a3a3d] outline-none focus:border-[#F59E0B] transition-colors text-sm"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[#8e8e93]">비밀번호</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="비밀번호를 입력하세요"
                  autoComplete="current-password"
                  className="w-full bg-[#242427] text-white placeholder-[#48484a] px-4 py-3.5 pr-11 rounded-xl border border-[#3a3a3d] outline-none focus:border-[#F59E0B] transition-colors text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#48484a] hover:text-zinc-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#2c0a0a] border border-[#FF3B30]/30">
                <span className="text-[#FF3B30] text-sm">⚠</span>
                <p className="text-[#FF3B30] text-xs">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-[#D97706] hover:bg-[#B45309] active:bg-[#92400E] text-white font-bold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed mt-1 text-sm"
            >
              {loading ? "로그인 중..." : "로그인"}
            </button>
          </form>
        </div>

        {/* 회원가입 링크 */}
        <p className="text-center text-sm text-[#8e8e93] mt-6">
          아직 계정이 없으신가요?{" "}
          <button
            type="button"
            onClick={() => navigate("/register")}
            className="text-[#F59E0B] font-semibold hover:underline"
          >
            회원가입
          </button>
        </p>
      </div>
    </div>
  );
}
