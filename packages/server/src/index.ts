import { argv, env } from "node:process";
import { fileURLToPath } from "node:url";
import { createApp, SERVER_VERSION, type CreateAppOptions } from "./app.js";
import { parseApiKeys, parseRateLimit } from "./access.js";

export { createApp, SERVER_VERSION };
export type { CreateAppOptions };
export { createAccessControl, parseApiKeys, parseRateLimit } from "./access.js";
export type { AccessControl, AccessDecision, AccessOptions, RateLimit } from "./access.js";

function isMainModule(): boolean {
  const entry = argv[1];
  if (!entry) return false;
  try {
    return fileURLToPath(import.meta.url) === entry;
  } catch {
    return false;
  }
}

/**
 * Build server options from the environment:
 *
 * - `OAS_API_KEYS`   comma-separated accepted keys (unset = open server)
 * - `OAS_RATE_LIMIT` `"<max>/<window>"`, e.g. `"60/1m"` (unset = unlimited)
 * - `OAS_TRUST_PROXY` `"1"` to read the client IP from `x-forwarded-for`
 */
export function optionsFromEnv(source: Record<string, string | undefined> = env): CreateAppOptions {
  const apiKeys = parseApiKeys(source.OAS_API_KEYS);
  const rateLimit = source.OAS_RATE_LIMIT ? parseRateLimit(source.OAS_RATE_LIMIT) : undefined;
  const trustProxy = source.OAS_TRUST_PROXY === "1" || source.OAS_TRUST_PROXY === "true";
  return {
    ...(apiKeys.length > 0 ? { apiKeys } : {}),
    ...(rateLimit ? { rateLimit } : {}),
    ...(trustProxy ? { trustProxy } : {}),
  };
}

// `oas-server` binary / `node dist/index.js`: listen on PORT (default 8787).
if (isMainModule()) {
  const port = Number(env.PORT ?? 8787);
  const host = env.HOST ?? "0.0.0.0";
  const options = optionsFromEnv();
  const server = createApp(options);
  server.listen(port, host, () => {
    const keys = options.apiKeys ? `${options.apiKeys.length} API key(s)` : "no API keys (open)";
    const limit = options.rateLimit
      ? `${options.rateLimit.max} req / ${options.rateLimit.windowMs / 1000} s`
      : "no rate limit";
    // eslint-disable-next-line no-console
    console.log(
      `openartshield server ${SERVER_VERSION} listening on http://${host}:${port} - ${keys}, ${limit}`,
    );
  });
}
