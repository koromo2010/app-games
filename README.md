# App Games

Party game prototypes built with Next.js.

## Routes

- `/games` - game lobby
- `/wordwolf` - Wordwolf prototype
- `/tahoiya` - Tahoiya prototype

## Shared game LLM gateway

All games must access AI providers through `lib/game-llm.ts`. New games should not call OpenAI, Gemini, or Groq directly.

The shared provider order is:

1. Paid mode: OpenAI (`OPENAI_API_KEY`)
2. Free mode: Gemini (`GEMINI_API_KEY`)
3. Free fallback: Groq (`GROQ_API_KEY`)
4. Final fallback: local game data with a user-visible notice

Provider model IDs are centralized in `lib/llm-model.ts`.

## Shared feedback and RAG

AI output feedback is shared infrastructure for every game:

- Store and retrieve feedback through `app/api/game-feedback/route.ts` and `lib/game-feedback-store.ts`.
- Attach `GameGenerationMeta` from `lib/game-ai-types.ts` to generated game data. It records the provider, model, paid/free/local mode, prompt version, latency, and feedback examples used for that generation.
- Render per-player Good/Bad feedback with `app/components/GameFeedbackPanel.tsx`. A player can update their feedback for the same generated artifact.
- Before calling `generateGameLlmText`, retrieve relevant examples and add the result of `formatGameFeedbackContext` to the prompt.

The first retrieval implementation uses Redis indexes plus game/task/settings tags. The stored schema also keeps stable feedback IDs and generation metadata so retrieval can later move to embeddings/vector search without replacing the UI or provider gateway.

## Development

```bash
npm install
npm run dev
```
