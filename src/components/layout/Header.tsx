import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { tokenManager } from "../../services/auth/tokenManager";

export function Header() {
  const navigate = useNavigate();
  const isLoggedIn = !!tokenManager.getToken();
  const [open, setOpen] = useState(false);
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
    <header className="flex items-center justify-between px-6 py-4 bg-[#181a20] border-b border-[#2b2f36]">
      <div className="flex items-center gap-2">
        <span className="text-2xl tracking-tight text-white font-['Archivo_Black']">
          <span className="text-[#F59E0B]">K</span>RONEX
        </span>
      </div>

      <div ref={menuRef} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="메뉴"
          className="flex items-center justify-center w-9 h-9 rounded-lg text-zinc-400 hover:text-white hover:bg-[#1f232b] transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {open && (
          <div className="absolute top-full right-0 mt-1.5 w-40 bg-[#181a20] border border-[#2b2f36] rounded-lg shadow-2xl overflow-hidden z-50">
            {isLoggedIn ? (
              <>
                <Link
                  to="/"
                  onClick={() => setOpen(false)}
                  className="block px-4 py-2.5 text-sm text-zinc-400 hover:text-white hover:bg-[#1f232b] transition-colors"
                >
                  거래하기
                </Link>
                <Link
                  to="/open-account"
                  onClick={() => setOpen(false)}
                  className="block px-4 py-2.5 text-sm text-zinc-400 hover:text-white hover:bg-[#1f232b] transition-colors"
                >
                  계좌개설
                </Link>
                <button
                  onClick={handleLogout}
                  className="block w-full text-left px-4 py-2.5 text-sm text-zinc-400 hover:text-white hover:bg-[#1f232b] transition-colors"
                >
                  로그아웃
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setOpen(false)}
                  className="block px-4 py-2.5 text-sm text-zinc-400 hover:text-white hover:bg-[#1f232b] transition-colors"
                >
                  로그인
                </Link>
                <Link
                  to="/register"
                  onClick={() => setOpen(false)}
                  className="block px-4 py-2.5 text-sm text-zinc-400 hover:text-white hover:bg-[#1f232b] transition-colors"
                >
                  회원가입
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
