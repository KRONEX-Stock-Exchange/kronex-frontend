import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

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

  useEffect(() => {
    const newSocket = io("ws://localhost:3003/stock", {
      transports: ["websocket"],
    });

    newSocket.on("connect", () => {
      console.log("WebSocket connected");
      newSocket.emit("joinStockRoom", stockId);
    });

    newSocket.on("stockUpdated", (receivedData: OrderbookData) => {
      setData(receivedData);
    });

    newSocket.on("disconnect", () => {
      console.log("WebSocket disconnected");
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [stockId]);

  return { data, socket };
}
