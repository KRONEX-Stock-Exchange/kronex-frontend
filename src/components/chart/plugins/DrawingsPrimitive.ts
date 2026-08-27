import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";

// 좌표계는 시간(Time)이 아니라 논리 인덱스(logical index)로 저장한다.
// coordinateToTime()은 마지막 봉 너머의 여백(whitespace)에서 null을 반환해
// 오른쪽 여백에 아무것도 그릴 수 없었는데, coordinateToLogical()은 그 영역에서도
// 분수 인덱스를 계속 내주므로 여백에도 그릴 수 있고, snapToCandle 같은 계산도
// 봉을 순회하지 않고 인덱스를 반올림하는 것만으로 끝나 빨라진다.
export interface DrawingPoint {
  logical: number;
  price: number;
}

export interface DrawingStyle {
  color: string;
  width: number;
  locked: boolean;
}

export const DEFAULT_DRAWING_COLOR = "#f0b90b";
export const DEFAULT_DRAWING_WIDTH = 2;
export const DEFAULT_EMOJI_SIZE = 20;
export const DEFAULT_TEXT_SIZE = 12;

type DrawingShape =
  | { id: number; type: "trendline"; p1: DrawingPoint; p2: DrawingPoint }
  | { id: number; type: "hline"; price: number }
  | { id: number; type: "polyline"; points: DrawingPoint[] }
  | { id: number; type: "pattern"; points: DrawingPoint[] }
  | {
      id: number;
      type: "channel";
      p1: DrawingPoint;
      p2: DrawingPoint;
      offsetPrice: number;
    }
  | { id: number; type: "brush"; points: DrawingPoint[] }
  | {
      id: number;
      type: "text";
      point: DrawingPoint;
      text: string;
      size: number;
      angle: number;
      flipped: boolean;
    }
  | {
      id: number;
      type: "emoji";
      point: DrawingPoint;
      emoji: string;
      size: number;
      angle: number;
      flipped: boolean;
    };

export type Drawing = DrawingShape & DrawingStyle;

export type Draft =
  | { type: "trendline"; p1: DrawingPoint; p2: DrawingPoint }
  | { type: "hline"; price: number }
  | { type: "polyline"; points: DrawingPoint[] }
  | { type: "pattern"; points: DrawingPoint[] }
  | {
      type: "channel";
      p1: DrawingPoint;
      p2: DrawingPoint;
      offsetPrice: number;
    }
  | { type: "brush"; points: DrawingPoint[] };

const HIT_RADIUS = 6;
const HANDLE_RADIUS = 4.5;

function strokePoints(
  ctx: CanvasRenderingContext2D,
  coords: ({ x: number; y: number } | null)[],
  close = false,
) {
  const valid = coords.filter((c): c is { x: number; y: number } => c !== null);
  if (valid.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(valid[0].x, valid[0].y);
  for (let i = 1; i < valid.length; i++) ctx.lineTo(valid[i].x, valid[i].y);
  if (close) ctx.closePath();
  ctx.stroke();
}

// 브러시(색연필) 획을 자연스럽게 — 모든 점을 지나면서 접선이 이어지는 Catmull-Rom
// 스플라인을 3차 베지어로 변환해 긋는다. 점이 듬성듬성해도 꺾인 곳 없이 흐르듯 그려진다.
function strokeSmooth(
  ctx: CanvasRenderingContext2D,
  coords: ({ x: number; y: number } | null)[],
) {
  const p = coords.filter((c): c is { x: number; y: number } => c !== null);
  if (p.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(p[0].x, p[0].y);
  if (p.length === 2) {
    ctx.lineTo(p[1].x, p[1].y);
    ctx.stroke();
    return;
  }
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] ?? p2;
    // Catmull-Rom → 베지어 제어점 (장력 6 = 표준)
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2.x, p2.y);
  }
  ctx.stroke();
}

function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

class DrawingsPaneRenderer implements IPrimitivePaneRenderer {
  private readonly source: DrawingsPrimitive;
  constructor(source: DrawingsPrimitive) {
    this.source = source;
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (!this.source.visible) return;
    this.source.beginCoordinateCache();
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      ctx.save();
      ctx.scale(scope.horizontalPixelRatio, scope.verticalPixelRatio);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const width = scope.mediaSize.width;

      for (const drawing of this.source.drawings) {
        ctx.strokeStyle = drawing.color;
        ctx.fillStyle = drawing.color;
        ctx.lineWidth = drawing.width;
        this.drawOne(ctx, drawing, width);
      }
      if (this.source.draft) {
        ctx.strokeStyle = `${DEFAULT_DRAWING_COLOR}aa`;
        ctx.fillStyle = `${DEFAULT_DRAWING_COLOR}aa`;
        ctx.lineWidth = DEFAULT_DRAWING_WIDTH;
        this.drawOne(ctx, this.source.draft, width);
      }

      // 수평선 가격 태그 — 선들 위에 겹쳐 그려야 가려지지 않으므로 별도 패스로 마지막에.
      if (this.source.priceTagEnabled) {
        for (const drawing of this.source.drawings) {
          if (drawing.type === "hline")
            this.drawHlinePriceTag(ctx, drawing.price, width);
        }
        if (this.source.draft?.type === "hline")
          this.drawHlinePriceTag(ctx, this.source.draft.price, width);
      }

      const selected = this.source.selected;
      if (selected) {
        if (
          (selected.type === "emoji" || selected.type === "text") &&
          this.source.isContentTransforming(selected)
        ) {
          const handles = this.source.getContentTransformHandles(selected);
          if (handles) {
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(handles.corners[0].x, handles.corners[0].y);
            for (let i = 1; i < handles.corners.length; i++)
              ctx.lineTo(handles.corners[i].x, handles.corners[i].y);
            ctx.closePath();
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(handles.rotationAnchor.x, handles.rotationAnchor.y);
            ctx.lineTo(handles.rotate.x, handles.rotate.y);
            ctx.stroke();
            for (const handle of [...handles.corners, handles.rotate]) {
              ctx.beginPath();
              ctx.arc(handle.x, handle.y, HANDLE_RADIUS, 0, Math.PI * 2);
              ctx.fillStyle = "#ffffff";
              ctx.fill();
              ctx.stroke();
            }
          }
        } else {
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = selected.color;
          ctx.lineWidth = 1.5;
          for (const p of this.source.getControlPoints(selected)) {
            const c = this.source.toCoordinate(p);
            if (!c) continue;
            ctx.beginPath();
            ctx.arc(c.x, c.y, HANDLE_RADIUS, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        }
      }

      const eraser = this.source.eraserCursor;
      if (eraser) {
        ctx.beginPath();
        ctx.arc(eraser.x, eraser.y, eraser.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#ffffff";
        ctx.setLineDash([2, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore();
    });
    this.source.endCoordinateCache();
  }

  private drawOne(
    ctx: CanvasRenderingContext2D,
    d: Drawing | Draft,
    chartWidth: number,
  ) {
    const toCoord = (p: DrawingPoint) => this.source.toCoordinate(p);

    if (d.type === "trendline") {
      strokePoints(ctx, [toCoord(d.p1), toCoord(d.p2)]);
      return;
    }
    if (d.type === "hline") {
      const y = this.source.priceToCoordinate(d.price);
      if (y === null) return;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();
      return;
    }
    if (d.type === "brush") {
      strokeSmooth(
        ctx,
        d.points.map((p) => toCoord(p)),
      );
      return;
    }
    if (d.type === "polyline") {
      strokePoints(
        ctx,
        d.points.map((p) => toCoord(p)),
      );
      return;
    }
    if (d.type === "pattern") {
      strokePoints(
        ctx,
        d.points.map((p) => toCoord(p)),
        d.points.length >= 3,
      );
      return;
    }
    if (d.type === "channel") {
      const c1 = toCoord(d.p1);
      const c2 = toCoord(d.p2);
      strokePoints(ctx, [c1, c2]);
      const o1 = this.source.toCoordinate({
        logical: d.p1.logical,
        price: d.p1.price + d.offsetPrice,
      });
      const o2 = this.source.toCoordinate({
        logical: d.p2.logical,
        price: d.p2.price + d.offsetPrice,
      });
      strokePoints(ctx, [o1, o2]);
      return;
    }
    if (d.type === "text") {
      const c = toCoord(d.point);
      if (!c) return;
      ctx.font = `${d.size}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate((d.angle * Math.PI) / 180);
      // 좌우반전은 회전한 로컬 좌표계 안에서 글자 자체를 뒤집는다(회전 먼저, 반전은
      // 그 위에 얹는 방식) — 그래야 반전 후 회전시켜도 손잡이가 가리키는 위/아래가
      // 계속 화면 기준으로 일관되게 움직인다.
      if (d.flipped) ctx.scale(-1, 1);
      ctx.fillText(d.text, 0, 0);
      ctx.restore();
      ctx.textAlign = "start";
      return;
    }
    if (d.type === "emoji") {
      const c = toCoord(d.point);
      if (!c) return;
      ctx.font = `${d.size}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate((d.angle * Math.PI) / 180);
      if (d.flipped) ctx.scale(-1, 1);
      ctx.fillText(d.emoji, 0, 0);
      ctx.restore();
      ctx.textAlign = "start";
      return;
    }
  }

  // 수평선 오른쪽 끝(가격축 쪽) 선 바로 위에 "17,093 (+3.43%)" 형태의 라벨을 그린다.
  // 가격 = 그 수평선의 가격, 등락률 = 현재가가 그 가격까지 몇 % 남았는지. 배경 없음.
  private drawHlinePriceTag(
    ctx: CanvasRenderingContext2D,
    price: number,
    chartWidth: number,
  ) {
    const current = this.source.currentPrice;
    if (current === null || current <= 0) return;

    const y = this.source.priceToCoordinate(price);
    if (y === null) return;

    const pct = ((price - current) / current) * 100;
    const up = pct >= 0;
    const text = `${Math.round(price).toLocaleString("ko-KR")} (${
      up ? "+" : ""
    }${pct.toFixed(2)}%)`;

    ctx.save();
    ctx.font = "11px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    // 선 위쪽에 아슬아슬하게 붙지 않도록 살짝 띄우고, 화면 위로 넘어가면 선 아래로.
    const above = y - 4 > 12;
    ctx.textBaseline = above ? "bottom" : "top";
    // 배경이 없으므로 캔들 위에서도 읽히도록 얇은 외곽선만 준다.
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#181a20";
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    const x = chartWidth - 6;
    const ty = above ? y - 4 : y + 4;
    ctx.strokeText(text, x, ty);
    ctx.fillStyle = up ? "#f6465d" : "#2563eb";
    ctx.fillText(text, x, ty);
    ctx.restore();
  }
}

class DrawingsPaneView implements IPrimitivePaneView {
  private readonly source: DrawingsPrimitive;
  constructor(source: DrawingsPrimitive) {
    this.source = source;
  }
  renderer(): IPrimitivePaneRenderer | null {
    return new DrawingsPaneRenderer(this.source);
  }
}

// 차트 위에 다양한 종류(추세선/수평선/폴리라인/패턴/채널/브러시/텍스트/이모지)의
// 드로잉을 그리는 primitive. lightweight-charts는 수평 가격선(createPriceLine)
// 외의 임의 도형을 지원하지 않아 캔버스에 직접 그린다.
export class DrawingsPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<never, Time> | null = null;
  private requestUpdateFn: (() => void) | null = null;
  private _drawings: Drawing[] = [];
  private _draft: Draft | null = null;
  private _visible = true;
  // 수평선 오른쪽 끝에 그 선의 가격과 현재가 대비 등락률을 띄우는 옵션.
  private _priceTagEnabled = false;
  private _currentPrice: number | null = null;
  private _selectedId: number | null = null;
  private _contentTransformId: number | null = null;
  // 지우개 커서(원)를 그릴 위치와 반경. 지우개 도구가 활성일 때만 채워진다.
  private _eraserCursor: { x: number; y: number; r: number } | null = null;
  // 획을 지우개로 쪼갤 때 새로 만드는 조각들의 고유 id 생성용(같은 ms 충돌 방지).
  private _idSeq = 0;
  private readonly paneView = new DrawingsPaneView(this);

  // 실행 취소(Ctrl+Z)/다시 실행 스택. 드래그처럼 pointermove마다 여러 번 바뀌는
  // 편집은 begin/endHistoryTransaction으로 감싸 한 덩어리(제스처 하나 = undo 한 번)로
  // 묶고, 그 사이의 updateDrawing 호출들은 각각 히스토리를 쌓지 않는다.
  private _undoStack: Drawing[][] = [];
  private _redoStack: Drawing[][] = [];
  private _historySuspended = false;
  private static readonly MAX_HISTORY = 100;

  private pushHistory(): void {
    if (this._historySuspended) return;
    this._undoStack.push(this._drawings);
    if (this._undoStack.length > DrawingsPrimitive.MAX_HISTORY)
      this._undoStack.shift();
    this._redoStack = [];
  }

  beginHistoryTransaction(): void {
    if (this._historySuspended) return;
    this.pushHistory();
    this._historySuspended = true;
  }

  endHistoryTransaction(): void {
    this._historySuspended = false;
  }

  // 스냅샷을 새로 쌓지 않고 이후 변경만 히스토리에서 제외한다. 지우개처럼 "첫 변경은
  // 스스로 스냅샷을 남기고, 그 뒤 드래그 내내의 변경은 한 덩어리"로 묶을 때 쓴다.
  suspendHistory(): void {
    this._historySuspended = true;
  }

  get canUndo(): boolean {
    return this._undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this._redoStack.length > 0;
  }

  undo(): boolean {
    const previous = this._undoStack.pop();
    if (!previous) return false;
    this._redoStack.push(this._drawings);
    this._drawings = previous;
    if (
      this._selectedId !== null &&
      !this._drawings.some((d) => d.id === this._selectedId)
    ) {
      this._selectedId = null;
      this._contentTransformId = null;
    }
    this.requestUpdateFn?.();
    return true;
  }

  redo(): boolean {
    const next = this._redoStack.pop();
    if (!next) return false;
    this._undoStack.push(this._drawings);
    this._drawings = next;
    if (
      this._selectedId !== null &&
      !this._drawings.some((d) => d.id === this._selectedId)
    ) {
      this._selectedId = null;
      this._contentTransformId = null;
    }
    this.requestUpdateFn?.();
    return true;
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart as IChartApi;
    this.series = param.series as ISeriesApi<never, Time>;
    this.requestUpdateFn = param.requestUpdate;
  }

  detached(): void {
    this.chart = null;
    this.series = null;
    this.requestUpdateFn = null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView];
  }

  get drawings(): readonly Drawing[] {
    return this._drawings;
  }

  get draft(): Draft | null {
    return this._draft;
  }

  get visible(): boolean {
    return this._visible;
  }

  get selected(): Drawing | null {
    if (this._selectedId === null) return null;
    return this._drawings.find((d) => d.id === this._selectedId) ?? null;
  }

  setSelected(id: number | null): void {
    this._selectedId = id;
    if (id !== this._contentTransformId) this._contentTransformId = null;
    this.requestUpdateFn?.();
  }

  setContentTransform(id: number | null): void {
    this._contentTransformId = id;
    this.requestUpdateFn?.();
  }

  isContentTransforming(drawing: Drawing): boolean {
    return (
      (drawing.type === "emoji" || drawing.type === "text") &&
      drawing.id === this._contentTransformId
    );
  }

  getContentTransformHandles(
    drawing: Extract<Drawing, { type: "emoji" | "text" }>,
  ): {
    center: { x: number; y: number };
    corners: { x: number; y: number }[];
    rotationAnchor: { x: number; y: number };
    rotate: { x: number; y: number };
  } | null {
    const center = this.toCoordinate(drawing.point);
    if (!center) return null;
    const angle = (drawing.angle * Math.PI) / 180;
    const rotatePoint = (x: number, y: number) => ({
      x: center.x + x * Math.cos(angle) - y * Math.sin(angle),
      y: center.y + x * Math.sin(angle) + y * Math.cos(angle),
    });
    const contentWidth =
      drawing.type === "text"
        ? Math.max(
            drawing.size,
            Array.from(drawing.text).length * drawing.size * 0.65,
          )
        : drawing.size;
    const halfWidth = contentWidth / 2 + 6;
    const halfHeight = drawing.size / 2 + 6;
    return {
      center,
      corners: [
        rotatePoint(-halfWidth, -halfHeight),
        rotatePoint(halfWidth, -halfHeight),
        rotatePoint(halfWidth, halfHeight),
        rotatePoint(-halfWidth, halfHeight),
      ],
      // 회전 손잡이는 도형 위쪽으로 뺀다(아래쪽은 선택 미니 툴바가 뜨는 자리라 겹친다)
      rotationAnchor: rotatePoint(0, -halfHeight),
      rotate: rotatePoint(0, -halfHeight - 18),
    };
  }

  setVisible(visible: boolean): void {
    this._visible = visible;
    this.requestUpdateFn?.();
  }

  get eraserCursor(): { x: number; y: number; r: number } | null {
    return this._eraserCursor;
  }

  setEraserCursor(cursor: { x: number; y: number; r: number } | null): void {
    if (
      this._eraserCursor?.x === cursor?.x &&
      this._eraserCursor?.y === cursor?.y &&
      this._eraserCursor?.r === cursor?.r
    ) {
      return;
    }
    this._eraserCursor = cursor;
    this.requestUpdateFn?.();
  }

  private genId(): number {
    return Date.now() * 1000 + (this._idSeq++ % 1000);
  }

  // 화면 좌표 (x, y) 반경 r 안을 "지운다". 무언가 바뀌면 true.
  // mode "partial"(기본): 브러시/폴리라인 획은 반경에 닿은 점만 빼고 남은 구간들로
  //   쪼갠다(그림앱 지우개처럼 문지른 부분만). 그 외 도형은 닿으면 통째로.
  // mode "stroke": 닿은 도형은 종류 불문 통째로 지운다.
  eraseAt(
    x: number,
    y: number,
    r: number,
    mode: "partial" | "stroke" = "partial",
  ): boolean {
    let changed = false;
    const next: Drawing[] = [];
    for (const d of this._drawings) {
      if (d.locked) {
        next.push(d);
        continue;
      }
      if (mode === "partial" && (d.type === "brush" || d.type === "polyline")) {
        const coords = d.points.map((p) => this.toCoordinate(p));
        let hit = false;
        const segments: DrawingPoint[][] = [];
        let run: DrawingPoint[] = [];
        for (let i = 0; i < d.points.length; i++) {
          const c = coords[i];
          if (c && Math.hypot(c.x - x, c.y - y) <= r) {
            hit = true;
            if (run.length) {
              segments.push(run);
              run = [];
            }
          } else {
            run.push(d.points[i]);
          }
        }
        if (run.length) segments.push(run);
        if (!hit) {
          next.push(d);
          continue;
        }
        changed = true;
        for (const seg of segments) {
          if (seg.length >= 2)
            next.push({ ...d, id: this.genId(), points: seg });
        }
        continue;
      }
      if (this.hitTestDrawing(d, x, y, r)) {
        changed = true;
        continue;
      }
      next.push(d);
    }
    if (!changed) return false;
    this.pushHistory();
    this._drawings = next;
    if (
      this._selectedId !== null &&
      !this._drawings.some((dd) => dd.id === this._selectedId)
    ) {
      this._selectedId = null;
      this._contentTransformId = null;
    }
    this.requestUpdateFn?.();
    return true;
  }

  get priceTagEnabled(): boolean {
    return this._priceTagEnabled;
  }

  get currentPrice(): number | null {
    return this._currentPrice;
  }

  // 수평선 가격 태그 옵션 on/off + 현재가 갱신. 값이 안 바뀌면 재렌더를 요청하지
  // 않아 (rAF 루프에서 매 프레임 불려도) 불필요한 다시 그리기가 없다.
  setPriceTag(enabled: boolean, currentPrice: number | null): void {
    // 옵션이 꺼져 있으면 현재가 변동은 무시한다 (라벨을 안 그리므로 재렌더 불필요).
    const nextPrice = enabled ? currentPrice : this._currentPrice;
    if (this._priceTagEnabled === enabled && this._currentPrice === nextPrice) {
      return;
    }
    this._priceTagEnabled = enabled;
    this._currentPrice = nextPrice;
    this.requestUpdateFn?.();
  }

  addDrawing(drawing: Drawing): void {
    this.pushHistory();
    this._drawings = [...this._drawings, drawing];
    this.requestUpdateFn?.();
  }

  removeDrawing(id: number): void {
    this.pushHistory();
    this._drawings = this._drawings.filter((d) => d.id !== id);
    if (this._selectedId === id) this._selectedId = null;
    this.requestUpdateFn?.();
  }

  updateDrawing(id: number, patch: Partial<Drawing>): void {
    this.pushHistory();
    this._drawings = this._drawings.map((d) =>
      d.id === id ? ({ ...d, ...patch } as Drawing) : d,
    );
    this.requestUpdateFn?.();
  }

  clear(): void {
    this.pushHistory();
    this._drawings = [];
    this._selectedId = null;
    this.requestUpdateFn?.();
  }

  // 저장된 드로잉 목록을 통째로 교체한다 (로컬 스토리지에서 불러올 때 사용).
  // 종목을 바꾸는 것이지 "편집"이 아니므로 undo/redo 히스토리는 초기화한다 —
  // 그러지 않으면 다른 종목 화면에서 Ctrl+Z를 눌러 이전 종목 드로잉이 섞여 들어올 수 있다.
  setDrawings(drawings: Drawing[]): void {
    this._drawings = drawings;
    this._selectedId = null;
    this._contentTransformId = null;
    this._undoStack = [];
    this._redoStack = [];
    this._historySuspended = false;
    this.requestUpdateFn?.();
  }

  // 과거 봉이 앞쪽에 추가(무한 스크롤 prepend)되면 logical index 0의 의미가
  // 그만큼 더 오래된 봉으로 바뀌므로, 기존에 저장해둔 모든 드로잉의 logical을
  // 같은 양만큼 밀어줘야 원래 가리키던 봉에 계속 붙어 있는다.
  shiftLogical(delta: number): void {
    if (delta === 0) return;
    const shiftPoint = (p: DrawingPoint): DrawingPoint => ({
      ...p,
      logical: p.logical + delta,
    });
    const shiftDrawing = (d: Drawing): Drawing => {
      if (d.type === "hline") return d;
      if (d.type === "trendline" || d.type === "channel")
        return { ...d, p1: shiftPoint(d.p1), p2: shiftPoint(d.p2) };
      if (d.type === "polyline" || d.type === "brush" || d.type === "pattern")
        return { ...d, points: d.points.map(shiftPoint) };
      return { ...d, point: shiftPoint(d.point) };
    };
    const shiftDraft = (d: Draft): Draft => {
      if (d.type === "hline") return d;
      if (d.type === "trendline" || d.type === "channel")
        return { ...d, p1: shiftPoint(d.p1), p2: shiftPoint(d.p2) };
      return { ...d, points: d.points.map(shiftPoint) };
    };
    this._drawings = this._drawings.map(shiftDrawing);
    if (this._draft) this._draft = shiftDraft(this._draft);
    // undo/redo 스택에 쌓인 과거 스냅샷들도 같이 밀어두지 않으면, 이 prepend 이후에
    // Ctrl+Z를 눌렀을 때 드로잉이 shift 되기 전(즉, 엉뚱한 봉) 위치로 튀어버린다.
    this._undoStack = this._undoStack.map((snapshot) =>
      snapshot.map(shiftDrawing),
    );
    this._redoStack = this._redoStack.map((snapshot) =>
      snapshot.map(shiftDrawing),
    );
    this.requestUpdateFn?.();
  }

  setDraft(draft: Draft | null): void {
    this._draft = draft;
    this.requestUpdateFn?.();
  }

  toCoordinate(point: DrawingPoint): { x: number; y: number } | null {
    if (!this.chart || !this.series) return null;
    const x = this.logicalToX(point.logical);
    const y = this.series.priceToCoordinate(point.price);
    if (x === null || y === null) return null;
    return { x, y };
  }

  // lightweight-charts 5.x의 logicalToCoordinate/coordinateToLogical은 정수 봉
  // 인덱스로 스냅한다(브러시 획이 봉 폭만큼 계단처럼 각져 보이던 원인). 정수 logical은
  // 그대로 넘기고, 소수 logical은 양옆 정수 봉 좌표를 선형 보간해 봉 사이 위치도
  // 픽셀 단위로 정확히 그린다.
  logicalToX(logical: number): number | null {
    if (!this.chart) return null;
    const lo = Math.floor(logical);
    const xLo = this.intLogicalToX(lo);
    if (Number.isInteger(logical)) return xLo;
    const xHi = this.intLogicalToX(lo + 1);
    if (xLo === null || xHi === null) return null;
    return xLo + (xHi - xLo) * (logical - lo);
  }

  // 정수 logical → x. 한 번의 렌더( draw() ) 안에서는 결과가 안 바뀌므로 그동안만
  // 캐시한다 (브러시 획은 점이 수백 개라 매 점마다 logicalToCoordinate를 부르면 낭비).
  // 렌더 밖(히트테스트/툴바 위치 등)에서는 스크롤로 값이 바뀔 수 있어 캐시하지 않는다.
  private _xCache = new Map<number, number | null>();
  private _caching = false;
  private intLogicalToX(intLogical: number): number | null {
    if (this._caching) {
      const cached = this._xCache.get(intLogical);
      if (cached !== undefined) return cached;
    }
    const x =
      this.chart?.timeScale().logicalToCoordinate(intLogical as never) ?? null;
    if (this._caching) this._xCache.set(intLogical, x);
    return x;
  }
  beginCoordinateCache(): void {
    this._caching = true;
    this._xCache.clear();
  }
  endCoordinateCache(): void {
    this._caching = false;
    this._xCache.clear();
  }

  priceToCoordinate(price: number): number | null {
    return this.series?.priceToCoordinate(price) ?? null;
  }

  // 드로잉을 이루는 편집 가능한 점들 (드래그 핸들 렌더링·이동/리사이즈 계산에 쓰인다).
  // hline은 전용 핸들 없이 몸체 자체를 드래그해 가격만 옮긴다.
  getControlPoints(d: Drawing): DrawingPoint[] {
    if (d.type === "trendline") return [d.p1, d.p2];
    if (d.type === "hline") return [];
    // 브러시는 점이 수십~수백 개라 핸들을 다 찍으면 획이 점으로 뒤덮인다.
    // 몸통을 잡아 이동/삭제만 하고 점 단위 편집 핸들은 두지 않는다.
    if (d.type === "brush") return [];
    if (d.type === "polyline" || d.type === "pattern") return d.points;
    if (d.type === "channel")
      return [
        d.p1,
        d.p2,
        { logical: d.p2.logical, price: d.p2.price + d.offsetPrice },
      ];
    if (d.type === "text" || d.type === "emoji") return [d.point];
    return [];
  }

  // 클릭 지점 근처(hitRadius px 이내)에 있는 드로잉을 찾는다 (선택/지우기 히트 테스트용)
  findDrawingNear(
    x: number,
    y: number,
    hitRadius = HIT_RADIUS,
  ): Drawing | null {
    for (let i = this._drawings.length - 1; i >= 0; i--) {
      const d = this._drawings[i];
      if (this.hitTestDrawing(d, x, y, hitRadius)) return d;
    }
    return null;
  }

  private hitTestDrawing(d: Drawing, x: number, y: number, r: number): boolean {
    if (d.type === "trendline") {
      const c1 = this.toCoordinate(d.p1);
      const c2 = this.toCoordinate(d.p2);
      if (!c1 || !c2) return false;
      return distanceToSegment(x, y, c1.x, c1.y, c2.x, c2.y) <= r;
    }
    if (d.type === "hline") {
      const ly = this.priceToCoordinate(d.price);
      return ly !== null && Math.abs(y - ly) <= r;
    }
    if (d.type === "polyline" || d.type === "brush" || d.type === "pattern") {
      const coords = d.points.map((p) => this.toCoordinate(p));
      for (let i = 0; i < coords.length - 1; i++) {
        const c1 = coords[i];
        const c2 = coords[i + 1];
        if (c1 && c2 && distanceToSegment(x, y, c1.x, c1.y, c2.x, c2.y) <= r)
          return true;
      }
      if (d.type === "pattern" && coords.length >= 3) {
        const c1 = coords[coords.length - 1];
        const c2 = coords[0];
        if (c1 && c2 && distanceToSegment(x, y, c1.x, c1.y, c2.x, c2.y) <= r)
          return true;
      }
      return false;
    }
    if (d.type === "channel") {
      const c1 = this.toCoordinate(d.p1);
      const c2 = this.toCoordinate(d.p2);
      if (c1 && c2 && distanceToSegment(x, y, c1.x, c1.y, c2.x, c2.y) <= r)
        return true;
      const o1 = this.toCoordinate({
        logical: d.p1.logical,
        price: d.p1.price + d.offsetPrice,
      });
      const o2 = this.toCoordinate({
        logical: d.p2.logical,
        price: d.p2.price + d.offsetPrice,
      });
      if (o1 && o2 && distanceToSegment(x, y, o1.x, o1.y, o2.x, o2.y) <= r)
        return true;
      return false;
    }
    if (d.type === "text" || d.type === "emoji") {
      const c = this.toCoordinate(d.point);
      if (!c) return false;
      const contentRadius =
        d.type === "emoji"
          ? d.size / 2
          : Math.max(d.size, Array.from(d.text).length * d.size * 0.65) / 2;
      return Math.hypot(x - c.x, y - c.y) <= r + contentRadius;
    }
    return false;
  }
}
