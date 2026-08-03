import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  buildSidecar,
  buildXmpDataMiningPacket,
  embedWatermark,
  extractWatermark,
  isDataMiningPolicy,
  messageByteLength,
  parseSidecar,
  serializeSidecar,
  DATA_MINING_POLICIES,
  type AuditConfig,
} from "@openartshield/core";
import { decodeImage, embedAndAudit, encodeImage, encodeImageWithXmp } from "@openartshield/node";

// A framework-free JSON API over node:http. Images travel as base64 inside
// JSON bodies - deliberately boring: no multipart parsing, no extra
// dependencies, trivially callable from every language. Watermark operations
// are fast enough (<1s) to stay synchronous; the slow layers (cloak, GPU
// work) are out of scope for v1 and documented as such.

export const SERVER_VERSION = "0.1.0";

/** Default cap on request bodies (base64-encoded images inflate ~4/3). */
const DEFAULT_MAX_BODY_BYTES = 64 * 1024 * 1024;

type OutputFormat = "png" | "jpeg" | "webp";

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function parseFormat(value: unknown): OutputFormat {
  if (value === undefined) return "png";
  if (value === "png" || value === "jpeg" || value === "webp") return value;
  throw new HttpError(400, `"format" must be "png", "jpeg", or "webp".`);
}

function requireString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, `"${field}" (string) is required.`);
  }
  return value;
}

function requireInt(body: Record<string, unknown>, field: string): number {
  const value = body[field];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new HttpError(400, `"${field}" (integer) is required.`);
  }
  return value;
}

function optionalInt(body: Record<string, unknown>, field: string): number | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new HttpError(400, `"${field}" must be an integer.`);
  }
  return value;
}

function optionalString(body: Record<string, unknown>, field: string): string | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new HttpError(400, `"${field}" must be a string.`);
  return value;
}

async function imageFromBody(body: Record<string, unknown>): Promise<{
  image: Awaited<ReturnType<typeof decodeImage>>;
  buffer: Buffer;
}> {
  const base64 = requireString(body, "image");
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    throw new HttpError(400, `"image" must be base64-encoded image bytes.`);
  }
  if (buffer.length === 0) throw new HttpError(400, `"image" decoded to zero bytes.`);
  try {
    return { image: await decodeImage(buffer), buffer };
  } catch {
    throw new HttpError(400, "Could not decode the image (supported: png, jpeg, webp, ...).");
  }
}

type JsonHandler = (body: Record<string, unknown>) => Promise<unknown>;

// --- Handlers ---------------------------------------------------------------

const handleEmbed: JsonHandler = async (body) => {
  const { image } = await imageFromBody(body);
  const message = requireString(body, "message");
  const seed = requireInt(body, "seed");
  const strength = optionalInt(body, "strength");
  const repetitions = optionalInt(body, "repetitions");
  const format = parseFormat(body.format);
  const quality = optionalInt(body, "quality");

  const { image: protectedImage, bitsEmbedded } = embedWatermark(image, {
    message,
    seed,
    ...(strength !== undefined ? { strength } : {}),
    ...(repetitions !== undefined ? { repetitions } : {}),
  });
  const encoded = await encodeImage(
    protectedImage,
    format,
    quality !== undefined ? { quality } : {},
  );
  const sidecar = buildSidecar({
    version: SERVER_VERSION,
    seed,
    messageLength: messageByteLength(message),
    repetitions: repetitions ?? 5,
    strength: strength ?? 8,
    createdAt: new Date().toISOString(),
  });
  return { image: encoded.toString("base64"), format, bitsEmbedded, sidecar };
};

const handleExtract: JsonHandler = async (body) => {
  const { image } = await imageFromBody(body);
  const result = extractWatermark(image, {
    seed: requireInt(body, "seed"),
    messageLength: requireInt(body, "messageLength"),
    ...(optionalInt(body, "repetitions") !== undefined
      ? { repetitions: optionalInt(body, "repetitions") as number }
      : {}),
  });
  return {
    checksumValid: result.checksumValid,
    recoveredMessage: result.recoveredMessage,
  };
};

const handleVerify: JsonHandler = async (body) => {
  const { image } = await imageFromBody(body);
  if (typeof body.sidecar !== "object" || body.sidecar === null) {
    throw new HttpError(400, `"sidecar" (object) is required.`);
  }
  // parseSidecar validates the shape and fills defaults.
  const sidecar = parseSidecar(JSON.stringify(body.sidecar));
  const result = extractWatermark(image, {
    seed: sidecar.seed,
    messageLength: sidecar.messageLength,
    repetitions: sidecar.repetitions,
  });
  return {
    checksumValid: result.checksumValid,
    recoveredMessage: result.recoveredMessage,
    sidecar: JSON.parse(serializeSidecar(sidecar)),
  };
};

const handleAudit: JsonHandler = async (body) => {
  const { image } = await imageFromBody(body);
  const config: AuditConfig = {
    message: requireString(body, "message"),
    seed: requireInt(body, "seed"),
    ...(optionalInt(body, "strength") !== undefined
      ? { strength: optionalInt(body, "strength") as number }
      : {}),
    ...(optionalInt(body, "repetitions") !== undefined
      ? { repetitions: optionalInt(body, "repetitions") as number }
      : {}),
  };
  const { report } = await embedAndAudit(image, config);
  return { report };
};

const handleOptOut: JsonHandler = async (body) => {
  const { image } = await imageFromBody(body);
  const policy = optionalString(body, "policy") ?? "prohibitedAiTraining";
  if (!isDataMiningPolicy(policy)) {
    throw new HttpError(400, `"policy" must be one of: ${DATA_MINING_POLICIES.join(", ")}.`);
  }
  const creator = optionalString(body, "creator");
  const webStatement = optionalString(body, "webStatement");
  const constraint = optionalString(body, "constraint");
  const xmp = buildXmpDataMiningPacket({
    policy,
    ...(creator !== undefined ? { creatorName: creator } : {}),
    ...(webStatement !== undefined ? { webStatementUrl: webStatement } : {}),
    ...(constraint !== undefined ? { constraintInfo: constraint } : {}),
  });

  const format = parseFormat(body.format);
  const quality = optionalInt(body, "quality");
  const encoded = await encodeImageWithXmp(
    image,
    format,
    xmp,
    quality !== undefined ? { quality } : {},
  );
  return { image: encoded.toString("base64"), format, policy };
};

// --- Server -----------------------------------------------------------------

const ROUTES: Record<string, JsonHandler> = {
  "/v1/embed": handleEmbed,
  "/v1/extract": handleExtract,
  "/v1/verify": handleVerify,
  "/v1/audit": handleAudit,
  "/v1/optout": handleOptOut,
};

export type CreateAppOptions = {
  /** Max accepted request body in bytes. Default 64 MiB. */
  maxBodyBytes?: number;
};

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += (chunk as Buffer).length;
    if (total > maxBytes) throw new HttpError(413, `Request body exceeds ${maxBytes} bytes.`);
    chunks.push(chunk as Buffer);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new HttpError(400, "Request body must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

/** Create the OpenArtShield HTTP server (not yet listening). */
export function createApp(options: CreateAppOptions = {}): Server {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  return createServer(async (req, res) => {
    const url = (req.url ?? "/").split("?")[0];

    try {
      if (url === "/healthz") {
        if (req.method !== "GET") throw new HttpError(405, "Use GET.");
        sendJson(res, 200, { ok: true, version: SERVER_VERSION });
        return;
      }

      const handler = ROUTES[url];
      if (handler === undefined) {
        throw new HttpError(
          404,
          `Unknown route. Available: /healthz, ${Object.keys(ROUTES).join(", ")}.`,
        );
      }
      if (req.method !== "POST") throw new HttpError(405, "Use POST with a JSON body.");

      const body = await readBody(req, maxBodyBytes);
      const result = await handler(body);
      sendJson(res, 200, result);
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(res, error.status, { error: error.message });
      } else {
        sendJson(res, 500, { error: error instanceof Error ? error.message : "Internal error." });
      }
    }
  });
}
