"use client";

import { createPortal } from "react-dom";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

type WindowGeometry = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type PointerOperation = {
  kind: "move" | "resize";
  pointerId: number;
  startX: number;
  startY: number;
  geometry: WindowGeometry;
};

type DebugToolWindowProps = {
  children: ReactNode;
  initialPosition: {
    top: number;
    left: number;
  };
  onClose: () => void;
};

const VIEWPORT_GAP = 8;
const DESKTOP_MIN_WIDTH = 320;
const DESKTOP_MIN_HEIGHT = 240;
const COMPACT_BREAKPOINT = 640;
const TITLE_BAR_HEIGHT = 44;
const KEYBOARD_STEP = 24;

function viewportSize() {
  return {
    width: Math.max(window.innerWidth, VIEWPORT_GAP * 2 + 1),
    height: Math.max(window.innerHeight, VIEWPORT_GAP * 2 + 1),
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function clampGeometry(geometry: WindowGeometry, compact = false): WindowGeometry {
  const viewport = viewportSize();
  const maximumWidth = Math.max(1, viewport.width - VIEWPORT_GAP * 2);
  const maximumHeight = Math.max(1, viewport.height - VIEWPORT_GAP * 2);
  const minimumWidth = Math.min(DESKTOP_MIN_WIDTH, maximumWidth);
  const minimumHeight = Math.min(DESKTOP_MIN_HEIGHT, maximumHeight);
  const width = compact
    ? maximumWidth
    : clamp(geometry.width, minimumWidth, maximumWidth);
  const height = compact
    ? Math.min(560, maximumHeight)
    : clamp(geometry.height, minimumHeight, maximumHeight);

  return {
    width,
    height,
    left: compact
      ? VIEWPORT_GAP
      : clamp(
          geometry.left,
          VIEWPORT_GAP,
          Math.max(VIEWPORT_GAP, viewport.width - width - VIEWPORT_GAP),
        ),
    top: compact
      ? Math.max(VIEWPORT_GAP, Math.round((viewport.height - height) / 2))
      : clamp(
          geometry.top,
          VIEWPORT_GAP,
          Math.max(VIEWPORT_GAP, viewport.height - height - VIEWPORT_GAP),
        ),
  };
}

function initialGeometry(position: DebugToolWindowProps["initialPosition"]) {
  const viewport = viewportSize();
  const compact = viewport.width < COMPACT_BREAKPOINT;
  return clampGeometry({
    top: position.top,
    left: position.left,
    width: Math.min(384, viewport.width - VIEWPORT_GAP * 2),
    height: Math.min(640, viewport.height - VIEWPORT_GAP * 2),
  }, compact);
}

export function DebugToolWindow({
  children,
  initialPosition,
  onClose,
}: DebugToolWindowProps) {
  const [geometry, setGeometry] = useState(() => initialGeometry(initialPosition));
  const [isCompact, setIsCompact] = useState(
    () => window.innerWidth < COMPACT_BREAKPOINT,
  );
  const [isMinimized, setIsMinimized] = useState(false);
  const windowRef = useRef<HTMLDivElement>(null);
  const operationRef = useRef<PointerOperation | null>(null);

  useEffect(() => {
    windowRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const handleViewportResize = () => {
      const compact = window.innerWidth < COMPACT_BREAKPOINT;
      setIsCompact(compact);
      setGeometry((current) => clampGeometry(current, compact));
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportResize);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportResize);
    };
  }, [onClose]);

  const startPointerOperation = (
    kind: PointerOperation["kind"],
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (event.button !== 0 || isCompact || (kind === "resize" && isMinimized)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    operationRef.current = {
      kind,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      geometry,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const operation = operationRef.current;
    if (!operation || operation.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - operation.startX;
    const deltaY = event.clientY - operation.startY;
    if (operation.kind === "move") {
      const effectiveHeight = isMinimized ? TITLE_BAR_HEIGHT : operation.geometry.height;
      const viewport = viewportSize();
      setGeometry({
        ...operation.geometry,
        left: clamp(
          operation.geometry.left + deltaX,
          VIEWPORT_GAP,
          Math.max(
            VIEWPORT_GAP,
            viewport.width - operation.geometry.width - VIEWPORT_GAP,
          ),
        ),
        top: clamp(
          operation.geometry.top + deltaY,
          VIEWPORT_GAP,
          Math.max(VIEWPORT_GAP, viewport.height - effectiveHeight - VIEWPORT_GAP),
        ),
      });
      return;
    }

    setGeometry(clampGeometry({
      ...operation.geometry,
      width: operation.geometry.width + deltaX,
      height: operation.geometry.height + deltaY,
    }));
  };

  const finishPointerOperation = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (operationRef.current?.pointerId === event.pointerId) {
      operationRef.current = null;
    }
  };

  const moveWithKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (isCompact) return;
    const offsets: Partial<Record<ReactKeyboardEvent["key"], [number, number]>> = {
      ArrowUp: [0, -KEYBOARD_STEP],
      ArrowRight: [KEYBOARD_STEP, 0],
      ArrowDown: [0, KEYBOARD_STEP],
      ArrowLeft: [-KEYBOARD_STEP, 0],
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    setGeometry((current) => clampGeometry({
      ...current,
      left: current.left + offset[0],
      top: current.top + offset[1],
    }));
  };

  const resizeWithKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const offsets: Partial<Record<ReactKeyboardEvent["key"], [number, number]>> = {
      ArrowUp: [0, -KEYBOARD_STEP],
      ArrowRight: [KEYBOARD_STEP, 0],
      ArrowDown: [0, KEYBOARD_STEP],
      ArrowLeft: [-KEYBOARD_STEP, 0],
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    setGeometry((current) => clampGeometry({
      ...current,
      width: current.width + offset[0],
      height: current.height + offset[1],
    }));
  };

  const toggleMinimized = () => {
    if (isMinimized) setGeometry((value) => clampGeometry(value, isCompact));
    setIsMinimized(!isMinimized);
  };

  const windowStyle = {
    top: geometry.top,
    left: geometry.left,
    width: geometry.width,
    height: isMinimized ? TITLE_BAR_HEIGHT : geometry.height,
  };

  return createPortal(
    <div
      ref={windowRef}
      role="dialog"
      aria-label="開発者向け操作"
      tabIndex={-1}
      className="fixed z-[9999] flex flex-col overflow-hidden rounded-xl border border-slate-300 bg-white text-slate-900 shadow-2xl outline-none ring-1 ring-slate-950/10"
      style={windowStyle}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerOperation}
      onPointerCancel={finishPointerOperation}
    >
      <header
        className={`flex h-11 shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-100 px-2 ${
          isCompact ? "" : "cursor-move select-none touch-none"
        }`}
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest("button")) return;
          startPointerOperation("move", event);
        }}
      >
        <button
          type="button"
          aria-label="デバッグウィンドウを移動"
          title="ドラッグまたは矢印キーで移動"
          disabled={isCompact}
          className="hidden h-7 w-7 cursor-move touch-none items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:cursor-default sm:flex"
          onPointerDown={(event) => startPointerOperation("move", event)}
          onKeyDown={moveWithKeyboard}
        >
          <span aria-hidden="true">⠿</span>
        </button>
        <p className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-wide text-slate-600">
          Debug tools
        </p>
        <button
          type="button"
          aria-label={isMinimized ? "デバッグウィンドウを元の大きさに戻す" : "デバッグウィンドウを最小化"}
          title={isMinimized ? "元の大きさに戻す" : "最小化"}
          onClick={toggleMinimized}
          className="flex h-7 w-7 items-center justify-center rounded text-sm font-bold text-slate-500 hover:bg-slate-200 hover:text-slate-900"
        >
          <span aria-hidden="true">{isMinimized ? "□" : "—"}</span>
        </button>
        <button
          type="button"
          aria-label="デバッグウィンドウを閉じる"
          title="閉じる"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded text-lg leading-none text-slate-500 hover:bg-rose-100 hover:text-rose-700"
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>

      {!isMinimized && (
        <>
          <div className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto p-3">{children}</div>
          {!isCompact && (
            <button
              type="button"
              aria-label="デバッグウィンドウのサイズを変更"
              title="ドラッグまたは矢印キーでサイズ変更"
              className="absolute bottom-0 right-0 flex h-6 w-6 cursor-se-resize touch-none items-end justify-end p-0.5 text-xs text-slate-400 hover:text-slate-700"
              onPointerDown={(event) => startPointerOperation("resize", event)}
              onKeyDown={resizeWithKeyboard}
            >
              <span aria-hidden="true">◢</span>
            </button>
          )}
        </>
      )}
    </div>,
    document.body,
  );
}
