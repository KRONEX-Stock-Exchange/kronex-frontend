import { useState, useEffect } from "react";
import { OrderBook } from "../components/orderbook/orderbook";
import { StockHeader } from "../components/stock/StockHeader";
import { CandlestickChart } from "../components/chart/CandlestickChart";
import { useOrderbook } from "../hooks/useOrderbook";
import { useAccountData, type OrderItem } from "../hooks/useAccountData";
import { useAccount } from "../contexts/AccountContext";
import { apiClient } from "../services/api/client";

interface StockItem {
  id: number;
  name: string;
  price: string;
  per: string;
}

const fmtWon = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

type OrderTypeTab = "매수" | "매도" | "정정" | "취소";
type AccountTab = "내 계좌" | "체결" | "미체결";

export function TradingPage() {
  const [stockId, setStockId] = useState<number | null>(null);
  const { data } = useOrderbook(stockId);
  const { accounts, selectedAccount, setSelectedAccount } = useAccount();
  const { data: accountData, orderData } = useAccountData(
    selectedAccount?.id ?? null,
  );

  const [accountTab, setAccountTab] = useState<AccountTab>("내 계좌");
  const [orderType, setOrderType] = useState<OrderTypeTab>("매수");
  const [priceType, setPriceType] = useState<"지정가" | "시장가">("지정가");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [orderLoading, setOrderLoading] = useState(false);
  const [stocks, setStocks] = useState<StockItem[]>([]);

  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);
  const [amendPrice, setAmendPrice] = useState("");
  const [amendLoading, setAmendLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  const [showTransfer, setShowTransfer] = useState(false);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferLoading, setTransferLoading] = useState(false);

  useEffect(() => {
    const fetchStocks = async () => {
      const response = await apiClient.get<StockItem[]>("/stocks");
      if (response.success && response.data) {
        setStocks(response.data);
        setStockId((prev) => prev ?? response.data![0]?.id ?? null);
      }
    };
    fetchStocks();
    const interval = setInterval(fetchStocks, 300000);
    return () => clearInterval(interval);
  }, []);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const getErrorMsg = (error: unknown, fallback: string) =>
    typeof error === "object" && error !== null
      ? ((error as { message?: string }).message ?? fallback)
      : ((error as string) ?? fallback);

  const handleOrder = async () => {
    const qty = parseInt(quantity);
    const prc = parseInt(price);
    if (!quantity || qty < 1)
      return showToast("수량은 1주 이상 입력해주세요.", "error");
    if (priceType === "지정가" && (!price || prc < 1))
      return showToast("가격은 1원 이상 입력해주세요.", "error");
    setOrderLoading(true);
    try {
      const endpoint =
        orderType === "매수"
          ? `/stocks/${stockId}/orders/buy`
          : `/stocks/${stockId}/orders/sell`;
      const response = await apiClient.post(endpoint, {
        accountNumber: selectedAccount?.accountNumber,
        price: priceType === "지정가" ? prc : 0,
        quantity: qty,
        orderType: priceType === "지정가" ? "LIMIT" : "MARKET",
      });
      if (response.success)
        showToast(`${orderType} 주문이 완료되었습니다.`, "success");
      else
        showToast(getErrorMsg(response.error, "주문에 실패했습니다."), "error");
    } catch {
      showToast("서버 연결에 실패했습니다.", "error");
    } finally {
      setOrderLoading(false);
    }
  };

  const handleAmend = async () => {
    if (!selectedOrder || !amendPrice || parseInt(amendPrice) < 1)
      return showToast("정정 가격을 입력해주세요.", "error");
    setAmendLoading(true);
    try {
      const response = await apiClient.put(`/orders/${selectedOrder.id}`, {
        accountNumber: selectedAccount?.accountNumber,
        price: parseInt(amendPrice),
      });
      if (response.success) {
        showToast("주문이 정정되었습니다.", "success");
        setSelectedOrder(null);
        setAmendPrice("");
      } else {
        showToast(getErrorMsg(response.error, "정정에 실패했습니다."), "error");
      }
    } catch {
      showToast("서버 연결에 실패했습니다.", "error");
    } finally {
      setAmendLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!selectedOrder) return;
    setCancelLoading(true);
    try {
      const response = await apiClient.delete(`/orders/${selectedOrder.id}`, {
        accountNumber: selectedAccount?.accountNumber,
      });
      if (response.success) {
        showToast("주문이 취소되었습니다.", "success");
        setSelectedOrder(null);
        setAmendPrice("");
      } else {
        showToast(getErrorMsg(response.error, "취소에 실패했습니다."), "error");
      }
    } catch {
      showToast("서버 연결에 실패했습니다.", "error");
    } finally {
      setCancelLoading(false);
    }
  };

  const handleTransfer = async () => {
    const amount = parseInt(transferAmount);
    const toAccountNumber = parseInt(transferTo);
    if (!amount || amount < 1)
      return showToast("금액을 입력해주세요.", "error");
    if (!toAccountNumber)
      return showToast("받는 계좌번호를 입력해주세요.", "error");
    if (!selectedAccount) return showToast("계좌를 선택해주세요.", "error");
    setTransferLoading(true);
    try {
      const response = await apiClient.post(
        `/accounts/${selectedAccount.accountNumber}/transfer`,
        {
          amount,
          toAccountNumber,
        },
      );
      if (response.success) {
        showToast("송금이 완료되었습니다.", "success");
        setShowTransfer(false);
        setTransferAmount("");
        setTransferTo("");
      } else {
        showToast(getErrorMsg(response.error, "송금에 실패했습니다."), "error");
      }
    } catch {
      showToast("서버 연결에 실패했습니다.", "error");
    } finally {
      setTransferLoading(false);
    }
  };

  const selectOrder = (order: OrderItem) => {
    setSelectedOrder(order);
    setAmendPrice(order.price);
    setOrderType("정정");
  };

  return (
    <div className="flex flex-col h-full w-full">
      <StockHeader
        stockInfo={data?.stockInfo ?? null}
        stocks={stocks}
        selectedStockId={stockId}
        onSelectStock={setStockId}
      />

      <div className="flex flex-1 min-h-0 p-5 pb-5 pt-2">
        {/* 좌: 차트 + 계좌 */}
        <div className="w-[50%] min-h-0 flex flex-col p-2 gap-2">
          <div className="h-[52%]">
            <CandlestickChart stockId={stockId} />
          </div>
          <div className="h-[48%] min-h-0 bg-[#181a20] rounded-2xl p-4 flex flex-col">
            <div className="flex items-center gap-4 mb-3 shrink-0">
              {(["내 계좌", "체결", "미체결"] as AccountTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setAccountTab(tab)}
                  className={`text-sm ${accountTab === tab ? "text-white" : "text-zinc-400"}`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="flex-1 min-h-0 overflow-auto scrollbar-thin">
              {accountTab === "내 계좌" && (
                <>
                  <div className="mb-3 flex flex-col gap-2">
                    <select
                      value={selectedAccount?.id ?? ""}
                      onChange={(e) => {
                        const account = accounts.find(
                          (a) => a.id === Number(e.target.value),
                        );
                        if (account) setSelectedAccount(account);
                      }}
                      className="bg-[#2b2f36] text-white text-xs px-3 py-1 rounded-lg border border-[#3b3f46] outline-none w-fit"
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.accountNumber}
                        </option>
                      ))}
                    </select>
                    {accountData?.account && (
                      <div className="grid grid-cols-[minmax(130px,1fr)_1px_minmax(130px,1fr)] gap-3 px-3 py-2 bg-[#2b2f36] rounded-lg border border-[#3b3f46]">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-[10px] text-zinc-500">
                            예수금
                          </span>
                          <span className="inline-block min-w-[104px] whitespace-nowrap text-xs text-white font-semibold tabular-nums">
                            {fmtWon(accountData.account.balance)}{" "}
                            KRW
                          </span>
                        </div>
                        <div className="w-px bg-[#3b3f46]" />
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-[10px] text-zinc-500">
                            사용가능
                          </span>
                          <span className="inline-block min-w-[104px] whitespace-nowrap text-xs text-[#0ecb81] font-semibold tabular-nums">
                            {fmtWon(accountData.account.availableBalance)}{" "}
                            KRW
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  <table className="w-full min-w-[760px] table-fixed text-xs">
                    <colgroup>
                      <col className="w-[18%]" />
                      <col className="w-[10%]" />
                      <col className="w-[10%]" />
                      <col className="w-[12%]" />
                      <col className="w-[12%]" />
                      <col className="w-[15%]" />
                      <col className="w-[10%]" />
                      <col className="w-[13%]" />
                    </colgroup>
                    <thead className="text-zinc-500 border-b border-[#2b2f36]">
                      <tr>
                        <th className="text-left py-2">종목명</th>
                        <th className="text-right py-2">보유</th>
                        <th className="text-right py-2">가능</th>
                        <th className="text-right py-2">평균가</th>
                        <th className="text-right py-2">현재가</th>
                        <th className="text-right py-2">매수금액</th>
                        <th className="text-right py-2">수익률</th>
                        <th className="text-right py-2">수익금액</th>
                      </tr>
                    </thead>
                    <tbody className="text-white">
                      {accountData?.holdings.map((stock) => {
                        const cur = Number(stock.stock.price);
                        const avg = Number(stock.average);
                        const qty = Number(stock.quantity);
                        const rate = avg > 0 ? ((cur - avg) / avg) * 100 : 0;
                        const amount = (cur - avg) * qty;
                        const color =
                          rate > 0
                            ? "text-[#f6465d]"
                            : rate < 0
                              ? "text-[#2563eb]"
                              : "text-white";
                        return (
                          <tr
                            key={stock.stock.id}
                            onClick={() => { if (stock.stock.id !== stockId) setStockId(stock.stock.id); }}
                            className={`border-b border-[#2b2f36] cursor-pointer hover:bg-[#2b2f36] transition-colors ${stock.stock.id === stockId ? "bg-[#23272f]" : ""}`}
                          >
                            <td className="py-2 pr-2 truncate">{stock.stock.name}</td>
                            <td className="text-right py-2 tabular-nums">
                              {qty.toLocaleString("ko-KR")}
                            </td>
                            <td className="text-right py-2 tabular-nums">
                              {Number(stock.availableQuantity).toLocaleString("ko-KR")}
                            </td>
                            <td className="text-right py-2 tabular-nums">
                              {avg.toLocaleString("ko-KR")}
                            </td>
                            <td className="text-right py-2 tabular-nums">
                              {cur.toLocaleString("ko-KR")}
                            </td>
                            <td className="text-right py-2 tabular-nums">
                              {Number(stock.totalBuyAmount).toLocaleString(
                                "ko-KR",
                              )}
                            </td>
                            <td className={`text-right py-2 tabular-nums ${color}`}>
                              {rate > 0 ? "+" : ""}
                              {rate.toFixed(2)}%
                            </td>
                            <td className={`text-right py-2 tabular-nums ${color}`}>
                              {amount > 0 ? "+" : ""}
                              {amount.toLocaleString("ko-KR")}
                            </td>
                          </tr>
                        );
                      })}
                      {(!accountData || accountData.holdings.length === 0) && (
                        <tr>
                          <td
                            colSpan={8}
                            className="py-4 text-center text-zinc-500"
                          >
                            보유 종목이 없습니다
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </>
              )}

              {accountTab === "체결" && (
                <table className="w-full text-xs">
                  <thead className="text-zinc-500 border-b border-[#2b2f36]">
                    <tr>
                      <th className="text-left py-2">주문ID</th>
                      <th className="text-left py-2">종목명</th>
                      <th className="text-right py-2">유형</th>
                      <th className="text-right py-2">주문구분</th>
                      <th className="text-right py-2">주문수량</th>
                      <th className="text-right py-2">체결수량</th>
                      <th className="text-right py-2">주문가격</th>
                      <th className="text-right py-2">접수시간</th>
                    </tr>
                  </thead>
                  <tbody className="text-white">
                    {orderData?.filledOrders.map((order) => (
                      <tr key={order.id} className="border-b border-[#2b2f36]">
                        <td className="py-2">{order.id}</td>
                        <td className="py-2">{order.stockName}</td>
                        <td
                          className={`text-right py-2 ${order.tradingType === "BUY" ? "text-[#f6465d]" : "text-[#2563eb]"}`}
                        >
                          {order.tradingType === "BUY" ? "매수" : "매도"}
                        </td>
                        <td className="text-right py-2">
                          {order.orderType === "MARKET" ? "시장가" : "지정가"}
                        </td>
                        <td className="text-right py-2">
                          {Number(order.quantity).toLocaleString("ko-KR")}
                        </td>
                        <td className="text-right py-2">
                          {Number(order.filledQuantity).toLocaleString("ko-KR")}
                        </td>
                        <td className="text-right py-2">
                          {order.orderType === "MARKET"
                            ? "-"
                            : Number(order.price).toLocaleString("ko-KR")}
                        </td>
                        <td className="text-right py-2 text-zinc-400">
                          {order.createdAt
                            ? new Date(order.createdAt).toLocaleTimeString(
                                "ko-KR",
                              )
                            : "-"}
                        </td>
                      </tr>
                    ))}
                    {(!orderData || orderData.filledOrders.length === 0) && (
                      <tr>
                        <td
                          colSpan={8}
                          className="py-4 text-center text-zinc-500"
                        >
                          체결 내역이 없습니다
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              {accountTab === "미체결" && (
                <table className="w-full text-xs">
                  <thead className="text-zinc-500 border-b border-[#2b2f36]">
                    <tr>
                      <th className="text-left py-2">주문ID</th>
                      <th className="text-left py-2">종목명</th>
                      <th className="text-right py-2">유형</th>
                      <th className="text-right py-2">주문구분</th>
                      <th className="text-right py-2">주문수량</th>
                      <th className="text-right py-2">주문가격</th>
                      <th className="text-right py-2">미체결</th>
                      <th className="text-right py-2">접수시간</th>
                    </tr>
                  </thead>
                  <tbody className="text-white">
                    {orderData?.openOrders.map((order) => {
                      const isSelected = selectedOrder?.id === order.id;
                      return (
                        <tr
                          key={order.id}
                          onClick={() => selectOrder(order)}
                          className={`border-b border-[#2b2f36] cursor-pointer transition-colors ${isSelected ? "bg-[#2b2f36]" : "hover:bg-[#1f2230]"}`}
                        >
                          <td className="py-2">{order.id}</td>
                          <td className="py-2">{order.stockName}</td>
                          <td
                            className={`text-right py-2 ${order.tradingType === "BUY" ? "text-[#f6465d]" : "text-[#2563eb]"}`}
                          >
                            {order.tradingType === "BUY" ? "매수" : "매도"}
                          </td>
                          <td className="text-right py-2">
                            {order.orderType === "MARKET" ? "시장가" : "지정가"}
                          </td>
                          <td className="text-right py-2">
                            {Number(order.quantity).toLocaleString("ko-KR")}
                          </td>
                          <td className="text-right py-2">
                            {order.orderType === "MARKET"
                              ? "-"
                              : Number(order.price).toLocaleString("ko-KR")}
                          </td>
                          <td className="text-right py-2">
                            {(
                              Number(order.quantity) - Number(order.filledQuantity)
                            ).toLocaleString("ko-KR")}
                          </td>
                          <td className="text-right py-2 text-zinc-400">
                            {order.createdAt
                              ? new Date(order.createdAt).toLocaleTimeString(
                                  "ko-KR",
                                )
                              : "-"}
                          </td>
                        </tr>
                      );
                    })}
                    {(!orderData ||
                      orderData.openOrders.length === 0) && (
                      <tr>
                        <td
                          colSpan={8}
                          className="py-4 text-center text-zinc-500"
                        >
                          미체결 내역이 없습니다
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* 중: 호가창 */}
        <div className="w-[30%] p-2">
          <OrderBook stockId={stockId} />
        </div>

        {/* 우: 주문 + 등락률 */}
        <div className="w-[20%] flex flex-col p-2 gap-2">
          <div className="h-[55%] bg-[#181a20] rounded-2xl p-4 flex flex-col">
            <div className="flex items-center gap-3 mb-4 shrink-0 border-b border-[#2b2f36] pb-3">
              <button
                onClick={() => setOrderType("매수")}
                className={`text-sm ${orderType === "매수" ? "text-[#f6465d] font-bold" : "text-zinc-400"}`}
              >
                매수
              </button>
              <button
                onClick={() => setOrderType("매도")}
                className={`text-sm ${orderType === "매도" ? "text-[#2563eb] font-bold" : "text-zinc-400"}`}
              >
                매도
              </button>
              <div className="w-px h-3 bg-[#2b2f36]" />
              <button
                onClick={() => setOrderType("정정")}
                className={`text-sm ${orderType === "정정" ? "text-[#F59E0B] font-bold" : "text-zinc-400"}`}
              >
                정정
              </button>
              <button
                onClick={() => setOrderType("취소")}
                className={`text-sm ${orderType === "취소" ? "text-zinc-300 font-bold" : "text-zinc-400"}`}
              >
                취소
              </button>
            </div>

            <div className="flex flex-col gap-3 flex-1 overflow-y-auto scrollbar-thin min-h-0">
              {(orderType === "매수" || orderType === "매도") && (
                <>
                  <div>
                    <label className="text-xs text-zinc-500 mb-1 block">
                      주문계좌
                    </label>
                    <select
                      value={selectedAccount?.id ?? ""}
                      onChange={(e) => {
                        const account = accounts.find(
                          (a) => a.id === Number(e.target.value),
                        );
                        if (account) setSelectedAccount(account);
                      }}
                      className="w-full bg-[#2b2f36] text-white text-xs px-3 py-2 rounded-lg border border-[#3b3f46] outline-none"
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.accountNumber}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-zinc-500 mb-1 block">
                      주문유형
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPriceType("지정가")}
                        className={`flex-1 py-2 text-xs rounded-lg ${priceType === "지정가" ? "bg-[#2b2f36] text-white border border-[#3b3f46]" : "bg-transparent text-zinc-400 border border-[#2b2f36]"}`}
                      >
                        지정가
                      </button>
                      <button
                        onClick={() => setPriceType("시장가")}
                        className={`flex-1 py-2 text-xs rounded-lg ${priceType === "시장가" ? "bg-[#2b2f36] text-white border border-[#3b3f46]" : "bg-transparent text-zinc-400 border border-[#2b2f36]"}`}
                      >
                        시장가
                      </button>
                    </div>
                  </div>

                  {priceType === "지정가" && (
                    <div>
                      <label className="text-xs text-zinc-500 mb-1 block">
                        가격
                      </label>
                      <input
                        type="number"
                        placeholder="0"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        className="w-full bg-[#2b2f36] text-white text-xs px-3 py-2 rounded-lg border border-[#3b3f46] outline-none"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-xs text-zinc-500 mb-1 block">
                      수량
                    </label>
                    <input
                      type="number"
                      placeholder="0"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="w-full bg-[#2b2f36] text-white text-xs px-3 py-2 rounded-lg border border-[#3b3f46] outline-none"
                    />
                  </div>

                  <div className="flex gap-1">
                    {[10, 25, 50, 100].map((pct) => (
                      <button
                        key={pct}
                        onClick={() => {
                          const orderPrice =
                            priceType === "지정가"
                              ? parseInt(price)
                              : parseFloat(data?.stockInfo?.upperLimit ?? "0");
                          if (orderType === "매수") {
                            const balance = accountData?.account?.balance ?? "0";
                            if (orderPrice > 0)
                              setQuantity(
                                String(
                                  BigInt(balance) * BigInt(pct) / 100n / BigInt(orderPrice),
                                ),
                              );
                          } else {
                            const holding = accountData?.holdings?.find(
                              (s) => s.stock.id === stockId,
                            );
                            const canSell = parseInt(holding?.availableQuantity ?? "0");
                            setQuantity(
                              String(Math.floor((canSell * pct) / 100)),
                            );
                          }
                        }}
                        className="flex-1 py-1 text-[10px] rounded bg-[#2b2f36] text-zinc-400 hover:text-white"
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={handleOrder}
                    disabled={orderLoading}
                    className={`py-3 rounded-lg text-sm font-bold disabled:opacity-50 shrink-0 ${orderType === "매수" ? "bg-[#f6465d] text-white" : "bg-[#2563eb] text-white"}`}
                  >
                    {orderLoading ? "처리중..." : orderType}
                  </button>
                </>
              )}

              {orderType === "정정" &&
                (selectedOrder ? (
                  <>
                    <div className="px-3 py-2 bg-[#2b2f36] rounded-lg text-xs flex flex-col gap-1.5">
                      <div className="flex justify-between">
                        <span className="text-zinc-400">주문 ID</span>
                        <span className="text-white">#{selectedOrder.id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">종목</span>
                        <span className="text-white">
                          {selectedOrder.stockName}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">유형</span>
                        <span
                          className={
                            selectedOrder.tradingType === "BUY"
                              ? "text-[#f6465d]"
                              : "text-[#2563eb]"
                          }
                        >
                          {selectedOrder.tradingType === "BUY"
                            ? "매수"
                            : "매도"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">현재 가격</span>
                        <span className="text-white">
                          {Number(selectedOrder.price).toLocaleString("ko-KR")}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 mb-1 block">
                        정정 가격
                      </label>
                      <input
                        type="number"
                        placeholder="0"
                        value={amendPrice}
                        onChange={(e) => setAmendPrice(e.target.value)}
                        className="w-full bg-[#2b2f36] text-white text-xs px-3 py-2 rounded-lg border border-[#3b3f46] outline-none focus:border-[#F59E0B]"
                      />
                    </div>
                    <button
                      onClick={handleAmend}
                      disabled={amendLoading}
                      className="py-3 rounded-lg text-sm font-bold disabled:opacity-50 bg-[#F59E0B] text-gray-900 shrink-0"
                    >
                      {amendLoading ? "처리중..." : "정정 확인"}
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-zinc-500 text-center py-6">
                    미체결 탭에서 주문을 선택하세요
                  </p>
                ))}

              {orderType === "취소" &&
                (selectedOrder ? (
                  <>
                    <div className="px-3 py-2 bg-[#2b2f36] rounded-lg text-xs flex flex-col gap-1.5">
                      <div className="flex justify-between">
                        <span className="text-zinc-400">주문 ID</span>
                        <span className="text-white">#{selectedOrder.id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">종목</span>
                        <span className="text-white">
                          {selectedOrder.stockName}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">유형</span>
                        <span
                          className={
                            selectedOrder.tradingType === "BUY"
                              ? "text-[#f6465d]"
                              : "text-[#2563eb]"
                          }
                        >
                          {selectedOrder.tradingType === "BUY"
                            ? "매수"
                            : "매도"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">수량</span>
                        <span className="text-white">
                          {Number(selectedOrder.quantity).toLocaleString("ko-KR")}
                          주
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">가격</span>
                        <span className="text-white">
                          {Number(selectedOrder.price) === 0
                            ? "시장가"
                            : Number(selectedOrder.price).toLocaleString(
                                "ko-KR",
                              )}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={handleCancel}
                      disabled={cancelLoading}
                      className="py-3 rounded-lg text-sm font-bold disabled:opacity-50 bg-transparent border border-[#f6465d] text-[#f6465d] hover:bg-[#f6465d]/10 shrink-0"
                    >
                      {cancelLoading ? "처리중..." : "주문 취소 확인"}
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-zinc-500 text-center py-6">
                    미체결 탭에서 주문을 선택하세요
                  </p>
                ))}
            </div>
          </div>

          <div className="h-[45%] bg-[#181a20] rounded-2xl p-4 flex flex-col">
            <div className="text-sm text-zinc-400 mb-3">실시간 등락률</div>
            <div className="flex-1 overflow-auto scrollbar-thin">
              <table className="w-full text-xs">
                <thead className="text-zinc-500 border-b border-[#2b2f36]">
                  <tr>
                    <th className="text-left py-1 w-8">순위</th>
                    <th className="text-left py-1">종목명</th>
                    <th className="text-right py-1">현재가</th>
                    <th className="text-right py-1">등락률</th>
                  </tr>
                </thead>
                <tbody className="text-white">
                  {[...stocks]
                    .sort((a, b) => parseFloat(b.per) - parseFloat(a.per))
                    .map((stock, i) => {
                      const per = parseFloat(stock.per);
                      const color =
                        per > 0
                          ? "text-[#f6465d]"
                          : per < 0
                            ? "text-[#2563eb]"
                            : "text-white";
                      return (
                        <tr
                          key={stock.id}
                          className="border-b border-[#2b2f36]"
                        >
                          <td className="py-1.5">{i + 1}</td>
                          <td className="py-1.5">{stock.name}</td>
                          <td className="text-right py-1.5">
                            {Number(stock.price).toLocaleString("ko-KR")}
                          </td>
                          <td className={`text-right py-1.5 ${color}`}>
                            {per > 0 ? "+" : ""}
                            {per.toFixed(2)}%
                          </td>
                        </tr>
                      );
                    })}
                  {stocks.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="py-4 text-center text-zinc-500"
                      >
                        종목 데이터 없음
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* 송금 플로팅 버튼 */}
      <button
        onClick={() => setShowTransfer(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 bg-[#F59E0B] hover:bg-[#D97706] text-gray-900 font-bold text-sm rounded-full shadow-lg transition-colors"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2v20M2 12h20" />
        </svg>
        송금
      </button>

      {/* 송금 모달 */}
      {showTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setShowTransfer(false)}
          />
          <div className="relative bg-[#181a20] rounded-2xl p-6 w-80 border border-[#2b2f36] shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <span className="text-white font-bold text-base">송금</span>
              <button
                onClick={() => setShowTransfer(false)}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-zinc-500 mb-1.5 block">
                  보내는 계좌
                </label>
                <select
                  value={selectedAccount?.id ?? ""}
                  onChange={(e) => {
                    const account = accounts.find(
                      (a) => a.id === Number(e.target.value),
                    );
                    if (account) setSelectedAccount(account);
                  }}
                  className="w-full bg-[#2b2f36] text-white text-xs px-3 py-2.5 rounded-lg border border-[#3b3f46] outline-none"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.accountNumber}
                    </option>
                  ))}
                </select>
                {accountData?.account && (
                  <p className="text-[10px] text-zinc-500 mt-1 px-1">
                    사용 가능:{" "}
                    <span className="text-[#0ecb81]">
                      {fmtWon(accountData.account.availableBalance)}{" "}
                      KRW
                    </span>
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs text-zinc-500 mb-1.5 block">
                  받는 계좌번호
                </label>
                <input
                  type="number"
                  placeholder="계좌번호 입력"
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                  className="w-full bg-[#2b2f36] text-white text-xs px-3 py-2.5 rounded-lg border border-[#3b3f46] outline-none focus:border-[#F59E0B]"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-500 mb-1.5 block">
                  금액
                </label>
                <input
                  type="number"
                  placeholder="0"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  className="w-full bg-[#2b2f36] text-white text-xs px-3 py-2.5 rounded-lg border border-[#3b3f46] outline-none focus:border-[#F59E0B]"
                />
                <div className="flex gap-1 mt-2">
                  {[10000, 50000, 100000].map((amt) => (
                    <button
                      key={amt}
                      onClick={() =>
                        setTransferAmount((prev) =>
                          String((parseInt(prev) || 0) + amt),
                        )
                      }
                      className="flex-1 py-1.5 text-[10px] rounded bg-[#2b2f36] text-zinc-400 hover:text-white transition-colors"
                    >
                      +{(amt / 10000).toLocaleString("ko-KR")}만
                    </button>
                  ))}
                  <button
                    onClick={() => setTransferAmount("")}
                    className="px-2 py-1.5 text-[10px] rounded bg-[#2b2f36] text-zinc-400 hover:text-white transition-colors"
                  >
                    초기화
                  </button>
                </div>
              </div>

              {transferAmount && parseInt(transferAmount) > 0 && (
                <div className="px-3 py-2 bg-[#2b2f36] rounded-lg text-xs flex justify-between">
                  <span className="text-zinc-400">송금 금액</span>
                  <span className="text-white font-semibold">
                    {parseInt(transferAmount).toLocaleString("ko-KR")} KRW
                  </span>
                </div>
              )}

              <button
                onClick={handleTransfer}
                disabled={transferLoading}
                className="w-full py-3 rounded-lg text-sm font-bold bg-[#F59E0B] hover:bg-[#D97706] text-gray-900 disabled:opacity-50 transition-colors"
              >
                {transferLoading ? "처리중..." : "송금하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-lg text-sm font-medium shadow-lg z-50 ${toast.type === "success" ? "bg-[#0ecb81] text-black" : "bg-[#f6465d] text-white"}`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
