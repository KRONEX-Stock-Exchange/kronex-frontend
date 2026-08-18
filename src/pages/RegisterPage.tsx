import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiClient } from "../services/api/client";
import { AuthShell } from "../components/auth/AuthShell";
import { AuthField } from "../components/auth/AuthField";
import { AuthAlert } from "../components/auth/AuthAlert";
import { AuthSubmitButton } from "../components/auth/AuthSubmitButton";

interface SignupForm {
  username: string;
  email: string;
  password: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

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
    if (error) setError("");
  };

  // 제출 전에도 바로 알 수 있도록 입력 즉시 검사한다 (입력 중인 칸은 아직 지적하지 않음)
  const emailError =
    form.email && !EMAIL_REGEX.test(form.email)
      ? "올바른 이메일 형식이 아닙니다."
      : "";
  const passwordError =
    form.password && form.password.length < MIN_PASSWORD_LENGTH
      ? `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`
      : "";
  const confirmError =
    confirmPassword && confirmPassword !== form.password
      ? "비밀번호가 일치하지 않습니다."
      : "";

  const canSubmit =
    !!form.username &&
    !!form.email &&
    !!form.password &&
    !!confirmPassword &&
    !emailError &&
    !passwordError &&
    !confirmError;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (form.password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    if (!EMAIL_REGEX.test(form.email)) {
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
        sessionStorage.setItem(
          "authMessage",
          "회원가입이 완료되었습니다. 로그인해주세요.",
        );
        navigate("/login");
      } else {
        const errorMsg =
          typeof response.error === "object" && response.error !== null
            ? (response.error as { message?: string }).message ||
              "회원가입에 실패했습니다."
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
    <AuthShell
      title="처음 오셨군요!"
      subtitle="계정을 만들고 거래를 시작하세요"
      footer={
        <>
          이미 계정이 있으신가요?{" "}
          <Link
            to="/login"
            className="font-semibold text-[#F59E0B] hover:underline"
          >
            로그인
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
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
          label="이메일"
          name="email"
          type="email"
          value={form.email}
          onChange={handleChange}
          placeholder="이메일을 입력하세요"
          autoComplete="email"
          required
          error={emailError}
        />

        <AuthField
          label="비밀번호"
          name="password"
          type="password"
          value={form.password}
          onChange={handleChange}
          placeholder="비밀번호를 입력하세요"
          autoComplete="new-password"
          required
          error={passwordError}
          hint={`${MIN_PASSWORD_LENGTH}자 이상 입력해주세요.`}
        />

        <AuthField
          label="비밀번호 확인"
          name="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="비밀번호를 다시 입력하세요"
          autoComplete="new-password"
          required
          error={confirmError}
        />

        {error && <AuthAlert type="error" message={error} />}

        <AuthSubmitButton
          loading={loading}
          loadingLabel="처리 중..."
          disabled={!canSubmit}
        >
          회원가입
        </AuthSubmitButton>
      </form>
    </AuthShell>
  );
}
