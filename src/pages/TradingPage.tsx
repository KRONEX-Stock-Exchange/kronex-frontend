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

export function TradingPage() {
  const [stockId, setStockId] = useState<number>(1);
  const { data } = useOrderbook(stockId);
  const { accounts, selectedAccount, setSelectedAccount } = useAccount();
  const { data: accountData, orderData } = useAccountData(selectedAccount?.id ?? null);
  const [accountTab, setAccountTab] = useState<"내 계좌" | "체결" | "미체결">("내 계좌");
  const [orderType, setOrderType] = useState<"매수" | "매도" | "정정" | "취소">("매수");
  const [priceType, setPriceType] = useState<"지정가" | "시장가">("지정가");

  // 주문 폼 상태
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [orderLoading, setOrderLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [stocks, setStocks] = useState<StockItem[]>([]);

  // 정정/취소 상태
  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);
  const [amendPrice, setAmendPrice] = useState("");
  const [amendLoading, setAmendLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  useEffect(() => {
    const fetchStocks = async () => {
      const response = await apiClient.get<StockItem[]>("/stocks");
      if (response.success && response.data) {
        setStocks(response.data);
      }
    };
    fetchStocks();
    const interval = setInterval(fetchStocks, 5000);
    return () => clearInterval(interval);
  }, []);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleOrder = async () => {
    const qty = parseInt(quantity);
    const prc = parseInt(price);

    if (!quantity || qty < 1) {
      showToast("수량은 1주 이상 입력해주세요.", "error");
      return;
    }
    if (priceType === "지정가" && (!price || prc < 1)) {
      showToast("가격은 1원 이상 입력해주세요.", "error");
      return;
    }

    setOrderLoading(true);

    try {
      const endpoint = orderType === "매수"
        ? `/stocks/${stockId}/orders/buy`
        : `/stocks/${stockId}/orders/sell`;

      const response = await apiClient.post(endpoint, {
        accountNumber: selectedAccount?.accountNumber,
        price: priceType === "지정가" ? prc : 0,
        number: qty,
        orderType: priceType === "지정가" ? "limit" : "market",
      });

      if (response.success) {
        showToast(`${orderType} 주문이 완료되었습니다.`, "success");
      } else {
        const errorMsg =
          typeof response.error === "object" && response.error !== null
            ? (response.error as { message?: string }).message || "주문에 실패했습니다."
            : response.error || "주문에 실패했습니다.";
        showToast(errorMsg, "error");
      }
    } catch {
      showToast("서버 연결에 실패했습니다.", "error");
    } finally {
      setOrderLoading(false);
    }
  };

  const handleAmend = async () => {
    if (!selectedOrder || !amendPrice || parseInt(amendPrice) < 1) {
      showToast("정정 가격을 입력해주세요.", "error");
      return;
    }
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
        const errorMsg = typeof response.error === "object" && response.error !== null
          ? (response.error as { message?: string }).message || "정정에 실패했습니다."
          : response.error || "정정에 실패했습니다.";
        showToast(errorMsg, "error");
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
        const errorMsg = typeof response.error === "object" && response.error !== null
          ? (response.error as { message?: string }).message || "취소에 실패했습니다."
          : response.error || "취소에 실패했습니다.";
        showToast(errorMsg, "error");
      }
    } catch {
      showToast("서버 연결에 실패했습니다.", "error");
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* 상단 주식 정보 헤더 */}
      <StockHeader
        stockInfo={data?.stockInfo || null}
        stocks={stocks}
        selectedStockId={stockId}
        onSelectStock={setStockId}
      />

      {/* 메인 컨텐츠 */}
      <div className="flex flex-1 min-h-0 p-5 pb-5 pt-2">
        {/* 차트 영역 (6:4 분할) */}
        <div className="w-[50%] min-h-0 flex flex-col p-2 gap-2">
          {/* 차트 (60%) */}
          <div className="h-[60%]">
            <CandlestickChart stockId={stockId} />
          </div>
          {/* 내 계좌 (40%) */}
          <div className="h-[40%] min-h-0 bg-[#181a20] rounded-2xl p-4 flex flex-col">
            {/* 탭 */}
            <div className="flex items-center gap-4 mb-3">
              <button
                onClick={() => setAccountTab("내 계좌")}
                className={`text-sm ${
                  accountTab === "내 계좌" ? "text-white" : "text-zinc-400"
                }`}
              >
                내 계좌
              </button>
              <button
                onClick={() => setAccountTab("체결")}
                className={`text-sm ${
                  accountTab === "체결" ? "text-white" : "text-zinc-400"
                }`}
              >
                체결
              </button>
              <button
                onClick={() => setAccountTab("미체결")}
                className={`text-sm ${
                  accountTab === "미체결" ? "text-white" : "text-zinc-400"
                }`}
              >
                미체결
              </button>
            </div>
            {/* 테이블 내용 */}
            <div className="flex-1 min-h-0 overflow-auto">
              {accountTab === "내 계좌" && (
                <>
                  <div className="mb-3 flex flex-col gap-2">
                    <select
                      value={selectedAccount?.id ?? ""}
                      onChange={(e) => {
                        const account = accounts.find((a) => a.id === Number(e.target.value));
                        if (account) setSelectedAccount(account);
                      }}
                      className="bg-[#2b2f36] text-white text-xs px-3 py-1 rounded-lg border border-[#3b3f46] outline-none w-fit"
                    >
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.accountNumber}
                        </option>
                      ))}
                    </select>
                    {accountData && (
                      <div className="flex gap-3 px-3 py-2 bg-[#2b2f36] rounded-lg border border-[#3b3f46]">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-zinc-500">예수금</span>
                          <span className="text-xs text-white font-semibold">
                            {Number(accountData.account.money).toLocaleString("ko-KR")} KRW
                          </span>
                        </div>
                        <div className="w-px bg-[#3b3f46]" />
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-zinc-500">사용가능</span>
                          <span className="text-xs text-[#0ecb81] font-semibold">
                            {Number(accountData.account.canMoney).toLocaleString("ko-KR")} KRW
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  <table className="w-full text-xs">
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
                      {accountData?.userStock.map((stock) => {
                        const currentPrice = Number(stock.stocks.price);
                        const avg = Number(stock.average);
                        const qty = Number(stock.number);
                        const profitRate = avg > 0 ? ((currentPrice - avg) / avg) * 100 : 0;
                        const profitAmount = (currentPrice - avg) * qty;
                        const profitColor = profitRate > 0 ? "text-[#f6465d]" : profitRate < 0 ? "text-[#2563eb]" : "text-white";
                        return (
                          <tr key={stock.stocks.id} className="border-b border-[#2b2f36]">
                            <td className="py-2">{stock.stocks.name}</td>
                            <td className="text-right py-2">{qty.toLocaleString("ko-KR")}</td>
                            <td className="text-right py-2">{Number(stock.canNumber).toLocaleString("ko-KR")}</td>
                            <td className="text-right py-2">{avg.toLocaleString("ko-KR")}</td>
                            <td className="text-right py-2">{currentPrice.toLocaleString("ko-KR")}</td>
                            <td className="text-right py-2">{Number(stock.totalBuyAmount).toLocaleString("ko-KR")}</td>
                            <td className={`text-right py-2 ${profitColor}`}>
                              {profitRate > 0 ? "+" : ""}{profitRate.toFixed(2)}%
                            </td>
                            <td className={`text-right py-2 ${profitColor}`}>
                              {profitAmount > 0 ? "+" : ""}{profitAmount.toLocaleString("ko-KR")}
                            </td>
                          </tr>
                        );
                      })}
                      {(!accountData || accountData.userStock.length === 0) && (
                        <tr>
                          <td colSpan={8} className="py-4 text-center text-zinc-500">
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
                      <th className="text-left py-2">종목ID</th>
                      <th className="text-left py-2">종목명</th>
                      <th className="text-right py-2">유형</th>
                      <th className="text-right py-2">주문구분</th>
                      <th className="text-right py-2">주문수량</th>
                      <th className="text-right py-2">체결수량</th>
                      <th className="text-right py-2">주문가격</th>
                    </tr>
                  </thead>
                  <tbody className="text-white">
                    {orderData?.executionOrder.map((order) => (
                      <tr key={order.id} className="border-b border-[#2b2f36]">
                        <td className="py-2">{order.id}</td>
                        <td className="py-2">{order.stockId}</td>
                        <td className="py-2">{order.stockName}</td>
                        <td className={`text-right py-2 ${order.tradingType === "buy" ? "text-[#f6465d]" : "text-[#2563eb]"}`}>
                          {order.tradingType === "buy" ? "매수" : "매도"}
                        </td>
                        <td className="text-right py-2">
                          {Number(order.price) === 0 ? "시장가" : "지정가"}
                        </td>
                        <td className="text-right py-2">{Number(order.number).toLocaleString("ko-KR")}</td>
                        <td className="text-right py-2">{Number(order.matchNumber).toLocaleString("ko-KR")}</td>
                        <td className="text-right py-2">{Number(order.price) === 0 ? "-" : Number(order.price).toLocaleString("ko-KR")}</td>
                      </tr>
                    ))}
                    {(!orderData || orderData.executionOrder.length === 0) && (
                      <tr>
                        <td colSpan={8} className="py-4 text-center text-zinc-500">
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
                    </tr>
                  </thead>
                  <tbody className="text-white">
                    {orderData?.noExecutionOrder.map((order) => {
                      const isSelected = selectedOrder?.id === order.id;
                      return (
                        <tr
                          key={order.id}
                          onClick={() => {
                            setSelectedOrder(order);
                            setAmendPrice(order.price);
                            setOrderType("정정");
                          }}
                          className={`border-b border-[#2b2f36] cursor-pointer transition-colors ${isSelected ? "bg-[#2b2f36]" : "hover:bg-[#1f2230]"}`}
                        >
                          <td className="py-2">{order.id}</td>
                          <td className="py-2">{order.stockName}</td>
                          <td className={`text-right py-2 ${order.tradingType === "buy" ? "text-[#f6465d]" : "text-[#2563eb]"}`}>
                            {order.tradingType === "buy" ? "매수" : "매도"}
                          </td>
                          <td className="text-right py-2">
                            {Number(order.price) === 0 ? "시장가" : "지정가"}
                          </td>
                          <td className="text-right py-2">{Number(order.number).toLocaleString("ko-KR")}</td>
                          <td className="text-right py-2">{Number(order.price) === 0 ? "-" : Number(order.price).toLocaleString("ko-KR")}</td>
                          <td className="text-right py-2">{(Number(order.number) - Number(order.matchNumber)).toLocaleString("ko-KR")}</td>
                        </tr>
                      );
                    })}
                    {(!orderData || orderData.noExecutionOrder.length === 0) && (
                      <tr>
                        <td colSpan={7} className="py-4 text-center text-zinc-500">
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
        <div className="w-[30%] p-2">
          <OrderBook stockId={stockId} />
        </div>
        <div className="w-[20%] flex flex-col p-2 gap-2">
          {/* 주문 창 */}
          <div className="h-[55%] bg-[#181a20] rounded-2xl p-4 flex flex-col">
            {/* 매수/매도/정정/취소 탭 */}
            <div className="flex items-center gap-3 mb-4 shrink-0 border-b border-[#2b2f36] pb-3">
              <button onClick={() => setOrderType("매수")} className={`text-sm ${orderType === "매수" ? "text-[#f6465d] font-bold" : "text-zinc-400"}`}>매수</button>
              <button onClick={() => setOrderType("매도")} className={`text-sm ${orderType === "매도" ? "text-[#2563eb] font-bold" : "text-zinc-400"}`}>매도</button>
              <div className="w-px h-3 bg-[#2b2f36]" />
              <button onClick={() => setOrderType("정정")} className={`text-sm ${orderType === "정정" ? "text-[#F59E0B] font-bold" : "text-zinc-400"}`}>정정</button>
              <button onClick={() => setOrderType("취소")} className={`text-sm ${orderType === "취소" ? "text-zinc-300 font-bold" : "text-zinc-400"}`}>취소</button>
            </div>

            {/* 주문 폼 */}
            <div className="flex flex-col gap-3 flex-1 overflow-y-auto scrollbar-thin min-h-0">

              {/* ── 매수/매도 폼 ── */}
              {(orderType === "매수" || orderType === "매도") && (<>
              {/* 주문계좌 */}
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">주문계좌</label>
                <select
                  value={selectedAccount?.id ?? ""}
                  onChange={(e) => {
                    const account = accounts.find((a) => a.id === Number(e.target.value));
                    if (account) setSelectedAccount(account);
                  }}
                  className="w-full bg-[#2b2f36] text-white text-xs px-3 py-2 rounded-lg border border-[#3b3f46] outline-none"
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.accountNumber}</option>
                  ))}
                </select>
              </div>

              {/* 주문유형 */}
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">주문유형</label>
                <div className="flex gap-2">
                  <button onClick={() => setPriceType("지정가")} className={`flex-1 py-2 text-xs rounded-lg ${priceType === "지정가" ? "bg-[#2b2f36] text-white border border-[#3b3f46]" : "bg-transparent text-zinc-400 border border-[#2b2f36]"}`}>지정가</button>
                  <button onClick={() => setPriceType("시장가")} className={`flex-1 py-2 text-xs rounded-lg ${priceType === "시장가" ? "bg-[#2b2f36] text-white border border-[#3b3f46]" : "bg-transparent text-zinc-400 border border-[#2b2f36]"}`}>시장가</button>
                </div>
              </div>

              {/* 가격 */}
              {priceType === "지정가" && (
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">가격</label>
                  <input type="number" placeholder="0" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full bg-[#2b2f36] text-white text-xs px-3 py-2 rounded-lg border border-[#3b3f46] outline-none" />
                </div>
              )}

              {/* 수량 */}
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">수량</label>
                <input type="number" placeholder="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full bg-[#2b2f36] text-white text-xs px-3 py-2 rounded-lg border border-[#3b3f46] outline-none" />
              </div>

              {/* 퍼센트 수량 선택 */}
              <div className="flex gap-1">
                {[10, 25, 50, 100].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => {
                      const orderPrice =
                        priceType === "지정가"
                          ? parseInt(price)
                          : data?.stockInfo?.upperLimit
                            ? parseFloat(data.stockInfo.upperLimit)
                            : 0;

                      if (orderType === "매수") {
                        const availableMoney = accountData?.account?.money
                          ? parseFloat(accountData.account.money)
                          : 0;
                        if (orderPrice > 0) {
                          const qty = Math.floor(
                            (availableMoney * pct) / 100 / orderPrice,
                          );
                          setQuantity(String(qty));
                        }
                      } else {
                        const holding = accountData?.userStock?.find(
                          (s) => s.stocks.id === stockId,
                        );
                        const canSell = holding?.canNumber
                          ? parseInt(holding.canNumber)
                          : 0;
                        const qty = Math.floor((canSell * pct) / 100);
                        setQuantity(String(qty));
                      }
                    }}
                    className="flex-1 py-1 text-[10px] rounded bg-[#2b2f36] text-zinc-400 hover:text-white"
                  >
                    {pct}%
                  </button>
                ))}
              </div>

              {/* 주문 버튼 */}
              <button
                onClick={handleOrder}
                disabled={orderLoading}
                className={`py-3 rounded-lg text-sm font-bold disabled:opacity-50 shrink-0 ${
                  orderType === "매수" ? "bg-[#f6465d] text-white" : "bg-[#2563eb] text-white"
                }`}
              >
                {orderLoading ? "처리중..." : orderType}
              </button>
            </>)}

            {/* ── 정정 폼 ── */}
            {orderType === "정정" && (
              <>
                {selectedOrder ? (
                  <>
                    <div className="px-3 py-2 bg-[#2b2f36] rounded-lg text-xs flex flex-col gap-1">
                      <span className="text-zinc-400">주문 #{selectedOrder.id}</span>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">종목</span>
                        <span className="text-white">{selectedOrder.stockName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">유형</span>
                        <span className={selectedOrder.tradingType === "buy" ? "text-[#f6465d]" : "text-[#2563eb]"}>
                          {selectedOrder.tradingType === "buy" ? "매수" : "매도"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">현재 가격</span>
                        <span className="text-white">{Number(selectedOrder.price).toLocaleString("ko-KR")}</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 mb-1 block">정정 가격</label>
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
                      className="py-3 rounded-lg text-sm font-bold disabled:opacity-50 bg-[#F59E0B] text-gray-900"
                    >
                      {amendLoading ? "처리중..." : "정정 확인"}
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-zinc-500 text-center py-6">미체결 탭에서 주문을 선택하세요</p>
                )}
              </>
            )}

            {/* ── 취소 폼 ── */}
            {orderType === "취소" && (
              <>
                {selectedOrder ? (
                  <>
                    <div className="px-3 py-2 bg-[#2b2f36] rounded-lg text-xs flex flex-col gap-1">
                      <span className="text-zinc-400">주문 #{selectedOrder.id}</span>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">종목</span>
                        <span className="text-white">{selectedOrder.stockName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">유형</span>
                        <span className={selectedOrder.tradingType === "buy" ? "text-[#f6465d]" : "text-[#2563eb]"}>
                          {selectedOrder.tradingType === "buy" ? "매수" : "매도"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">수량</span>
                        <span className="text-white">{Number(selectedOrder.number).toLocaleString("ko-KR")}주</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">가격</span>
                        <span className="text-white">{Number(selectedOrder.price) === 0 ? "시장가" : Number(selectedOrder.price).toLocaleString("ko-KR")}</span>
                      </div>
                    </div>
                    <button
                      onClick={handleCancel}
                      disabled={cancelLoading}
                      className="py-3 rounded-lg text-sm font-bold disabled:opacity-50 bg-transparent border border-[#f6465d] text-[#f6465d] hover:bg-[#f6465d]/10"
                    >
                      {cancelLoading ? "처리중..." : "주문 취소 확인"}
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-zinc-500 text-center py-6">미체결 탭에서 주문을 선택하세요</p>
                )}
              </>
            )}
            </div>
          </div>
          {/* 등락률 순위 */}
          <div className="h-[45%] bg-[#181a20] rounded-2xl p-4 flex flex-col">
            <div className="text-sm text-zinc-400 mb-3">실시간 등락률</div>
            <div className="flex-1 overflow-auto">
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
                      const perColor = per > 0 ? "text-[#f6465d]" : per < 0 ? "text-[#2563eb]" : "text-white";
                      return (
                        <tr key={stock.id} className="border-b border-[#2b2f36]">
                          <td className="py-1.5">{i + 1}</td>
                          <td className="py-1.5">{stock.name}</td>
                          <td className="text-right py-1.5">{Number(stock.price).toLocaleString("ko-KR")}</td>
                          <td className={`text-right py-1.5 ${perColor}`}>
                            {per > 0 ? "+" : ""}{per.toFixed(2)}%
                          </td>
                        </tr>
                      );
                    })}
                  {stocks.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-zinc-500">
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

      {/* 토스트 알림 */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-lg text-sm font-medium shadow-lg z-50 transition-all ${
            toast.type === "success"
              ? "bg-[#0ecb81] text-black"
              : "bg-[#f6465d] text-white"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
