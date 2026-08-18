import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiClient } from "../services/api/client";
import { tokenManager } from "../services/auth/tokenManager";
import type { Account } from "../types";

interface AccountContextType {
  accounts: Account[];
  selectedAccount: Account | null;
  setSelectedAccount: (account: Account) => void;
  fetchAccounts: () => Promise<Account[]>;
}

const AccountContext = createContext<AccountContextType | null>(null);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

  const fetchAccounts = useCallback(async (): Promise<Account[]> => {
    try {
      const response = await apiClient.get<Account[] | Record<string, Account>>("/accounts");
      if (response.success && response.data) {
        const data = Array.isArray(response.data)
          ? response.data
          : Object.values(response.data);
        setAccounts(data);
        // 이전 세션에서 고른 계좌가 새 목록에 없으면 첫 계좌로 교체한다
        setSelectedAccount((prev) =>
          prev && data.some((a) => a.id === prev.id) ? prev : (data[0] ?? null),
        );
        return data;
      }
    } catch {
      // silently fail
    }
    return [];
  }, []);

  useEffect(() => {
    // 토큰이 없으면 호출하지 않는다. 로그인 전에 401을 내면 apiClient가 토큰 재발급을
    // 시도하고, 그 요청이 로그인 직후에 실패로 끝나면 갓 발급된 토큰을 지워버려
    // 실시간 소켓 인증이 깨진다.
    if (!tokenManager.getToken()) return;
    fetchAccounts();
  }, [fetchAccounts]);

  return (
    <AccountContext.Provider
      value={{ accounts, selectedAccount, setSelectedAccount, fetchAccounts }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const context = useContext(AccountContext);
  if (!context) {
    throw new Error("useAccount must be used within AccountProvider");
  }
  return context;
}
