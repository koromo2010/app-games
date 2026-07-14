import { ensureWordMasterSchema } from "../lib/word-master-schema.ts";

await ensureWordMasterSchema();
console.log("Shared word master schema is ready.");
