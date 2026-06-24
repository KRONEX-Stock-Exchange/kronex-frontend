import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../services/api/client";

interface SignupForm {
  username: string;
  email: string;
  password: string;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<SignupForm>({ username: "", email: "", password: "" });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (form.password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email)) {
      setError("올바른 이메일 형식을 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.post("/auth/signup", {
        username: form.username,
        email: form.email,
        password: form.password,
      });

      if (response.success) {
        sessionStorage.setItem("authMessage", "회원가입이 완료되었습니다. 로그인해주세요.");
        navigate("/login");
      } else {
        const errorMsg =
          typeof response.error === "object" && response.error !== null
            ? (response.error as { message?: string }).message || "회원가입에 실패했습니다."
            : response.error || "회원가입에 실패했습니다.";
        setError(errorMsg);
      }
    } catch {
      setError("서버 연결에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const EyeIcon = ({ visible }: { visible: boolean }) =>
    visible ? (
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
    );

  const fields = [
    { name: "username", label: "아이디", type: "text", placeholder: "아이디를 입력하세요", autoComplete: "username" },
    { name: "email", label: "이메일", type: "email", placeholder: "이메일을 입력하세요", autoComplete: "email" },
  ] as const;

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
          <h1 className="text-2xl font-bold text-white">처음 오셨군요!</h1>
          <p className="text-[#8e8e93] text-sm mt-1">계정을 만들고 거래를 시작하세요</p>
        </div>

        {/* 폼 카드 */}
        <div className="bg-[#1c1c1f] rounded-3xl p-6 border border-[#2a2a2d]">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {fields.map((field) => (
              <div key={field.name} className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[#8e8e93]">{field.label}</label>
                <input
                  type={field.type}
                  name={field.name}
                  value={form[field.name]}
                  onChange={handleChange}
                  placeholder={field.placeholder}
                  autoComplete={field.autoComplete}
                  required
                  className="w-full bg-[#242427] text-white placeholder-[#48484a] px-4 py-3.5 rounded-xl border border-[#3a3a3d] outline-none focus:border-[#F59E0B] transition-colors text-sm"
                />
              </div>
            ))}

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[#8e8e93]">비밀번호</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="비밀번호를 입력하세요"
                  autoComplete="new-password"
                  required
                  className="w-full bg-[#242427] text-white placeholder-[#48484a] px-4 py-3.5 pr-11 rounded-xl border border-[#3a3a3d] outline-none focus:border-[#F59E0B] transition-colors text-sm"
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)} tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#48484a] hover:text-zinc-300 transition-colors">
                  <EyeIcon visible={showPassword} />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[#8e8e93]">비밀번호 확인</label>
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="비밀번호를 다시 입력하세요"
                  autoComplete="new-password"
                  required
                  className="w-full bg-[#242427] text-white placeholder-[#48484a] px-4 py-3.5 pr-11 rounded-xl border border-[#3a3a3d] outline-none focus:border-[#F59E0B] transition-colors text-sm"
                />
                <button type="button" onClick={() => setShowConfirm((v) => !v)} tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#48484a] hover:text-zinc-300 transition-colors">
                  <EyeIcon visible={showConfirm} />
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
              {loading ? "처리 중..." : "회원가입"}
            </button>
          </form>
        </div>

        {/* 로그인 링크 */}
        <p className="text-center text-sm text-[#8e8e93] mt-6">
          이미 계정이 있으신가요?{" "}
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="text-[#F59E0B] font-semibold hover:underline"
          >
            로그인
          </button>
        </p>
      </div>
    </div>
  );
}
