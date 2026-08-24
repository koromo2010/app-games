type RevisionedOnlineRoom = {
  code: string;
  revision?: number;
};

/**
 * Keeps a late HTTP response from rolling a client back after polling,
 * WebSocket reconciliation, or another command already supplied a newer room.
 */
export function preferLatestOnlineRoom<Room extends RevisionedOnlineRoom>(
  current: Room | null,
  incoming: Room,
) {
  if (!current) return incoming;
  // Joining/creating a Room uses its explicit lifecycle path. Reconciliation
  // and command responses must never replace an already active different Room.
  if (current.code !== incoming.code) return current;
  if (
    typeof current.revision === "number"
    && typeof incoming.revision === "number"
    && incoming.revision <= current.revision
  ) {
    return current;
  }
  return incoming;
}
