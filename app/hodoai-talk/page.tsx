import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { privateGameCookieMatches, privateGameCookieName } from "@/lib/private-game-access";

export default async function HodoaiTalkPage() {
  const store = await cookies();
  if (!privateGameCookieMatches(store.get(privateGameCookieName)?.value)) redirect("/games");
  redirect("/kotoba-de-kazu-narabe");
}
