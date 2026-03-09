import { Link, useNavigate } from "react-router-dom";
import { tokenManager } from "../../services/auth/tokenManager";

export function Header() {
  const navigate = useNavigate();
  const isLoggedIn = !!tokenManager.getToken();

  const handleLogout = () => {
    tokenManager.clearToken();
    navigate("/login");
  };

  return (
    <header className="flex items-center justify-between px-6 py-4 bg-zinc-900 border-b border-zinc-800">
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#78350F]">
          <svg width="16" height="16" viewBox="0 0 28 28" fill="none">
            <polygon points="3,25 14,3 25,25 14,16" fill="white" />
          </svg>
        </div>
        <span className="text-xl font-bold tracking-wide text-white">
          <span className="text-[#F59E0B]">K</span>RONEX
        </span>
      </div>
      <nav className="flex gap-6">
        {isLoggedIn ? (
          <>
            <Link to="/" className="text-zinc-400 hover:text-white">
              거래하기
            </Link>
            <Link to="/open-account" className="text-zinc-400 hover:text-white">
              계좌개설
            </Link>
            <button
              onClick={handleLogout}
              className="text-zinc-400 hover:text-white"
            >
              로그아웃
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="text-zinc-400 hover:text-white">
              로그인
            </Link>
            <Link to="/register" className="text-zinc-400 hover:text-white">
              회원가입
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
