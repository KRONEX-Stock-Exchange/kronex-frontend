import { useState } from "react";
import { OrderBook } from "../components/orderbook/orderbook";
import { StockHeader } from "../components/stock/StockHeader";
import { CandlestickChart } from "../components/chart/CandlestickChart";
import { useOrderbook } from "../hooks/useOrderbook";

export function TradingPage() {
  const stockId = 1;
  const { data } = useOrderbook(stockId);
  const [accountTab, setAccountTab] = useState<"내 계좌" | "체결" | "미체결">("내 계좌");
  const [orderType, setOrderType] = useState<"매수" | "매도">("매수");
  const [priceType, setPriceType] = useState<"지정가" | "시장가">("지정가");

  return (
    <div className="flex flex-col h-full w-full">
      {/* 상단 주식 정보 헤더 */}
      <StockHeader stockInfo={data?.stockInfo || null} />

      {/* 메인 컨텐츠 */}
      <div className="flex flex-1 p-5 pb-5 pt-2">
        {/* 차트 영역 (6:4 분할) */}
        <div className="w-[50%] flex flex-col p-2 gap-2">
          {/* 차트 (60%) */}
          <div className="h-[60%]">
            <CandlestickChart />
          </div>
          {/* 내 계좌 (40%) */}
          <div className="h-[40%] bg-[#181a20] rounded-2xl p-4 flex flex-col">
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
            <div className="flex-1 overflow-auto">
              {accountTab === "내 계좌" && (
                <>
                  <div className="mb-3">
                    <select className="bg-[#2b2f36] text-white text-xs px-3 py-1 rounded-lg border border-[#3b3f46] outline-none">
                      <option value="1">123-456-789012</option>
                      <option value="2">987-654-321098</option>
                    </select>
                  </div>
                  <table className="w-full text-xs">
                    <thead className="text-zinc-500 border-b border-[#2b2f36]">
                      <tr>
                        <th className="text-left py-2">종목명</th>
                        <th className="text-right py-2">보유수량</th>
                        <th className="text-right py-2">가능수량</th>
                        <th className="text-right py-2">평균가격</th>
                        <th className="text-right py-2">총 매수금액</th>
                      </tr>
                    </thead>
                    <tbody className="text-white">
                      <tr className="border-b border-[#2b2f36]">
                        <td className="py-2">삼성전자</td>
                        <td className="text-right py-2">100</td>
                        <td className="text-right py-2">100</td>
                        <td className="text-right py-2">72,500</td>
                        <td className="text-right py-2">7,250,000</td>
                      </tr>
                      <tr className="border-b border-[#2b2f36]">
                        <td className="py-2">SK하이닉스</td>
                        <td className="text-right py-2">50</td>
                        <td className="text-right py-2">30</td>
                        <td className="text-right py-2">135,000</td>
                        <td className="text-right py-2">6,750,000</td>
                      </tr>
                      <tr className="border-b border-[#2b2f36]">
                        <td className="py-2">NAVER</td>
                        <td className="text-right py-2">20</td>
                        <td className="text-right py-2">20</td>
                        <td className="text-right py-2">215,500</td>
                        <td className="text-right py-2">4,310,000</td>
                      </tr>
                    </tbody>
                  </table>
                </>
              )}
              {accountTab === "체결" && (
                <table className="w-full text-xs">
                  <thead className="text-zinc-500 border-b border-[#2b2f36]">
                    <tr>
                      <th className="text-left py-2">종목명</th>
                      <th className="text-right py-2">체결유형</th>
                      <th className="text-right py-2">체결수량</th>
                      <th className="text-right py-2">체결가격</th>
                      <th className="text-right py-2">체결시간</th>
                    </tr>
                  </thead>
                  <tbody className="text-white">
                    <tr className="border-b border-[#2b2f36]">
                      <td className="py-2">삼성전자</td>
                      <td className="text-right py-2 text-[#f6465d]">매수</td>
                      <td className="text-right py-2">100</td>
                      <td className="text-right py-2">72,500</td>
                      <td className="text-right py-2">09:31:25</td>
                    </tr>
                    <tr className="border-b border-[#2b2f36]">
                      <td className="py-2">NAVER</td>
                      <td className="text-right py-2 text-[#2563eb]">매도</td>
                      <td className="text-right py-2">10</td>
                      <td className="text-right py-2">218,000</td>
                      <td className="text-right py-2">10:15:42</td>
                    </tr>
                  </tbody>
                </table>
              )}
              {accountTab === "미체결" && (
                <table className="w-full text-xs">
                  <thead className="text-zinc-500 border-b border-[#2b2f36]">
                    <tr>
                      <th className="text-left py-2">종목명</th>
                      <th className="text-right py-2">주문유형</th>
                      <th className="text-right py-2">주문수량</th>
                      <th className="text-right py-2">주문가격</th>
                      <th className="text-right py-2">미체결수량</th>
                    </tr>
                  </thead>
                  <tbody className="text-white">
                    <tr className="border-b border-[#2b2f36]">
                      <td className="py-2">삼성전자</td>
                      <td className="text-right py-2 text-[#f6465d]">매수</td>
                      <td className="text-right py-2">50</td>
                      <td className="text-right py-2">71,000</td>
                      <td className="text-right py-2">50</td>
                    </tr>
                    <tr className="border-b border-[#2b2f36]">
                      <td className="py-2">카카오</td>
                      <td className="text-right py-2 text-[#2563eb]">매도</td>
                      <td className="text-right py-2">30</td>
                      <td className="text-right py-2">55,000</td>
                      <td className="text-right py-2">30</td>
                    </tr>
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
          <div className="h-[50%] bg-[#181a20] rounded-2xl p-4 flex flex-col">
            {/* 매수/매도 탭 */}
            <div className="flex items-center gap-4 mb-4">
              <button
                onClick={() => setOrderType("매수")}
                className={`text-sm ${
                  orderType === "매수" ? "text-[#f6465d]" : "text-zinc-400"
                }`}
              >
                매수
              </button>
              <button
                onClick={() => setOrderType("매도")}
                className={`text-sm ${
                  orderType === "매도" ? "text-[#2563eb]" : "text-zinc-400"
                }`}
              >
                매도
              </button>
            </div>

            {/* 주문 폼 */}
            <div className="flex flex-col gap-3 flex-1">
              {/* 주문계좌 */}
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">주문계좌</label>
                <select className="w-full bg-[#2b2f36] text-white text-xs px-3 py-2 rounded-lg border border-[#3b3f46] outline-none">
                  <option value="1">123-456-789012</option>
                  <option value="2">987-654-321098</option>
                </select>
              </div>

              {/* 주문유형 */}
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">주문유형</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPriceType("지정가")}
                    className={`flex-1 py-2 text-xs rounded-lg ${
                      priceType === "지정가"
                        ? "bg-[#2b2f36] text-white border border-[#3b3f46]"
                        : "bg-transparent text-zinc-400 border border-[#2b2f36]"
                    }`}
                  >
                    지정가
                  </button>
                  <button
                    onClick={() => setPriceType("시장가")}
                    className={`flex-1 py-2 text-xs rounded-lg ${
                      priceType === "시장가"
                        ? "bg-[#2b2f36] text-white border border-[#3b3f46]"
                        : "bg-transparent text-zinc-400 border border-[#2b2f36]"
                    }`}
                  >
                    시장가
                  </button>
                </div>
              </div>

              {/* 가격 */}
              {priceType === "지정가" && (
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">가격</label>
                  <input
                    type="number"
                    placeholder="0"
                    className="w-full bg-[#2b2f36] text-white text-xs px-3 py-2 rounded-lg border border-[#3b3f46] outline-none"
                  />
                </div>
              )}

              {/* 수량 */}
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">수량</label>
                <input
                  type="number"
                  placeholder="0"
                  className="w-full bg-[#2b2f36] text-white text-xs px-3 py-2 rounded-lg border border-[#3b3f46] outline-none"
                />
              </div>

              {/* 주문 버튼 */}
              <button
                className={`mt-auto py-3 rounded-lg text-sm font-bold ${
                  orderType === "매수"
                    ? "bg-[#f6465d] text-white"
                    : "bg-[#2563eb] text-white"
                }`}
              >
                {orderType}
              </button>
            </div>
          </div>
          {/* 등락률 순위 */}
          <div className="h-[50%] bg-[#181a20] rounded-2xl p-4 flex flex-col">
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
                  <tr className="border-b border-[#2b2f36]">
                    <td className="py-1.5">1</td>
                    <td className="py-1.5">삼성전자</td>
                    <td className="text-right py-1.5">72,500</td>
                    <td className="text-right py-1.5 text-[#f6465d]">+5.23%</td>
                  </tr>
                  <tr className="border-b border-[#2b2f36]">
                    <td className="py-1.5">2</td>
                    <td className="py-1.5">SK하이닉스</td>
                    <td className="text-right py-1.5">135,000</td>
                    <td className="text-right py-1.5 text-[#f6465d]">+3.85%</td>
                  </tr>
                  <tr className="border-b border-[#2b2f36]">
                    <td className="py-1.5">3</td>
                    <td className="py-1.5">NAVER</td>
                    <td className="text-right py-1.5">218,500</td>
                    <td className="text-right py-1.5 text-[#f6465d]">+2.15%</td>
                  </tr>
                  <tr className="border-b border-[#2b2f36]">
                    <td className="py-1.5">4</td>
                    <td className="py-1.5">카카오</td>
                    <td className="text-right py-1.5">55,200</td>
                    <td className="text-right py-1.5 text-[#f6465d]">+1.84%</td>
                  </tr>
                  <tr className="border-b border-[#2b2f36]">
                    <td className="py-1.5">5</td>
                    <td className="py-1.5">LG에너지솔루션</td>
                    <td className="text-right py-1.5">385,000</td>
                    <td className="text-right py-1.5 text-[#2563eb]">-0.52%</td>
                  </tr>
                  <tr className="border-b border-[#2b2f36]">
                    <td className="py-1.5">6</td>
                    <td className="py-1.5">현대차</td>
                    <td className="text-right py-1.5">245,500</td>
                    <td className="text-right py-1.5 text-[#2563eb]">-1.23%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
