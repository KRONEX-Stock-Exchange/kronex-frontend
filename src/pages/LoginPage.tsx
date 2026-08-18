import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiClient } from "../services/api/client";
import { tokenManager } from "../services/auth/tokenManager";
import { useAccount } from "../contexts/AccountContext";
import { AuthShell } from "../components/auth/AuthShell";
import { AuthField } from "../components/auth/AuthField";
import { AuthAlert } from "../components/auth/AuthAlert";
import { AuthSubmitButton } from "../components/auth/AuthSubmitButton";

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
    if (error) setError("");
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
    <AuthShell
      title="다시 만나서 반가워요"
      subtitle="로그인하고 거래를 시작하세요"
      footer={
        <>
          아직 계정이 없으신가요?{" "}
          <Link
            to="/register"
            className="font-semibold text-[#F59E0B] hover:underline"
          >
            회원가입
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {info && <AuthAlert type="info" message={info} />}

        <AuthField
          label="아이디"
          name="username"
          value={form.username}
          onChange={handleChange}
          placeholder="아이디를 입력하세요"
          autoComplete="username"
          autoFocus
          required
        />

        <AuthField
          label="비밀번호"
          name="password"
          type="password"
          value={form.password}
          onChange={handleChange}
          placeholder="비밀번호를 입력하세요"
          autoComplete="current-password"
          required
        />

        {error && <AuthAlert type="error" message={error} />}

        <AuthSubmitButton loading={loading} loadingLabel="로그인 중...">
          로그인
        </AuthSubmitButton>
      </form>
    </AuthShell>
  );
}
