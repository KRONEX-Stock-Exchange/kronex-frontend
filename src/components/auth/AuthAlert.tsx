const STYLES = {
  error: {
    box: "bg-[#d03b3b]/10 border-[#d03b3b]/30",
    text: "text-[#e2685f]",
  },
  info: {
    box: "bg-[#F59E0B]/10 border-[#F59E0B]/30",
    text: "text-[#F59E0B]",
  },
} as const;

export function AuthAlert({
  type,
  message,
}: {
  type: keyof typeof STYLES;
  message: string;
}) {
  const style = STYLES[type];

  return (
    <div
      role="alert"
      className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-3 ${style.box}`}
    >
      <svg
        className={`mt-px h-4 w-4 shrink-0 ${style.text}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5" />
        <path d="M12 16.5h.01" />
      </svg>
      <p className={`text-xs leading-relaxed ${style.text}`}>{message}</p>
    </div>
  );
}
