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
  const [form, setForm] = useState<SignupForm>({
    username: "",
    email: "",
    password: "",
  });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    // 비밀번호 확인
    if (form.password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    // 이메일 형식 검증
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
        alert("회원가입이 완료되었습니다.");
        navigate("/login");
      } else {
        const errorMsg = typeof response.error === "object" && response.error !== null
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b0e11]">
      <div className="w-full max-w-md p-8 bg-[#181a20] rounded-2xl">
        <h1 className="text-2xl font-bold text-white mb-6 text-center">
          회원가입
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* 사용자명 */}
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">사용자명</label>
            <input
              type="text"
              name="username"
              value={form.username}
              onChange={handleChange}
              placeholder="사용자명을 입력하세요"
              required
              className="w-full bg-[#2b2f36] text-white px-4 py-3 rounded-lg border border-[#3b3f46] outline-none focus:border-[#f6465d] transition-colors"
            />
          </div>

          {/* 이메일 */}
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">이메일</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="이메일을 입력하세요"
              required
              className="w-full bg-[#2b2f36] text-white px-4 py-3 rounded-lg border border-[#3b3f46] outline-none focus:border-[#f6465d] transition-colors"
            />
          </div>

          {/* 비밀번호 */}
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">비밀번호</label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="비밀번호를 입력하세요"
              required
              className="w-full bg-[#2b2f36] text-white px-4 py-3 rounded-lg border border-[#3b3f46] outline-none focus:border-[#f6465d] transition-colors"
            />
          </div>

          {/* 비밀번호 확인 */}
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">
              비밀번호 확인
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="비밀번호를 다시 입력하세요"
              required
              className="w-full bg-[#2b2f36] text-white px-4 py-3 rounded-lg border border-[#3b3f46] outline-none focus:border-[#f6465d] transition-colors"
            />
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div className="text-[#f6465d] text-sm text-center">{error}</div>
          )}

          {/* 회원가입 버튼 */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#f6465d] text-white font-bold rounded-lg hover:bg-[#d63850] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "처리중..." : "회원가입"}
          </button>

          {/* 로그인 링크 */}
          <div className="text-center text-sm text-zinc-400">
            이미 계정이 있으신가요?{" "}
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="text-[#f6465d] hover:underline"
            >
              로그인
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
