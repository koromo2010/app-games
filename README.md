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

## Development

```bash
npm install
npm run dev
```
