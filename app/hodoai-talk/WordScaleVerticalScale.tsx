type WordScaleMarker = {
  id: string;
  label: string;
  value: number;
};

type WordScaleVerticalScaleProps = {
  lowLabel: string;
  highLabel: string;
  markers?: WordScaleMarker[];
};

export function WordScaleVerticalScale({ lowLabel, highLabel, markers = [] }: WordScaleVerticalScaleProps) {
  return (
    <div className="grid min-h-64 grid-cols-[4.5rem_minmax(0,1fr)] gap-3 rounded-2xl border border-white/10 bg-slate-950/55 p-4">
      <div className="relative">
        <span className="absolute left-0 top-0 font-mono text-xs font-black text-fuchsia-200">120</span>
        <span className="absolute bottom-0 left-0 font-mono text-xs font-black text-sky-200">0</span>
        <div className="absolute bottom-6 left-9 top-6 w-2 rounded-full bg-gradient-to-b from-fuchsia-400 via-amber-300 to-sky-400 shadow-[0_0_22px_rgba(34,211,238,0.28)]">
          {markers.map((marker) => (
            <span
              key={marker.id}
              className="absolute left-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-slate-950 bg-amber-300 shadow-lg"
              style={{ top: `${(120 - Math.max(0, Math.min(120, marker.value))) / 1.2}%` }}
              title={`${marker.label}: ${marker.value}`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-slate-950" />
            </span>
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-col justify-between py-1">
        <p className="text-sm font-bold leading-5 text-fuchsia-100">{highLabel}</p>
        {markers.length > 0 && (
          <div className="space-y-2">
            {markers.map((marker) => (
              <p key={marker.id} className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm font-bold text-amber-100">
                {marker.label} <span className="font-mono text-lg font-black text-amber-300">{marker.value}</span>
              </p>
            ))}
          </div>
        )}
        <p className="text-sm font-bold leading-5 text-sky-100">{lowLabel}</p>
      </div>
    </div>
  );
}
