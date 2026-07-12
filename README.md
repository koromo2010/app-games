# App Games

Party game prototypes built with Next.js.

## Routes

- `/games` - game lobby
- `/wordwolf` - Wordwolf prototype
- `/tahoiya` - Tahoiya prototype

## Shared game LLM gateway

All games must access AI providers through `lib/game-llm.ts`. New games should not call OpenAI, Gemini, or Groq directly.

The shared provider order is:

1. Paid mode first attempt: OpenAI (`OPENAI_API_KEY`)
2. If OpenAI fails or its structured output is rejected: Gemini (`GEMINI_API_KEY`)
3. Free fallback: Groq (`GROQ_API_KEY`)
4. Final fallback: local game data with a user-visible notice

Provider model IDs are centralized in `lib/llm-model.ts`.

Provider failover runs only inside the shared gateway. Game routes must not repeat the provider chain. Topic generation is cached per room and round so duplicate clicks or tabs reuse the same result instead of spending another LLM request.

## Shared feedback and RAG

AI output feedback is shared infrastructure for every game:

- Store and retrieve feedback through `app/api/game-feedback/route.ts` and `lib/game-feedback-store.ts`.
- Attach `GameGenerationMeta` from `lib/game-ai-types.ts` to generated game data. It records the provider, model, paid/free/local mode, prompt version, latency, and feedback examples used for that generation.
- Render per-player Good/Bad feedback with `app/components/GameFeedbackPanel.tsx`. A player can update their feedback for the same generated artifact.
- Before calling `generateGameLlmText`, retrieve relevant examples and add the result of `formatGameFeedbackContext` to the prompt.

The first retrieval implementation uses Redis indexes plus game/task/settings tags. The stored schema also keeps stable feedback IDs and generation metadata so retrieval can later move to embeddings/vector search without replacing the UI or provider gateway.

## Shared room UI

Every multiplayer game must expose the current room configuration to all participants, while only the host can change it. New games should render configuration values with `app/components/RoomConfigSummary.tsx` so clients can verify the rules before play starts and while the room is active.

Room configuration defaults are stored per game and per player in Redis, with local storage as an offline fallback. New games should use `lib/game-room-defaults-client.ts` for loading and saving, and add their server-side normalizer to `lib/room-defaults-store.ts`.

Multiplayer games should use the shared time-limit options and normalizer in `lib/game-room-config.ts`. A time limit of `0` always means no limit; game-specific phase behavior may decide how partial submissions are handled when time expires.

Tahoiya gameplay mutations are revisioned server actions. The server rejects stale phase rollback, reapplies concurrent submissions with compare-and-set, and decides completion or timeout transitions without depending on the host browser.

## Development

```bash
npm install
npm run dev
```
