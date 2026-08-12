import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { REALTIME_URL } from "../constants";
import { tokenManager } from "../services/auth/tokenManager";

export interface OrderbookItem {
  price: string;
  quantity: string;
}

export interface StockInfo {
  id: number;
  name: string;
  price: string;
  prevClose: string;
  low: string;
  high: string;
  close: string;
  open: string;
  upperLimit: string;
  lowerLimit: string;
}

export interface MatchItem {
  price: string;
  quantity: string;
  type: "BUY" | "SELL";
}

export interface OrderbookData {
  stockInfo: StockInfo | null;
  buyOrderbookData: OrderbookItem[];
  sellOrderbookData: OrderbookItem[];
  match: MatchItem[];
}

export function useOrderbook(stockId: number | null) {
  const [data, setData] = useState<OrderbookData>({
    stockInfo: null,
    buyOrderbookData: [],
    sellOrderbookData: [],
    match: [],
  });
  const [loading, setLoading] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (stockId === null) return;
    let active = true;

    // 종목 전환 시 이전 종목 데이터가 잠깐씩 섞여 보이지 않도록 즉시 초기화
    setData({
      stockInfo: null,
      buyOrderbookData: [],
      sellOrderbookData: [],
      match: [],
    });
    setLoading(true);

    const connect = () => {
      const newSocket = io(`${REALTIME_URL}/stock`, {
        transports: ["websocket"],
        auth: { token: tokenManager.getToken() },
      });

      newSocket.on("connect", () => {
        newSocket.emit("joinStockRoom", stockId);
      });

      newSocket.on("stockInfoUpdated", (info: StockInfo) => {
        setData((prev) => ({ ...prev, stockInfo: info }));
        setLoading(false);
      });

      newSocket.on("orderBookUpdated", ({ buyOrderbook, sellOrderbook }: { buyOrderbook: OrderbookItem[]; sellOrderbook: OrderbookItem[] }) => {
        setData((prev) => ({ ...prev, buyOrderbookData: buyOrderbook, sellOrderbookData: sellOrderbook }));
      });

      newSocket.on("matchedListUpdated", (matched: MatchItem[]) => {
        setData((prev) => ({ ...prev, match: matched }));
      });

      newSocket.on("errorCustom", async ({ message }: { message: string }) => {
        newSocket.disconnect();
        if (message === "AccessToken이 만료되었습니다.") {
          const newToken = await tokenManager.refresh();
          if (active && newToken) {
            connect();
          }
        } else {
          tokenManager.redirectToLogin();
        }
      });

      newSocket.on("exception", (err: { message: string; errorCode: string }) => {
        console.error(`[WS] ${err.errorCode}: ${err.message}`);
      });

      socketRef.current = newSocket;
      setSocket(newSocket);
    };

    connect();

    return () => {
      active = false;
      if (socketRef.current) {
        socketRef.current.emit("leaveStockRoom", stockId);
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [stockId]);

  return { data, loading, socket };
}
