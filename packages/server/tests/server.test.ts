import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encodeImage } from "@openartshield/node";
import type { PixelImage } from "@openartshield/core";
import { createApp } from "../src/app.js";

// Integration tests over a real HTTP server on an ephemeral port.

function makeTexturedImage(width: number, height: number): PixelImage {
  let state = 1234567 >>> 0;
  const rand = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const data = new Uint8ClampedArray(width * height * 3);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.floor(((i / 3) % 200) * 0.8 + rand() * 50);
  }
  return { width, height, channels: 3, data };
}

const server = createApp({ maxBodyBytes: 8 * 1024 * 1024 });
let baseUrl: string;
let imageBase64: string;

const message = "artist=demo";
const seed = 123;

async function post(path: string, body: unknown): Promise<{ status: number; json: never }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: (await response.json()) as never };
}

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  imageBase64 = (await encodeImage(makeTexturedImage(256, 256), "png")).toString("base64");
});

afterAll(async () => {
  // Drop keep-alive connections from fetch so close() doesn't hang.
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

describe("GET /healthz", () => {
  it("responds ok", async () => {
    const response = await fetch(`${baseUrl}/healthz`);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { ok: boolean; version: string };
    expect(json.ok).toBe(true);
    expect(json.version).toBeTruthy();
  });
});

describe("POST /v1/embed + /v1/extract", () => {
  it("round-trips a watermark through the API", async () => {
    const embed = await post("/v1/embed", {
      image: imageBase64,
      message,
      seed,
      strength: 16,
    });
    expect(embed.status).toBe(200);
    const embedJson = embed.json as {
      image: string;
      bitsEmbedded: number;
      sidecar: { seed: number; messageLength: number };
    };
    expect(embedJson.bitsEmbedded).toBeGreaterThan(0);
    expect(embedJson.sidecar.seed).toBe(seed);

    const extract = await post("/v1/extract", {
      image: embedJson.image,
      seed,
      messageLength: embedJson.sidecar.messageLength,
    });
    expect(extract.status).toBe(200);
    const extractJson = extract.json as { checksumValid: boolean; recoveredMessage: string };
    expect(extractJson.checksumValid).toBe(true);
    expect(extractJson.recoveredMessage).toBe(message);
  });

  it("verifies with the sidecar from embed", async () => {
    const embed = await post("/v1/embed", { image: imageBase64, message, seed, strength: 16 });
    const { image, sidecar } = embed.json as { image: string; sidecar: unknown };
    const verify = await post("/v1/verify", { image, sidecar });
    expect(verify.status).toBe(200);
    const json = verify.json as { checksumValid: boolean; recoveredMessage: string };
    expect(json.checksumValid).toBe(true);
    expect(json.recoveredMessage).toBe(message);
  });

  it("rejects missing fields with 400", async () => {
    const response = await post("/v1/embed", { image: imageBase64 });
    expect(response.status).toBe(400);
    expect((response.json as { error: string }).error).toContain("message");
  });

  it("rejects undecodable images with 400", async () => {
    const response = await post("/v1/embed", {
      image: Buffer.from("not an image").toString("base64"),
      message,
      seed,
    });
    expect(response.status).toBe(400);
  });
});

describe("POST /v1/audit", () => {
  it("returns a full audit report", async () => {
    const response = await post("/v1/audit", { image: imageBase64, message, seed, strength: 16 });
    expect(response.status).toBe(200);
    const { report } = response.json as {
      report: { results: unknown[]; summary: Record<string, unknown> };
    };
    expect(report.results.length).toBeGreaterThan(0);
    expect(report.summary).toBeTruthy();
  });
});

describe("POST /v1/optout", () => {
  it("returns an image carrying the XMP opt-out", async () => {
    const response = await post("/v1/optout", {
      image: imageBase64,
      creator: "Demo Artist",
      format: "png",
    });
    expect(response.status).toBe(200);
    const json = response.json as { image: string; policy: string };
    expect(json.policy).toBe("prohibitedAiTraining");

    // PNG stores XMP in an uncompressed iTXt chunk, so the packet is
    // findable in the raw bytes - no image library needed here.
    const bytes = Buffer.from(json.image, "base64").toString("latin1");
    expect(bytes).toContain("DMI-PROHIBITED-AIMLTRAINING");
    expect(bytes).toContain("Demo Artist");
  });

  it("rejects unknown policies", async () => {
    const response = await post("/v1/optout", { image: imageBase64, policy: "nope" });
    expect(response.status).toBe(400);
  });
});

describe("routing", () => {
  it("404s unknown routes and 405s wrong methods", async () => {
    const notFound = await post("/v1/nope", {});
    expect(notFound.status).toBe(404);

    const wrongMethod = await fetch(`${baseUrl}/v1/embed`);
    expect(wrongMethod.status).toBe(405);
  });

  it("413s oversized bodies", async () => {
    const big = "a".repeat(9 * 1024 * 1024);
    const response = await post("/v1/embed", { image: big, message, seed });
    expect(response.status).toBe(413);
  });
});
