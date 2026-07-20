import type { AppLocale } from "@/lib/app-locale";

export const daifugoCopy = {
  ja: {
    title: "大富豪", practiceTitle: "大富豪・CPU練習", lobby: "広場へ戻る", lobbyShort: "広場へ", practice: "CPU練習", rules: "ルール", checking: "ログイン情報と部屋を確認中...", loginRequired: "オンライン対戦にはログインが必要です。", tagline: "3〜6人、手札を最初に出し切れ。", createRoom: "部屋を作る", capacity: "最大募集人数", passphraseOptional: "合言葉（任意）", createNewRoom: "新しい部屋を作る", joinRoom: "部屋に参加", roomCode: "部屋コード", passphrase: "合言葉", joinByCode: "コードで参加", roomList: "部屋一覧", noRooms: "参加できる部屋はありません。", people: "人", yes: "あり", no: "なし", dissolve: "部屋を解散", leave: "退出", participants: "参加者", currentConfig: "現在の部屋設定", turnTime: "手番時間", beforeStart: "ゲーム開始前", startHelp: "3人以上で開始できます。開始後の手札は本人だけに表示されます。", oneTurnLimit: "1手の制限時間", addDummy: "ダミーユーザーを追加", waitingReturn: "参加者の復帰待ち", needThree: "3人以上で開始できます", startMembers: "このメンバーで開始", waitHost: "ホストの開始を待っています。", turn: "手番", yourHand: "あなたの手札", cards: "枚", handEmpty: "手札を出し切りました", playSelected: "選んだカードを出す", pass: "パス", finished: "ゲーム終了", place: "位", returnUnavailable: "部屋に戻れません。", resultTitle: "大富豪 結果", resultText: "大富豪（{players}人対戦）\nあなたは{place}位\n{turns}手で決着\n#GameFields", you: "（あなた）", dummy: "ダミー", host: "ホスト", confirmRemove: "{name}さんを退出扱いにしますか？", confirmDissolve: "この部屋を解散しますか？", noLimit: "なし", seconds: "{seconds}秒", rank1: "大富豪", rank2: "富豪", rank3: "貧民", rank4: "大貧民", newGame: "新しいゲーム", guest: "ゲスト", dealing: "カードを配っています…", yourHandLabel: "あなたの手札。出すカードを選択", handFinished: "手札をすべて出しました", playAgain: "もう一度遊ぶ", tableLabel: "大富豪の場", playedBy: "{name}が出しました", emptyTable: "場は空です", emptyHelp: "同じ数字を1〜4枚出せます", starts: "{name}から開始。ダイヤの3が必要です", currentTurn: "{name}の番です", api401: "合言葉が違うか、ログインの有効期限が切れています。", api403: "この操作を行う権限がありません。", api404: "部屋が見つかりません。", api409: "部屋の状態が更新されました。もう一度お試しください。", api503: "部屋サーバーを利用できません。少し待ってお試しください。", actionFailed: "操作を保存できませんでした。", createFailed: "部屋を作成できませんでした。", codeInvalid: "4文字の部屋コードを入力してください。", joinFailed: "部屋に参加できませんでした。", listFailed: "部屋一覧を取得できませんでした。", dissolveFailed: "部屋を解散できませんでした。", roomMissingResult: "部屋が解散されました。結果はこのまま確認できます。", roomMissing: "部屋が解散されました。", dissolvedResult: "部屋を解散しました。結果はこのまま確認できます。",
  },
  en: {
    title: "Daifugo", practiceTitle: "Daifugo · CPU Practice", lobby: "Back to lobby", lobbyShort: "Lobby", practice: "CPU Practice", rules: "Rules", checking: "Checking your sign-in and room...", loginRequired: "Sign in to play online.", tagline: "3–6 players. Be the first to empty your hand.", createRoom: "Create a room", capacity: "Maximum players", passphraseOptional: "Passphrase (optional)", createNewRoom: "Create new room", joinRoom: "Join a room", roomCode: "Room code", passphrase: "Passphrase", joinByCode: "Join by code", roomList: "Room list", noRooms: "No rooms are available to join.", people: " players", yes: "Yes", no: "No", dissolve: "Dissolve room", leave: "Leave", participants: "Players", currentConfig: "Current room settings", turnTime: "Turn timer", beforeStart: "Before the game", startHelp: "The game can start with at least 3 players. Only each player can see their own hand after the game starts.", oneTurnLimit: "Turn time limit", addDummy: "Add dummy player", waitingReturn: "Waiting for players to return", needThree: "At least 3 players required", startMembers: "Start with these players", waitHost: "Waiting for the host to start.", turn: "Turn", yourHand: "Your hand", cards: " cards", handEmpty: "You have emptied your hand", playSelected: "Play selected cards", pass: "Pass", finished: "Game over", place: "th", returnUnavailable: "Could not return to the room.", resultTitle: "Daifugo Result", resultText: "Daifugo ({players} players)\nYou finished #{place}\nCompleted in {turns} turns\n#GameFields", you: " (you)", dummy: "Dummy", host: "Host", confirmRemove: "Treat {name} as having left the room?", confirmDissolve: "Dissolve this room?", noLimit: "None", seconds: "{seconds}s", rank1: "Daifugo", rank2: "Fugo", rank3: "Himin", rank4: "Daihinmin", newGame: "New game", guest: "Guest", dealing: "Dealing cards…", yourHandLabel: "Your hand. Select cards to play", handFinished: "You played every card", playAgain: "Play again", tableLabel: "Daifugo table", playedBy: "Played by {name}", emptyTable: "The table is empty", emptyHelp: "Play 1–4 cards of the same rank", starts: "{name} starts. The 3 of diamonds is required", currentTurn: "{name}'s turn", api401: "The passphrase is incorrect or your sign-in expired.", api403: "You do not have permission for this action.", api404: "Room not found.", api409: "The room changed. Please try again.", api503: "The room server is unavailable. Please try again shortly.", actionFailed: "Could not save the action.", createFailed: "Could not create the room.", codeInvalid: "Enter a four-character room code.", joinFailed: "Could not join the room.", listFailed: "Could not load the room list.", dissolveFailed: "Could not dissolve the room.", roomMissingResult: "The room was dissolved. You can still review the result.", roomMissing: "The room was dissolved.", dissolvedResult: "The room was dissolved. You can still review the result.",
  },
} as const;

export type DaifugoCopy = typeof daifugoCopy.ja;

export function daifugoText(locale: AppLocale) {
  return daifugoCopy[locale] as DaifugoCopy;
}

export function formatDaifugoText(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template);
}

const englishPlayErrors: Record<string, string> = {
  "ゲームは終了しています。": "The game is over.",
  "いまはあなたの番ではありません。": "It is not your turn.",
  "出すカードを選んでください。": "Select cards to play.",
  "手札にないカードが含まれています。": "The selection includes a card that is not in your hand.",
  "同じ数字のカードだけを組にできます。ジョーカーは代用できます。": "Only cards of the same rank can form a set. A joker may substitute.",
  "最初はダイヤの3を含めて出してください。": "The first play must include the 3 of diamonds.",
  "場より強い数字を出してください。": "Play a rank stronger than the table.",
  "いまはパスできません。": "You cannot pass now.",
};

export function localizeDaifugoPlayError(message: string, locale: AppLocale) {
  return locale === "en" ? englishPlayErrors[message] ?? message : message;
}
