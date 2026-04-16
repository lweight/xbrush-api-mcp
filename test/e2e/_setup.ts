/**
 * E2E setup: load .env into process.env before describe.runIf evaluates.
 * Scans the project root; no dependency on dotenv so dev setup stays zero-dep.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const eqIdx = line.indexOf("=");
    const name = line.substring(0, eqIdx).trim();
    let value = line.substring(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[name] = value;
  }
  return out;
}

try {
  const content = readFileSync(resolve(process.cwd(), ".env"), "utf-8");
  for (const [k, v] of Object.entries(parseEnvFile(content))) {
    if (!process.env[k]) process.env[k] = v;
  }
} catch {
  // no .env present — tests will skip the auth-dependent suites
}
