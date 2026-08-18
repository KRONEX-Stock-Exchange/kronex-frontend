import type { ReactNode } from "react";

export function AuthSubmitButton({
  loading,
  loadingLabel,
  disabled,
  children,
}: {
  loading: boolean;
  loadingLabel: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-[#F59E0B] py-3.5 text-sm font-bold text-gray-900 transition-colors hover:bg-[#d97706] active:bg-[#b45309] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-900/30 border-t-gray-900" />
      )}
      {loading ? loadingLabel : children}
    </button>
  );
}
