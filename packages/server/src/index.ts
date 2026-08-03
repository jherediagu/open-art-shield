import { argv, env } from "node:process";
import { fileURLToPath } from "node:url";
import { createApp, SERVER_VERSION, type CreateAppOptions } from "./app.js";

export { createApp, SERVER_VERSION };
export type { CreateAppOptions };

function isMainModule(): boolean {
  const entry = argv[1];
  if (!entry) return false;
  try {
    return fileURLToPath(import.meta.url) === entry;
  } catch {
    return false;
  }
}

// `oas-server` binary / `node dist/index.js`: listen on PORT (default 8787).
if (isMainModule()) {
  const port = Number(env.PORT ?? 8787);
  const host = env.HOST ?? "0.0.0.0";
  const server = createApp();
  server.listen(port, host, () => {
    // eslint-disable-next-line no-console
    console.log(`openartshield server ${SERVER_VERSION} listening on http://${host}:${port}`);
  });
}
