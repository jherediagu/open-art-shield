import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { optionsFromEnv } from "../src/index.js";
import { parseApiKeys, parseRateLimit } from "../src/access.js";

// API keys and rate limiting over a real HTTP server on an ephemeral port.
// The clock is injected so window expiry is tested without sleeping.

const servers: Server[] = [];

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

// A body that fails validation early (400) so tests never touch image codecs;
// access control runs before the handler, which is what we are checking.
const probeBody = JSON.stringify({});

async function probe(baseUrl: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${baseUrl}/v1/embed`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: probeBody,
  });
}

describe("API keys", () => {
  it("stays open when no keys are configured", async () => {
    const baseUrl = await listen(createApp());
    const response = await probe(baseUrl);
    expect(response.status).toBe(400);
  });

  it("401s missing and wrong keys, accepts bearer and x-api-key", async () => {
    const baseUrl = await listen(createApp({ apiKeys: ["k-one", "k-two"] }));

    const missing = await probe(baseUrl);
    expect(missing.status).toBe(401);
    expect(missing.headers.get("www-authenticate")).toContain("Bearer");
    expect(((await missing.json()) as { error: string }).error).toContain("API key required");

    const wrong = await probe(baseUrl, { authorization: "Bearer nope" });
    expect(wrong.status).toBe(401);
    expect(((await wrong.json()) as { error: string }).error).toBe("Invalid API key.");

    // A prefix of a valid key must not pass.
    const prefix = await probe(baseUrl, { "x-api-key": "k-on" });
    expect(prefix.status).toBe(401);

    const bearer = await probe(baseUrl, { authorization: "Bearer k-two" });
    expect(bearer.status).toBe(400);

    const header = await probe(baseUrl, { "x-api-key": "k-one" });
    expect(header.status).toBe(400);
  });

  it("never gates /healthz", async () => {
    const baseUrl = await listen(createApp({ apiKeys: ["k"] }));
    const response = await fetch(`${baseUrl}/healthz`);
    expect(response.status).toBe(200);
  });
});

describe("rate limit", () => {
  it("429s past the window max and recovers after reset", async () => {
    let clock = 1_000_000;
    const baseUrl = await listen(
      createApp({ rateLimit: { max: 2, windowMs: 10_000 }, now: () => clock }),
    );

    const first = await probe(baseUrl);
    expect(first.status).toBe(400);
    expect(first.headers.get("ratelimit-limit")).toBe("2");
    expect(first.headers.get("ratelimit-remaining")).toBe("1");

    const second = await probe(baseUrl);
    expect(second.status).toBe(400);
    expect(second.headers.get("ratelimit-remaining")).toBe("0");

    const third = await probe(baseUrl);
    expect(third.status).toBe(429);
    expect(third.headers.get("retry-after")).toBe("10");
    expect(((await third.json()) as { error: string }).error).toContain("Rate limit exceeded");

    clock += 10_001;
    const afterReset = await probe(baseUrl);
    expect(afterReset.status).toBe(400);
    expect(afterReset.headers.get("ratelimit-remaining")).toBe("1");
  });

  it("meters per API key, not globally", async () => {
    const baseUrl = await listen(
      createApp({ apiKeys: ["a", "b"], rateLimit: { max: 1, windowMs: 60_000 } }),
    );
    expect((await probe(baseUrl, { "x-api-key": "a" })).status).toBe(400);
    expect((await probe(baseUrl, { "x-api-key": "a" })).status).toBe(429);
    expect((await probe(baseUrl, { "x-api-key": "b" })).status).toBe(400);
  });

  it("keys unauthenticated clients by forwarded IP only when trustProxy is set", async () => {
    const trusting = await listen(
      createApp({ rateLimit: { max: 1, windowMs: 60_000 }, trustProxy: true }),
    );
    expect((await probe(trusting, { "x-forwarded-for": "10.0.0.1" })).status).toBe(400);
    expect((await probe(trusting, { "x-forwarded-for": "10.0.0.1" })).status).toBe(429);
    expect((await probe(trusting, { "x-forwarded-for": "10.0.0.2" })).status).toBe(400);

    const ignoring = await listen(createApp({ rateLimit: { max: 1, windowMs: 60_000 } }));
    expect((await probe(ignoring, { "x-forwarded-for": "10.0.0.1" })).status).toBe(400);
    expect((await probe(ignoring, { "x-forwarded-for": "10.0.0.2" })).status).toBe(429);
  });
});

describe("configuration parsing", () => {
  it("parses rate limit specs", () => {
    expect(parseRateLimit("60/1m")).toEqual({ max: 60, windowMs: 60_000 });
    expect(parseRateLimit("10/30s")).toEqual({ max: 10, windowMs: 30_000 });
    expect(parseRateLimit("1000/1h")).toEqual({ max: 1000, windowMs: 3_600_000 });
    expect(parseRateLimit("5/500ms")).toEqual({ max: 5, windowMs: 500 });
    expect(parseRateLimit("7/2")).toEqual({ max: 7, windowMs: 2000 });
    expect(() => parseRateLimit("lots")).toThrow(/Invalid rate limit/);
    expect(() => parseRateLimit("0/1m")).toThrow(/positive/);
  });

  it("parses key lists", () => {
    expect(parseApiKeys(undefined)).toEqual([]);
    expect(parseApiKeys("")).toEqual([]);
    expect(parseApiKeys("a, b,,c ")).toEqual(["a", "b", "c"]);
  });

  it("builds options from the environment", () => {
    expect(optionsFromEnv({})).toEqual({});
    expect(
      optionsFromEnv({ OAS_API_KEYS: "x,y", OAS_RATE_LIMIT: "60/1m", OAS_TRUST_PROXY: "1" }),
    ).toEqual({
      apiKeys: ["x", "y"],
      rateLimit: { max: 60, windowMs: 60_000 },
      trustProxy: true,
    });
  });
});
