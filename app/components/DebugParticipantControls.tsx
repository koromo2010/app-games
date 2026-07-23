"use client";

export type DebugParticipant = {
  id: string;
  name: string;
};

type Props = {
  participants: readonly DebugParticipant[];
  disabled?: boolean;
  addDisabled?: boolean;
  isSubmitting?: boolean;
  onAdd: () => void | Promise<void>;
  onRemove: (participantId: string) => void | Promise<void>;
  run: (action: () => void | Promise<void>) => Promise<void>;
};

export function DebugParticipantControls({
  participants,
  disabled = false,
  addDisabled = false,
  isSubmitting = false,
  onAdd,
  onRemove,
  run,
}: Props) {
  const controlsDisabled = disabled || isSubmitting;

  const remove = async (participant: DebugParticipant) => {
    if (!window.confirm(`${participant.name}をダミー参加者から削除しますか？`)) return;
    await run(() => onRemove(participant.id));
  };

  return (
    <section className="mt-3 rounded-lg border border-cyan-200 bg-cyan-50 p-2.5" aria-labelledby="debug-participants-heading">
      <div className="flex items-center justify-between gap-2">
        <p id="debug-participants-heading" className="text-xs font-bold text-cyan-950">ダミー参加者</p>
        <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-cyan-800">{participants.length}人</span>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-cyan-900/75">デバッグ中だけ部屋に入り、通常の戦績には含まれません。</p>
      {participants.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {participants.map((participant) => (
            <li key={participant.id} className="flex items-center justify-between gap-2 rounded-md border border-cyan-100 bg-white px-2 py-1.5">
              <span className="min-w-0 truncate text-xs font-semibold text-slate-700">{participant.name}</span>
              <button
                type="button"
                disabled={controlsDisabled}
                onClick={() => void remove(participant)}
                className="shrink-0 rounded border border-rose-200 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        disabled={controlsDisabled || addDisabled}
        onClick={() => void run(onAdd)}
        className="mt-2 w-full rounded-md border border-cyan-300 bg-white px-3 py-2 text-xs font-bold text-cyan-900 hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {addDisabled ? "参加人数の上限です" : "ダミーを追加"}
      </button>
      {disabled && <p className="mt-1.5 text-[11px] text-slate-500">参加者の変更はゲーム開始前だけ行えます。</p>}
    </section>
  );
}
