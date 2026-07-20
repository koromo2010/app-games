import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CodeInterceptGame } from "@/app/code-intercept/CodeInterceptGame";
import { CodeInterceptRealtimeProvider } from "@/app/code-intercept/CodeInterceptRealtimeProvider";
import { codeInterceptRealtimePilotEnabled } from "@/lib/code-intercept-realtime-schema";
import { gamePageAccessAllowed } from "@/lib/game-access";

export const metadata: Metadata = {
  title: "コードインターセプト | Game Fields",
  description: "秘密の単語をヒントに暗号を伝達し、相手チームの暗号を傍受するチーム対抗ゲーム。",
};

export default async function CodeInterceptPage() {
  if (!(await gamePageAccessAllowed("code-intercept"))) redirect("/games");
  const realtimeEnabled = codeInterceptRealtimePilotEnabled();
  return <CodeInterceptRealtimeProvider>
    <CodeInterceptGame realtimeEnabled={realtimeEnabled} />
  </CodeInterceptRealtimeProvider>;
}
