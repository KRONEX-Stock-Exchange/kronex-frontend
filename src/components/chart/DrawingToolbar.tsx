export type ToolId =
  | "cursor"
  | "trendline"
  | "hline"
  | "polyline"
  | "pattern"
  | "channel"
  | "brush"
  | "eraser"
  | "eraserStroke"
  | "text"
  | "emoji"
  | "measure"
  | "zoom";

interface ToolMeta {
  id: ToolId;
  label: string;
}

const TOOLS: ToolMeta[] = [
  { id: "cursor", label: "커서" },
  { id: "trendline", label: "추세선" },
  { id: "hline", label: "수평선" },
  { id: "polyline", label: "폴리라인" },
  { id: "pattern", label: "패턴 (삼각형)" },
  { id: "channel", label: "평행 채널" },
  { id: "brush", label: "브러시 (색연필)" },
  { id: "eraser", label: "지우개 (문지른 부분만)" },
  { id: "eraserStroke", label: "지우개 (획 통째)" },
  { id: "text", label: "텍스트" },
  { id: "emoji", label: "이모지" },
  { id: "measure", label: "측정자" },
  { id: "zoom", label: "확대" },
];

type IconId =
  | ToolId
  | "magnet"
  | "lock"
  | "unlock"
  | "eye"
  | "eyeOff"
  | "trash"
  | "save"
  | "check";

function ToolIcon({ id }: { id: IconId }) {
  const common = {
    className: "w-4 h-4",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
  };

  switch (id) {
    case "cursor":
      return (
        <svg {...common} strokeWidth={1} fill="currentColor">
          <path
            d="M4 3l6.5 16 2.3-6.7L19.5 10 4 3z"
            strokeLinejoin="round"
            stroke="currentColor"
            strokeWidth={1}
          />
        </svg>
      );
    case "trendline":
      return (
        <svg {...common}>
          <circle cx="5" cy="19" r="1.8" fill="currentColor" stroke="none" />
          <line x1="6.3" y1="17.7" x2="17.7" y2="6.3" strokeLinecap="round" />
          <circle cx="19" cy="5" r="1.8" fill="currentColor" stroke="none" />
        </svg>
      );
    case "hline":
      return (
        <svg {...common}>
          <circle cx="3.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
          <line x1="3.5" y1="12" x2="20.5" y2="12" strokeLinecap="round" />
          <circle cx="20.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      );
    case "polyline":
      return (
        <svg {...common}>
          <path
            d="M3 18L9 8l5 5 7-10"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="3" cy="18" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="9" cy="8" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="14" cy="13" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="21" cy="3" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
    case "pattern":
      return (
        <svg {...common}>
          <path d="M4 19L12 5l8 14z" strokeLinejoin="round" />
          <circle cx="4" cy="19" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="20" cy="19" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
    case "channel":
      return (
        <svg {...common}>
          <line x1="3" y1="19" x2="15" y2="6" strokeLinecap="round" />
          <line x1="9" y1="19" x2="21" y2="6" strokeLinecap="round" />
        </svg>
      );
    case "brush":
      return (
        <svg {...common}>
          <path
            d="M3 20c2-1 2-4.5 5-4.5s2.5 3 5 3 2-5 5-5 2 3.5 3 3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "eraser":
      return (
        <svg {...common}>
          <path
            d="M8.5 19H20M4.5 15.5l6-6 5 5-4.5 4.5H8L4.5 15.5z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M10.5 9.5l3.5-3.5a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L15.5 14.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "eraserStroke":
      return (
        <svg {...common}>
          <path
            d="M8.5 19H20M4.5 15.5l6-6 5 5-4.5 4.5H8L4.5 15.5z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M10.5 9.5l3.5-3.5a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L15.5 14.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M3 4l18 16" strokeLinecap="round" />
        </svg>
      );
    case "text":
      return (
        <svg {...common}>
          <path d="M5 5h14M12 5v14" strokeLinecap="round" />
        </svg>
      );
    case "emoji":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="9" cy="10" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="15" cy="10" r="1.1" fill="currentColor" stroke="none" />
          <path d="M8 14.5c1.4 1.8 6.6 1.8 8 0" strokeLinecap="round" />
        </svg>
      );
    case "measure":
      return (
        <svg {...common}>
          <line
            x1="4"
            y1="12"
            x2="20"
            y2="12"
            strokeLinecap="round"
            strokeDasharray="2.5 2.5"
          />
          <path d="M4 8v8M20 8v8" strokeLinecap="round" />
        </svg>
      );
    case "zoom":
      return (
        <svg {...common}>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <line x1="15.3" y1="15.3" x2="21" y2="21" strokeLinecap="round" />
          <line x1="7.5" y1="10.5" x2="13.5" y2="10.5" strokeLinecap="round" />
          <line x1="10.5" y1="7.5" x2="10.5" y2="13.5" strokeLinecap="round" />
        </svg>
      );
    case "magnet":
      return (
        <svg {...common}>
          <path d="M6 3v8a6 6 0 0012 0V3" strokeLinecap="round" />
          <path d="M6 3h4M14 3h4" strokeLinecap="round" />
          <path d="M6 7.5h4M14 7.5h4" strokeLinecap="round" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <rect x="5" y="11" width="14" height="9" rx="1.5" />
          <path d="M8 11V7a4 4 0 018 0v4" />
        </svg>
      );
    case "unlock":
      return (
        <svg {...common}>
          <rect x="5" y="11" width="14" height="9" rx="1.5" />
          <path d="M8 11V7a4 4 0 017.5-2" />
        </svg>
      );
    case "eye":
      return (
        <svg {...common}>
          <path
            d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="12" r="2.8" />
        </svg>
      );
    case "eyeOff":
      return (
        <svg {...common}>
          <path
            d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="12" r="2.8" />
          <line x1="3" y1="21" x2="21" y2="3" strokeLinecap="round" />
        </svg>
      );
    case "trash":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z"
          />
        </svg>
      );
    case "save":
      return (
        <svg {...common}>
          <path
            strokeLinejoin="round"
            d="M5 4h11l3 3v13a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z"
          />
          <path strokeLinejoin="round" d="M8 4v5h7V4" />
          <path strokeLinejoin="round" d="M8 20v-6h8v6" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 12.5l5.5 5.5L20 7"
          />
        </svg>
      );
  }
}

interface DrawingToolbarProps {
  activeTool: ToolId;
  onSelectTool: (tool: ToolId) => void;
  magnetOn: boolean;
  onToggleMagnet: () => void;
  locked: boolean;
  onToggleLocked: () => void;
  drawingsVisible: boolean;
  onToggleVisible: () => void;
  onClearAll: () => void;
  onSave: () => void;
  justSaved: boolean;
  hasDrawings: boolean;
}

function ToolbarButton({
  active,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex items-center justify-center w-9 h-9 lg:w-7 lg:h-7 rounded-md transition-colors shrink-0 ${
        active
          ? "bg-[#2b2f36] text-[#f0b90b]"
          : "text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {children}
    </button>
  );
}

export function DrawingToolbar({
  activeTool,
  onSelectTool,
  magnetOn,
  onToggleMagnet,
  locked,
  onToggleLocked,
  drawingsVisible,
  onToggleVisible,
  onClearAll,
  hasDrawings,
  onSave,
  justSaved,
}: DrawingToolbarProps) {
  return (
    <div className="flex flex-col items-center gap-0.5 py-1.5 px-1 bg-[#181a20] border-r border-[#2b2f36] overflow-y-auto">
      {TOOLS.map((tool) => (
        <ToolbarButton
          key={tool.id}
          label={tool.label}
          active={activeTool === tool.id}
          onClick={() => onSelectTool(tool.id)}
        >
          <ToolIcon id={tool.id} />
        </ToolbarButton>
      ))}
      <div className="my-1 w-6 border-t border-[#2b2f36]" />
      <ToolbarButton
        label="자석 모드 (캔들에 스냅)"
        active={magnetOn}
        onClick={onToggleMagnet}
      >
        <ToolIcon id="magnet" />
      </ToolbarButton>
      <ToolbarButton
        label={locked ? "드로잉 잠금 해제" : "드로잉 잠금"}
        active={locked}
        onClick={onToggleLocked}
      >
        <ToolIcon id={locked ? "lock" : "unlock"} />
      </ToolbarButton>
      <ToolbarButton
        label={drawingsVisible ? "드로잉 숨기기" : "드로잉 표시"}
        active={!drawingsVisible}
        onClick={onToggleVisible}
      >
        <ToolIcon id={drawingsVisible ? "eye" : "eyeOff"} />
      </ToolbarButton>
      <ToolbarButton
        label={justSaved ? "저장됨" : "드로잉 저장"}
        active={justSaved}
        onClick={onSave}
      >
        <ToolIcon id={justSaved ? "check" : "save"} />
      </ToolbarButton>
      {hasDrawings && (
        <ToolbarButton label="전체 삭제" onClick={onClearAll}>
          <ToolIcon id="trash" />
        </ToolbarButton>
      )}
    </div>
  );
}
