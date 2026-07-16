import type { ReactNode } from "react";

export function LobbyInfoDrawer({ isLoggedIn, isOpen, onOpen, onClose, children }: { isLoggedIn: boolean; isOpen: boolean; onOpen: () => void; onClose: () => void; children: ReactNode }) {
  return <>
    {isLoggedIn && !isOpen && <button type="button" aria-label="アカウント・戦績を開く" aria-controls="lobby-account-panel" onPointerEnter={onOpen} onFocus={onOpen} onClick={onOpen} className="group fixed inset-y-0 left-0 z-30 hidden w-6 bg-transparent md:block lg:hidden"><span className="sr-only">情報メニュー</span><span className="absolute left-0 top-1/2 h-28 w-1.5 -translate-y-1/2 rounded-r-full border-y border-r border-cyan-300/60 bg-cyan-300/55 shadow-[0_0_18px_rgba(34,211,238,0.45)] transition-all duration-150 group-hover:w-2.5 group-hover:bg-cyan-200" aria-hidden="true" /></button>}
    {isLoggedIn && <button type="button" aria-label="アカウント・戦績メニューを閉じる" onClick={onClose} className={`fixed inset-0 z-40 bg-transparent transition-opacity duration-200 motion-reduce:transition-none lg:hidden ${isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`} />}
    <aside id="lobby-account-panel" onMouseLeave={onClose} className={`space-y-4 lg:order-1 lg:static lg:col-start-1 lg:row-start-1 lg:block lg:w-auto lg:translate-x-0 lg:overflow-visible lg:bg-transparent lg:p-0 lg:shadow-none lg:pointer-events-auto ${isLoggedIn ? `fixed inset-y-0 left-0 z-50 w-[min(380px,calc(100vw-2rem))] overflow-y-auto rounded-r-xl bg-slate-950 p-3 shadow-2xl will-change-transform transition-transform duration-200 ease-out motion-reduce:transition-none ${isOpen ? "translate-x-0 pointer-events-auto" : "-translate-x-full pointer-events-none"}` : "order-1"}`}>
      {isLoggedIn && <div className="sticky top-0 z-10 flex items-center justify-between rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-white shadow-lg lg:hidden"><p className="text-sm font-black">アカウント・戦績</p><button type="button" onClick={onClose} className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold">閉じる</button></div>}
      {children}
    </aside>
  </>;
}
