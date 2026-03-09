import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { WS_BASE_URL } from "../constants";
import { tokenManager } from "../services/auth/tokenManager";

export interface OrderbookItem {
  price: string;
  number: string;
}

export interface StockInfo {
  id: number;
  name: string;
  price: string;
  previousClose: string;
  low: string;
  high: string;
  close: string;
  open: string;
  upperLimit: string;
  lowerLimit: string;
}

export interface OrderbookData {
  stockInfo: StockInfo;
  buyOrderbookData: OrderbookItem[];
  sellOrderbookData: OrderbookItem[];
  match: { price: string; number: string; type: string }[];
}

export function useOrderbook(stockId: number) {
  const [data, setData] = useState<OrderbookData | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    let active = true;

    const connect = () => {
      const newSocket = io(`${WS_BASE_URL}/stock`, {
        transports: ["websocket"],
        auth: { token: tokenManager.getToken() },
      });

      newSocket.on("connect", () => {
        newSocket.emit("joinStockRoom", stockId);
      });

      newSocket.on("stockUpdated", (receivedData: OrderbookData) => {
        setData(receivedData);
      });

      newSocket.on("disconnect", () => {
        console.log("WebSocket disconnected");
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
        socketRef.current.emit("leaveStockRoom", stockId);
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [stockId]);

  return { data, socket };
}
