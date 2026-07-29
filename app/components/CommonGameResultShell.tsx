import type { ReactNode } from "react";

type CommonGameResultShellProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  summary?: ReactNode;
  children?: ReactNode;
  utilities?: ReactNode;
  actions?: ReactNode;
  tone?: "light" | "dark";
  className?: string;
  contentClassName?: string;
};

export function CommonGameResultShell({
  eyebrow,
  title,
  summary,
  children,
  utilities,
  actions,
  tone = "light",
  className,
  contentClassName = "mt-5",
}: CommonGameResultShellProps) {
  const dark = tone === "dark";
  const shellClassName = className ?? (dark
    ? "rounded-2xl border border-white/10 bg-slate-950/80 p-6 text-white"
    : "rounded-2xl border border-slate-200 bg-white p-6 text-slate-950 shadow-sm");
  const dividerClassName = dark ? "border-white/10" : "border-slate-200";
  const eyebrowClassName = dark ? "text-amber-300" : "text-cyan-700";
  const summaryClassName = dark ? "text-slate-300" : "text-slate-600";

  return (
    <section data-common-game-result-shell className={shellClassName}>
      <header data-result-heading>
        {eyebrow && (
          <p className={`text-xs font-black uppercase tracking-[0.16em] ${eyebrowClassName}`}>
            {eyebrow}
          </p>
        )}
        <h2 className="mt-1 text-3xl font-black">{title}</h2>
        {summary && <div className={`mt-3 text-sm leading-6 ${summaryClassName}`}>{summary}</div>}
      </header>
      {children && <div data-result-content className={contentClassName}>{children}</div>}
      {utilities && (
        <div data-result-utilities className={`mt-6 border-t pt-5 ${dividerClassName}`}>
          {utilities}
        </div>
      )}
      {actions && (
        <div data-result-actions className={`mt-6 border-t pt-5 ${dividerClassName}`}>
          {actions}
        </div>
      )}
    </section>
  );
}
