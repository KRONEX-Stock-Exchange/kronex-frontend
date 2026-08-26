import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "../services/api/client";

export type TransferDirection = "SENT" | "RECEIVED";
export type TransferDirectionFilter = TransferDirection | "ALL";
export type TransferSort = "LATEST" | "OLDEST";
export type TransferStatus = "RECEIVED" | "REJECTED" | "COMPLETED";

export interface TransferHistoryItem {
  id: string;
  direction: TransferDirection;
  amount: string;
  status: TransferStatus;
  rejectReason: string | null;
  senderAccountNumber: number;
  recipientAccountNumber: number;
  /** 발신자가 지정한 커스텀 이름. 없으면 서버가 계좌번호를 문자열로 채워 보낸다. */
  senderName: string;
  completedAt: string | null;
  createdAt: string;
}

interface TransferHistoryPage {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  items: TransferHistoryItem[];
}

const DEFAULT_LIMIT = 5;

/**
 * GET /accounts/:accountNumber/transfers 페이지네이션 조회.
 * 계좌·필터·정렬이 바뀌면 1페이지로 되돌린다.
 *
 * 송금은 주문·잔고와 달리 실시간 이벤트가 없어서, enabled가 켜질 때마다(= 송금 탭에
 * 들어올 때마다) 1페이지를 다시 읽어 목록이 낡은 채로 남지 않게 한다.
 */
export function useTransferHistory(
  accountNumber: number | null,
  enabled: boolean,
  limit = DEFAULT_LIMIT,
) {
  const [items, setItems] = useState<TransferHistoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [direction, setDirection] = useState<TransferDirectionFilter>("ALL");
  const [sort, setSort] = useState<TransferSort>("LATEST");
  const [loading, setLoading] = useState(false);

  // 필터를 연달아 바꿀 때 늦게 도착한 이전 응답이 최신 목록을 덮어쓰지 않도록 한다
  const requestId = useRef(0);

  const fetchPage = useCallback(
    async (targetPage: number) => {
      if (!accountNumber) {
        setItems([]);
        setTotal(0);
        setTotalPages(0);
        return;
      }

      const id = ++requestId.current;
      setLoading(true);

      const params = new URLSearchParams({
        page: String(targetPage),
        limit: String(limit),
        sort,
      });
      if (direction !== "ALL") params.set("direction", direction);

      try {
        const response = await apiClient.get<TransferHistoryPage>(
          `/accounts/${accountNumber}/transfers?${params}`,
        );
        if (id !== requestId.current) return;

        if (response.success && response.data) {
          setItems(response.data.items ?? []);
          setTotal(response.data.total);
          setTotalPages(response.data.totalPages);
        } else {
          setItems([]);
          setTotal(0);
          setTotalPages(0);
        }
      } catch {
        if (id !== requestId.current) return;
        setItems([]);
        setTotal(0);
        setTotalPages(0);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [accountNumber, limit, sort, direction],
  );

  // 탭 진입 시, 그리고 계좌·필터·정렬이 바뀔 때마다 1페이지부터 다시
  useEffect(() => {
    if (!enabled) return;
    setPage(1);
    fetchPage(1);
  }, [enabled, fetchPage]);

  const goToPage = useCallback(
    (targetPage: number) => {
      if (targetPage < 1) return;
      if (totalPages > 0 && targetPage > totalPages) return;
      setPage(targetPage);
      fetchPage(targetPage);
    },
    [fetchPage, totalPages],
  );

  // 송금 직후처럼 목록을 처음부터 다시 읽어야 할 때
  const refresh = useCallback(() => {
    setPage(1);
    fetchPage(1);
  }, [fetchPage]);

  return {
    items,
    page,
    total,
    totalPages,
    loading,
    direction,
    setDirection,
    sort,
    setSort,
    goToPage,
    refresh,
  };
}
