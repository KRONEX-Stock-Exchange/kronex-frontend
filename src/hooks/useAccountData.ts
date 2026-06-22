import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { WS_BASE_URL } from "../constants";
import { tokenManager } from "../services/auth/tokenManager";

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
  account: { id: number; accountNumber: number; money: string; canMoney: string };
  userStock: UserStock[];
}

export function useAccountData(accountId: number | null) {
  const [data, setData] = useState<AccountData | null>(null);
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const priceSockets = useRef<Map<number, Socket>>(new Map());

  // 메인 소켓: 계좌 구독
  useEffect(() => {
    if (!accountId) return;

    let active = true;

    const connect = () => {
      const newSocket = io(`${WS_BASE_URL}/stock`, {
        transports: ["websocket"],
        auth: { token: tokenManager.getToken() },
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

          const execution = prev.executionOrder.filter(
            (o) => o.id !== updated.id,
          );
          const noExecution = prev.noExecutionOrder.filter(
            (o) => o.id !== updated.id,
          );

          if (isExecuted) {
            execution.unshift(updated);
          } else {
            noExecution.unshift(updated);
          }

          return { executionOrder: execution, noExecutionOrder: noExecution };
        });
      });

      newSocket.on("errorCustom", async ({ message }: { message: string }) => {
        if (message === "AccessToken이 만료되었습니다.") {
          newSocket.disconnect();
          const newToken = await tokenManager.refresh();
          if (active && newToken) {
            connect();
          }
        }
      });

      socketRef.current = newSocket;
      setSocket(newSocket);
    };

    connect();

    return () => {
      active = false;
      if (socketRef.current) {
        socketRef.current.emit("leaveAccountRoom", accountId);
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [accountId]);

  // 주식별 실시간 가격 소켓
  useEffect(() => {
    if (!data?.userStock) return;

    const currentStockIds = new Set(data.userStock.map((s) => s.stocks.id));

    // 더 이상 보유하지 않는 주식 소켓 정리 (leaveStockPriceRoom 후 disconnect)
    for (const [stockId, sock] of priceSockets.current) {
      if (!currentStockIds.has(stockId)) {
        sock.emit("leaveStockPriceRoom", stockId);
        sock.disconnect();
        priceSockets.current.delete(stockId);
      }
    }

    // 새 주식에 대해 가격 소켓 생성
    for (const stockId of currentStockIds) {
      if (priceSockets.current.has(stockId)) continue;

      let active = true;

      const connectPrice = () => {
        const priceSocket = io(`${WS_BASE_URL}/stock`, {
          transports: ["websocket"],
          auth: { token: tokenManager.getToken() },
        });

        priceSocket.on("connect", () => {
          priceSocket.emit("joinStockPriceRoom", stockId);
        });

        priceSocket.on(`stockPriceUpdated_${stockId}`, (newPrice: string) => {
          setData((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              userStock: prev.userStock.map((s) =>
                s.stocks.id === stockId
                  ? { ...s, stocks: { ...s.stocks, price: newPrice } }
                  : s,
              ),
            };
          });
        });

        priceSocket.on(
          "errorCustom",
          async ({ message }: { message: string }) => {
            if (message === "AccessToken이 만료되었습니다.") {
              priceSocket.disconnect();
              priceSockets.current.delete(stockId);
              const newToken = await tokenManager.refresh();
              if (active && newToken) {
                connectPrice();
              }
            }
          },
        );

        priceSockets.current.set(stockId, priceSocket);
      };

      connectPrice();

      // active 플래그를 정리하기 위해 클로저로 관리
      const originalSocket = priceSockets.current.get(stockId);
      if (originalSocket) {
        originalSocket.once("disconnect", () => {
          active = false;
        });
      }
    }

    return () => {
      for (const [stockId, sock] of priceSockets.current) {
        sock.emit("leaveStockPriceRoom", stockId);
        sock.disconnect();
      }
      priceSockets.current.clear();
    };
  }, [data?.userStock.length]);

  return { data, orderData, socket };
}
