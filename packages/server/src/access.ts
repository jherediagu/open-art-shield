import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

// Access control for the self-hosted server: optional API keys and an
// in-memory fixed-window rate limit. Both are off by default so `docker run`
// keeps working as a building block behind your own gateway; turn them on
// when the port is reachable by anyone you don't fully trust.
//
// Deliberately dependency-free and process-local: a single instance does not
// need Redis, and a multi-instance deployment should rate-limit at the edge.

export type RateLimit = {
  /** Requests allowed per window, per API key (or per client IP when unkeyed). */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
};

export type AccessOptions = {
  /** Accepted API keys. Empty or undefined leaves the server open. */
  apiKeys?: readonly string[];
  /** Fixed-window limit. Undefined disables rate limiting. */
  rateLimit?: RateLimit;
  /** Trust `x-forwarded-for` for the client IP (only behind a proxy you control). */
  trustProxy?: boolean;
  /** Clock override, for tests. */
  now?: () => number;
};

export type AccessDecision =
  | { allowed: true; headers: Record<string, string> }
  | { allowed: false; status: 401 | 429; error: string; headers: Record<string, string> };

export type AccessControl = {
  /** Decide whether a request may proceed. Never throws. */
  check(req: IncomingMessage): AccessDecision;
  /** True when at least one API key is configured. */
  readonly requiresKey: boolean;
};

/** Parse `"<max>/<window>"` such as `"60/1m"`, `"1000/1h"`, or `"10/30s"`. */
export function parseRateLimit(spec: string): RateLimit {
  const match = /^\s*(\d+)\s*\/\s*(\d+)\s*(ms|s|m|h)?\s*$/i.exec(spec);
  if (!match) {
    throw new Error(`Invalid rate limit "${spec}": expected "<max>/<window>", e.g. "60/1m".`);
  }
  const max = Number(match[1]);
  const amount = Number(match[2]);
  const unit = (match[3] ?? "s").toLowerCase();
  const perUnit = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[unit] ?? 1000;
  const windowMs = amount * perUnit;
  if (max <= 0 || windowMs <= 0) {
    throw new Error(`Invalid rate limit "${spec}": max and window must be positive.`);
  }
  return { max, windowMs };
}

/** Split a comma- or whitespace-separated list of keys, dropping empties. */
export function parseApiKeys(spec: string | undefined): string[] {
  if (!spec) return [];
  return spec
    .split(/[,\s]+/)
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Read the presented key from `Authorization: Bearer …` or `x-api-key`. */
export function presentedApiKey(req: IncomingMessage): string | undefined {
  const auth = req.headers.authorization;
  if (typeof auth === "string") {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (match) return match[1].trim();
  }
  const header = req.headers["x-api-key"];
  if (typeof header === "string" && header.length > 0) return header.trim();
  return undefined;
}

function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = req.headers["x-forwarded-for"];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? "unknown";
}

type Bucket = { count: number; resetAt: number };

/** Prune expired buckets once the table grows past this many subjects. */
const PRUNE_THRESHOLD = 10_000;

export function createAccessControl(options: AccessOptions = {}): AccessControl {
  const keyDigests = (options.apiKeys ?? []).map(digest);
  const requiresKey = keyDigests.length > 0;
  const limit = options.rateLimit;
  const trustProxy = options.trustProxy ?? false;
  const now = options.now ?? Date.now;
  const buckets = new Map<string, Bucket>();

  function keyIsValid(key: string): boolean {
    const presented = digest(key);
    // Compare against every configured key so timing does not reveal which
    // one (if any) matched; digests are fixed-length so lengths never leak.
    let matched = false;
    for (const known of keyDigests) {
      if (timingSafeEqual(presented, known)) matched = true;
    }
    return matched;
  }

  function prune(at: number): void {
    if (buckets.size < PRUNE_THRESHOLD) return;
    for (const [subject, bucket] of buckets) {
      if (bucket.resetAt <= at) buckets.delete(subject);
    }
  }

  function consume(subject: string, at: number): { headers: Record<string, string>; ok: boolean } {
    if (!limit) return { headers: {}, ok: true };
    prune(at);
    let bucket = buckets.get(subject);
    if (!bucket || bucket.resetAt <= at) {
      bucket = { count: 0, resetAt: at + limit.windowMs };
      buckets.set(subject, bucket);
    }
    const ok = bucket.count < limit.max;
    if (ok) bucket.count += 1;
    const remaining = Math.max(0, limit.max - bucket.count);
    const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - at) / 1000));
    const headers: Record<string, string> = {
      "ratelimit-limit": String(limit.max),
      "ratelimit-remaining": String(remaining),
      "ratelimit-reset": String(resetSeconds),
    };
    if (!ok) headers["retry-after"] = String(resetSeconds);
    return { headers, ok };
  }

  return {
    requiresKey,
    check(req) {
      const at = now();
      let subject: string;
      if (requiresKey) {
        const key = presentedApiKey(req);
        if (key === undefined) {
          return {
            allowed: false,
            status: 401,
            error: "API key required: send Authorization: Bearer <key> or x-api-key.",
            headers: { "www-authenticate": 'Bearer realm="openartshield"' },
          };
        }
        if (!keyIsValid(key)) {
          return {
            allowed: false,
            status: 401,
            error: "Invalid API key.",
            headers: { "www-authenticate": 'Bearer realm="openartshield", error="invalid_token"' },
          };
        }
        subject = `key:${digest(key).toString("hex")}`;
      } else {
        subject = `ip:${clientIp(req, trustProxy)}`;
      }

      const { headers, ok } = consume(subject, at);
      if (!ok) {
        return {
          allowed: false,
          status: 429,
          error: `Rate limit exceeded: ${limit?.max} requests per ${Math.round((limit?.windowMs ?? 0) / 1000)} s.`,
          headers,
        };
      }
      return { allowed: true, headers };
    },
  };
}
