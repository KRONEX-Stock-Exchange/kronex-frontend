import type { ReactNode } from "react";

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

// 로그인/회원가입이 공유하는 페이지 껍데기 (배경, 로고, 카드, 하단 링크)
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: AuthShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#14161b] px-4 py-12">
      {/* 상단 은은한 브랜드 글로우 — 단조로운 검은 배경에 깊이를 준다 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64"
        style={{
          background:
            "radial-gradient(45% 100% at 50% 0%, rgba(245,158,11,0.07) 0%, rgba(245,158,11,0) 70%)",
        }}
      />

      <div className="relative mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-100 flex-col justify-center">
        <div className="mb-8 text-center">
          <p className="mb-5 font-['Archivo_Black'] text-3xl tracking-tight">
            <span className="text-[#F59E0B]">K</span>
            <span className="text-white">RONEX</span>
          </p>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          <p className="mt-1.5 text-sm text-zinc-400">{subtitle}</p>
        </div>

        {/* 무거운 드롭섀도 대신, 위쪽 얇은 하이라이트 + 넓고 옅은 앰비언트 그림자로 띄운다 */}
        <div
          className="rounded-xl border border-[#2b2f36] bg-[#181a20] p-6"
          style={{
            boxShadow:
              "inset 0 1px 0 0 rgba(255,255,255,0.04), 0 24px 56px -28px rgba(0,0,0,0.85)",
          }}
        >
          {children}
        </div>

        <p className="mt-6 text-center text-sm text-zinc-400">{footer}</p>
      </div>
    </div>
  );
}
