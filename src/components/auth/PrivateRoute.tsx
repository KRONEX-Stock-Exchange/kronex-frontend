import { Navigate } from "react-router-dom";
import { tokenManager } from "../../services/auth/tokenManager";

export function PrivateRoute({ children }: { children: React.ReactNode }) {
  if (!tokenManager.getToken()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
