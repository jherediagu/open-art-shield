import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDeclareManifest, buildXmpDataMiningPacket } from "@openartshield/core";
import {
  declareFormatFromPath,
  generateDeclareKeys,
  readDeclaration,
  readImageXmp,
  signDeclaration,
  writeImage,
  writeImageWithXmp,
  writeSiteOptOut,
} from "../src/index.js";
import { createSyntheticImage } from "./helpers.js";

const execFileAsync = promisify(execFile);

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "oas-declare-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("declareFormatFromPath", () => {
  it("maps supported extensions to MIME types", () => {
    expect(declareFormatFromPath("a.png")).toBe("image/png");
    expect(declareFormatFromPath("a.jpg")).toBe("image/jpeg");
    expect(declareFormatFromPath("a.JPEG")).toBe("image/jpeg");
    expect(declareFormatFromPath("a.webp")).toBe("image/webp");
  });

  it("rejects unsupported extensions", () => {
    expect(() => declareFormatFromPath("a.gif")).toThrow(/Unsupported image extension/);
  });
});

// 'c2pa-node' is an optional dependency, intentionally NOT installed in this
// repo (native binary; CI stays lean). These tests pin down the error message
// users see without it; the signing/reading integration is exercised manually
// against a scratch install.
describe("c2pa signing (optional dependency)", () => {
  const manifest = buildDeclareManifest({
    title: "x.png",
    format: "image/png",
    claimGenerator: "openartshield-test/0.0.0",
  });

  it("rejects mismatched input/output formats before touching c2pa", async () => {
    await expect(
      signDeclaration({
        input: "in.png",
        output: "out.jpg",
        manifest,
        signer: { kind: "test" },
      }),
    ).rejects.toThrow(/must match the input format/);
  });

  it("fails with an install hint when 'c2pa-node' is absent", async () => {
    await expect(
      signDeclaration({
        input: "in.png",
        output: "out.png",
        manifest,
        signer: { kind: "test" },
      }),
    ).rejects.toThrow(/c2pa-node/);
    await expect(readDeclaration("in.png")).rejects.toThrow(/c2pa-node/);
  });
});

describe("XMP opt-out embedding", () => {
  it("round-trips the plus:DataMining packet through png, jpeg, and webp", async () => {
    const input = join(dir, "source.png");
    await writeImage(createSyntheticImage(64, 64, 3), input);
    const packet = buildXmpDataMiningPacket({
      policy: "prohibitedAiTraining",
      creatorName: "Test Artist",
    });

    for (const ext of ["png", "jpg", "webp"] as const) {
      const output = join(dir, `optout.${ext}`);
      await writeImageWithXmp(input, output, packet);
      const xmp = await readImageXmp(output);
      expect(xmp, ext).not.toBeNull();
      expect(xmp, ext).toContain("DMI-PROHIBITED-AIMLTRAINING");
      expect(xmp, ext).toContain("Test Artist");
    }
  });

  it("returns null for images without XMP", async () => {
    const plain = join(dir, "plain.png");
    await writeImage(createSyntheticImage(32, 32, 3), plain);
    expect(await readImageXmp(plain)).toBeNull();
  });

  it("rejects unsupported output extensions", async () => {
    const input = join(dir, "source2.png");
    await writeImage(createSyntheticImage(16, 16, 3), input);
    await expect(writeImageWithXmp(input, join(dir, "out.gif"), "<x/>")).rejects.toThrow(
      /Unsupported output extension/,
    );
  });
});

describe("writeSiteOptOut", () => {
  it("writes tdmrep.json and ai.txt into the site root", async () => {
    const site = join(dir, "site");
    const result = await writeSiteOptOut({
      dir: site,
      policyUrl: "https://example.com/tdm-policy",
    });
    expect(result.tdmRepPath).toBe(join(site, ".well-known", "tdmrep.json"));
    expect(result.aiTxtPath).toBe(join(site, "ai.txt"));

    const tdmRep = JSON.parse(await readFile(result.tdmRepPath, "utf8"));
    expect(tdmRep[0]["tdm-reservation"]).toBe(1);
    expect(tdmRep[0]["tdm-policy"]).toBe("https://example.com/tdm-policy");

    const aiTxt = await readFile(result.aiTxtPath, "utf8");
    expect(aiTxt).toContain("Disallow: /*.png$");
  });
});

// openssl ships with macOS/Linux and the CI images; skip cleanly elsewhere.
async function opensslAvailable(): Promise<boolean> {
  try {
    await execFileAsync("openssl", ["version"]);
    return true;
  } catch {
    return false;
  }
}

describe("generateDeclareKeys", async () => {
  const hasOpenssl = await opensslAvailable();

  it.skipIf(!hasOpenssl)("generates a self-signed ES256 certificate and key", async () => {
    const outDir = join(dir, "keys");
    const { certificatePath, privateKeyPath } = await generateDeclareKeys({
      outDir,
      name: "Test/Artist",
      days: 30,
    });
    const cert = await readFile(certificatePath, "utf8");
    const key = await readFile(privateKeyPath, "utf8");
    expect(cert).toContain("BEGIN CERTIFICATE");
    expect(key).toContain("BEGIN PRIVATE KEY");

    // The certificate must satisfy the C2PA profile bits we request.
    const { stdout } = await execFileAsync("openssl", [
      "x509",
      "-in",
      certificatePath,
      "-noout",
      "-text",
    ]);
    expect(stdout).toContain("Digital Signature");
    expect(stdout).toContain("E-mail Protection");
    expect(stdout).toContain("CA:FALSE");
    // The "/" in the name must not have leaked into the subject fields.
    // (LibreSSL prints "O=...", OpenSSL 3 prints "O = ..." - accept both.)
    expect(stdout).toMatch(/O ?= ?Test Artist/);
  });

  it("validates its inputs", async () => {
    await expect(generateDeclareKeys({ outDir: dir, name: "" })).rejects.toThrow(/name/);
    await expect(generateDeclareKeys({ outDir: dir, name: "X", days: 0 })).rejects.toThrow(
      /positive number of days/,
    );
  });
});
