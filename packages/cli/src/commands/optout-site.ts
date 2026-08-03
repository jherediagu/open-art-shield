import {
  AI_CRAWLER_ROBOTS_SNIPPET,
  AI_TXT_MEDIA_EXTENSIONS,
  TDM_RESERVATION_HEADER,
  type AiTxtMediaCategory,
} from "@openartshield/core";
import { writeSiteOptOut, type WriteSiteOptOutResult } from "@openartshield/node";
import { CliError } from "../utils/errors.js";
import { info, raw, success } from "../utils/output.js";

export type OptOutSiteOptions = {
  /** Site root directory (e.g. "public"). */
  dir: string;
  /** Optional TDM policy URL recorded in tdmrep.json. */
  policyUrl?: string;
  /** ai.txt categories to disallow (repeatable). Default: all. */
  disallow?: string[];
};

export async function runOptOutSite(options: OptOutSiteOptions): Promise<WriteSiteOptOutResult> {
  let disallow: AiTxtMediaCategory[] | undefined;
  if (options.disallow !== undefined) {
    for (const category of options.disallow) {
      if (!(category in AI_TXT_MEDIA_EXTENSIONS)) {
        throw new CliError(
          `--disallow must be one of ${Object.keys(AI_TXT_MEDIA_EXTENSIONS).join(", ")}, received "${category}".`,
        );
      }
    }
    disallow = options.disallow as AiTxtMediaCategory[];
  }

  return writeSiteOptOut({
    dir: options.dir,
    ...(options.policyUrl !== undefined ? { policyUrl: options.policyUrl } : {}),
    ...(disallow !== undefined ? { disallow } : {}),
  });
}

export async function optOutSiteCommand(options: OptOutSiteOptions): Promise<void> {
  const result = await runOptOutSite(options);

  info("OpenArtShield optout-site");
  info("");
  success(`TDMRep reservation written to ${result.tdmRepPath}`);
  success(`ai.txt written to ${result.aiTxtPath}`);
  info("");
  info("To complete the site-level opt-out:");
  info(`1. Serve every response with the header: ${TDM_RESERVATION_HEADER}`);
  info("2. Add the AI crawlers to your robots.txt (we never overwrite it):");
  raw(AI_CRAWLER_ROBOTS_SNIPPET);
  info("");
  info(
    "Note: these are reservations under Art. 4(3) DSM / EU AI Act Art. 53 - compliant " +
      "trainers must respect them, but nothing here technically blocks a scraper.",
  );
}
