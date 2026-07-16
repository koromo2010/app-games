import { avatarColorOptions, defaultAvatarImage, defaultAvatarImages } from "@/lib/player-session";
import { GamePlayerMenu } from "../components/GamePlayerMenu";

type Props = {
  playerId?: string;
  playerName: string;
  headerName: string;
  avatarImage: string | null;
  headerAvatarColor: string;
  headerAvatarImage: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onPlayerNameChange: (name: string) => void;
  onCommitPlayerName: () => void;
  onAvatarColorChange: (color: string) => void;
  onAvatarImageChange: (image: string | null) => void;
  onAvatarUpload: (file?: File) => void;
  onOpenMyPage: () => void;
};

export function WordWolfPlayerProfile(props: Props) {
  return <>
    <div className="relative hidden min-w-0 items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5">
      <button type="button" onClick={() => props.onOpenChange(!props.isOpen)} className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full border border-white/70 bg-white/10 shadow-sm ring-2 ring-white/10 transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-cyan-200" style={{ backgroundColor: props.headerAvatarColor }} aria-label="アイコン色を選ぶ">
        <span className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${props.headerAvatarImage})` }} aria-hidden="true" />
      </button>
      <span className="max-w-[140px] truncate font-semibold text-cyan-50">{props.headerName}</span>
      {props.isOpen && <div className="absolute right-0 top-11 z-50 w-64 rounded-lg border border-white/15 bg-slate-950/95 p-3 shadow-2xl">
        <label className="block text-xs font-semibold text-cyan-100">プレイヤー名
          <input value={props.playerName} onChange={(event) => props.onPlayerNameChange(event.target.value)} onBlur={props.onCommitPlayerName} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} className="mt-2 w-full rounded-md border border-white/15 bg-white/10 px-2 py-1.5 text-sm font-semibold text-cyan-50 outline-none transition placeholder:text-slate-500 focus:border-cyan-200" placeholder="空欄なら自動生成" />
        </label>
        <p className="mt-3 text-xs font-semibold text-cyan-100">アイコン色</p>
        <div className="mt-2 grid grid-cols-8 gap-2">{avatarColorOptions.map((color) => <button key={color} type="button" onClick={() => props.onAvatarColorChange(color)} className={`h-8 w-8 rounded-full border transition hover:scale-105 ${props.headerAvatarColor === color ? "border-white ring-2 ring-cyan-200" : "border-white/30"}`} style={{ backgroundColor: color }} aria-label={`${color} を選択`} />)}</div>
        <p className="mt-3 text-xs font-semibold text-cyan-100">デフォルト画像</p>
        <div className="mt-2 grid grid-cols-5 gap-2">{defaultAvatarImages.map((image, index) => <button key={image} type="button" onClick={() => props.onAvatarImageChange(image)} className={`h-10 w-10 overflow-hidden rounded-full border bg-cover bg-center transition hover:scale-105 ${props.headerAvatarImage === image ? "border-white ring-2 ring-cyan-200" : "border-white/30"}`} style={{ backgroundColor: props.headerAvatarColor, backgroundImage: `url(${image})` }} aria-label={`デフォルト画像 ${index + 1} を選択`} />)}</div>
        <label className="mt-3 block cursor-pointer rounded-md border border-white/15 bg-white/10 px-2 py-1.5 text-center text-xs font-semibold text-cyan-50 transition hover:bg-white/15">画像をアップロード<input type="file" accept="image/*" className="sr-only" onChange={(event) => { props.onAvatarUpload(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
        {props.avatarImage && <button type="button" onClick={() => props.onAvatarImageChange(defaultAvatarImage)} className="mt-2 w-full rounded-md border border-white/10 px-2 py-1 text-xs font-semibold text-slate-300 transition hover:bg-white/10">デフォルト画像に戻す</button>}
        <button type="button" onClick={props.onOpenMyPage} className="mt-3 flex w-full items-center justify-center rounded-md bg-cyan-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-cyan-500">マイページを開く</button>
      </div>}
    </div>
    <GamePlayerMenu id={props.playerId} name={props.headerName} avatarColor={props.headerAvatarColor} avatarImage={props.headerAvatarImage} />
  </>;
}
