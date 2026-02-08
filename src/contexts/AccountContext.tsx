import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiClient } from "../services/api/client";
import type { Account } from "../types";

interface AccountContextType {
  accounts: Account[];
  selectedAccount: Account | null;
  setSelectedAccount: (account: Account) => void;
  fetchAccounts: () => Promise<void>;
}

const AccountContext = createContext<AccountContextType | null>(null);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const response = await apiClient.get<Account[]>("/accounts");
      if (response.success && response.data) {
        setAccounts(response.data);
        if (response.data.length > 0 && !selectedAccount) {
          setSelectedAccount(response.data[0]);
        }
      }
    } catch {
      // silently fail
    }
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
