(function () {
  "use strict";

  const root = document.getElementById("mockup-root");
  if (!root) return;

  const suppliedConcept = window.KRONEX_CONCEPT || {};
  const concept = {
    number: Number(suppliedConcept.number) || 1,
    name: suppliedConcept.name || "KRONEX Exchange",
    subtitle: suppliedConcept.subtitle || "Professional market workspace",
  };
  const theme = document.body.dataset.theme || `concept-${concept.number}`;

  const requestedView = new URLSearchParams(window.location.search).get("view");
  const initialView = ["login", "register", "open-account", "trade"].includes(requestedView) ? requestedView : "trade";
  const state = {
    view: initialView,
    loggedIn: !["login", "register"].includes(initialView),
    selectedStock: "005930",
    accountTab: "holdings",
    orderTab: "buy",
    chartRange: "1d",
    selectedOrder: "KRX-240714-0182",
  };

  const stocks = [
    { id: "005930", name: "삼성전자", short: "삼성", price: 71800, change: 1100, per: 1.56 },
    { id: "000660", name: "SK하이닉스", short: "SK", price: 235500, change: 7500, per: 3.29 },
    { id: "373220", name: "LG에너지솔루션", short: "LG", price: 346500, change: -4500, per: -1.28 },
    { id: "207940", name: "삼성바이오로직스", short: "삼바", price: 1042000, change: 18000, per: 1.76 },
    { id: "005380", name: "현대차", short: "현대", price: 212500, change: -2500, per: -1.16 },
    { id: "035420", name: "NAVER", short: "N", price: 176200, change: 4200, per: 2.44 },
    { id: "035720", name: "카카오", short: "K", price: 41950, change: 350, per: 0.84 },
    { id: "068270", name: "셀트리온", short: "셀", price: 187300, change: -1800, per: -0.95 },
  ];

  const holdings = [
    ["삼성전자", "120", "84", "68,420", "71,800", "8,210,400", "+4.94%", "+405,600"],
    ["SK하이닉스", "18", "18", "219,800", "235,500", "3,956,400", "+7.14%", "+282,600"],
    ["NAVER", "10", "6", "182,300", "176,200", "1,823,000", "-3.35%", "-61,000"],
  ];

  const filledOrders = [
    ["KRX-240714-0179", "삼성전자", "매수", "지정가", "20", "20", "71,200", "14:31:08"],
    ["KRX-240714-0164", "NAVER", "매도", "시장가", "4", "4", "-", "13:58:42"],
    ["KRX-240714-0121", "SK하이닉스", "매수", "지정가", "3", "3", "232,500", "11:22:16"],
  ];

  const openOrders = [
    ["KRX-240714-0182", "삼성전자", "매수", "지정가", "12", "71,300", "7", "14:36:22"],
    ["KRX-240714-0176", "NAVER", "매도", "지정가", "6", "179,500", "6", "14:18:07"],
    ["KRX-240714-0158", "SK하이닉스", "매수", "지정가", "2", "230,000", "2", "13:47:51"],
  ];

  const sellDepth = [
    [73000, 1280], [72900, 764], [72800, 1850], [72700, 922], [72600, 1450],
    [72500, 2110], [72400, 805], [72300, 1370], [72200, 2840], [72100, 1592],
  ];
  const buyDepth = [
    [71800, 2380], [71700, 1715], [71600, 2980], [71500, 1940], [71400, 1105],
    [71300, 2670], [71200, 1830], [71100, 970], [71000, 3210], [70900, 1485],
  ];

  const matches = [
    [71800, 24, "buy", "14:38:19"], [71700, 8, "sell", "14:38:16"],
    [71800, 31, "buy", "14:38:12"], [71800, 5, "buy", "14:38:07"],
    [71700, 18, "sell", "14:38:04"], [71800, 42, "buy", "14:37:59"],
    [71900, 10, "buy", "14:37:55"], [71700, 16, "sell", "14:37:50"],
  ];

  const chartCandles = [
    [69300, 70400, 68800, 69900, 420], [69900, 71100, 69600, 70700, 610],
    [70700, 71200, 69900, 70200, 530], [70200, 70600, 69100, 69600, 740],
    [69600, 70500, 69300, 70300, 510], [70300, 71500, 70100, 71100, 690],
    [71100, 71800, 70700, 71400, 460], [71400, 72000, 71000, 71600, 570],
    [71600, 71700, 70400, 70800, 810], [70800, 71300, 70100, 70500, 590],
    [70500, 71400, 70300, 71200, 520], [71200, 72500, 71000, 72100, 920],
    [72100, 72900, 71600, 71800, 760], [71800, 72200, 70900, 71200, 640],
    [71200, 71900, 70800, 71600, 480], [71600, 72400, 71300, 72200, 690],
    [72200, 73100, 71900, 72800, 880], [72800, 73400, 72000, 72300, 710],
    [72300, 72600, 71400, 71800, 560], [71800, 72100, 70800, 71100, 830],
    [71100, 71600, 70500, 71400, 610], [71400, 72200, 71200, 71900, 540],
    [71900, 72600, 71500, 72400, 670], [72400, 72700, 71600, 72000, 630],
    [72000, 72400, 71100, 71500, 790], [71500, 72400, 71300, 71800, 730],
  ];

  const won = (value) => Number(value).toLocaleString("ko-KR");
  const signed = (value) => `${value > 0 ? "+" : ""}${won(value)}`;
  const tone = (value) => value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
  const currentStock = () => stocks.find((stock) => stock.id === state.selectedStock) || stocks[0];
  const escapeHtml = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function logoTemplate(compact) {
    return `
      <span class="brand-mark${compact ? " compact" : ""}" aria-hidden="true">
        <svg viewBox="0 0 28 28" focusable="false"><polygon points="3,25 14,3 25,25 14,16" fill="white"></polygon></svg>
      </span>
      <span class="brand-wordmark brand-word"><span class="brand-k">K</span><span class="brand-rest">RONEX</span></span>`;
  }

  function eyeIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path class="eye-open" d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7S2 12 2 12Z"></path>
      <circle class="eye-open" cx="12" cy="12" r="3"></circle>
      <path class="eye-closed" d="m3 3 18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 5.2A9.6 9.6 0 0 1 12 5c6.2 0 10 7 10 7a15 15 0 0 1-2.1 3M6.5 6.5C3.7 8.4 2 12 2 12s3.8 7 10 7a9.7 9.7 0 0 0 3.3-.6"></path>
    </svg>`;
  }

  function headerTemplate() {
    const tradeNav = `
      <button class="nav-link ${state.view === "trade" ? "active" : ""}" type="button" data-view="trade" ${state.view === "trade" ? 'aria-current="page"' : ""}>거래하기</button>
      <button class="nav-link ${state.view === "open-account" ? "active" : ""}" type="button" data-view="open-account" ${state.view === "open-account" ? 'aria-current="page"' : ""}>계좌개설</button>
      <button class="nav-link" type="button" data-action="logout">로그아웃</button>`;
    const authNav = `
      <button class="nav-link ${state.view === "login" ? "active" : ""}" type="button" data-view="login">로그인</button>
      <button class="nav-link ${state.view === "register" ? "active" : ""}" type="button" data-view="register">회원가입</button>
      <button class="nav-link nav-demo-link" type="button" data-view="trade">거래 화면 보기</button>`;

    return `
      <header class="exchange-header">
        <div class="header-primary">
          <button class="brand" type="button" data-view="${state.loggedIn ? "trade" : "login"}" aria-label="KRONEX 홈">
            ${logoTemplate(false)}
          </button>
          <div class="concept-signature" aria-label="현재 디자인 시안">
            <span class="concept-number">0${concept.number}</span>
            <span class="concept-copy"><strong>${escapeHtml(concept.name)}</strong><small>${escapeHtml(concept.subtitle)}</small></span>
          </div>
        </div>
        <nav class="exchange-nav primary-nav" aria-label="주요 메뉴">${state.loggedIn ? tradeNav : authNav}</nav>
        <div class="header-utility header-actions">
          <span class="connection-status"><i class="status-dot" aria-hidden="true"></i> 실시간 연결</span>
          <time class="realtime-clock" aria-label="현재 시간">--:--:--</time>
        </div>
      </header>`;
  }

  function mobileNavTemplate() {
    if (!state.loggedIn) {
      return `<nav class="mobile-nav" aria-label="모바일 주요 메뉴">
        <button class="${state.view === "login" ? "active" : ""}" type="button" data-view="login">로그인</button>
        <button class="${state.view === "register" ? "active" : ""}" type="button" data-view="register">회원가입</button>
        <button type="button" data-view="trade">거래 화면</button>
      </nav>`;
    }

    return `<nav class="mobile-nav" aria-label="모바일 주요 메뉴">
      <button class="${state.view === "trade" ? "active" : ""}" type="button" data-view="trade">거래</button>
      <button type="button" data-action="toggle-market">종목</button>
      <button class="${state.view === "open-account" ? "active" : ""}" type="button" data-view="open-account">계좌개설</button>
      <button type="button" data-action="open-transfer">송금</button>
      <button type="button" data-action="logout">로그아웃</button>
    </nav>`;
  }

  function marketStripTemplate() {
    const stock = currentStock();
    const list = stocks.map((item) => `
      <button class="instrument-option ${item.id === stock.id ? "active" : ""}" type="button" role="option"
        aria-selected="${item.id === stock.id}" data-action="select-stock" data-stock-id="${item.id}"
        data-search="${escapeHtml(`${item.name} ${item.id}`.toLowerCase())}">
        <span class="stock-avatar" aria-hidden="true">${escapeHtml(item.short)}</span>
        <span class="instrument-name"><strong>${escapeHtml(item.name)}</strong><small>#${item.id}</small></span>
        <span class="instrument-price">${won(item.price)}</span>
        <span class="instrument-change ${tone(item.per)}">${item.per > 0 ? "+" : ""}${item.per.toFixed(2)}%</span>
      </button>`).join("");

    return `
      <section class="market-strip" aria-label="선택 종목 시세">
        <div class="instrument-picker stock-picker market-identity">
          <button class="instrument-trigger" type="button" data-action="toggle-market" aria-expanded="false" aria-haspopup="listbox" aria-controls="instrument-menu">
            <span class="stock-avatar" aria-hidden="true">${escapeHtml(stock.short)}</span>
            <span class="instrument-name"><strong>${escapeHtml(stock.name)}</strong><small>KRX · #${stock.id}</small></span>
            <span class="trigger-chevron" aria-hidden="true">⌄</span>
          </button>
          <div class="instrument-menu" id="instrument-menu" hidden>
            <label class="instrument-search-label" for="instrument-search">종목 선택 / 검색</label>
            <div class="search-field">
              <span aria-hidden="true">⌕</span>
              <input id="instrument-search" type="search" data-market-search placeholder="종목명 또는 종목 ID 검색" autocomplete="off" />
              <kbd>ESC</kbd>
            </div>
            <div class="instrument-list-head" aria-hidden="true"><span>종목</span><span>현재가</span><span>등락률</span></div>
            <div class="instrument-list" role="listbox" aria-label="거래 종목">${list}</div>
            <p class="instrument-empty" hidden>검색 결과가 없습니다.</p>
          </div>
        </div>
        <div class="market-quote market-price">
          <div class="quote-primary ${tone(stock.per)}"><strong>${won(stock.price)}</strong><span>KRW</span></div>
          <div class="quote-change ${tone(stock.per)}"><span>${signed(stock.change)}</span><strong>${stock.per > 0 ? "+" : ""}${stock.per.toFixed(2)}%</strong></div>
        </div>
        <dl class="market-facts market-stats">
          <div><dt>전일 종가</dt><dd>70,700</dd></div>
          <div><dt>시가</dt><dd>70,900</dd></div>
          <div><dt>고가</dt><dd class="positive">72,400</dd></div>
          <div><dt>저가</dt><dd class="negative">70,700</dd></div>
          <div><dt>거래량</dt><dd>14.82M</dd></div>
          <div><dt>거래대금</dt><dd>1.06조</dd></div>
        </dl>
      </section>`;
  }

  function chartSvgTemplate() {
    const max = 74000;
    const min = 68000;
    const priceY = (price) => 22 + ((max - price) / (max - min)) * 166;
    const xFor = (index) => 48 + index * 24;
    const grid = [0, 1, 2, 3, 4].map((index) => {
      const y = 22 + index * 41.5;
      const label = max - index * 1500;
      return `<line class="chart-grid-line" x1="36" y1="${y}" x2="686" y2="${y}"></line><text class="chart-axis-label" x="690" y="${y + 4}">${won(label)}</text>`;
    }).join("") + [0, 1, 2, 3, 4, 5].map((index) => {
      const x = 48 + index * 120;
      return `<line class="chart-grid-line" x1="${x}" y1="22" x2="${x}" y2="260"></line>`;
    }).join("");

    const candles = chartCandles.map((item, index) => {
      const [open, high, low, close, volume] = item;
      const x = xFor(index);
      const up = close >= open;
      const bodyTop = Math.min(priceY(open), priceY(close));
      const bodyHeight = Math.max(2, Math.abs(priceY(open) - priceY(close)));
      const volumeHeight = Math.max(3, (volume / 1000) * 46);
      return `<g class="chart-candle ${up ? "up" : "down"}" data-index="${index}">
        <line class="candle-wick" x1="${x}" y1="${priceY(high).toFixed(1)}" x2="${x}" y2="${priceY(low).toFixed(1)}"></line>
        <rect class="candle-body" x="${x - 5}" y="${bodyTop.toFixed(1)}" width="10" height="${bodyHeight.toFixed(1)}" rx="1"></rect>
        <rect class="volume-bar" x="${x - 5}" y="${(260 - volumeHeight).toFixed(1)}" width="10" height="${volumeHeight.toFixed(1)}"></rect>
      </g>`;
    }).join("");

    const maPath = (period, offset) => {
      const points = chartCandles.map((item, index) => {
        const start = Math.max(0, index - Math.min(period, 8) + 1);
        const values = chartCandles.slice(start, index + 1).map((candle) => candle[3]);
        const average = values.reduce((sum, value) => sum + value, 0) / values.length + offset;
        return `${xFor(index)},${priceY(average).toFixed(1)}`;
      });
      return `M${points.join(" L")}`;
    };

    return `
      <svg class="price-chart chart-svg" viewBox="0 0 740 280" role="img" aria-labelledby="price-chart-title price-chart-desc" preserveAspectRatio="none">
        <title id="price-chart-title">삼성전자 일봉 캔들 차트</title>
        <desc id="price-chart-desc">가격 캔들, 거래량, 5일 20일 60일 120일 이동평균선을 포함한 예시 차트</desc>
        <g class="chart-grid">${grid}</g>
        <g class="chart-volume" aria-label="거래량">${candles}</g>
        <g class="moving-averages" fill="none">
          <path class="ma-line ma-5" d="${maPath(5, 0)}"></path>
          <path class="ma-line ma-20" d="${maPath(8, -220)}"></path>
          <path class="ma-line ma-60" d="${maPath(8, -520)}"></path>
          <path class="ma-line ma-120" d="${maPath(8, -820)}"></path>
        </g>
        <line class="current-price-line" x1="36" y1="${priceY(71800).toFixed(1)}" x2="686" y2="${priceY(71800).toFixed(1)}"></line>
        <g class="chart-time-axis">
          <text x="44" y="276">06.10</text><text x="185" y="276">06.18</text><text x="329" y="276">06.26</text><text x="473" y="276">07.04</text><text x="617" y="276">07.12</text>
        </g>
      </svg>`;
  }

  function chartPanelTemplate() {
    const ranges = [["1m", "1분"], ["5m", "5분"], ["15m", "15분"], ["30m", "30분"], ["1h", "1시간"], ["1d", "일"]];
    return `
      <section class="panel chart-panel" aria-labelledby="chart-title">
        <header class="panel-head chart-panel-head">
          <div><p class="eyebrow">MARKET CHART</p><h2 class="panel-title" id="chart-title">가격 차트</h2></div>
          <div class="chart-toolbar" role="tablist" aria-label="차트 시간 단위" data-tab-group="chart">
            ${ranges.map(([value, label]) => `<button id="chart-tab-${value}" type="button" role="tab" data-tab-group="chart" data-tab-value="${value}" aria-selected="${state.chartRange === value}" tabindex="${state.chartRange === value ? 0 : -1}" class="chart-range timeframe-button ${state.chartRange === value ? "active" : ""}">${label}</button>`).join("")}
          </div>
        </header>
        <div class="chart-legend" aria-label="OHLC 및 이동평균 범례">
          <span class="legend-symbol"><i class="realtime-dot"></i><strong class="chart-range-label">일봉</strong></span>
          <span>시 <strong>70,900</strong></span><span>고 <strong class="positive">72,400</strong></span><span>저 <strong class="negative">70,700</strong></span><span>종 <strong class="positive">71,800</strong></span>
          <span>거래량 <strong>14,823,105</strong></span>
          <span class="ma-key ma-5">MA5 <strong>71,540</strong></span><span class="ma-key ma-20">MA20 <strong>70,925</strong></span><span class="ma-key ma-60">MA60 <strong>69,840</strong></span><span class="ma-key ma-120">MA120 <strong>68,410</strong></span>
        </div>
        <div class="chart-canvas" role="tabpanel" aria-live="polite">${chartSvgTemplate()}</div>
        <footer class="chart-footer"><span>KRX · 20분 지연 없음</span><span>마지막 업데이트 <time>14:38:19</time></span></footer>
      </section>`;
  }

  function tableRows(rows, tableKind) {
    return rows.map((row, rowIndex) => `<tr class="${rowIndex === 0 ? "highlight-row" : ""}">${row.map((cell, cellIndex) => {
      let cellClass = "numeric-cell";
      if (cellIndex === 0 || cellIndex === 1) cellClass = "text-cell";
      if (["매수", "+4.94%", "+7.14%", "+405,600", "+282,600"].includes(cell)) cellClass += " positive";
      if (["매도", "-3.35%", "-61,000"].includes(cell)) cellClass += " negative";
      if (tableKind === "open" && cellIndex === 0) {
        return `<td class="${cellClass}"><button type="button" class="table-link" data-action="select-order" data-order-id="${escapeHtml(cell)}">${escapeHtml(cell)}</button></td>`;
      }
      return `<td class="${cellClass}">${escapeHtml(cell)}</td>`;
    }).join("")}</tr>`).join("");
  }

  function accountPanelTemplate() {
    return `
      <section class="panel account-panel" aria-labelledby="account-title">
        <header class="panel-head account-panel-head">
          <div><p class="eyebrow">MY PORTFOLIO</p><h2 class="panel-title" id="account-title">계좌</h2></div>
          <div class="account-summary-compact">
            <span>총 평가자산 <strong>25,820,600 KRW</strong></span><span class="positive">오늘 +627,200 (+2.49%)</span>
          </div>
        </header>
        <div class="account-toolbar">
          <div class="panel-tabs tablist" role="tablist" aria-label="계좌 내역" data-tab-group="account">
            <button id="account-tab-holdings" type="button" role="tab" data-tab-group="account" data-tab-value="holdings" aria-controls="account-holdings" aria-selected="${state.accountTab === "holdings"}" tabindex="${state.accountTab === "holdings" ? 0 : -1}" class="tab-button ${state.accountTab === "holdings" ? "active" : ""}">내 계좌</button>
            <button id="account-tab-filled" type="button" role="tab" data-tab-group="account" data-tab-value="filled" aria-controls="account-filled" aria-selected="${state.accountTab === "filled"}" tabindex="${state.accountTab === "filled" ? 0 : -1}" class="tab-button ${state.accountTab === "filled" ? "active" : ""}">체결</button>
            <button id="account-tab-open" type="button" role="tab" data-tab-group="account" data-tab-value="open" aria-controls="account-open" aria-selected="${state.accountTab === "open"}" tabindex="${state.accountTab === "open" ? 0 : -1}" class="tab-button ${state.accountTab === "open" ? "active" : ""}">미체결 <span class="count-badge">3</span></button>
          </div>
          <label class="compact-select"><span>계좌</span><select aria-label="조회 계좌"><option>110-472-903821</option><option>110-472-918405</option></select></label>
        </div>
        <div class="balance-cards balance-grid">
          <article class="balance-card balance-item"><span class="label">예수금</span><strong class="value">12,540,000 <small>KRW</small></strong><small>전일 대비 +340,000</small></article>
          <article class="balance-card balance-item accent"><span class="label">사용가능</span><strong class="value">8,975,400 <small>KRW</small></strong><small>주문 가능 금액</small></article>
        </div>
        <div class="account-table-wrap table-wrap tab-panels" data-tab-panel-group="account">
          <div id="account-holdings" class="tab-pane ${state.accountTab === "holdings" ? "active" : ""}" role="tabpanel" aria-labelledby="account-tab-holdings" ${state.accountTab !== "holdings" ? "hidden" : ""}>
            <table class="data-table holdings-table">
              <caption>보유 종목 현황</caption>
              <thead><tr><th scope="col">종목명</th><th scope="col">보유</th><th scope="col">가능</th><th scope="col">평균가</th><th scope="col">현재가</th><th scope="col">매수금액</th><th scope="col">수익률</th><th scope="col">수익금액</th></tr></thead>
              <tbody>${tableRows(holdings, "holdings")}</tbody>
            </table>
          </div>
          <div id="account-filled" class="tab-pane ${state.accountTab === "filled" ? "active" : ""}" role="tabpanel" aria-labelledby="account-tab-filled" ${state.accountTab !== "filled" ? "hidden" : ""}>
            <table class="data-table filled-orders-table">
              <caption>체결 주문 내역</caption>
              <thead><tr><th scope="col">주문ID</th><th scope="col">종목명</th><th scope="col">유형</th><th scope="col">주문구분</th><th scope="col">주문수량</th><th scope="col">체결수량</th><th scope="col">주문가격</th><th scope="col">접수시간</th></tr></thead>
              <tbody>${tableRows(filledOrders, "filled")}</tbody>
            </table>
          </div>
          <div id="account-open" class="tab-pane ${state.accountTab === "open" ? "active" : ""}" role="tabpanel" aria-labelledby="account-tab-open" ${state.accountTab !== "open" ? "hidden" : ""}>
            <table class="data-table open-orders-table">
              <caption>미체결 주문 내역 — 주문 ID를 선택하면 정정할 수 있습니다</caption>
              <thead><tr><th scope="col">주문ID</th><th scope="col">종목명</th><th scope="col">유형</th><th scope="col">주문구분</th><th scope="col">주문수량</th><th scope="col">주문가격</th><th scope="col">미체결</th><th scope="col">접수시간</th></tr></thead>
              <tbody>${tableRows(openOrders, "open")}</tbody>
            </table>
          </div>
        </div>
      </section>`;
  }

  function depthRowsTemplate(rows, side) {
    const previousClose = 70700;
    const maxQuantity = Math.max(...sellDepth.concat(buyDepth).map((item) => item[1]));
    return rows.map(([price, quantity]) => {
      const percentage = ((price - previousClose) / previousClose) * 100;
      const marker = price === 71800 ? "현재" : price === 72400 ? "고" : price === 71100 ? "저" : "";
      const markerClass = marker === "현재" ? "current" : marker === "고" ? "high" : marker === "저" ? "low" : "";
      return `<tr class="depth-row ${side} ${markerClass}">
        <td class="depth-quantity"><progress class="depth-bar" max="${maxQuantity}" value="${quantity}" aria-label="잔량 ${won(quantity)}"></progress><span>${won(quantity)}</span></td>
        <td class="depth-price-cell"><button type="button" class="depth-price ${tone(percentage)}" data-action="set-price" data-price="${price}" aria-label="${won(price)}원 주문 가격으로 선택">${won(price)}</button>${marker ? `<span class="price-marker ${markerClass}">${marker}</span>` : ""}</td>
        <td class="depth-change ${tone(percentage)}">${percentage >= 0 ? "+" : ""}${percentage.toFixed(2)}%</td>
      </tr>`;
    }).join("");
  }

  function orderbookPanelTemplate() {
    const sellTotal = sellDepth.reduce((sum, item) => sum + item[1], 0);
    const buyTotal = buyDepth.reduce((sum, item) => sum + item[1], 0);
    return `
      <section class="panel orderbook-panel" aria-labelledby="orderbook-title">
        <header class="panel-head orderbook-panel-head">
          <div><p class="eyebrow">LEVEL II</p><h2 class="panel-title" id="orderbook-title">호가</h2></div>
          <span class="unit-label">단위 · KRW / 주</span>
        </header>
        <div class="orderbook-layout">
        <div class="depth-table-wrap">
          <table class="depth-table sell-depth">
            <caption>매도 호가 10단계</caption>
            <thead><tr><th scope="col">매도잔량</th><th scope="col">매도호가</th><th scope="col">등락률</th></tr></thead>
            <tbody>${depthRowsTemplate(sellDepth, "sell")}</tbody>
            <tfoot><tr><th scope="row">매도 총잔량</th><td colspan="2" class="negative">${won(sellTotal)}</td></tr></tfoot>
          </table>
          <div class="spread-row" aria-label="현재가와 스프레드"><span>현재가</span><strong class="positive">71,800</strong><span>스프레드 300 · 0.42%</span></div>
          <table class="depth-table buy-depth">
            <caption>매수 호가 10단계</caption>
            <thead><tr><th scope="col">매수잔량</th><th scope="col">매수호가</th><th scope="col">등락률</th></tr></thead>
            <tbody>${depthRowsTemplate(buyDepth, "buy")}</tbody>
            <tfoot><tr><th scope="row">매수 총잔량</th><td colspan="2" class="positive">${won(buyTotal)}</td></tr></tfoot>
          </table>
        </div>
        <div class="orderbook-stats book-stats">
          <dl>
            <div><dt>전일종가</dt><dd>70,700</dd></div><div><dt>시가</dt><dd>70,900</dd></div>
            <div><dt>고가</dt><dd class="positive">72,400 <small>+2.40%</small></dd></div><div><dt>저가</dt><dd class="neutral">70,700 <small>0.00%</small></dd></div>
            <div><dt>상한가</dt><dd class="positive">91,900 <small>+29.99%</small></dd></div><div><dt>하한가</dt><dd class="negative">49,500 <small>-29.99%</small></dd></div>
          </dl>
        </div>
        <section class="recent-matches recent-trades" aria-labelledby="matches-title">
          <header><h3 class="recent-trades-title" id="matches-title">최근체결</h3><span>체결강도 <strong class="positive">108.42%</strong></span></header>
          <table><caption>최근 체결 내역</caption><thead><tr><th scope="col">시간</th><th scope="col">가격</th><th scope="col">수량</th></tr></thead><tbody>${matches.map(([price, quantity, side, time]) => `<tr class="${side === "buy" ? "positive" : "negative"}"><td><time>${time}</time></td><td><strong>${won(price)}</strong></td><td>${won(quantity)}</td></tr>`).join("")}</tbody></table>
        </section>
        </div>
      </section>`;
  }

  function standardOrderFields(side) {
    const sideLabel = side === "buy" ? "매수" : "매도";
    return `
      <form class="order-entry" data-order-form data-side="${side}" novalidate>
        <label class="form-field"><span>주문계좌</span><select name="account" aria-label="${sideLabel} 주문 계좌"><option>110-472-903821</option><option>110-472-918405</option></select></label>
        <fieldset class="form-field price-type-field">
          <legend>주문유형</legend>
          <div class="segmented-control segmented" role="group" aria-label="가격 유형">
            <button type="button" class="active" data-action="price-type" data-price-type="limit" aria-pressed="true">지정가</button>
            <button type="button" data-action="price-type" data-price-type="market" aria-pressed="false">시장가</button>
          </div>
        </fieldset>
        <label class="form-field order-price-field"><span class="field-label">가격</span><span class="input-with-unit input-shell"><input name="price" type="number" inputmode="numeric" min="1" value="71800" aria-label="주문 가격" /><em>KRW</em></span></label>
        <label class="form-field"><span class="field-label">수량</span><span class="input-with-unit input-shell"><input name="quantity" type="number" inputmode="numeric" min="1" placeholder="0" aria-label="주문 수량" /><em>주</em></span></label>
        <div class="order-percentages quick-row" aria-label="주문 가능 수량 빠른 선택">
          ${[10, 25, 50, 100].map((percentage) => `<button type="button" data-action="order-percent" data-percent="${percentage}">${percentage}%</button>`).join("")}
        </div>
        <dl class="order-estimate order-summary"><div><dt>${side === "buy" ? "주문가능" : "매도가능"}</dt><dd>${side === "buy" ? "8,975,400 KRW" : "84주"}</dd></div><div><dt>예상 주문금액</dt><dd data-order-estimate>0 KRW</dd></div></dl>
        <button class="submit-order trade-cta ${side}" type="submit"><span>${sideLabel} 주문</span><small>확인 후 즉시 접수</small></button>
      </form>`;
  }

  function selectedOrderDetails(kind) {
    const isAmend = kind === "amend";
    return `
      <div class="order-selection-banner"><span>미체결 주문 선택됨</span><strong>#${state.selectedOrder}</strong></div>
      <dl class="selected-order-details">
        <div><dt>주문 ID</dt><dd>#${state.selectedOrder}</dd></div>
        <div><dt>종목</dt><dd>삼성전자 <small>#005930</small></dd></div>
        <div><dt>유형</dt><dd class="positive">매수 · 지정가</dd></div>
        ${isAmend ? `<div><dt>현재 가격</dt><dd>71,300 KRW</dd></div>` : `<div><dt>수량</dt><dd>12주 <small>(미체결 7주)</small></dd></div><div><dt>가격</dt><dd>71,300 KRW</dd></div>`}
      </dl>
      ${isAmend ? `<form class="amend-form" data-amend-form><label class="form-field"><span class="field-label">정정 가격</span><span class="input-with-unit input-shell"><input name="amendPrice" type="number" min="1" value="71700" required /><em>KRW</em></span></label><p class="form-hint">수량은 미체결 잔량 7주로 유지됩니다.</p><button class="confirm-amend trade-cta" type="submit">정정 확인</button></form>` : `<div class="cancel-warning" role="note"><strong>주문을 취소할까요?</strong><p>미체결 수량 7주가 전부 취소되며, 취소한 주문은 복구할 수 없습니다.</p></div><button class="confirm-cancel trade-cta" type="button" data-action="confirm-cancel">주문 취소 확인</button>`}`;
  }

  function orderPanelTemplate() {
    const tabs = [["buy", "매수"], ["sell", "매도"], ["amend", "정정"], ["cancel", "취소"]];
    return `
      <section class="panel order-panel" aria-labelledby="order-title">
        <header class="panel-head order-panel-head"><div><p class="eyebrow">PLACE ORDER</p><h2 class="panel-title" id="order-title">주문</h2></div><span class="secure-label">보안 연결</span></header>
        <div class="order-tabs" role="tablist" aria-label="주문 작업" data-tab-group="order">
          ${tabs.map(([value, label]) => `<button id="order-tab-${value}" type="button" role="tab" data-tab-group="order" data-tab-value="${value}" aria-controls="order-${value}" aria-selected="${state.orderTab === value}" tabindex="${state.orderTab === value ? 0 : -1}" class="${value} ${state.orderTab === value ? "active" : ""}">${label}</button>`).join("")}
        </div>
        <div class="order-content tab-panels" data-tab-panel-group="order">
          <div id="order-buy" role="tabpanel" aria-labelledby="order-tab-buy" ${state.orderTab !== "buy" ? "hidden" : ""} class="order-pane ${state.orderTab === "buy" ? "active" : ""}">${standardOrderFields("buy")}</div>
          <div id="order-sell" role="tabpanel" aria-labelledby="order-tab-sell" ${state.orderTab !== "sell" ? "hidden" : ""} class="order-pane ${state.orderTab === "sell" ? "active" : ""}">${standardOrderFields("sell")}</div>
          <div id="order-amend" role="tabpanel" aria-labelledby="order-tab-amend" ${state.orderTab !== "amend" ? "hidden" : ""} class="order-pane amend-panel ${state.orderTab === "amend" ? "active" : ""}">${selectedOrderDetails("amend")}</div>
          <div id="order-cancel" role="tabpanel" aria-labelledby="order-tab-cancel" ${state.orderTab !== "cancel" ? "hidden" : ""} class="order-pane cancel-panel ${state.orderTab === "cancel" ? "active" : ""}">${selectedOrderDetails("cancel")}</div>
        </div>
      </section>`;
  }

  function moversPanelTemplate() {
    const sorted = [...stocks].sort((a, b) => b.per - a.per);
    return `
      <section class="panel movers-panel" aria-labelledby="movers-title">
        <header class="panel-head movers-panel-head"><div><p class="eyebrow">LIVE MOVERS</p><h2 class="panel-title" id="movers-title">실시간 등락률</h2></div><span class="live-label"><i></i> LIVE</span></header>
        <table class="movers-table data-table">
          <caption>전 종목 실시간 등락 순위</caption>
          <thead><tr><th scope="col">순위</th><th scope="col">종목명</th><th scope="col">현재가</th><th scope="col">등락률</th></tr></thead>
          <tbody>${sorted.map((stock, index) => `<tr><td><span class="rank rank-${index + 1}">${index + 1}</span></td><td><button type="button" data-action="select-stock" data-stock-id="${stock.id}" class="mover-stock"><strong>${escapeHtml(stock.name)}</strong><small>#${stock.id}</small></button></td><td>${won(stock.price)}</td><td class="${tone(stock.per)}">${stock.per > 0 ? "+" : ""}${stock.per.toFixed(2)}%</td></tr>`).join("")}</tbody>
        </table>
      </section>`;
  }

  function transferTemplate() {
    return `
      <button class="transfer-fab transfer-trigger" type="button" data-action="open-transfer" aria-haspopup="dialog" aria-controls="transfer-modal"><span aria-hidden="true">↗</span><strong>송금</strong><small>KRW 이체</small></button>
      <div class="modal-layer modal" id="transfer-modal" aria-hidden="true" hidden>
        <button class="modal-backdrop" type="button" data-action="close-transfer" tabindex="-1" aria-label="송금 창 닫기"></button>
        <section class="transfer-modal modal-card" role="dialog" aria-modal="true" aria-labelledby="transfer-title" aria-describedby="transfer-description">
          <header class="modal-head"><div><p class="eyebrow">KRONEX TRANSFER</p><h2 id="transfer-title">송금</h2></div><button class="modal-close" type="button" data-action="close-transfer" aria-label="송금 창 닫기">×</button></header>
          <p id="transfer-description" class="modal-description">KRONEX 계좌 사이에서 원화를 즉시 이체합니다.</p>
          <form class="transfer-form" data-transfer-form novalidate>
            <label class="form-field"><span>보내는 계좌</span><select name="fromAccount"><option>110-472-903821</option><option>110-472-918405</option></select><small>사용 가능: <strong class="positive">8,975,400 KRW</strong></small></label>
            <label class="form-field"><span>받는 계좌번호</span><input name="toAccount" type="text" inputmode="numeric" autocomplete="off" placeholder="계좌번호 입력" required /></label>
            <label class="form-field"><span class="field-label">금액</span><span class="input-with-unit input-shell"><input name="transferAmount" type="number" inputmode="numeric" min="1" placeholder="0" required /><em>KRW</em></span></label>
            <div class="quick-amounts quick-row" aria-label="금액 빠른 입력">
              <button type="button" data-action="quick-amount" data-amount="10000">+1만</button><button type="button" data-action="quick-amount" data-amount="50000">+5만</button><button type="button" data-action="quick-amount" data-amount="100000">+10만</button><button type="button" data-action="reset-amount">초기화</button>
            </div>
            <dl class="transfer-summary order-summary"><div><dt>송금 금액</dt><dd data-transfer-summary>0 KRW</dd></div><div><dt>수수료</dt><dd>0 KRW</dd></div><div class="transfer-total"><dt>총 출금</dt><dd data-transfer-total>0 KRW</dd></div></dl>
            <p class="transfer-notice">받는 계좌번호와 금액을 다시 확인해 주세요. 처리 완료 후에는 취소할 수 없습니다.</p>
            <button class="transfer-submit trade-cta" type="submit">송금하기</button>
          </form>
        </section>
      </div>`;
  }

  function toastTemplate() {
    return `<div class="toast-region" aria-label="알림">
      <div class="toast toast-success" role="status" aria-live="polite" hidden><span class="toast-icon" aria-hidden="true">✓</span><span class="toast-message">요청이 완료되었습니다.</span><button type="button" data-action="dismiss-toast" aria-label="성공 알림 닫기">×</button></div>
      <div class="toast toast-error" role="alert" aria-live="assertive" hidden><span class="toast-icon" aria-hidden="true">!</span><span class="toast-message">입력 내용을 확인해 주세요.</span><button type="button" data-action="dismiss-toast" aria-label="오류 알림 닫기">×</button></div>
    </div>`;
  }

  function tradingViewTemplate() {
    return `
      <main class="exchange-main trading-view trade-view" id="main-content">
        ${marketStripTemplate()}
        <div class="workspace">
          ${chartPanelTemplate()}
          ${accountPanelTemplate()}
          ${orderbookPanelTemplate()}
          ${orderPanelTemplate()}
          ${moversPanelTemplate()}
        </div>
        ${transferTemplate()}
      </main>`;
  }

  function authIntro(title, subtitle) {
    return `<div class="auth-intro auth-aside">
      <div class="auth-logo">${logoTemplate(false)}</div>
      <p class="eyebrow">SECURE ACCESS · KRONEX</p>
      <h1>${title}</h1><p>${subtitle}</p>
      <div class="auth-trust-row"><span>256-bit 암호화</span><span>실시간 보호</span><span>KRW 거래</span></div>
    </div>`;
  }

  function loginViewTemplate() {
    return `<main class="auth-view login-view active" id="main-content">
      <div class="auth-layout auth-shell">
        ${authIntro("다시 만나서 반가워요", "로그인하고 거래를 시작하세요")}
        <section class="auth-card" aria-labelledby="login-card-title">
          <header><p class="eyebrow">MEMBER LOGIN</p><h2 id="login-card-title">로그인</h2></header>
          <div class="auth-banner info-banner" role="status"><span aria-hidden="true">!</span><p><strong>세션 만료 안내</strong>보안을 위해 이전 세션이 만료되었습니다. 다시 로그인해 주세요.</p></div>
          <div class="auth-feedback error-banner" id="login-feedback" role="alert" hidden></div>
          <form class="auth-form" data-login-form novalidate>
            <label class="form-field"><span>아이디</span><input name="username" type="text" autocomplete="username" placeholder="아이디를 입력하세요" required /></label>
            <label class="form-field password-field"><span class="field-label">비밀번호</span><span class="password-input input-shell"><input name="password" type="password" autocomplete="current-password" placeholder="비밀번호를 입력하세요" required /><button type="button" data-action="toggle-password" aria-label="비밀번호 표시" aria-pressed="false">${eyeIcon()}</button></span></label>
            <button class="auth-submit trade-cta" type="submit">로그인</button>
          </form>
          <p class="auth-switch auth-links">아직 계정이 없으신가요? <button type="button" data-view="register">회원가입</button></p>
        </section>
      </div>
    </main>`;
  }

  function registerViewTemplate() {
    return `<main class="auth-view register-view active" id="main-content">
      <div class="auth-layout auth-shell">
        ${authIntro("처음 오셨군요!", "계정을 만들고 거래를 시작하세요")}
        <section class="auth-card" aria-labelledby="register-card-title">
          <header><p class="eyebrow">CREATE ACCOUNT</p><h2 id="register-card-title">회원가입</h2></header>
          <div class="auth-banner info-banner" role="note"><span aria-hidden="true">✓</span><p><strong>가입 전 확인</strong>실제 사용 가능한 이메일과 안전한 비밀번호를 입력해 주세요.</p></div>
          <div class="auth-feedback error-banner" id="register-feedback" role="alert" hidden></div>
          <form class="auth-form" data-register-form novalidate>
            <label class="form-field"><span>아이디</span><input name="username" type="text" autocomplete="username" placeholder="아이디를 입력하세요" required /></label>
            <label class="form-field"><span>이메일</span><input name="email" type="email" autocomplete="email" placeholder="이메일을 입력하세요" required /></label>
            <label class="form-field password-field"><span class="field-label">비밀번호</span><span class="password-input input-shell"><input name="password" type="password" autocomplete="new-password" placeholder="비밀번호를 입력하세요" required /><button type="button" data-action="toggle-password" aria-label="비밀번호 표시" aria-pressed="false">${eyeIcon()}</button></span></label>
            <label class="form-field password-field"><span class="field-label">비밀번호 확인</span><span class="password-input input-shell"><input name="confirmPassword" type="password" autocomplete="new-password" placeholder="비밀번호를 다시 입력하세요" required /><button type="button" data-action="toggle-password" aria-label="비밀번호 확인 표시" aria-pressed="false">${eyeIcon()}</button></span></label>
            <button class="auth-submit trade-cta" type="submit">회원가입</button>
          </form>
          <p class="auth-switch auth-links">이미 계정이 있으신가요? <button type="button" data-view="login">로그인</button></p>
        </section>
      </div>
    </main>`;
  }

  function openAccountViewTemplate() {
    return `<main class="auth-view open-account-view active" id="main-content">
      <div class="auth-layout auth-shell account-opening-layout">
        ${authIntro("계좌 개설", "KRONEX에서 첫 거래를 준비하세요")}
        <section class="auth-card account-opening-card" aria-labelledby="open-account-title">
          <header><p class="eyebrow">OPEN TRADING ACCOUNT</p><h2 id="open-account-title">거래 계좌 만들기</h2></header>
          <div class="auth-banner info-banner" role="note"><span aria-hidden="true">₩</span><p><strong>즉시 개설</strong>별도 서류 없이 전용 계좌번호가 바로 발급됩니다.</p></div>
          <div class="account-opening-summary">
            <div><span>계좌 종류</span><strong>KRW 종합 거래계좌</strong></div><div><span>개설 수수료</span><strong>무료</strong></div><div><span>예상 소요시간</span><strong>약 10초</strong></div>
          </div>
          <div class="auth-feedback error-banner" id="open-account-feedback" role="alert" hidden></div>
          <form data-open-account-form><button class="auth-submit trade-cta open-account-submit" type="submit">계좌 개설하기</button></form>
          <p class="account-consent">버튼을 누르면 KRONEX 계좌 이용 약관에 동의한 것으로 간주합니다.</p>
          <p class="auth-switch auth-links">이미 계좌가 있으신가요? <button type="button" data-view="trade">거래 화면으로</button></p>
        </section>
      </div>
    </main>`;
  }

  function viewTemplate() {
    if (state.view === "login") return loginViewTemplate();
    if (state.view === "register") return registerViewTemplate();
    if (state.view === "open-account") return openAccountViewTemplate();
    return tradingViewTemplate();
  }

  function render() {
    root.className = `kronex-app theme-${concept.number}`;
    root.dataset.theme = theme;
    root.dataset.concept = String(concept.number);
    root.innerHTML = `<div class="app-shell">${headerTemplate()}${viewTemplate()}${mobileNavTemplate()}${toastTemplate()}</div>`;
    document.title = `${concept.name} · KRONEX 디자인 시안`;
    updateClock();
  }

  let toastTimer = 0;
  let lastFocused = null;

  function showToast(type, message) {
    const toast = root.querySelector(`.toast-${type}`);
    const other = root.querySelector(`.toast-${type === "success" ? "error" : "success"}`);
    if (!toast) return;
    window.clearTimeout(toastTimer);
    if (other) {
      other.hidden = true;
      other.classList.remove("is-visible");
    }
    const messageNode = toast.querySelector(".toast-message");
    if (messageNode) messageNode.textContent = message;
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add("is-visible", "show"));
    toastTimer = window.setTimeout(() => dismissToast(toast), 3200);
  }

  function dismissToast(toast) {
    if (!toast) return;
    toast.classList.remove("is-visible", "show");
    window.setTimeout(() => { toast.hidden = true; }, 180);
  }

  function updateClock() {
    const node = root.querySelector(".realtime-clock");
    if (!node) return;
    const now = new Date();
    node.dateTime = now.toISOString();
    node.textContent = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).format(now);
  }

  function setTab(group, value, focusTab) {
    root.querySelectorAll(`[role="tab"][data-tab-group="${group}"]`).forEach((tab) => {
      const active = tab.dataset.tabValue === value;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focusTab) tab.focus();
    });
    root.querySelectorAll(`[data-tab-panel-group="${group}"] > [role="tabpanel"]`).forEach((panel) => {
      const active = panel.id === `${group}-${value}`;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
    if (group === "account") state.accountTab = value;
    if (group === "order") state.orderTab = value;
    if (group === "chart") {
      state.chartRange = value;
      const labels = { "1m": "1분봉", "5m": "5분봉", "15m": "15분봉", "30m": "30분봉", "1h": "1시간봉", "1d": "일봉" };
      const rangeLabel = root.querySelector(".chart-range-label");
      if (rangeLabel) rangeLabel.textContent = labels[value] || value;
      const chart = root.querySelector(".chart-canvas");
      if (chart) chart.setAttribute("aria-label", `${labels[value] || value} 차트로 전환됨`);
    }
  }

  function toggleMarket(open) {
    const trigger = root.querySelector("[data-action='toggle-market']");
    const menu = root.querySelector(".instrument-menu");
    if (!trigger || !menu) return;
    const shouldOpen = open === undefined ? menu.hidden : open;
    menu.hidden = !shouldOpen;
    menu.classList.toggle("is-open", shouldOpen);
    trigger.classList.toggle("active", shouldOpen);
    trigger.setAttribute("aria-expanded", String(shouldOpen));
    if (shouldOpen) window.setTimeout(() => root.querySelector("[data-market-search]")?.focus(), 0);
  }

  function openTransfer(trigger) {
    const layer = root.querySelector("#transfer-modal");
    if (!layer) return;
    lastFocused = trigger || document.activeElement;
    layer.hidden = false;
    layer.classList.add("is-open");
    layer.setAttribute("aria-hidden", "false");
    window.setTimeout(() => layer.querySelector(".modal-close")?.focus(), 0);
  }

  function closeTransfer() {
    const layer = root.querySelector("#transfer-modal");
    if (!layer) return;
    layer.classList.remove("is-open");
    layer.setAttribute("aria-hidden", "true");
    layer.hidden = true;
    if (lastFocused instanceof HTMLElement) lastFocused.focus();
  }

  function updateTransferSummary(input) {
    const amount = Math.max(0, Number(input?.value) || 0);
    root.querySelectorAll("[data-transfer-summary], [data-transfer-total]").forEach((node) => { node.textContent = `${won(amount)} KRW`; });
  }

  function authError(id, message) {
    const feedback = root.querySelector(`#${id}`);
    if (!feedback) return;
    feedback.innerHTML = `<span aria-hidden="true">!</span><p>${escapeHtml(message)}</p>`;
    feedback.hidden = false;
    feedback.focus?.();
    showToast("error", message);
  }

  root.addEventListener("click", (event) => {
    const viewButton = event.target.closest("[data-view]");
    if (viewButton) {
      state.view = viewButton.dataset.view;
      if (state.view === "trade") state.loggedIn = true;
      render();
      root.querySelector("#main-content")?.focus?.();
      return;
    }

    const tab = event.target.closest("[role='tab'][data-tab-group]");
    if (tab) {
      setTab(tab.dataset.tabGroup, tab.dataset.tabValue, false);
      return;
    }

    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return;
    const action = actionTarget.dataset.action;

    if (action === "logout") {
      state.loggedIn = false;
      state.view = "login";
      render();
      showToast("success", "안전하게 로그아웃되었습니다.");
    } else if (action === "toggle-market") {
      toggleMarket();
    } else if (action === "select-stock") {
      state.selectedStock = actionTarget.dataset.stockId;
      render();
      showToast("success", `${currentStock().name} 종목으로 전환했습니다.`);
    } else if (action === "set-price") {
      const activePanel = root.querySelector("#order-buy:not([hidden]), #order-sell:not([hidden])") || root.querySelector("#order-buy");
      const input = activePanel?.querySelector("input[name='price']");
      if (input) {
        input.value = actionTarget.dataset.price;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.focus();
        showToast("success", `${won(actionTarget.dataset.price)} KRW를 주문 가격에 반영했습니다.`);
      }
    } else if (action === "price-type") {
      const form = actionTarget.closest(".order-entry");
      form?.querySelectorAll("[data-price-type]").forEach((button) => {
        const active = button === actionTarget;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      const priceField = form?.querySelector(".order-price-field");
      if (priceField) priceField.hidden = actionTarget.dataset.priceType === "market";
    } else if (action === "order-percent") {
      const form = actionTarget.closest(".order-entry");
      const percentage = Number(actionTarget.dataset.percent);
      const price = Number(form?.querySelector("input[name='price']")?.value) || 71800;
      const quantity = form?.dataset.side === "sell" ? Math.floor(84 * percentage / 100) : Math.floor(8975400 * percentage / 100 / price);
      const input = form?.querySelector("input[name='quantity']");
      if (input) {
        input.value = String(quantity);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    } else if (action === "select-order") {
      state.selectedOrder = actionTarget.dataset.orderId;
      setTab("account", "open", false);
      setTab("order", "amend", false);
      showToast("success", `주문 ${state.selectedOrder}을 정정 대상으로 선택했습니다.`);
    } else if (action === "confirm-cancel") {
      showToast("success", `주문 ${state.selectedOrder}이 취소되었습니다.`);
    } else if (action === "open-transfer") {
      openTransfer(actionTarget);
    } else if (action === "close-transfer") {
      closeTransfer();
    } else if (action === "quick-amount") {
      const input = root.querySelector("input[name='transferAmount']");
      if (input) {
        input.value = String((Number(input.value) || 0) + Number(actionTarget.dataset.amount));
        updateTransferSummary(input);
        input.focus();
      }
    } else if (action === "reset-amount") {
      const input = root.querySelector("input[name='transferAmount']");
      if (input) {
        input.value = "";
        updateTransferSummary(input);
        input.focus();
      }
    } else if (action === "toggle-password") {
      const input = actionTarget.closest(".password-input")?.querySelector("input");
      if (!input) return;
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      actionTarget.classList.toggle("is-visible", !showing);
      actionTarget.setAttribute("aria-pressed", String(!showing));
      actionTarget.setAttribute("aria-label", showing ? "비밀번호 표시" : "비밀번호 숨기기");
      input.focus();
    } else if (action === "dismiss-toast") {
      dismissToast(actionTarget.closest(".toast"));
    }
  });

  root.addEventListener("input", (event) => {
    const input = event.target;
    if (input.matches("[data-market-search]")) {
      const query = input.value.trim().toLowerCase();
      let visible = 0;
      root.querySelectorAll(".instrument-option").forEach((option) => {
        const matchesQuery = option.dataset.search.includes(query);
        option.hidden = !matchesQuery;
        if (matchesQuery) visible += 1;
      });
      const empty = root.querySelector(".instrument-empty");
      if (empty) empty.hidden = visible !== 0;
    }
    if (input.matches("input[name='transferAmount']")) updateTransferSummary(input);
    if (input.matches(".order-entry input[name='quantity'], .order-entry input[name='price']")) {
      const form = input.closest(".order-entry");
      const price = Number(form?.querySelector("input[name='price']")?.value) || 71800;
      const quantity = Number(form?.querySelector("input[name='quantity']")?.value) || 0;
      const estimate = form?.querySelector("[data-order-estimate]");
      if (estimate) estimate.textContent = `${won(price * quantity)} KRW`;
    }
  });

  root.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target;

    if (form.matches("[data-login-form]")) {
      const username = form.elements.username.value.trim();
      const password = form.elements.password.value;
      if (!username || !password) return authError("login-feedback", "아이디와 비밀번호를 입력해주세요.");
      state.loggedIn = true;
      state.view = "trade";
      render();
      showToast("success", `${username}님, KRONEX에 오신 것을 환영합니다.`);
    } else if (form.matches("[data-register-form]")) {
      const username = form.elements.username.value.trim();
      const email = form.elements.email.value.trim();
      const password = form.elements.password.value;
      const confirmPassword = form.elements.confirmPassword.value;
      if (!username || !email || !password || !confirmPassword) return authError("register-feedback", "모든 항목을 입력해주세요.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return authError("register-feedback", "올바른 이메일 형식을 입력해주세요.");
      if (password !== confirmPassword) return authError("register-feedback", "비밀번호가 일치하지 않습니다.");
      state.view = "login";
      render();
      showToast("success", "회원가입이 완료되었습니다. 로그인해주세요.");
    } else if (form.matches("[data-open-account-form]")) {
      state.view = "trade";
      render();
      showToast("success", "계좌가 개설되었습니다. 바로 거래를 시작할 수 있습니다.");
    } else if (form.matches("[data-order-form]")) {
      const side = form.dataset.side === "sell" ? "매도" : "매수";
      const market = form.querySelector("[data-price-type='market']")?.getAttribute("aria-pressed") === "true";
      const price = Number(form.elements.price.value);
      const quantity = Number(form.elements.quantity.value);
      if (!quantity || quantity < 1) return showToast("error", "수량은 1주 이상 입력해주세요.");
      if (!market && (!price || price < 1)) return showToast("error", "가격은 1원 이상 입력해주세요.");
      showToast("success", `${side} 주문이 완료되었습니다.`);
      form.elements.quantity.value = "";
      form.querySelector("[data-order-estimate]").textContent = "0 KRW";
    } else if (form.matches("[data-amend-form]")) {
      const price = Number(form.elements.amendPrice.value);
      if (!price || price < 1) return showToast("error", "정정 가격을 입력해주세요.");
      showToast("success", `주문 ${state.selectedOrder}이 ${won(price)} KRW로 정정되었습니다.`);
    } else if (form.matches("[data-transfer-form]")) {
      const destination = form.elements.toAccount.value.trim();
      const amount = Number(form.elements.transferAmount.value);
      if (!destination) return showToast("error", "받는 계좌번호를 입력해주세요.");
      if (!amount || amount < 1) return showToast("error", "금액을 입력해주세요.");
      if (amount > 8975400) return showToast("error", "사용 가능한 잔액을 초과했습니다.");
      closeTransfer();
      showToast("success", `${won(amount)} KRW 송금이 완료되었습니다.`);
    }
  });

  root.addEventListener("keydown", (event) => {
    const tab = event.target.closest?.("[role='tab'][data-tab-group]");
    if (tab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const tabs = [...root.querySelectorAll(`[role="tab"][data-tab-group="${tab.dataset.tabGroup}"]`)];
      let index = tabs.indexOf(tab);
      if (event.key === "Home") index = 0;
      else if (event.key === "End") index = tabs.length - 1;
      else index = (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      setTab(tab.dataset.tabGroup, tabs[index].dataset.tabValue, true);
      return;
    }

    if (event.target.matches?.("[data-action='toggle-market']") && event.key === "ArrowDown") {
      event.preventDefault();
      toggleMarket(true);
    }
    if (event.target.matches?.("[data-market-search]") && event.key === "ArrowDown") {
      const first = [...root.querySelectorAll(".instrument-option")].find((option) => !option.hidden);
      if (first) { event.preventDefault(); first.focus(); }
    }

    const layer = root.querySelector("#transfer-modal:not([hidden])");
    if (layer && event.key === "Tab") {
      const focusable = [...layer.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])")].filter((node) => !node.hidden);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (root.querySelector("#transfer-modal:not([hidden])")) closeTransfer();
    else if (root.querySelector(".instrument-menu:not([hidden])")) {
      toggleMarket(false);
      root.querySelector("[data-action='toggle-market']")?.focus();
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (!root.contains(event.target)) return;
    if (!event.target.closest(".instrument-picker") && root.querySelector(".instrument-menu:not([hidden])")) toggleMarket(false);
  });

  render();
  window.setInterval(updateClock, 1000);
})();
