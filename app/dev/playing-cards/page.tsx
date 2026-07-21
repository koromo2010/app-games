import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { expectedAppEnvironment } from "@/lib/storage-environment-guard";
import { PlayingCardsPlayground } from "./PlayingCardsPlayground";

export const metadata: Metadata = {
  title: "共通トランプ基盤",
  robots: { index: false, follow: false },
};

export default function PlayingCardsDevelopmentPage() {
  if (process.env.APP_ENV === "production" || expectedAppEnvironment() === "production") notFound();
  return <PlayingCardsPlayground />;
}
