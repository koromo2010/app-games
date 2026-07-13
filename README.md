# App Games

Party game prototypes built with Next.js.

> AI・別スレッドで開発を再開する場合は、最初に [`docs/README.md`](./docs/README.md) の資料ナビを開いてください。必読資料、作業別の参照先、バグ調査の確認順をまとめています。

## Routes

- `/games` - game lobby
- `/users/me` - signed-in player's private stats, replay, favorites, and sharing page
- `/wordwolf` - Wordwolf prototype
- `/tahoiya` - Tahoiya prototype
- `/northern-branch` - Private-use online Northern Branch room game for logged-in players (requires `PRIVATE_GAME_ACCESS_KEY`)
- `/kotoba-de-kazu-narabe` - Private-use online room game for logged-in players (requires `PRIVATE_GAME_ACCESS_KEY`)
- `/word-sonar` - Private-use original online word deduction room game (requires `PRIVATE_GAME_ACCESS_KEY`; legacy `/kotoba-senpuku` redirects here)
- `/hodoai-talk` - Redirect to `/kotoba-de-kazu-narabe`

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

Player login is also backed by a signed, 30-day HttpOnly cookie. Configure a server-only `PLAYER_SESSION_SECRET` of at least 32 characters; a sufficiently long `LLM_SESSION_SECRET` is used only as a compatibility fallback. Multiplayer APIs derive the acting player from this cookie instead of trusting IDs in request bodies.

## Shared feedback and RAG

AI output feedback is shared infrastructure for every game:

- Store and retrieve feedback through `app/api/game-feedback/route.ts` and `lib/game-feedback-store.ts`.
- Attach `GameGenerationMeta` from `lib/game-ai-types.ts` to generated game data. It records the provider, model, personal/paid/free/local mode, prompt version, latency, and feedback examples used for that generation.
- Render per-player Good/Bad feedback with `app/components/GameFeedbackPanel.tsx`. A player can update their feedback for the same generated artifact.
- Before calling `generateGameLlmText`, retrieve relevant examples and add the result of `formatGameFeedbackContext` to the prompt.

The first retrieval implementation uses Redis indexes plus game/task/settings tags. The stored schema also keeps stable feedback IDs and generation metadata so retrieval can later move to embeddings/vector search without replacing the UI or provider gateway.

## Shared room UI

Every multiplayer game must expose the current room configuration to all participants, while only the host can change it. New games should render configuration values with `app/components/RoomConfigSummary.tsx` so clients can verify the rules before play starts and while the room is active.

Every game with a debug mode must place `app/components/DebugModeButton.tsx` in its top bar for the host. A player first verifies `DEBUG_MODE_PASSWORD` on `/users/me`; the resulting account flag controls whether debug controls are rendered and is rechecked by mutation APIs. Games do not implement password dialogs. While a debug game is active, the shared control can abort it back to the same room's pre-game state without removing participants.

Room configuration defaults are stored per game and per player in Redis, with local storage as an offline fallback. New games should use `lib/game-room-defaults-client.ts` for loading and saving, and add their server-side normalizer to `lib/room-defaults-store.ts`.

Multiplayer games should use the shared time-limit presets, manual seconds input, and normalizer in `lib/game-room-config.ts` and `app/components/RoomTimeLimitControl.tsx`. A time limit of `0` always means no limit; game-specific phase behavior may decide how partial submissions are handled when time expires.

Tahoiya gameplay mutations are revisioned server actions. The server rejects stale phase rollback, reapplies concurrent submissions with compare-and-set, and decides completion or timeout transitions without depending on the host browser.

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
take several hours. Gameplay itself does not call these external vocabulary sources or the review LLM.

## Development

```bash
npm install
npm run dev
npm run lint
npm test
npm run build
```

## Password recovery email

Player accounts may optionally register a recovery email address. New accounts can add it during registration, and existing accounts can add or change it after confirming the current password. Password reset links expire after one hour and can be used only once.

Configure these server-side environment variables:

- `RESEND_API_KEY`
- `EMAIL_FROM` (optional; defaults to `Game Fields <noreply@game-fields.com>`)
- `APP_BASE_URL` (recommended; `https://game-fields.com` in production)

Verify `game-fields.com` in Resend before using the default sender. Never expose the Resend API key to the browser.
