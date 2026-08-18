import { useId, useState } from "react";

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {off ? (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      ) : (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

interface AuthFieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: "text" | "email" | "password";
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  required?: boolean;
  /** 입력값이 잘못됐을 때 필드 아래에 뜨는 문구 */
  error?: string;
  /** 평소에 보여줄 도움말 (error가 있으면 대체됨) */
  hint?: string;
}

export function AuthField({
  label,
  name,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  autoFocus,
  required,
  error,
  hint,
}: AuthFieldProps) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && revealed ? "text" : type;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-zinc-400">
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          type={inputType}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required={required}
          aria-invalid={!!error}
          aria-describedby={error || hint ? `${id}-desc` : undefined}
          className={`w-full rounded-lg border bg-[#1f232b] px-4 py-3.5 text-sm text-white placeholder-zinc-500 outline-none transition-[color,border-color,box-shadow] focus:ring-2 ${
            isPassword ? "pr-11" : ""
          } ${
            error
              ? "border-[#d03b3b] focus:border-[#e2685f] focus:ring-[#d03b3b]/20"
              : "border-[#3b3f46] focus:border-[#F59E0B] focus:ring-[#F59E0B]/15"
          }`}
        />

        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            tabIndex={-1}
            aria-label={revealed ? "비밀번호 숨기기" : "비밀번호 표시"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 transition-colors hover:text-zinc-300"
          >
            <EyeIcon off={revealed} />
          </button>
        )}
      </div>

      {(error || hint) && (
        <p
          id={`${id}-desc`}
          className={`text-[11px] leading-snug ${error ? "text-[#e2685f]" : "text-zinc-500"}`}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
}
