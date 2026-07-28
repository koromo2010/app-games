import fs from "node:fs";

function replaceOrThrow(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing patch anchor: ${label}`);
  return source.replace(before, after);
}

const switcherPath = "app/components/LocaleSwitcher.tsx";
fs.writeFileSync(switcherPath, `"use client";

import { useAppLocale } from "@/app/components/AppLocaleProvider";
import type { AppLocale } from "@/lib/app-locale";

export function LocaleSwitcher({
  className = "",
}: {
  className?: string;
}) {
  const { locale, setLocale, t } = useAppLocale();
  const locales: AppLocale[] = ["ja", "en"];

  return (
    <div
      className={\`inline-flex items-center gap-1 rounded-xl border border-white/15 bg-slate-950/85 p-1 shadow-lg backdrop-blur \${className}\`}
      aria-label={t("locale.switchLabel")}
      data-locale-switcher
    >
      {locales.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setLocale(option)}
          aria-pressed={locale === option}
          className={\`rounded-lg px-3 py-1.5 text-xs font-black transition \${
            locale === option
              ? "bg-cyan-300 text-slate-950"
              : "text-slate-200 hover:bg-white/10 hover:text-white"
          }\`}
        >
          {t(\`locale.\${option}\`)}
        </button>
      ))}
    </div>
  );
}
`);

const gatePath = "app/components/PlayerAuthGate.tsx";
let gate = fs.readFileSync(gatePath, "utf8");
gate = replaceOrThrow(
  gate,
  'import { useState } from "react";\n',
  'import { useState } from "react";\nimport { LocaleSwitcher } from "@/app/components/LocaleSwitcher";\nimport { useAppLocale } from "@/app/components/AppLocaleProvider";\n',
  "gate imports",
);
gate = replaceOrThrow(
  gate,
  '  const router = useRouter();\n',
  '  const router = useRouter();\n  const { t } = useAppLocale();\n',
  "gate locale hook",
);
gate = replaceOrThrow(
  gate,
  '  const [message, setMessage] = useState(\n    "このゲームを遊ぶにはログインが必要です。",\n  );',
  '  const [message, setMessage] = useState(() => t("authGate.loginRequired"));',
  "gate initial message",
);
gate = replaceOrThrow(
  gate,
  '        <div className="mb-4 text-center">\n',
  '        <div className="mb-4 flex justify-end">\n          <LocaleSwitcher />\n        </div>\n        <div className="mb-4 text-center">\n',
  "gate switcher",
);
gate = replaceOrThrow(
  gate,
  '            ログインすると、このままゲームラウンジを開きます。\n',
  '            {t("authGate.continueToLobby")}\n',
  "gate description",
);
fs.writeFileSync(gatePath, gate);

const layoutPath = "app/layout.tsx";
let layout = fs.readFileSync(layoutPath, "utf8");
layout = replaceOrThrow(
  layout,
  'import { AppLocaleProvider } from "@/app/components/AppLocaleProvider";\n',
  'import { AppLocaleProvider } from "@/app/components/AppLocaleProvider";\nimport { LocaleSwitcher } from "@/app/components/LocaleSwitcher";\n',
  "layout import",
);
layout = replaceOrThrow(
  layout,
  '<body className="min-h-full flex flex-col"><AppLocaleProvider initialLocale={locale}><RouteTransitionProvider>{children}<SiteFooter siteName={settings.siteName} /></RouteTransitionProvider></AppLocaleProvider>',
  '<body className="min-h-full flex flex-col"><AppLocaleProvider initialLocale={locale}><div className="fixed right-3 top-3 z-[100]" data-global-locale-switcher><LocaleSwitcher /></div><RouteTransitionProvider>{children}<SiteFooter siteName={settings.siteName} /></RouteTransitionProvider></AppLocaleProvider>',
  "layout global switcher",
);
fs.writeFileSync(layoutPath, layout);

const i18nPath = "lib/app-i18n.ts";
let i18n = fs.readFileSync(i18nPath, "utf8");
i18n = replaceOrThrow(
  i18n,
  '    "locale.ja": "日本語",\n    "locale.en": "English",',
  '    "locale.switchLabel": "表示言語を選択",\n    "locale.ja": "日本語",\n    "locale.en": "English",\n    "authGate.loginRequired": "このゲームを遊ぶにはログインが必要です。",\n    "authGate.continueToLobby": "ログインすると、このままゲームラウンジを開きます。",',
  "ja messages",
);
i18n = replaceOrThrow(
  i18n,
  '    "locale.ja": "日本語",\n    "locale.en": "English",\n  },\n} as const;',
  '    "locale.switchLabel": "Choose display language",\n    "locale.ja": "日本語",\n    "locale.en": "English",\n    "authGate.loginRequired": "Sign in to play this game.",\n    "authGate.continueToLobby": "After signing in, the game lounge will open automatically.",\n  },\n} as const;',
  "en messages",
);
fs.writeFileSync(i18nPath, i18n);

const testPath = "tests/login-locale-switcher-contract.test.ts";
fs.writeFileSync(testPath, `import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("LocaleSwitcher uses the shared locale provider", () => {
  const source = readFileSync("app/components/LocaleSwitcher.tsx", "utf8");
  assert.match(source, /useAppLocale/);
  assert.match(source, /setLocale\(option\)/);
  assert.match(source, /aria-pressed/);
});

test("LocaleSwitcher is shared by layout and PlayerAuthGate", () => {
  const layout = readFileSync("app/layout.tsx", "utf8");
  const gate = readFileSync("app/components/PlayerAuthGate.tsx", "utf8");
  assert.match(layout, /<LocaleSwitcher \/>/);
  assert.match(gate, /<LocaleSwitcher \/>/);
  assert.match(gate, /authGate\.loginRequired/);
  assert.match(gate, /authGate\.continueToLobby/);
});
`);
