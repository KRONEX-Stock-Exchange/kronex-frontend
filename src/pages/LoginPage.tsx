import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../services/api/client";

interface LoginForm {
  username: string;
  password: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<LoginForm>({
    username: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (!form.username || !form.password) {
      setError("사용자명과 비밀번호를 입력해주세요.");
      return;
    }

    setLoading(true);

    try {
      const response = await apiClient.post("/auth/signin", {
        username: form.username,
        password: form.password,
      });

      if (response.success) {
        navigate("/");
      } else {
        const errorMsg =
          typeof response.error === "object" && response.error !== null
            ? (response.error as { message?: string }).message ||
              "로그인에 실패했습니다."
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
    <div className="min-h-screen flex items-center justify-center bg-[#0b0e11]">
      <div className="w-full max-w-md p-8 bg-[#181a20] rounded-2xl">
        <h1 className="text-2xl font-bold text-white mb-6 text-center">
          Login
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* 사용자명 */}
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Username</label>
            <input
              type="text"
              name="username"
              value={form.username}
              onChange={handleChange}
              placeholder="Enter your username"
              required
              className="w-full bg-[#2b2f36] text-white px-4 py-3 rounded-lg border border-[#3b3f46] outline-none focus:border-[#f6465d] transition-colors"
            />
          </div>

          {/* 비밀번호 */}
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Password</label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="Enter your password"
              required
              className="w-full bg-[#2b2f36] text-white px-4 py-3 rounded-lg border border-[#3b3f46] outline-none focus:border-[#f6465d] transition-colors"
            />
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div className="text-[#f6465d] text-sm text-center">{error}</div>
          )}

          {/* 로그인 버튼 */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#f6465d] text-white font-bold rounded-lg hover:bg-[#d63850] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Processing..." : "Login"}
          </button>

          {/* 회원가입 링크 */}
          <div className="text-center text-sm text-zinc-400">
            Don't have an account?{" "}
            <button
              type="button"
              onClick={() => navigate("/register")}
              className="text-[#f6465d] hover:underline"
            >
              Register
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
