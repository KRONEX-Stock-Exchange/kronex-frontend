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
  stockName?: string;
  price: string;
  quantity: string;
  filledQuantity: string;
  orderType?: "LIMIT" | "MARKET";
  tradingType: "BUY" | "SELL" | "EDIT" | "CANCEL";
  status:
    | "RECEIVED"
    | "OPEN"
    | "FILLED"
    | "CANCELED"
    | "REPLACED"
    | "REJECTED"
    | "COMPLETED";
  createdAt?: string;
  /** 주문 수량 전체가 체결된 시각. */
  fullyFilledAt?: string;
  /** 기존 API 호환용 완료 시각 필드. */
  completedAt?: string;
  updatedAt?: string;
}

export interface OrderData {
  filledOrders: OrderItem[];
  openOrders: OrderItem[];
}

interface OrdersPageResponse {
  orders: OrderItem[];
  nextCursor: string | null;
}

// cursor: undefined = 아직 페이지 조회를 시도 안 함 (커서를 마지막 항목에서 유도해야 함)
//         string    = 다음 페이지 조회에 쓸 커서
//         null      = 더 이상 데이터 없음
type PageCursor = string | null | undefined;

// 미체결 인덱스는 score == order.id라 커서를 바로 id로 씀
function lastOpenCursor(orders?: OrderItem[]): string | undefined {
  return orders?.[orders.length - 1]?.id;
}

// 체결 인덱스는 score == fullyFilledAt(epoch ms), 없으면 id 폴백 (백엔드 filledOrderScore와 동일 로직)
function lastFilledCursor(orders?: OrderItem[]): string | undefined {
  const last = orders?.[orders.length - 1];
  if (!last) return undefined;
  return last.fullyFilledAt
    ? String(new Date(last.fullyFilledAt).getTime())
    : last.id;
}

// 이미 있는 항목이면 그 자리에서 갱신(정렬 위치 유지), 없으면 맨 앞에 추가(새 항목이라 항상 최신)
function upsertOrder(list: OrderItem[], order: OrderItem): OrderItem[] {
  const exists = list.some((o) => o.id === order.id);
  if (exists) return list.map((o) => (o.id === order.id ? order : o));
  return [order, ...list];
}

// orderUpdated(delta) 이벤트 반영: 페이지 밖에 있던 항목이라도 status만 보고 정확히 어느 탭에 있어야 하는지 판단
function applyOrderDelta(prev: OrderData | null, updates: OrderItem[]): OrderData {
  let openOrders = prev?.openOrders ?? [];
  let filledOrders = prev?.filledOrders ?? [];

  for (const order of updates) {
    if (order.status === "OPEN") {
      openOrders = upsertOrder(openOrders, order);
      filledOrders = filledOrders.filter((o) => o.id !== order.id);
    } else if (order.status === "FILLED") {
      openOrders = openOrders.filter((o) => o.id !== order.id);
      filledOrders = upsertOrder(filledOrders, order);
    } else {
      // CANCELED / REPLACED / REJECTED / COMPLETED / RECEIVED → 양쪽 탭에서 제거
      openOrders = openOrders.filter((o) => o.id !== order.id);
      filledOrders = filledOrders.filter((o) => o.id !== order.id);
    }
  }

  return { openOrders, filledOrders };
}

export interface AccountInfo {
  id: number;
  accountNumber?: number;
  balance: string;
  availableBalance: string;
}

export interface AccountData {
  account: AccountInfo | null;
  holdings: Holding[];
}

export function useAccountData(accountId: number | null) {
  const [data, setData] = useState<AccountData | null>(null);
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const priceSockets = useRef<Map<number, Socket>>(new Map());
  // accountInit 도착 여부를 소켓 콜백에서 확인하기 위한 ref
  const dataRef = useRef(data);
  dataRef.current = data;

  const [openCursor, setOpenCursor] = useState<PageCursor>(undefined);
  const [filledCursor, setFilledCursor] = useState<PageCursor>(undefined);
  const [loadingMoreOpen, setLoadingMoreOpen] = useState(false);
  const [loadingMoreFilled, setLoadingMoreFilled] = useState(false);

  // 소켓 이벤트 핸들러(마운트 시 한 번 등록)에서 최신 상태를 읽기 위한 ref
  const openCursorRef = useRef(openCursor);
  openCursorRef.current = openCursor;
  const filledCursorRef = useRef(filledCursor);
  filledCursorRef.current = filledCursor;
  const orderDataRef = useRef(orderData);
  orderDataRef.current = orderData;
  const loadingMoreOpenRef = useRef(false);
  const loadingMoreFilledRef = useRef(false);

  // 미체결 주문 다음 페이지 조회 (무한 스크롤)
  const loadMoreOpenOrders = () => {
    const sock = socketRef.current;
    if (!accountId || !sock) return;
    if (openCursorRef.current === null) return; // 더 이상 없음
    if (loadingMoreOpenRef.current) return;

    const cursor = openCursorRef.current ?? lastOpenCursor(orderDataRef.current?.openOrders);
    if (cursor == null) return; // 목록이 비어있어 페이징할 기준이 없음

    loadingMoreOpenRef.current = true;
    setLoadingMoreOpen(true);

    sock.emit(
      "getOpenOrders",
      { accountId, cursor },
      (res: OrdersPageResponse) => {
        setOrderData((prev) => ({
          filledOrders: prev?.filledOrders ?? [],
          openOrders: [...(prev?.openOrders ?? []), ...res.orders],
        }));
        setOpenCursor(res.nextCursor);
        loadingMoreOpenRef.current = false;
        setLoadingMoreOpen(false);
      },
    );
  };

  // 체결 주문 다음 페이지 조회 (무한 스크롤)
  const loadMoreFilledOrders = () => {
    const sock = socketRef.current;
    if (!accountId || !sock) return;
    if (filledCursorRef.current === null) return;
    if (loadingMoreFilledRef.current) return;

    const cursor =
      filledCursorRef.current ?? lastFilledCursor(orderDataRef.current?.filledOrders);
    if (cursor == null) return;

    loadingMoreFilledRef.current = true;
    setLoadingMoreFilled(true);

    sock.emit(
      "getFilledOrders",
      { accountId, cursor },
      (res: OrdersPageResponse) => {
        setOrderData((prev) => ({
          openOrders: prev?.openOrders ?? [],
          filledOrders: [...(prev?.filledOrders ?? []), ...res.orders],
        }));
        setFilledCursor(res.nextCursor);
        loadingMoreFilledRef.current = false;
        setLoadingMoreFilled(false);
      },
    );
  };

  // 메인 소켓: 계좌 구독
  useEffect(() => {
    if (!accountId) {
      setLoading(false);
      return;
    }

    setData(null); // 계좌 변경 시 이전 데이터 초기화 → price socket effect 재실행 트리거
    setOrderData(null);
    setOpenCursor(undefined);
    setFilledCursor(undefined);
    setLoading(true);

    let active = true;
    let initRetryTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const newSocket = io(`${REALTIME_URL}/stock`, {
        transports: ["websocket"],
        auth: { token: tokenManager.getToken() },
      });

      newSocket.on("connect", () => {
        newSocket.emit("joinAccountRoom", accountId);

        // 연결 직후 accountInit이 오지 않는 경우가 있어 도착할 때까지 몇 번 재요청한다
        // (이게 없으면 계좌 탭이 영영 빈 화면으로 남는다)
        let attempts = 0;
        const retryInit = () => {
          if (!active || dataRef.current || attempts >= 3) return;
          attempts += 1;
          newSocket.emit("joinAccountRoom", accountId);
          initRetryTimer = setTimeout(retryInit, 2000);
        };
        clearTimeout(initRetryTimer);
        initRetryTimer = setTimeout(retryInit, 2000);
      });

      newSocket.on("accountInit", (receivedData: AccountData) => {
        clearTimeout(initRetryTimer);
        setLoading(false);
        setData({
          ...receivedData,
          holdings: receivedData.holdings.filter(
            (holding) =>
              Number(holding.quantity) !== 0 ||
              Number(holding.availableQuantity) !== 0,
          ),
        });
      });

      newSocket.on("accountBalanceUpdated", (account: AccountInfo | null) => {
        setData((prev) => (prev ? { ...prev, account } : prev));
      });

      newSocket.on(
        "holdingUpdated",
        (updated: Omit<Holding, "stock"> | null) => {
          if (!updated) return;

        setData((prev) => {
          if (!prev) return prev;

          // 보유·가능 수량이 모두 0일 때만 보유 종목 제거
          if (
            Number(updated.quantity) === 0 &&
            Number(updated.availableQuantity) === 0
          ) {
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
        },
      );

      // 계좌 입장 시 1회성 초기 페이지 (이후 갱신은 orderUpdated로 옴)
      newSocket.on("openOrdersInit", (data: OrderItem[]) => {
        setOrderData((prev) => ({ filledOrders: prev?.filledOrders ?? [], openOrders: data }));
      });

      newSocket.on("filledOrdersInit", (data: OrderItem[]) => {
        setOrderData((prev) => ({ openOrders: prev?.openOrders ?? [], filledOrders: data }));
      });

      // 실시간 delta: 바뀐 주문만 옴. status 보고 어느 탭에 반영할지 판단 (스크롤로 불러온 뒷페이지 항목도 정확히 처리됨)
      newSocket.on("orderUpdated", (updates: OrderItem[]) => {
        setOrderData((prev) => applyOrderDelta(prev, updates));
      });

      newSocket.on("errorCustom", async ({ message }: { message: string }) => {
        newSocket.disconnect();
        if (message === "AccessToken이 만료되었습니다.") {
          const newToken = await tokenManager.refresh();
          if (active && newToken) connect();
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
      clearTimeout(initRetryTimer);
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
    const connectPriceSocket = (id: number) => {
      const priceSocket = io(`${REALTIME_URL}/stock`, {
        transports: ["websocket"],
        auth: { token: tokenManager.getToken() },
      });

      priceSocket.on("connect", () => {
        priceSocket.emit("joinStockPriceRoom", id);
      });

      priceSocket.on("stockPriceUpdated", (newPrice: string) => {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            holdings: prev.holdings.map((h) =>
              h.stock.id === id
                ? { ...h, stock: { ...h.stock, price: newPrice } }
                : h,
            ),
          };
        });
      });

      priceSocket.on("errorCustom", async ({ message }: { message: string }) => {
        priceSocket.disconnect();
        if (message === "AccessToken이 만료되었습니다.") {
          const newToken = await tokenManager.refresh();
          // 갱신 대기 중 보유 종목에서 빠졌다면 재연결하지 않음
          if (newToken && priceSockets.current.get(id) === priceSocket) {
            connectPriceSocket(id);
          }
        } else {
          tokenManager.redirectToLogin();
        }
      });

      priceSockets.current.set(id, priceSocket);
    };

    for (const stockId of currentStockIds) {
      if (priceSockets.current.has(stockId)) continue;
      connectPriceSocket(stockId);
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

  return {
    data,
    orderData,
    loading,
    socket,
    loadMoreOpenOrders,
    loadMoreFilledOrders,
    loadingMoreOpen,
    loadingMoreFilled,
    hasMoreOpenOrders: openCursor !== null,
    hasMoreFilledOrders: filledCursor !== null,
  };
}
