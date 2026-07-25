"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SubmitGameButton({ instanceId, gameId }: { instanceId: string; gameId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "submitting" | "failed">("idle");
  const [error, setError] = useState("");

  const submit = async () => {
    if (!window.confirm("この検査済みrevisionを正式提出します。提出後は運営の採用審査対象になります。よろしいですか？")) return;
    setState("submitting");
    setError("");
    const response = await fetch(`/api/dashboard/games/${encodeURIComponent(instanceId)}/${encodeURIComponent(gameId)}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).catch(() => null);
    const body = await response?.json().catch(() => null) as { submitted?: boolean; error?: string } | null;
    if (!response?.ok || !body?.submitted) {
      setState("failed");
      setError(body?.error ?? "正式提出に失敗しました。");
      return;
    }
    router.refresh();
  };

  return <>
    <button className="submit-action" type="button" disabled={state === "submitting"} onClick={() => void submit()}>
      {state === "submitting" ? "提出中…" : "正式提出"}
    </button>
    {state === "failed" && <p className="submission-error" role="alert">{error}</p>}
  </>;
}
