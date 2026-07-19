type ConfirmNavigation = (message: string) => boolean;

export const roomLeaveConfirmationMessage = "この部屋から退出しますか？\n退出すると参加枠から外れ、同じ部屋へ戻れない場合があります。";

export const resultLobbyConfirmationMessage = "部屋には戻らず、広場へ移動しますか？\n部屋は解散されず、広場の「プレイ中の部屋」から戻れます。";

export const roomCloseConfirmationMessage = "この部屋を閉じますか？\n参加者もこの部屋を利用できなくなります。";

export function confirmRoomLeave(confirmNavigation?: ConfirmNavigation) {
  return (confirmNavigation ?? ((message) => window.confirm(message)))(roomLeaveConfirmationMessage);
}

export function confirmResultLobbyNavigation(confirmNavigation?: ConfirmNavigation) {
  return (confirmNavigation ?? ((message) => window.confirm(message)))(resultLobbyConfirmationMessage);
}

export function confirmRoomClose(confirmNavigation?: ConfirmNavigation) {
  return (confirmNavigation ?? ((message) => window.confirm(message)))(roomCloseConfirmationMessage);
}
