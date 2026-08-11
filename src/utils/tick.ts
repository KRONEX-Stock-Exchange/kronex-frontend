// 호가 단위(틱) 유틸

export function getTickSize(price: number): number {
  if (price < 2000) return 1;
  if (price < 5000) return 5;
  if (price < 20000) return 10;
  if (price < 50000) return 50;
  if (price < 200000) return 100;
  if (price < 500000) return 500;
  return 1000;
}

// 한 틱 위/아래로 이동. 내릴 때는 경계 아래 구간의 단위를 적용한다.
// (예: 2000원에서 내리면 1999원 구간의 단위 1원이 적용되어 1999원)
export function stepPrice(price: number, direction: 1 | -1): number {
  if (direction > 0) return price + getTickSize(price);
  return Math.max(0, price - getTickSize(Math.max(0, price - 1)));
}
