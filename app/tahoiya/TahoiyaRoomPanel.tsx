import type { TahoiyaAnswererMode, TahoiyaDifficulty, TahoiyaPlayMode, TahoiyaPlayer, TahoiyaRoom, TahoiyaRoomChoice } from "@/lib/tahoiya-types";
import { tahoiyaDifficultyCriterionDescription, tahoiyaDifficultyLabel } from "@/lib/tahoiya-difficulty";
import { allRoomPlayersReturned } from "@/lib/room-lobby-return";
import { DebugWordGenerationTest, type DebugWordGenerationResult } from "../components/DebugWordGenerationTest";
import { RoomConfigSummary } from "../components/RoomConfigSummary";
import { RoomTimeLimitControl } from "../components/RoomTimeLimitControl";
import { cyanButtonClass, dangerButtonClass, inputClass, panelClass, primaryButtonClass, subtleButtonClass } from "../wordwolf/styles";
import { tahoiyaFakeDefinitionsPerPlayerChoices } from "@/lib/tahoiya-definitions";

type ConfigItem = { label: string; value: string };
type Choice<T extends string | boolean | number> = { label: string; value: T; activeClass: string };

function ChoiceButtons<T extends string | boolean | number>({ value, choices, onChange }: { value: T; choices: Choice<T>[]; onChange: (value: T) => void }) {
  return (
    <div className={`mt-2 grid gap-2 ${choices.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
      {choices.map((choice) => (
        <button key={String(choice.value)} type="button" onClick={() => onChange(choice.value)} className={`rounded-lg border px-3 py-2 text-sm font-bold ${value === choice.value ? choice.activeClass : "border-slate-300 bg-white text-slate-700"}`}>
          {choice.label}
        </button>
      ))}
    </div>
  );
}

type Props = {
  room: TahoiyaRoom | null;
  passphrase: string;
  joinCode: string;
  joinableRooms: TahoiyaRoomChoice[];
  answerer: TahoiyaPlayer | null;
  answererCandidates: TahoiyaPlayer[];
  roomConfigItems: ConfigItem[];
  activePlayer: TahoiyaPlayer | null;
  activePlayerId: string;
  playerName: string;
  isHost: boolean;
  isDebugMode: boolean;
  isStarting: boolean;
  message: string;
  onPassphraseChange: (value: string) => void;
  onJoinCodeChange: (value: string) => void;
  onActivePlayerChange: (value: string) => void;
  onCreateRoom: () => void;
  onRefreshRooms: () => void;
  onJoinRoom: (code?: string) => void;
  onPlayModeChange: (value: TahoiyaPlayMode) => void;
  onDifficultyChange: (value: TahoiyaDifficulty) => void;
  onAnswererModeChange: (value: TahoiyaAnswererMode) => void;
  onAnswererChange: (value: string) => void;
  onShowDefinitionChange: (value: boolean) => void;
  onFakeDefinitionsPerPlayerChange: (value: number) => void;
  onTimeLimitChange: (value: number) => void;
  onTestWordGeneration: () => Promise<DebugWordGenerationResult>;
  onTestDifficultyScreening: () => Promise<DebugWordGenerationResult>;
  onAddTestPlayer: () => void;
  onStartRound: () => void;
  onDissolveRoom: () => void;
};

const amberChoice = "border-amber-500 bg-amber-100 text-amber-950";
const cyanChoice = "border-cyan-500 bg-cyan-100 text-cyan-950";
const roseChoice = "border-rose-500 bg-rose-100 text-rose-950";

export function TahoiyaRoomPanel(props: Props) {
  const { room } = props;
  return (
    <div className={panelClass}>
      <p className="text-xs font-semibold uppercase text-amber-700">Entry</p>
      <h2 className="text-lg font-bold text-slate-950">部屋</h2>
      {!room ? <EntryPanel {...props} /> : <ActiveRoomPanel {...props} room={room} />}
      {props.message && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">{props.message}</p>}
    </div>
  );
}

function EntryPanel(props: Props) {
  return (
    <div className="mt-4 space-y-3">
      <label className="block text-sm font-medium text-slate-700">合言葉
        <input value={props.passphrase} onChange={(event) => props.onPassphraseChange(event.target.value)} className={`mt-1 ${inputClass}`} placeholder="空欄なら合言葉なし" />
      </label>
      <button onClick={props.onCreateRoom} className={`w-full ${primaryButtonClass}`}>部屋を作成</button>
      <button onClick={props.onRefreshRooms} className={`w-full ${subtleButtonClass}`}>参加できる部屋を表示</button>
      {props.joinableRooms.length > 0 && <div className="space-y-2">{props.joinableRooms.map((choice) => (
        <button key={choice.code} type="button" onClick={() => props.onJoinRoom(choice.code)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm transition hover:bg-white">
          <span className="font-bold text-slate-950">{choice.code}</span><span className="ml-2 text-slate-500">{choice.hostName} / {choice.playerCount}人</span>
        </button>
      ))}</div>}
      <input value={props.joinCode} onChange={(event) => props.onJoinCodeChange(event.target.value.toUpperCase())} className={inputClass} placeholder="ROOM CODE" />
      <button onClick={() => props.onJoinRoom()} className={`w-full ${cyanButtonClass}`}>コードで参加</button>
    </div>
  );
}

function ActiveRoomPanel(props: Props & { room: TahoiyaRoom }) {
  const { room } = props;
  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-lg bg-slate-100 p-3"><p className="text-xs text-slate-500">ROOM</p><p className="text-xl font-black text-slate-950">{room.code}</p></div>
      <p className="text-sm text-slate-600">{room.playMode === "all-vote" ? <span className="font-bold text-slate-950">全員作成・全員投票</span> : <>回答者: <span className="font-bold text-slate-950">{props.answerer?.name ?? (room.answererMode === "random" ? "開始時にランダム" : "未指定")}</span></>}</p>
      {room.phase === "lobby" && props.isHost && <HostSettings {...props} room={room} />}
      <RoomConfigSummary items={props.roomConfigItems} />
      {room.phase === "lobby" && !props.isHost && <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">部屋設定は参加者全員に表示され、変更できるのはホストだけです。</p>}
      {room.phase === "lobby" && <TopicGenerationProgress room={room} isStarting={props.isStarting} />}
      {props.isDebugMode ? (
        <label className="block text-sm font-medium text-slate-700">操作プレイヤー
          <select value={props.activePlayer?.id ?? props.activePlayerId} onChange={(event) => props.onActivePlayerChange(event.target.value)} className={`mt-1 ${inputClass}`}>
            {room.players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
          </select>
        </label>
      ) : <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">操作中: <span className="font-bold text-slate-950">{props.activePlayer?.name ?? props.playerName}</span></div>}
      {room.phase === "lobby" && (props.isHost ? <HostActions {...props} room={room} /> : !room.topicGenerationProgress && <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-semibold text-slate-600">ホストのラウンド開始を待っています。</p>)}
      {props.isHost && <button onClick={props.onDissolveRoom} className={`w-full ${dangerButtonClass}`}>部屋を解散</button>}
    </div>
  );
}

function HostSettings(props: Props & { room: TahoiyaRoom }) {
  const { room } = props;
  return (
    <fieldset disabled={Boolean(room.topicGenerationProgress)} className="space-y-3 disabled:opacity-60">
      <Setting title="遊び方" description={room.playMode === "all-vote" ? "全員が偽説明を書き、全員で投票して最多得票を競います。" : "1人だけが回答し、それ以外の参加者が偽説明を書きます。"}>
        <ChoiceButtons value={room.playMode} onChange={props.onPlayModeChange} choices={[{ label: "回答者1人", value: "single-answerer", activeClass: amberChoice }, { label: "全員投票", value: "all-vote", activeClass: cyanChoice }]} />
      </Setting>
      <Setting title="お題の難易度" description={room.topicDifficulty === "extreme" ? "難語好きでも知らないほど深い魔境の語を選びます。" : "一般的な大人が意味を知らない秘境の語を選びます。"}>
        <ChoiceButtons value={room.topicDifficulty} onChange={props.onDifficultyChange} choices={[{ label: "秘境", value: "standard", activeClass: cyanChoice }, { label: "魔境", value: "extreme", activeClass: roseChoice }]} />
      </Setting>
      {room.playMode === "single-answerer" && <>
        <Setting title="回答者の決め方">
          <ChoiceButtons value={room.answererMode} onChange={props.onAnswererModeChange} choices={[{ label: "指定", value: "manual", activeClass: amberChoice }, { label: "ランダム", value: "random", activeClass: cyanChoice }]} />
          {room.answererMode === "manual" ? <label className="mt-2 block text-sm font-medium text-slate-700">回答者<select value={room.answererId} onChange={(event) => props.onAnswererChange(event.target.value)} className={`mt-1 ${inputClass}`}><option value="">選択してください</option>{props.answererCandidates.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label> : <p className="mt-2 text-xs font-semibold text-slate-500">ラウンド開始時に、参加者全員から1人を回答者に選びます。</p>}
        </Setting>
        <Setting title="本物の説明を見せる" description="偽説明を書く人に、AIが用意した本物の説明を表示するか選べます。">
          <ChoiceButtons value={room.showRealDefinitionToWriters} onChange={props.onShowDefinitionChange} choices={[{ label: "見せる", value: true, activeClass: amberChoice }, { label: "見せない", value: false, activeClass: cyanChoice }]} />
        </Setting>
      </>}
      <Setting title="1人あたりの偽説明数" description="各プレイヤーが作る偽説明の数です。複数にすると、すべてが別々の投票候補になります。">
        <ChoiceButtons value={room.fakeDefinitionsPerPlayer} onChange={props.onFakeDefinitionsPerPlayerChange} choices={tahoiyaFakeDefinitionsPerPlayerChoices.map((count) => ({ label: `${count}つ`, value: count, activeClass: amberChoice }))} />
      </Setting>
      <RoomTimeLimitControl label="制限時間" value={room.actionTimeLimitSeconds} onChange={props.onTimeLimitChange} />
    </fieldset>
  );
}

function TopicGenerationProgress({ room, isStarting }: { room: TahoiyaRoom; isStarting: boolean }) {
  const progress = room.topicGenerationProgress;
  if (!progress && !isStarting) return null;
  const stage = progress?.stage ?? "checking-reusable";
  const isNewCandidateFlow = progress?.newCandidateFlow === true || stage === "screening-new";
  const batch = progress?.batchNumber && progress.batchLimit
    ? `（${progress.batchNumber}/${progress.batchLimit}）`
    : "";
  const copy = stage === "checking-reusable"
    ? { title: "お題を準備しています", detail: "参加者全員がまだ遊んでいない保存済みのお題を確認しています。" }
    : stage === "checking-screened"
      ? { title: "判定済み候補を確認しています", detail: "難易度判定済みで、まだ正解説明を作っていない候補を探しています。" }
      : stage === "screening-new"
        ? { title: "新しい候補を審査しています", detail: `保存済み候補がなかったため、新しい候補10語を難易度判定中です${batch}。` }
        : stage === "generating-definition"
          ? { title: "正解説明を生成しています", detail: isNewCandidateFlow ? "新しく審査を通過した候補へ、たほい屋用の正解説明を付けています。" : "判定済み候補へ、たほい屋用の正解説明を付けています。" }
          : { title: "まもなく開始します", detail: isNewCandidateFlow ? "新しく作ったお題を保存し、部屋へ反映しています。" : "選んだお題を部屋へ反映しています。" };
  return (
    <div role="status" aria-live="polite" className="rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-3 text-cyan-950">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-cyan-600" aria-hidden="true" />
        <p className="text-sm font-black">{copy.title}</p>
      </div>
      <p className="mt-1 text-xs font-semibold leading-relaxed text-cyan-800">{copy.detail}</p>
      <p className="mt-1 text-[11px] text-cyan-700">この進捗は部屋の全員に共有されています。そのままお待ちください。</p>
    </div>
  );
}

function Setting({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-sm font-bold text-slate-950">{title}</p>{children}{description && <p className="mt-2 text-xs text-slate-500">{description}</p>}</div>;
}

function HostActions(props: Props & { room: TahoiyaRoom }) {
  const difficulty = `${tahoiyaDifficultyLabel(props.room.topicDifficulty)}（${tahoiyaDifficultyCriterionDescription(props.room.topicDifficulty)}）`;
  const allPlayersReturned = allRoomPlayersReturned(props.room.lobbyReturn, props.room.players);
  const waitingPlayerCount = props.room.players.length - (props.room.lobbyReturn?.returnedPlayerIds.length ?? 0);
  const generationInProgress = Boolean(props.room.topicGenerationProgress);
  return <>{props.isDebugMode && !generationInProgress && <><DebugWordGenerationTest onGenerate={() => props.onTestDifficultyScreening()} heading="未判定10語を難易度審査" description="共通DBの未判定10語をLLMへ渡し、認知率と除外フラグを判定済みDBへ保存します。秘境は1%超〜14%、魔境は0〜1%。センシティブ・大学名・企業名・地名は除外します。説明文と出題履歴はまだ作りません。" showModeToggle={false} fixedButtonLabel="未判定10語を審査して保存" fixedRepeatLabel="次の未判定10語を審査" /><DebugWordGenerationTest onGenerate={() => props.onTestWordGeneration()} heading={`${difficulty}正式採用フロー確認`} description="完成済み候補、判定済みで説明未作成の候補、未判定10語の順に探します。使用する1語だけ説明文を生成して完成済み候補へ保存し、デバッグ確認では出題履歴を付けません。" showModeToggle={false} fixedButtonLabel="正式採用フローを確認" fixedRepeatLabel="もう一度正式フローを確認" /><button onClick={props.onAddTestPlayer} disabled={props.room.players.length >= 8} className={`w-full ${subtleButtonClass}`}>テストプレイヤー追加</button></>}<button onClick={props.onStartRound} disabled={props.isStarting || generationInProgress || !allPlayersReturned} className={`w-full ${primaryButtonClass}`}>{props.isStarting || generationInProgress ? "お題を準備中..." : allPlayersReturned ? "ラウンド開始" : `復帰待ち（あと${waitingPlayerCount}人）`}</button></>;
}
