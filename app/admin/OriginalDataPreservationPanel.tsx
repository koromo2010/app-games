"use client";

import { type ChangeEvent, useRef, useState } from "react";
import { ensureSiteAdminStepUp } from "@/lib/site-admin-passkey-client";
import {
  decodeOriginalDataOfflineReceipt,
  hashOriginalDataOfflineContainer,
  verifyOriginalDataOfflineArchive,
  type OriginalDataOfflineReceipt,
} from "@/lib/original-data-offline-verifier";

const endpoint = "/api/admin/sdk-original-data-preservation";
const receiptHeader = "X-Game-Fields-A0-Preservation-Receipt";

type LocalVerification = Awaited<ReturnType<typeof verifyOriginalDataOfflineArchive>>;
type EncryptedContainer = Awaited<ReturnType<typeof hashOriginalDataOfflineContainer>>;
type Phase = "idle" | "preparing" | "downloaded" | "verified" | "sealed" | "error";

function friendlyError(error: unknown) {
  const code = error instanceof Error && error.message ? error.message : "A0_EXPORT_UNAVAILABLE";
  const known: Record<string, string> = {
    A0_SAFE_RECEIPT_INVALID: "安全受領票を確認できなかったため停止しました。",
    A0_LOCAL_ZIP_SIZE_MISMATCH: "ZIPのbyte sizeが安全受領票と一致しません。",
    A0_LOCAL_ZIP_SHA256_MISMATCH: "ZIPのSHA-256が安全受領票と一致しません。",
    A0_LOCAL_ZIP_INTERNAL_HASH_INVALID: "ZIP内部のSHA256SUMS検証に失敗しました。",
    A0_LOCAL_ZIP_MANIFEST_MISMATCH: "ZIP内部manifestと安全受領票が一致しません。",
    A0_LOCAL_ZIP_RECORD_COUNT_MISMATCH: "ZIP内部のrecord countが一致しません。",
    A0_LOCAL_ZIP_ARTIFACT_MISMATCH: "ZIP内部のGit artifact検証に失敗しました。",
    A0_LOCAL_ZIP_INVALID: "ZIPを安全に展開・検証できませんでした。",
  };
  return known[code] ?? `元データ確保は停止しました（${code}）。`;
}

function downloadBlob(bytes: ArrayBuffer | Uint8Array, filename: string, type: string) {
  const payload = bytes instanceof ArrayBuffer
    ? bytes
    : (() => {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      return copy.buffer;
    })();
  const objectUrl = URL.createObjectURL(new Blob([payload], { type }));
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.rel = "noopener";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

export function OriginalDataPreservationPanel({
  onAuthExpired,
}: {
  onAuthExpired: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState<OriginalDataOfflineReceipt | null>(null);
  const [localVerification, setLocalVerification] = useState<LocalVerification | null>(null);
  const [encryptedContainer, setEncryptedContainer] = useState<EncryptedContainer | null>(null);
  const [containerTestConfirmed, setContainerTestConfirmed] = useState(false);
  const [twoCopiesConfirmed, setTwoCopiesConfirmed] = useState(false);
  const [downloadInvocationCount, setDownloadInvocationCount] = useState(0);
  const [receivedBytesAvailable, setReceivedBytesAvailable] = useState(false);
  const requestPending = useRef(false);
  const verifiedArchiveBytes = useRef<ArrayBuffer | null>(null);

  const downloadOriginalData = async () => {
    if (requestPending.current || receipt) return;
    requestPending.current = true;
    setPhase("preparing");
    setMessage("本人確認後、2対象を一つのread-only snapshotから収集・検証しています…");
    try {
      await ensureSiteAdminStepUp();
      setDownloadInvocationCount((current) => current + 1);
      const response = await fetch(endpoint, { method: "POST", cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { code?: unknown; error?: unknown } | null;
        if (response.status === 401) onAuthExpired();
        const code = typeof payload?.code === "string"
          ? payload.code
          : typeof payload?.error === "string"
            ? payload.error
            : `HTTP_${response.status}`;
        throw new Error(code);
      }
      const safeReceipt = decodeOriginalDataOfflineReceipt(response.headers.get(receiptHeader));
      const archive = await response.arrayBuffer();
      await verifyOriginalDataOfflineArchive(archive, safeReceipt);
      verifiedArchiveBytes.current = archive;
      setReceivedBytesAvailable(true);
      downloadBlob(archive, safeReceipt.filename, "application/zip");
      setReceipt(safeReceipt);
      setPhase("downloaded");
      setMessage("完全受信したZIPを保存処理へ渡しました。保存済みZIPを下で選び、端末上の再検証を完了してください。");
    } catch (error) {
      setPhase("error");
      setMessage(friendlyError(error));
    } finally {
      requestPending.current = false;
    }
  };

  const saveReceivedBytesAgain = () => {
    if (!receipt || !verifiedArchiveBytes.current) return;
    downloadBlob(verifiedArchiveBytes.current, receipt.filename, "application/zip");
    setMessage("同じ検証済み受信bytesを再度保存処理へ渡しました。production endpointは再実行していません。");
  };

  const verifySavedZip = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file || !receipt) return;
    setPhase("preparing");
    setMessage("選択したZIPをこのブラウザ内だけで展開・全entry照合しています…");
    try {
      const archive = await file.arrayBuffer();
      const verified = await verifyOriginalDataOfflineArchive(archive, receipt);
      verifiedArchiveBytes.current = null;
      setReceivedBytesAvailable(false);
      setLocalVerification(verified);
      setEncryptedContainer(null);
      setContainerTestConfirmed(false);
      setTwoCopiesConfirmed(false);
      setPhase("verified");
      setMessage("保存済みZIPのsize、SHA-256、manifest、record count、全entry hashを端末内で検証しました。ZIP bytesは送信していません。");
    } catch (error) {
      setPhase("error");
      setMessage(friendlyError(error));
    }
  };

  const inspectEncryptedContainer = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file || !localVerification) return;
    setPhase("preparing");
    setMessage("暗号化containerのsizeとSHA-256をこのブラウザ内だけで計算しています…");
    try {
      const result = await hashOriginalDataOfflineContainer(file);
      if (result.bytes <= 0 || !result.filename.toLowerCase().endsWith(".7z")) {
        throw new Error("A0_ENCRYPTED_CONTAINER_INVALID");
      }
      setEncryptedContainer(result);
      setContainerTestConfirmed(false);
      setTwoCopiesConfirmed(false);
      setPhase("verified");
      setMessage("暗号化containerのsizeとSHA-256を端末内で計算しました。7-Zipの完全性testと2媒体copyを確認してください。");
    } catch (error) {
      setPhase("error");
      setMessage(friendlyError(error));
    }
  };

  const saveSafeReceipt = () => {
    if (
      !receipt
      || !localVerification
      || !encryptedContainer
      || !containerTestConfirmed
      || !twoCopiesConfirmed
    ) return;
    const durableReceipt = {
      schemaVersion: 1,
      phaseId: "T-131-A0",
      sourceMainCommit: receipt.sourceMainCommit,
      sourceDeploymentFingerprint: receipt.sourceDeploymentFingerprint,
      semanticEnvironment: receipt.semanticEnvironment,
      sourceDatabaseFingerprint: receipt.sourceDatabaseFingerprint,
      snapshotFingerprint: receipt.snapshotFingerprint,
      observedAt: receipt.observedAt,
      observedSchemaVersion: receipt.observedSchemaVersion,
      migrationLedger: receipt.migrationLedger,
      targets: receipt.targets,
      zipBytes: receipt.zipBytes,
      zipSha256: receipt.zipSha256,
      localTestExtraction: "PASS",
      internallyHashedEntryCount: localVerification.internallyHashedEntryCount,
      encryptedContainerBytes: encryptedContainer.bytes,
      encryptedContainerSha256: encryptedContainer.sha256,
      encryptedContainerIntegrityTest: "USER_CONFIRMED_PASS",
      offlineCopyCount: "AT_LEAST_TWO_USER_CONFIRMED",
      downloadInvocationCount,
      retryCount: Math.max(0, downloadInvocationCount - 1),
      productionWriteCount: 0,
      controlPlaneWriteCount: 0,
    } as const;
    const bytes = new TextEncoder().encode(`${JSON.stringify(durableReceipt, null, 2)}\n`);
    downloadBlob(bytes, `Game-Fields-T-131-A0-safe-receipt-${receipt.observedAt.slice(0, 10)}.json`, "application/json");
    setPhase("sealed");
    setMessage("secret-free安全受領票を端末へ保存しました。raw ZIPや7z本体ではなく、このJSONだけが後でcheckpointへ保存可能です。");
  };

  return (
    <section className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-5 sm:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">T-131-A0 · confidential offline preservation</p>
        <h2 className="mt-2 text-2xl font-black">元データ・オフライン確保</h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-amber-50/90">
          production runtimeが選択したschema 9 DBから、moi-lab2とyabobojpn-labだけを一つの
          REPEATABLE READ / READ ONLY snapshotで取得し、取得可能なimmutable Git artifactと一緒に一つのZIPへ封印します。
        </p>
        <p className="mt-3 text-sm font-bold text-amber-100">
          migration、DB write、owner紐付け、公開、release、Blob保存は行いません。ZIPと暗号化containerはLibrary・Git・chat・一般cloudへuploadしないでください。
        </p>
      </header>

      <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 sm:p-7">
        <h3 className="text-xl font-black">1. production ZIPを最大1回成功させる</h3>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          完全なarchiveをserverとbrowserの両方で検証してから保存します。成功後はこの画面で再生成できません。
        </p>
        <button
          type="button"
          disabled={phase === "preparing" || receipt !== null}
          onClick={() => void downloadOriginalData()}
          className="mt-5 w-full rounded-xl bg-cyan-300 px-4 py-3 font-black text-slate-950 transition hover:bg-cyan-200 disabled:opacity-40"
        >
          {phase === "preparing" && !receipt ? "元データを収集中…" : receipt ? "ZIP生成済み（再実行不可）" : "本人確認して元データZIPを保存"}
        </button>
        {receipt ? (
          <div className="mt-5 grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4 text-xs leading-5 text-slate-300 sm:grid-cols-2">
            <p className="sm:col-span-2"><span className="font-bold text-white">file:</span> {receipt.filename}</p>
            <p><span className="font-bold text-white">size:</span> {receipt.zipBytes.toLocaleString("ja-JP")} bytes</p>
            <p><span className="font-bold text-white">schema:</span> 9 / 001–009 exact / 010 absent</p>
            <p className="break-all font-mono sm:col-span-2"><span className="font-sans font-bold text-white">SHA-256:</span> {receipt.zipSha256}</p>
            {receipt.targets.map((target) => (
              <div key={target.target} className="rounded-lg border border-white/10 p-3">
                <p className="font-mono font-bold text-cyan-200">{target.target}</p>
                <p>lifecycle: {target.lifecycle} / principal: {target.principalValidity}</p>
                <p>artifact: {target.artifactStatus} ({target.artifactPresentCount}/{target.artifactLocatorCount})</p>
              </div>
            ))}
            {receivedBytesAvailable ? (
              <button
                type="button"
                onClick={saveReceivedBytesAgain}
                className="rounded-lg border border-cyan-300/30 px-3 py-2 font-bold text-cyan-100 hover:bg-cyan-300/10 sm:col-span-2"
              >
                同じ受信済みbytesを再保存（endpoint再実行なし）
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 sm:p-7">
        <h3 className="text-xl font-black">2. 保存済みZIPを端末内で完全照合</h3>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          選択したfileはuploadされません。size、outer SHA-256、安全な展開、manifest、record count、全entry SHA-256をbrowser内で検証します。
        </p>
        <label className={`mt-5 block rounded-xl border px-4 py-3 text-center text-sm font-black ${receipt ? "cursor-pointer border-emerald-300/30 text-emerald-100 hover:bg-emerald-300/10" : "cursor-not-allowed border-white/10 text-slate-600"}`}>
          保存したZIPを選んで照合
          <input
            type="file"
            accept=".zip,application/zip"
            disabled={!receipt || phase === "preparing"}
            onChange={(event) => void verifySavedZip(event)}
            className="sr-only"
          />
        </label>
        {localVerification ? (
          <p className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">
            PASS: {localVerification.entryCount} entries / {localVerification.internallyHashedEntryCount} internal hashes / 2 exact targets
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 sm:p-7">
        <h3 className="text-xl font-black">3. AES-256暗号化containerと2媒体copy</h3>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-300">
          <li>7-Zip GUIで保存済みZIPを一つの7zへ追加し、暗号方式AES-256と「ファイル名を暗号化」を選びます。</li>
          <li>passphraseは7-Zipへ直接入力し、この画面、chat、shell argument、script、logへ入力しません。</li>
          <li>7-Zipの「テスト」で復号・完全性を確認し、利用者端末と利用者管理の別媒体へ少なくとも2 copy保持します。</li>
          <li>暗号化済み7zを下で選び、sizeとSHA-256だけをbrowser内で計算します。</li>
        </ol>
        <label className={`mt-5 block rounded-xl border px-4 py-3 text-center text-sm font-black ${localVerification ? "cursor-pointer border-cyan-300/30 text-cyan-100 hover:bg-cyan-300/10" : "cursor-not-allowed border-white/10 text-slate-600"}`}>
          暗号化済み7zを選んでdigest計算
          <input
            type="file"
            accept=".7z,application/x-7z-compressed"
            disabled={!localVerification || phase === "preparing"}
            onChange={(event) => void inspectEncryptedContainer(event)}
            className="sr-only"
          />
        </label>
        {encryptedContainer ? (
          <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
            <p><span className="font-bold text-white">encrypted size:</span> {encryptedContainer.bytes.toLocaleString("ja-JP")} bytes</p>
            <p className="break-all font-mono text-xs"><span className="font-sans font-bold text-white">encrypted SHA-256:</span> {encryptedContainer.sha256}</p>
            <label className="flex items-start gap-3"><input type="checkbox" checked={containerTestConfirmed} onChange={(event) => setContainerTestConfirmed(event.target.checked)} className="mt-1" /><span>7-Zipの「テスト」がpassphrase入力後にエラー0で完了した</span></label>
            <label className="flex items-start gap-3"><input type="checkbox" checked={twoCopiesConfirmed} onChange={(event) => setTwoCopiesConfirmed(event.target.checked)} className="mt-1" /><span>暗号化containerと復号手段を、利用者管理の2媒体で確認した</span></label>
            <button
              type="button"
              disabled={!containerTestConfirmed || !twoCopiesConfirmed || phase === "sealed"}
              onClick={saveSafeReceipt}
              className="w-full rounded-xl bg-emerald-300 px-4 py-3 font-black text-slate-950 hover:bg-emerald-200 disabled:opacity-40"
            >
              {phase === "sealed" ? "安全受領票を保存済み" : "secret-free安全受領票を保存"}
            </button>
          </div>
        ) : null}
      </section>

      {message ? (
        <p
          role={phase === "error" ? "alert" : "status"}
          className={`rounded-xl border px-4 py-3 text-sm leading-6 ${phase === "error" ? "border-rose-300/30 bg-rose-300/10 text-rose-100" : phase === "sealed" ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100" : "border-cyan-300/25 bg-cyan-300/10 text-cyan-50"}`}
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
