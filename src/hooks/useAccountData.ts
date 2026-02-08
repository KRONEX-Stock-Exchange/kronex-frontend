import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

export interface UserStock {
  number: string;
  canNumber: string;
  average: string;
  totalBuyAmount: string;
  stocks: {
    id: number;
    name: string;
    price: string;
  };
}

export interface OrderItem {
  id: number;
  stockName: string;
  stockId: number;
  price: string;
  number: string;
  matchNumber: string;
  status: string;
  tradingType: string;
}

export interface OrderData {
  executionOrder: OrderItem[];
  noExecutionOrder: OrderItem[];
}

export interface AccountData {
  account: { id: number; accountNumber: number; money: string };
  userStock: UserStock[];
}

export function useAccountData(accountId: number | null) {
  const [data, setData] = useState<AccountData | null>(null);
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const priceSockets = useRef<Map<number, Socket>>(new Map());

  // 메인 소켓: 계좌 구독
  useEffect(() => {
    if (!accountId) return;

    const newSocket = io("ws://localhost:3003/stock", {
      transports: ["websocket"],
      withCredentials: true,
    });

    newSocket.on("connect", () => {
      newSocket.emit("joinAccountRoom", accountId);
    });

    newSocket.on("accountUpdated", (receivedData: AccountData) => {
      setData(receivedData);
    });

    newSocket.on("orderInit", (receivedData: OrderData) => {
      setOrderData(receivedData);
    });

    newSocket.on("orderUpdated", (updated: OrderItem) => {
      setOrderData((prev) => {
        if (!prev) return prev;
        const isExecuted = updated.status === "y";

        // 기존 리스트에서 제거
        const execution = prev.executionOrder.filter((o) => o.id !== updated.id);
        const noExecution = prev.noExecutionOrder.filter((o) => o.id !== updated.id);

        // 상태에 맞는 리스트에 추가
        if (isExecuted) {
          execution.unshift(updated);
        } else {
          noExecution.unshift(updated);
        }

        return { executionOrder: execution, noExecutionOrder: noExecution };
      });
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [accountId]);

  // 주식별 실시간 가격 소켓
  useEffect(() => {
    if (!data?.userStock) return;

    const currentStockIds = new Set(data.userStock.map((s) => s.stocks.id));

    // 더 이상 보유하지 않는 주식 소켓 정리
    for (const [stockId, sock] of priceSockets.current) {
      if (!currentStockIds.has(stockId)) {
        sock.disconnect();
        priceSockets.current.delete(stockId);
      }
    }

    // 새 주식에 대해 가격 소켓 생성
    for (const stockId of currentStockIds) {
      if (priceSockets.current.has(stockId)) continue;

      const priceSocket = io("ws://localhost:3003/stock", {
        transports: ["websocket"],
        withCredentials: true,
      });

      priceSocket.on("connect", () => {
        priceSocket.emit("joinStockPriceRoom", stockId);
      });

      priceSocket.on("stockPriceUpdated", (newPrice: string) => {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            userStock: prev.userStock.map((s) =>
              s.stocks.id === stockId
                ? { ...s, stocks: { ...s.stocks, price: newPrice } }
                : s
            ),
          };
        });
      });

      priceSockets.current.set(stockId, priceSocket);
    }

    return () => {
      for (const [, sock] of priceSockets.current) {
        sock.disconnect();
      }
      priceSockets.current.clear();
    };
  }, [data?.userStock.length]);

  return { data, orderData, socket };
}
