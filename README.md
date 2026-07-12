# App Games

Party game prototypes built with Next.js.

> AI・別スレッドで開発を再開する場合は、最初に [`AGENTS.md`](./AGENTS.md) と [`docs/DEVELOPMENT_HANDOFF.md`](./docs/DEVELOPMENT_HANDOFF.md) を読んでください。現在の仕様、共通設計、主要ファイル、検証・デプロイ手順をまとめています。

## Routes

- `/games` - game lobby
- `/wordwolf` - Wordwolf prototype
- `/tahoiya` - Tahoiya prototype
- `/northern-branch` - Private-use Northern Branch outline prototype (requires `PRIVATE_GAME_ACCESS_KEY`)

## Private game access

Set the server-side environment variable `PRIVATE_GAME_ACCESS_KEY`. Entering the same value in the unlabeled access field on the game lobby reveals private-use game cards and issues a 30-day HttpOnly access cookie.

## Shared game LLM gateway

All games must access AI providers through `lib/game-llm.ts`. New games should not call OpenAI, Gemini, or Groq directly.

The shared provider order is:

1. Personal mode first attempt: the provider selected by the player (OpenAI, Gemini, or Groq)
2. Game Fields paid mode: OpenAI using the app's `OPENAI_API_KEY`
3. Provider fallback: Gemini (`GEMINI_API_KEY`) and Groq (`GROQ_API_KEY`)
4. Final fallback: local game data with a user-visible notice

Provider model IDs are centralized in `lib/llm-model.ts`.

Provider failover runs only inside the shared gateway. Game routes must not repeat the provider chain. Topic generation is cached per room and round so duplicate clicks or tabs reuse the same result instead of spending another LLM request.

Quality-critical tasks may pass `quality: "high"` to the shared gateway. Tahoiya topic generation uses high reasoning to create three candidates, then prefers a different provider for independent review and records both the generating and reviewing providers in `GameGenerationMeta`.

## Paid API access

The shared access panel separates personal provider access from Game Fields-provided paid access:

- Personal API: the player selects OpenAI, Google Gemini, or Groq and supplies a key issued by that provider. Billing and free-tier limits belong to the selected provider.
- Game Fields API: the app uses its own `OPENAI_API_KEY`. It currently uses an invite/test password and is designed so that authorization can later be replaced by a purchase or credit entitlement.

Personal keys are validated server-side against the active provider model, never stored in Redis, player accounts, logs, or localStorage, and are retained for at most eight hours in an AES-256-GCM encrypted HttpOnly cookie. A server-only `LLM_SESSION_SECRET` of at least 32 characters is recommended; until it is configured, the existing server-only access password and shared OpenAI key are combined to derive the encryption secret. Players should create a game-specific key with permissions and spend controls where the provider supports them.

## Shared feedback and RAG

AI output feedback is shared infrastructure for every game:

- Store and retrieve feedback through `app/api/game-feedback/route.ts` and `lib/game-feedback-store.ts`.
- Attach `GameGenerationMeta` from `lib/game-ai-types.ts` to generated game data. It records the provider, model, personal/paid/free/local mode, prompt version, latency, and feedback examples used for that generation.
- Render per-player Good/Bad feedback with `app/components/GameFeedbackPanel.tsx`. A player can update their feedback for the same generated artifact.
- Before calling `generateGameLlmText`, retrieve relevant examples and add the result of `formatGameFeedbackContext` to the prompt.

The first retrieval implementation uses Redis indexes plus game/task/settings tags. The stored schema also keeps stable feedback IDs and generation metadata so retrieval can later move to embeddings/vector search without replacing the UI or provider gateway.

## Shared room UI

Every multiplayer game must expose the current room configuration to all participants, while only the host can change it. New games should render configuration values with `app/components/RoomConfigSummary.tsx` so clients can verify the rules before play starts and while the room is active.

Every game with a debug mode must place `app/components/DebugModeButton.tsx` in its top bar for the host. The shared component verifies `DEBUG_MODE_PASSWORD` through `app/api/debug-auth/route.ts`; do not implement a game-specific password dialog or expose the password to the browser bundle.

Room configuration defaults are stored per game and per player in Redis, with local storage as an offline fallback. New games should use `lib/game-room-defaults-client.ts` for loading and saving, and add their server-side normalizer to `lib/room-defaults-store.ts`.

Multiplayer games should use the shared time-limit presets, manual seconds input, and normalizer in `lib/game-room-config.ts` and `app/components/RoomTimeLimitControl.tsx`. A time limit of `0` always means no limit; game-specific phase behavior may decide how partial submissions are handled when time expires.

Tahoiya gameplay mutations are revisioned server actions. The server rejects stale phase rollback, reapplies concurrent submissions with compare-and-set, and decides completion or timeout transitions without depending on the host browser.

## Development

```bash
npm install
npm run dev
```

## Password recovery email

Player accounts may optionally register a recovery email address. New accounts can add it during registration, and existing accounts can add or change it after confirming the current password. Password reset links expire after one hour and can be used only once.

Configure these server-side environment variables:

- `RESEND_API_KEY`
- `EMAIL_FROM` (optional; defaults to `Game Fields <noreply@game-fields.com>`)
- `APP_BASE_URL` (recommended; `https://game-fields.com` in production)

Verify `game-fields.com` in Resend before using the default sender. Never expose the Resend API key to the browser.
