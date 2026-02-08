import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
} from "lightweight-charts";
import type { IChartApi } from "lightweight-charts";

// 목업 데이터 생성
function generateMockData() {
  const data = [];
  const volumeData = [];
  let basePrice = 10000;
  const now = new Date();

  for (let i = 100; i >= 0; i--) {
    const date = new Date(now);
    date.setMinutes(date.getMinutes() - i * 5);
    const time = Math.floor(date.getTime() / 1000);

    const open = basePrice + (Math.random() - 0.5) * 200;
    const close = open + (Math.random() - 0.5) * 300;
    const high = Math.max(open, close) + Math.random() * 100;
    const low = Math.min(open, close) - Math.random() * 100;
    const volume = Math.floor(Math.random() * 10000) + 1000;

    data.push({ time, open, high, low, close });
    volumeData.push({
      time,
      value: volume,
      color: close >= open ? "rgba(246, 70, 93, 0.5)" : "rgba(37, 99, 235, 0.5)",
    });

    basePrice = close;
  }

  return { candleData: data, volumeData };
}

export function CandlestickChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const { candleData, volumeData } = generateMockData();

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#181a20" },
        textColor: "#848e9c",
      },
      grid: {
        vertLines: { color: "#2b2f36" },
        horzLines: { color: "#2b2f36" },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      crosshair: {
        mode: 1,
        vertLine: {
          color: "#505050",
          labelBackgroundColor: "#2b2f36",
        },
        horzLine: {
          color: "#505050",
          labelBackgroundColor: "#2b2f36",
        },
      },
      timeScale: {
        borderColor: "#2b2f36",
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: "#2b2f36",
      },
    });

    chartRef.current = chart;

    // 캔들스틱 시리즈
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#f6465d",
      downColor: "#2563eb",
      borderUpColor: "#f6465d",
      borderDownColor: "#2563eb",
      wickUpColor: "#f6465d",
      wickDownColor: "#2563eb",
    });
    candlestickSeries.setData(candleData);

    // 거래량 시리즈
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });
    volumeSeries.setData(volumeData);

    // 차트 크기 맞추기
    chart.timeScale().fitContent();

    // 리사이즈 핸들러
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  return (
    <div className="w-full h-full bg-[#181a20] rounded-2xl overflow-hidden p-2">
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
}
