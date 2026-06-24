import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiClient } from "../services/api/client";
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
        if (data.length > 0 && !selectedAccount) {
          setSelectedAccount(data[0]);
        }
        return data;
      }
    } catch {
      // silently fail
    }
    return [];
  }, [selectedAccount]);

  useEffect(() => {
    fetchAccounts();
  }, []);

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
