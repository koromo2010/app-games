export function CreatorOwnershipIssue({ kind }: {
  kind: "record_inconsistency" | "lookup_unavailable";
}) {
  const recordInconsistency = kind === "record_inconsistency";
  return <main className="account-link-error">
    <h1>{recordInconsistency ? "所有権情報に不整合があります" : "所有権情報を一時的に確認できません"}</h1>
    <p>
      {recordInconsistency
        ? "この環境の登録情報に不整合があるため、再接続では修復できません。"
        : "所有権情報を確認するサービスが一時的に利用できません。時間をおいて再度お試しください。"}
    </p>
  </main>;
}
