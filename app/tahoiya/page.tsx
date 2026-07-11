import type { Metadata } from "next";
import { TahoiyaGame } from "./TahoiyaGame";

export const metadata: Metadata = {
  title: "Tahoiya | App Games",
  description: "A prototype room-based dictionary bluffing game.",
};

export default function TahoiyaPage() {
  return <TahoiyaGame />;
}
