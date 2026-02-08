import { createBrowserRouter } from "react-router-dom";
import { Layout } from "./components/layout";
import { TradingPage } from "./pages/TradingPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { OpenAccountPage } from "./pages/OpenAccountPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      {
        index: true,
        element: <TradingPage />,
      },
      {
        path: "login",
        element: <LoginPage />,
      },
      {
        path: "register",
        element: <RegisterPage />,
      },
      {
        path: "open-account",
        element: <OpenAccountPage />,
      },
    ],
  },
]);
