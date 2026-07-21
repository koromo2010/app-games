# App Games

Party game prototypes built with Next.js.

> AI・別スレッドで開発を再開する場合は、最初に [`docs/README.md`](./docs/README.md) の資料ナビを開いてください。必読資料、作業別の参照先、バグ調査の確認順をまとめています。

## Routes

- `/games` - game lobby
- `/admin` - password-protected site settings for the site name, search title/description, and favicon
- `/users/me` - signed-in player's private stats, replay, favorites, and sharing page
- `/wordwolf` - Wordwolf prototype
- `/tahoiya` - Tahoiya prototype
- `/northern-branch` - Private-use online Northern Branch room game for logged-in players (requires `PRIVATE_GAME_ACCESS_KEY`)
- `/word-scale` - Private-use online room game for logged-in players (requires `PRIVATE_GAME_ACCESS_KEY`)
- `/word-sonar` - Online word deduction room game for logged-in players (legacy `/kotoba-senpuku` redirects here)
- `/kotoba-de-kazu-narabe` and `/hodoai-talk` - Redirect to `/word-scale`
- `/word-out` - Word Out: private online 2-6 player room game with configurable cards and association groups, plus one undealt word (`/nigoichi` redirects here)
- `/games/code-intercept` - Private 4-12 player team prototype with fixed or per-round team-selected code lengths
- `/daifugo` - Online Daifugo for 3–6 players, with CPU practice at `/daifugo/practice`
- `/canvas` - Private drawing-canvas UI prototype with mouse, touch, pen, undo, erase, local save, and same-browser tab sync

## Private game access

Set the server-side environment variable `PRIVATE_GAME_ACCESS_KEY`. Entering the same value in the unlabeled access field on the game lobby reveals private-use game cards and issues a 30-day HttpOnly access cookie.

## Site administration

Set the server-only `SITE_ADMIN_PASSWORD`, then open `/admin`. When it is not configured, the existing `DEBUG_MODE_PASSWORD` is accepted as a compatibility fallback. The management screen stores the site name, homepage search title, search-description candidate, and uploaded favicon in Redis/Vercel Blob. The admin session uses a separate signed HttpOnly cookie and expires after 12 hours. Search engines may rewrite the displayed snippet for a particular query.

## Shared game LLM gateway

All games must access AI providers through `lib/game-llm.ts`. New games should not call OpenAI, Gemini, or Groq directly.

The shared provider order is:

1. Personal mode first attempt: the provider selected by the player (OpenAI, Gemini, or Groq)
2. Game Fields paid mode: OpenAI using the app's `SHARED_OPENAI_API_KEY` (legacy fallback: `OPENAI_API_KEY`)
3. Provider fallback: Gemini (`SHARED_GEMINI_API_KEY`) and Groq (`SHARED_GROQ_API_KEY`), with legacy-name fallbacks
4. Final fallback: local game data with a user-visible notice

Provider model IDs are centralized in `lib/llm-model.ts`.

Provider failover runs only inside the shared gateway. Game routes must not repeat the provider chain. Topic generation is cached per room and round so duplicate clicks or tabs reuse the same result instead of spending another LLM request.

Quality-critical tasks may pass `quality: "high"` to the shared gateway. Tahoiya topic generation uses high reasoning to create three candidates, then prefers a different provider for independent review and records both the generating and reviewing providers in `GameGenerationMeta`.

## Paid API access

The shared access panel separates personal provider access from Game Fields-provided paid access:

- Personal API: the player selects OpenAI, Google Gemini, or Groq and supplies a key issued by that provider. Billing and free-tier limits belong to the selected provider.
- Game Fields API: the app uses its own `SHARED_OPENAI_API_KEY` (or the legacy `OPENAI_API_KEY` during migration). It currently uses an invite/test password and is designed so that authorization can later be replaced by a purchase or credit entitlement.

Personal keys are validated server-side against the active provider model, never stored in Redis, player accounts, logs, or localStorage, and are retained for at most eight hours in an AES-256-GCM encrypted HttpOnly cookie. A server-only `LLM_SESSION_SECRET` of at least 32 characters is recommended; until it is configured, the existing server-only access password and shared OpenAI key are combined to derive the encryption secret. Players should create a game-specific key with permissions and spend controls where the provider supports them.

Player login is also backed by a signed, 30-day HttpOnly cookie. Configure a server-only `PLAYER_SESSION_SECRET` of at least 32 characters; a sufficiently long `LLM_SESSION_SECRET` is used only as a compatibility fallback. Multiplayer APIs derive the acting player from this cookie instead of trusting IDs in request bodies.

State-changing APIs use shared Redis-backed rate limits for IP, player, and normalized identity buckets. Bucket subjects are HMAC-obscured; set an optional server-only `RATE_LIMIT_HASH_SECRET` (32+ characters recommended), or the player session secret is reused.

## Shared feedback and RAG

AI output feedback is shared infrastructure for every game:

- Store and retrieve feedback through `app/api/game-feedback/route.ts` and `lib/game-feedback-store.ts`.
- Attach `GameGenerationMeta` from `lib/game-ai-types.ts` to generated game data. It records the provider, model, personal/paid/free/local mode, prompt version, latency, and feedback examples used for that generation.
- Render per-player Good/Bad feedback with `app/components/GameFeedbackPanel.tsx`. A player can update their feedback for the same generated artifact.
- Before calling `generateGameLlmText`, retrieve relevant examples and add the result of `formatGameFeedbackContext` to the prompt.

The first retrieval implementation uses Redis indexes plus game/task/settings tags. The stored schema also keeps stable feedback IDs and generation metadata so retrieval can later move to embeddings/vector search without replacing the UI or provider gateway.

## Shared room UI

Every multiplayer game must expose the current room configuration to all participants, while only the host can change it. New games should render configuration values with `app/components/RoomConfigSummary.tsx` so clients can verify the rules before play starts and while the room is active.

Every game with a debug mode must place `app/components/DebugModeButton.tsx` in its top bar for the host. Debug controls are available when the player's registered recovery email matches an account registered in the site administration screen, or when an administrator explicitly grants access to that player ID. The shared `/api/debug-auth` check and mutation APIs enforce the same rule; players cannot grant the permission to themselves. Recovery-email registration and changes live on `/users/me`, not in the game catalog. While a debug game is active, the shared control can abort it back to the same room's pre-game state without removing participants.

Room configuration defaults are stored per game and per player in Redis, with local storage as an offline fallback. New games should use `lib/game-room-defaults-client.ts` for loading and saving, and add their server-side normalizer to `lib/room-defaults-store.ts`.

Every game must declare its time-limit policy in `config/game-registry.json`. Multiplayer games use the shared presets, manual seconds input, and normalizer in `lib/game-room-config.ts` and `app/components/RoomTimeLimitControl.tsx`; `0` always means no limit. Each game keeps its timeout transition on the server and declares its saved fields and expiry handler so `npm run lint` rejects a new game with missing timer support. A non-game utility may opt out only with an explicit reason.

Tahoiya gameplay mutations are revisioned server actions. The server rejects stale phase rollback, reapplies concurrent submissions with compare-and-set, and decides completion or timeout transitions without depending on the host browser.

All online games route room queries and mutations through `lib/online-room-api-client.ts` and a game-specific typed adapter. Visible-tab synchronization and cross-tab refresh use `app/hooks/use-online-room-polling.ts`; game screens must not duplicate room URLs, HTTP methods, or interval/listener setup. Preview and local development use revision-only WebSocket notifications: normal polling stops after subscription, a 45-second reconciliation remains, and disconnects immediately fall back to polling while reconnecting with backoff. Production keeps WebSocket disabled unless explicitly enabled. Result ordering shared by UI, external share text, and replay storage should be projected once through `lib/game-result-presentation.ts`.

Future advertising uses the provider-neutral `app/components/GameAdSlot.tsx`. Slots exist only on the game catalog, pre-entry, room lobby, and result surfaces; active play and debug rooms do not show ads. Advertising is off by default. Set `NEXT_PUBLIC_GAME_ADS_MODE=preview` only to inspect reserved layout space. Do not use `live` until a consent flow, provider adapter, CSP rules, and production policy review are complete.

## Vocabulary sources

The curated Tahoiya seed catalog uses or references terminology from the following open vocabulary sources. Definitions stored by Game Fields are short game-oriented paraphrases, not reproduced dictionary entries.

- [JMdict/EDICT](https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project), Electronic Dictionary Research and Development Group, licensed under [CC BY-SA 4.0](https://www.edrdg.org/edrdg/licence.html).
- [Medical Subject Headings (MeSH)](https://meshb.nlm.nih.gov/), courtesy of the U.S. National Library of Medicine, under the [NLM data terms and conditions](https://www.nlm.nih.gov/databases/download/terms_and_conditions.html).
- [Getty Vocabularies / Art & Architecture Thesaurus](https://www.getty.edu/research/tools/vocabularies/), J. Paul Getty Trust, licensed under ODC-By 1.0. Contributor and record-level sources should also be retained when bulk ingestion is added.
- [National Diet Library](https://www.ndl.go.jp/), used as a historical-material discovery reference under the applicable [content reuse terms](https://www.ndl.go.jp/use/reproduction).

### Tahoiya candidate generation

Tahoiya candidates are generated separately from gameplay. The manual GitHub Actions workflow
`Generate Tahoiya candidate catalog` randomly chooses 10 distinct sources from the configured
20-source registry, collects one unseen heading from each, and reviews all 10 in one LLM request.
Accepted words are appended to `data/tahoiya-candidates.json`; reruns continue from the existing
catalog until the requested total (100 for the first run) is reached. After checking quality and API
cost, the same workflow can continue the catalog toward 1000. The deployed app imports only new
JSON records into Redis with `HSETNX`, so existing per-player usage history is preserved.

Before running the workflow, add `OPENAI_API_KEY` under GitHub repository Settings → Secrets and
variables → Actions. An optional Actions variable `TAHOIYA_GENERATOR_MODEL` selects the review model;
when omitted, the script uses `gpt-5.6-sol`. The generation job uses the configured paid API and may
take several hours. Gameplay does not call these external vocabulary sources. It screens batches of
10 previously unjudged words from the shared database, persists the estimated recognition rate and
exclusion flags, and classifies `0-1%` as 魔境 and `>1%-14%` as 秘境. Only the selected word receives
a generated and verified reading and correct-definition sentence; the other screening results remain
available for later rounds.

## Development

```bash
npm install
npm run dev
npm run lint
npm test
npm run build
npm run build:sdk
npm run build:runtime-packages
npm run test:sdk-package
npm run build:sdk-starter
npm run test:sdk-starter
```

## Password recovery email

Player accounts may optionally register a recovery email address. New accounts can add it during registration, and existing accounts can add or change it after confirming the current password. Password reset links expire after one hour and can be used only once.

Configure these server-side environment variables:

- `SHARED_RESEND_API_KEY` (legacy fallback: `RESEND_API_KEY`)
- `EMAIL_FROM` (optional; defaults to `Game Fields <noreply@game-fields.com>`)
- `APP_BASE_URL` (recommended; `https://game-fields.com` in production)

Verify `game-fields.com` in Resend before using the default sender. Never expose the Resend API key to the browser.
