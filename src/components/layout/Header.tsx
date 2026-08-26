import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { tokenManager } from "../../services/auth/tokenManager";
import { PatchNotesModal } from "../common/PatchNotesModal";

function MenuIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

const TradeIcon = () => (
  <MenuIcon>
    <path d="M3 3v18h18" />
    <path d="M7 16l4-4 3 3 5-6" />
  </MenuIcon>
);

const AccountIcon = () => (
  <MenuIcon>
    <circle cx="9" cy="7" r="4" />
    <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
    <path d="M19 8v6" />
    <path d="M22 11h-6" />
  </MenuIcon>
);

const LoginIcon = () => (
  <MenuIcon>
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    <polyline points="10 17 15 12 10 7" />
    <line x1="15" y1="12" x2="3" y2="12" />
  </MenuIcon>
);

const PatchNoteIcon = () => (
  <MenuIcon>
    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
    <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
    <path d="M9 13h6" />
    <path d="M9 17h6" />
  </MenuIcon>
);

const LogoutIcon = () => (
  <MenuIcon>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </MenuIcon>
);

export function Header() {
  const navigate = useNavigate();
  const isLoggedIn = !!tokenManager.getToken();
  const [open, setOpen] = useState(false);
  const [patchNotesOpen, setPatchNotesOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    setOpen(false);
    tokenManager.clearToken();
    navigate("/login");
  };

  return (
    <header className="flex items-center justify-between px-4 py-3 lg:px-6 lg:py-4 bg-[#181a20] border-b border-[#21242b]">
      <div className="flex items-center gap-2">
        <span className="text-xl lg:text-2xl tracking-tight text-white font-['Archivo_Black']">
          <span className="text-[#F59E0B]">K</span>RONEX
        </span>
      </div>

      <div ref={menuRef} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="메뉴"
          aria-expanded={open}
          className={`flex items-center justify-center min-w-11 min-h-11 lg:min-w-0 lg:min-h-0 lg:w-8 lg:h-8 rounded-lg transition-colors ${
            open
              ? "text-zinc-200 bg-[#1f232b]"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-[#1f232b]/60"
          }`}
        >
          <div className="flex flex-col items-center justify-center gap-1.25">
            <span
              className={`block h-0.5 w-4 rounded-full bg-current transition-transform duration-300 ${
                open ? "translate-y-1.75 rotate-45" : ""
              }`}
            />
            <span
              className={`block h-0.5 w-4 rounded-full bg-current transition-opacity duration-200 ${
                open ? "opacity-0" : "opacity-100"
              }`}
            />
            <span
              className={`block h-0.5 w-4 rounded-full bg-current transition-transform duration-300 ${
                open ? "-translate-y-1.75 -rotate-45" : ""
              }`}
            />
          </div>
        </button>

        <div
          className={`absolute top-full right-0 mt-1.5 z-50 grid w-52 lg:w-44 transition-[grid-template-rows,opacity] duration-200 ease-out ${
            open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
          }`}
        >
          <div className="overflow-hidden bg-[#181a20] border border-[#21242b] rounded-lg shadow-lg shadow-black/40">
            {isLoggedIn ? (
              <>
                <Link
                  to="/"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-3.5 lg:py-2.5 text-sm text-zinc-400 hover:text-white hover:bg-[#1f232b] transition-colors"
                >
                  <TradeIcon />
                  거래하기
                </Link>
                <Link
                  to="/open-account"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-3.5 lg:py-2.5 text-sm text-zinc-400 hover:text-white hover:bg-[#1f232b] transition-colors"
                >
                  <AccountIcon />
                  계좌개설
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-3.5 lg:py-2.5 text-sm text-zinc-400 hover:text-white hover:bg-[#1f232b] transition-colors"
                >
                  <LoginIcon />
                  로그인
                </Link>
                <Link
                  to="/register"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-3.5 lg:py-2.5 text-sm text-zinc-400 hover:text-white hover:bg-[#1f232b] transition-colors"
                >
                  <AccountIcon />
                  회원가입
                </Link>
              </>
            )}
            <button
              onClick={() => {
                setOpen(false);
                setPatchNotesOpen(true);
              }}
              className="flex items-center gap-2.5 w-full text-left px-4 py-3.5 lg:py-2.5 text-sm text-zinc-400 hover:text-white hover:bg-[#1f232b] transition-colors"
            >
              <PatchNoteIcon />
              패치노트
            </button>
            {isLoggedIn && (
              <button
                onClick={handleLogout}
                className="flex items-center gap-2.5 w-full text-left px-4 py-3.5 lg:py-2.5 text-sm text-zinc-400 hover:text-white hover:bg-[#1f232b] border-t border-[#21242b] transition-colors"
              >
                <LogoutIcon />
                로그아웃
              </button>
            )}
          </div>
        </div>
      </div>

      <PatchNotesModal open={patchNotesOpen} onClose={() => setPatchNotesOpen(false)} />
    </header>
  );
}
