"use client";

import { useState } from "react";
import { secondary } from "./game-sdk-frame-shared";

export function GameSdkInviteLinkButton({
  roomCode,
  onMessage,
}: {
  roomCode: string;
  onMessage: (message: string) => void;
}) {
  const [copying, setCopying] = useState(false);

  const copyInviteLink = async () => {
    if (copying) return;
    setCopying(true);
    try {
      const inviteUrl = `${window.location.origin}/join/${encodeURIComponent(roomCode)}`;
      await navigator.clipboard.writeText(inviteUrl);
      onMessage("招待リンクをコピーしました。");
    } catch {
      onMessage("招待リンクをコピーできませんでした。ブラウザの権限を確認してください。");
    } finally {
      setCopying(false);
    }
  };

  return (
    <button
      type="button"
      className={`${secondary} mt-4 w-full`}
      disabled={copying}
      onClick={() => void copyInviteLink()}
    >
      {copying ? "コピー中…" : "招待リンクをコピー"}
    </button>
  );
}
