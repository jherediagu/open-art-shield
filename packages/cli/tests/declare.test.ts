import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readImageXmp, writeImage } from "@openartshield/node";
import { runDeclare } from "../src/commands/declare.js";
import { runOptOut } from "../src/commands/optout.js";
import { runOptOutSite } from "../src/commands/optout-site.js";
import { buildCli } from "../src/index.js";
import { CliError } from "../src/utils/errors.js";
import { createSyntheticImage } from "./helpers.js";

let dir: string;
let inputPath: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "oas-declare-cli-"));
  inputPath = join(dir, "input.png");
  await writeImage(createSyntheticImage(64, 64, 3), inputPath);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("oas declare", () => {
  it("requires a signer", async () => {
    await expect(runDeclare({ input: inputPath, out: join(dir, "signed.png") })).rejects.toThrow(
      /signer is required/i,
    );
  });

  it("rejects --test-signer combined with --cert/--key", async () => {
    await expect(
      runDeclare({
        input: inputPath,
        out: join(dir, "signed.png"),
        testSigner: true,
        cert: "cert.pem",
        key: "key.pem",
      }),
    ).rejects.toThrow(/not both/);
  });

  it("rejects --cert without --key", async () => {
    await expect(
      runDeclare({ input: inputPath, out: join(dir, "signed.png"), cert: "cert.pem" }),
    ).rejects.toThrow(/passed together/);
  });

  it("rejects invalid policy values", async () => {
    await expect(
      runDeclare({
        input: inputPath,
        out: join(dir, "signed.png"),
        testSigner: true,
        aiTraining: "forbidden",
      }),
    ).rejects.toThrow(/--ai-training must be one of/);
  });

  it("requires --constraint for constrained policies", async () => {
    await expect(
      runDeclare({
        input: inputPath,
        out: join(dir, "signed.png"),
        testSigner: true,
        dataMining: "constrained",
      }),
    ).rejects.toThrow(/--constraint/);
  });

  // 'c2pa-node' is an optional dependency, not installed in this repo. The
  // full signing round-trip is exercised manually; here we pin the hint.
  it("fails with an install hint when 'c2pa-node' is absent", async () => {
    await expect(
      runDeclare({ input: inputPath, out: join(dir, "signed.png"), testSigner: true }),
    ).rejects.toThrow(/c2pa-node/);
  });
});

describe("oas optout", () => {
  it("writes a copy with the plus:DataMining XMP packet", async () => {
    const out = join(dir, "optout.png");
    const result = await runOptOut({
      input: inputPath,
      out,
      creator: "Demo Artist",
      webStatement: "https://example.com/rights",
    });
    expect(result.outPath).toBe(out);
    expect(result.policyUri).toContain("DMI-PROHIBITED-AIMLTRAINING");

    const xmp = await readImageXmp(out);
    expect(xmp).not.toBeNull();
    expect(xmp).toContain("DMI-PROHIBITED-AIMLTRAINING");
    expect(xmp).toContain("Demo Artist");
    expect(xmp).toContain("https://example.com/rights");
  });

  it("supports the full policy vocabulary", async () => {
    const result = await runOptOut({
      input: inputPath,
      out: join(dir, "optout-genai.png"),
      policy: "prohibited-genai-training",
    });
    expect(result.policyUri).toContain("DMI-PROHIBITED-GENAIMLTRAINING");
  });

  it("rejects unknown policies", async () => {
    await expect(
      runOptOut({ input: inputPath, out: join(dir, "x.png"), policy: "no-scraping" }),
    ).rejects.toThrow(CliError);
  });
});

describe("oas optout-site", () => {
  it("writes tdmrep.json and ai.txt", async () => {
    const site = join(dir, "site");
    const result = await runOptOutSite({ dir: site, policyUrl: "https://example.com/policy" });

    const tdmRep = JSON.parse(await readFile(result.tdmRepPath, "utf8"));
    expect(tdmRep[0]["tdm-reservation"]).toBe(1);
    const aiTxt = await readFile(result.aiTxtPath, "utf8");
    expect(aiTxt).toContain("Disallow: /*.jpg$");
  });

  it("limits ai.txt to the requested categories", async () => {
    const site = join(dir, "site-images");
    const result = await runOptOutSite({ dir: site, disallow: ["images"] });
    const aiTxt = await readFile(result.aiTxtPath, "utf8");
    expect(aiTxt).toContain("Disallow: /*.png$");
    expect(aiTxt).not.toContain("Disallow: /*.mp3$");
  });

  it("rejects unknown categories", async () => {
    await expect(runOptOutSite({ dir: join(dir, "x"), disallow: ["fonts"] })).rejects.toThrow(
      /--disallow must be one of/,
    );
  });
});

describe("cli wiring", () => {
  it("registers the declare and optout commands", () => {
    const cli = buildCli();
    const names = cli.commands.map((c) => c.name);
    for (const name of [
      "declare",
      "declare-read",
      "declare-keys",
      "declare-durable",
      "recover",
      "trustmark",
      "trustmark-decode",
      "optout",
      "optout-site",
    ]) {
      expect(names).toContain(name);
    }
  });
});
