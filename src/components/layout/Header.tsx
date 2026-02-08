import { Link } from "react-router-dom";

export function Header() {
  return (
    <header className="flex items-center justify-between px-6 py-4 bg-zinc-900 border-b border-zinc-800">
      <div className="text-xl font-bold text-white">Exchange</div>
      <nav className="flex gap-6">
        <Link to="/" className="text-zinc-400 hover:text-white">
          Trading
        </Link>
        <Link to="/open-account" className="text-zinc-400 hover:text-white">
          Open Account
        </Link>
        <Link to="/login" className="text-zinc-400 hover:text-white">
          Login
        </Link>
        <Link to="/register" className="text-zinc-400 hover:text-white">
          Register
        </Link>
      </nav>
    </header>
  );
}
