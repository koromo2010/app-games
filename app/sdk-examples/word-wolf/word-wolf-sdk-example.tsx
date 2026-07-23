"use client";

import { WordWolfGame } from "@/app/wordwolf/WordWolfGame";

/**
 * SDK-dev acceptance harness.
 *
 * Keep the canonical Word Wolf game intact here. Common SDK extraction is
 * accepted only while this renders and completes the same game as /wordwolf.
 */
export function WordWolfSdkExample() {
  return <WordWolfGame />;
}
