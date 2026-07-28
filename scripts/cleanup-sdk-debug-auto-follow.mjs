import fs from "node:fs";

const framePath = "app/components/GameSdkFrame.tsx";
let frame = fs.readFileSync(framePath, "utf8");

const malformed = `    if (!target) {      return;\n    }    selectDebugTarget(target, "auto-follow");`;
const formatted = `    if (!target) return;\n    selectDebugTarget(target, "auto-follow");`;

if (!frame.includes(malformed) && !frame.includes(formatted)) {
  throw new Error("SDK DEBUG auto-follow effect not found");
}

frame = frame.replace(malformed, formatted);
fs.writeFileSync(framePath, frame);

// Re-run against the latest develop head.
