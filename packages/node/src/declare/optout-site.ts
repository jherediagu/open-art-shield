import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildAiTxt,
  buildTdmRepJson,
  type AiTxtMediaCategory,
  type BuildTdmRepParams,
} from "@openartshield/core";

// Site-level opt-out artifacts: /.well-known/tdmrep.json (W3C TDMRep) and
// ai.txt (Spawning). The pure builders live in core; this writes them into a
// site root (e.g. a static site's public/ directory).

export type WriteSiteOptOutOptions = {
  /** Site root directory to write into (e.g. "public"). Created if missing. */
  dir: string;
  /** Optional TDM policy URL recorded in tdmrep.json. */
  policyUrl?: string;
  /** ai.txt categories to disallow. Default: all (deny all). */
  disallow?: AiTxtMediaCategory[];
};

export type WriteSiteOptOutResult = {
  tdmRepPath: string;
  aiTxtPath: string;
};

/** Write tdmrep.json and ai.txt into a site directory. */
export async function writeSiteOptOut(
  options: WriteSiteOptOutOptions,
): Promise<WriteSiteOptOutResult> {
  const wellKnownDir = join(options.dir, ".well-known");
  await mkdir(wellKnownDir, { recursive: true });

  const tdmRepPath = join(wellKnownDir, "tdmrep.json");
  const tdmParams: BuildTdmRepParams = {};
  if (options.policyUrl !== undefined) tdmParams.policyUrl = options.policyUrl;
  await writeFile(tdmRepPath, buildTdmRepJson(tdmParams), "utf8");

  const aiTxtPath = join(options.dir, "ai.txt");
  await writeFile(
    aiTxtPath,
    buildAiTxt(options.disallow !== undefined ? { disallow: options.disallow } : {}),
    "utf8",
  );

  return { tdmRepPath, aiTxtPath };
}
