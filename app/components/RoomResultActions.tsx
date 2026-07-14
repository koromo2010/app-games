type RoomResultActionsProps = {
  disabled?: boolean;
  onPlayAgain: () => void;
  onDissolve: () => void;
};

export function RoomResultActions({ disabled = false, onPlayAgain, onDissolve }: RoomResultActionsProps) {
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <button
        type="button"
        disabled={disabled}
        onClick={onPlayAgain}
        className="rounded-xl bg-amber-300 px-4 py-3 font-black text-slate-950 disabled:opacity-50"
      >
        同じ部屋でもう一度
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onDissolve}
        className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 font-black text-rose-800 transition hover:bg-rose-100 disabled:opacity-50"
      >
        部屋を解散
      </button>
    </div>
  );
}
