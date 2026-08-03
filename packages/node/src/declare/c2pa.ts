import { extname } from "node:path";
import type { DeclareFormat, DeclareManifestDefinition } from "@openartshield/core";

// C2PA signing/reading for the Declare layer.
//
// 'c2pa-node' (Adobe's Node bindings over c2pa-rs) is an OPTIONAL dependency,
// exactly like 'onnxruntime-node' for the vae backend: it ships a native
// binary, so we lazy-load it and fail with an install hint. The pure manifest
// builders live in @openartshield/core; this file only turns a manifest
// definition into signed Content Credentials on a real file.
//
// Signing DX has three levels:
//   1. `signer: { kind: "test" }` - c2pa-node's bundled test certificate.
//      Instant, but every validator shows "C2PA Test Signing Cert".
//   2. A self-signed certificate from `generateDeclareKeys` (keys.ts).
//      Verifiable, carries the artist's name, but not on any trust list.
//   3. Bring-your-own cert/key from a CA for trust-list interop.

/** Minimal structural typing for the bits of c2pa-node we touch. */
type C2paManifestBuilder = object;
type C2paModule = {
  createC2pa(options?: { signer?: unknown }): {
    sign(props: {
      manifest: C2paManifestBuilder;
      asset: { path: string; mimeType?: string };
      options?: { embed?: boolean; outputPath?: string };
    }): Promise<{ signedAsset: { path: string } }>;
    read(asset: { path: string; mimeType?: string }): Promise<Record<string, unknown> | null>;
  };
  ManifestBuilder: new (
    definition: Record<string, unknown>,
    options?: { vendor?: string },
  ) => C2paManifestBuilder;
  SigningAlgorithm: Record<string, string>;
  createTestSigner(): Promise<unknown>;
};

async function loadC2pa(): Promise<C2paModule> {
  // Variable specifier so bundlers/TS don't try to resolve the optional dep.
  const specifier = "c2pa-node";
  try {
    return (await import(specifier)) as C2paModule;
  } catch {
    throw new Error(
      "The declare layer requires the optional dependency 'c2pa-node'. " +
        "Install it with: pnpm add c2pa-node",
    );
  }
}

/**
 * Default RFC 3161 timestamp authority. c2pa-node's local signer requires a
 * TSA URL; a timestamped signature also stays provable after the certificate
 * expires.
 */
export const DEFAULT_TSA_URL = "http://timestamp.digicert.com";

export type DeclareSigner =
  | { kind: "test" }
  | {
      kind: "local";
      certificatePath: string;
      privateKeyPath: string;
      /** COSE algorithm; must match the key type. Default "es256". */
      algorithm?: string;
      /** RFC 3161 timestamp authority URL. Default DEFAULT_TSA_URL. */
      tsaUrl?: string;
    };

/** Map a file path to the MIME type the Declare layer supports. */
export function declareFormatFromPath(path: string): DeclareFormat {
  const ext = extname(path).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      throw new Error(`Unsupported image extension "${ext}". Use .png, .jpg/.jpeg, or .webp.`);
  }
}

async function resolveSigner(module: C2paModule, signer: DeclareSigner): Promise<unknown> {
  if (signer.kind === "test") {
    return module.createTestSigner();
  }
  const { readFile } = await import("node:fs/promises");
  const [certificate, privateKey] = await Promise.all([
    readFile(signer.certificatePath),
    readFile(signer.privateKeyPath),
  ]);
  return {
    type: "local",
    certificate,
    privateKey,
    algorithm: signer.algorithm ?? module.SigningAlgorithm.ES256 ?? "es256",
    // The native binding requires tsaUrl to be a string for local signers.
    tsaUrl: signer.tsaUrl ?? DEFAULT_TSA_URL,
  };
}

export type SignDeclarationOptions = {
  /** Path of the image to sign. */
  input: string;
  /** Where to write the signed copy (same extension as the input). */
  output: string;
  /** Manifest definition, typically from buildDeclareManifest. */
  manifest: DeclareManifestDefinition;
  /** How to sign. */
  signer: DeclareSigner;
};

/** Sign a C2PA manifest into a copy of the image. */
export async function signDeclaration(
  options: SignDeclarationOptions,
): Promise<{ outputPath: string }> {
  // Validate both paths up front so mistakes fail before the native call.
  const mimeType = declareFormatFromPath(options.input);
  const outputMime = declareFormatFromPath(options.output);
  if (outputMime !== mimeType) {
    throw new Error(
      `Output format (${outputMime}) must match the input format (${mimeType}); ` +
        "C2PA signing does not transcode.",
    );
  }

  const module = await loadC2pa();
  const signer = await resolveSigner(module, options.signer);
  const c2pa = module.createC2pa({ signer });
  const manifest = new module.ManifestBuilder(
    options.manifest as unknown as Record<string, unknown>,
    { vendor: "openartshield" },
  );
  const { signedAsset } = await c2pa.sign({
    manifest,
    asset: { path: options.input, mimeType },
    options: { embed: true, outputPath: options.output },
  });
  return { outputPath: signedAsset.path };
}

export type DeclarationAssertion = { label: string; data: unknown };

export type DeclarationReadResult = {
  title: string | null;
  claimGenerator: string | null;
  /** Certificate issuer/holder shown by validators. */
  issuer: string | null;
  assertions: DeclarationAssertion[];
  /**
   * The parsed cawg.training-mining entries, if the manifest carries the
   * assertion. Keys are the CAWG entry keys (e.g. "cawg.ai_training").
   */
  trainingMining: Record<string, { use: string; constraint_info?: string }> | null;
  /** Raw c2pa validation status entries; empty means no problems reported. */
  validationStatus: unknown[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/**
 * Read the active C2PA manifest of an image. Returns null when the image
 * carries no Content Credentials.
 */
export async function readDeclaration(input: string): Promise<DeclarationReadResult | null> {
  const mimeType = declareFormatFromPath(input);
  const module = await loadC2pa();
  const c2pa = module.createC2pa();
  const store = asRecord(await c2pa.read({ path: input, mimeType }));
  if (store === null) return null;
  const active = asRecord(store.active_manifest);
  if (active === null) return null;

  const assertions: DeclarationAssertion[] = [];
  if (Array.isArray(active.assertions)) {
    for (const raw of active.assertions) {
      const assertion = asRecord(raw);
      if (assertion !== null && typeof assertion.label === "string") {
        assertions.push({ label: assertion.label, data: assertion.data });
      }
    }
  }

  const trainingAssertion = assertions.find((a) => a.label === "cawg.training-mining");
  const entries = asRecord(asRecord(trainingAssertion?.data)?.entries);

  const signatureInfo = asRecord(active.signature_info);
  return {
    title: typeof active.title === "string" ? active.title : null,
    claimGenerator: typeof active.claim_generator === "string" ? active.claim_generator : null,
    issuer: typeof signatureInfo?.issuer === "string" ? signatureInfo.issuer : null,
    assertions,
    trainingMining: entries as DeclarationReadResult["trainingMining"],
    validationStatus: Array.isArray(store.validation_status) ? store.validation_status : [],
  };
}
