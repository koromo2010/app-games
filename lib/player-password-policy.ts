export const playerPasswordMinimumLength = 4;
export const playerPasswordMaximumLength = 128;

export function isValidPlayerPassword(password: string) {
  return password.length >= playerPasswordMinimumLength
    && password.length <= playerPasswordMaximumLength;
}

export function playerPasswordChangeError(input: {
  accountPlayerId: string | null;
  authenticatedPlayerId: string;
  currentPasswordValid: boolean;
  newPassword: string;
  newPasswordMatchesCurrent: boolean;
}) {
  if (
    !input.accountPlayerId
    || input.accountPlayerId !== input.authenticatedPlayerId
    || !input.currentPasswordValid
  ) {
    return "PLAYER_ACCOUNT_INVALID_CREDENTIALS" as const;
  }
  if (!isValidPlayerPassword(input.newPassword)) {
    return "PLAYER_ACCOUNT_PASSWORD_INVALID" as const;
  }
  if (input.newPasswordMatchesCurrent) {
    return "PLAYER_ACCOUNT_PASSWORD_UNCHANGED" as const;
  }
  return null;
}
