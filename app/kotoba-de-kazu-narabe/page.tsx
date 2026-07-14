import { redirect } from "next/navigation";
import { gamePageAccessAllowed } from "@/lib/game-access";

export default async function KotobaDeKazuNarabePage() {
  if (!(await gamePageAccessAllowed("hodoai"))) redirect("/games");
  redirect("/word-scale");
}
