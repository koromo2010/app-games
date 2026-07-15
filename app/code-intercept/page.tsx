import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CodeInterceptGame } from "@/app/code-intercept/CodeInterceptGame";
import { gamePageAccessAllowed } from "@/lib/game-access";

export const metadata: Metadata = {
  title: "暗号傍受（仮） | Game Fields",
  description: "秘密の単語と連想ヒントで味方へ暗号を伝え、敵チームの対応関係を推理するチーム対抗ゲーム。",
};

export default async function CodeInterceptPage() {
  if (!(await gamePageAccessAllowed("code-intercept"))) redirect("/games");
  return <CodeInterceptGame />;
}
