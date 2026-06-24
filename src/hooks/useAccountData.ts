import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { REALTIME_URL } from "../constants";
import { tokenManager } from "../services/auth/tokenManager";

export interface Holding {
  stockId: number;
  quantity: string;
  availableQuantity: string;
  average: string;
  totalBuyAmount: string;
  stock: {
    id: number;
    name: string;
    price: string;
  };
}

export interface OrderItem {
  id: string;
  stockId: number;
  stockName: string;
  price: string;
  quantity: string;
  filledQuantity: string;
  orderType: string;
  tradingType: string;
  status: string;
  createdAt: string;
}

export interface OrderData {
  filledOrders: OrderItem[];
  openOrders: OrderItem[];
}

export interface AccountData {
  account: {
    id: number;
    accountNumber: number;
    balance: string;
    availableBalance: string;
  };
  holdings: Holding[];
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

    setData(null); // 계좌 변경 시 이전 데이터 초기화 → price socket effect 재실행 트리거

    let active = true;

    const connect = () => {
      const newSocket = io(`${REALTIME_URL}/stock`, {
        transports: ["websocket"],
        auth: { token: tokenManager.getToken() },
      });

      newSocket.on("connect", () => {
        newSocket.emit("joinAccountRoom", accountId);
      });

      newSocket.on("accountInit", (receivedData: AccountData) => {
        setData(receivedData);
      });

      newSocket.on("accountBalanceUpdated", ({ balance, availableBalance }: { id: number; balance: string; availableBalance: string }) => {
        setData((prev) => {
          if (!prev) return prev;
          return { ...prev, account: { ...prev.account, balance, availableBalance } };
        });
      });

      newSocket.on("holdingUpdated", (updated: Omit<Holding, "stock">) => {
        setData((prev) => {
          if (!prev) return prev;

          // 수량 0 → 보유 종목 제거
          if (Number(updated.quantity) === 0) {
            return {
              ...prev,
              holdings: prev.holdings.filter((h) => h.stockId !== updated.stockId),
            };
          }

          // 기존 보유 종목 업데이트
          if (prev.holdings.some((h) => h.stockId === updated.stockId)) {
            return {
              ...prev,
              holdings: prev.holdings.map((h) =>
                h.stockId === updated.stockId ? { ...h, ...updated } : h,
              ),
            };
          }

          // 신규 보유 종목 → init 재요청 (stock 정보가 없으므로)
          newSocket.emit("joinAccountRoom", accountId);
          return prev;
        });
      });

      newSocket.on("openOrdersUpdated", (data: OrderItem[]) => {
        setOrderData((prev) => ({
          filledOrders: prev?.filledOrders ?? [],
          openOrders: data,
        }));
      });

      newSocket.on("filledOrdersUpdated", (data: OrderItem[]) => {
        setOrderData((prev) => ({
          filledOrders: data,
          openOrders: prev?.openOrders ?? [],
        }));
      });

      newSocket.on("errorCustom", async ({ message }: { message: string }) => {
        if (message === "AccessToken이 만료되었습니다.") {
          newSocket.disconnect();
          const newToken = await tokenManager.refresh();
          if (active && newToken) connect();
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

  // 가격 소켓 동기화: holdings가 바뀔 때 추가/제거만, 기존 소켓은 유지
  useEffect(() => {
    // holdings 없으면 (data null 또는 초기화) 모두 정리
    if (!data?.holdings) {
      for (const [, sock] of priceSockets.current) {
        sock.disconnect();
      }
      priceSockets.current.clear();
      return;
    }

    const currentStockIds = new Set(data.holdings.map((h) => h.stock.id));

    // 더 이상 보유하지 않는 종목 소켓 제거
    for (const [stockId, sock] of priceSockets.current) {
      if (!currentStockIds.has(stockId)) {
        sock.emit("leaveStockPriceRoom", stockId);
        sock.disconnect();
        priceSockets.current.delete(stockId);
      }
    }

    // 새로 보유한 종목 소켓 생성 (기존 소켓은 건드리지 않음)
    for (const stockId of currentStockIds) {
      if (priceSockets.current.has(stockId)) continue;

      const priceSocket = io(`${REALTIME_URL}/stock`, {
        transports: ["websocket"],
        auth: { token: tokenManager.getToken() },
      });

      priceSocket.on("connect", () => {
        priceSocket.emit("joinStockPriceRoom", stockId);
      });

      priceSocket.on("stockPriceUpdated", (newPrice: number) => {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            holdings: prev.holdings.map((h) =>
              h.stock.id === stockId
                ? { ...h, stock: { ...h.stock, price: newPrice.toString() } }
                : h,
            ),
          };
        });
      });

      priceSockets.current.set(stockId, priceSocket);
    }
  }, [data?.holdings?.length]);

  // 언마운트 시 모든 price 소켓 정리
  useEffect(() => {
    return () => {
      for (const [, sock] of priceSockets.current) {
        sock.disconnect();
      }
      priceSockets.current.clear();
    };
  }, []);

  return { data, orderData, socket };
}
