import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { AccountProvider } from "../../contexts/AccountContext";
import { UpdateAvailableBanner } from "../common/UpdateAvailableBanner";

export function Layout() {
  return (
    <AccountProvider>
      <div className="flex flex-col h-screen">
        <Header />
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
      <UpdateAvailableBanner />
    </AccountProvider>
  );
}
