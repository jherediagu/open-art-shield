// Machine-readable opt-out builders: TDMRep, ai.txt, and the IPTC
// plus:DataMining XMP packet.
//
// These are the standards scrapers and model trainers are being pushed to
// respect (EU AI Act Art. 53 via the Art. 4(3) DSM text-and-data-mining
// reservation). Emitting all of them at once costs nothing and layers the
// signal: in-file XMP survives downloads, site-level files cover crawling.
// None of them technically prevents scraping - they are reservations, and we
// say so in the docs.

/** IPTC/PLUS data-mining vocabulary URIs (ns.useplus.org). */
export const PLUS_DATA_MINING_VALUES = {
  allowed: "http://ns.useplus.org/ldf/vocab/DMI-ALLOWED",
  prohibited: "http://ns.useplus.org/ldf/vocab/DMI-PROHIBITED",
  prohibitedAiTraining: "http://ns.useplus.org/ldf/vocab/DMI-PROHIBITED-AIMLTRAINING",
  prohibitedGenAiTraining: "http://ns.useplus.org/ldf/vocab/DMI-PROHIBITED-GENAIMLTRAINING",
  prohibitedExceptSearch:
    "http://ns.useplus.org/ldf/vocab/DMI-PROHIBITED-EXCEPTSEARCHENGINEINDEXING",
} as const;

export type DataMiningPolicy = keyof typeof PLUS_DATA_MINING_VALUES;

export const DATA_MINING_POLICIES = Object.keys(PLUS_DATA_MINING_VALUES) as DataMiningPolicy[];

export function isDataMiningPolicy(value: unknown): value is DataMiningPolicy {
  return typeof value === "string" && value in PLUS_DATA_MINING_VALUES;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export type BuildXmpParams = {
  /** Which PLUS data-mining reservation to record. */
  policy: DataMiningPolicy;
  /** Optional creator name (dc:creator). */
  creatorName?: string;
  /** Optional URL of a rights/usage statement (xmpRights:WebStatement). */
  webStatementUrl?: string;
  /** Free-text constraint recorded alongside the policy (plus:OtherConstraints). */
  constraintInfo?: string;
};

/**
 * Build an XMP packet carrying the IPTC plus:DataMining property, per the
 * IPTC "Data Mining" opt-out best practices. Deterministic: no timestamps.
 */
export function buildXmpDataMiningPacket(params: BuildXmpParams): string {
  if (!isDataMiningPolicy(params.policy)) {
    throw new Error(
      `Unknown data-mining policy "${String(params.policy)}". Use one of: ${DATA_MINING_POLICIES.join(", ")}.`,
    );
  }
  const value = PLUS_DATA_MINING_VALUES[params.policy];

  const lines: string[] = [];
  lines.push('<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>');
  lines.push('<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="openartshield">');
  lines.push(' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">');
  lines.push(
    '  <rdf:Description rdf:about=""',
    '    xmlns:plus="http://ns.useplus.org/ldf/xmp/1.0/"',
    '    xmlns:dc="http://purl.org/dc/elements/1.1/"',
    '    xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/">',
  );
  lines.push(`   <plus:DataMining>${escapeXml(value)}</plus:DataMining>`);
  if (params.constraintInfo !== undefined && params.constraintInfo.length > 0) {
    lines.push(
      `   <plus:OtherConstraints>${escapeXml(params.constraintInfo)}</plus:OtherConstraints>`,
    );
  }
  if (params.creatorName !== undefined && params.creatorName.length > 0) {
    lines.push("   <dc:creator><rdf:Seq>");
    lines.push(`    <rdf:li>${escapeXml(params.creatorName)}</rdf:li>`);
    lines.push("   </rdf:Seq></dc:creator>");
  }
  if (params.webStatementUrl !== undefined && params.webStatementUrl.length > 0) {
    lines.push(
      `   <xmpRights:WebStatement>${escapeXml(params.webStatementUrl)}</xmpRights:WebStatement>`,
    );
  }
  lines.push("  </rdf:Description>");
  lines.push(" </rdf:RDF>");
  lines.push("</x:xmpmeta>");
  lines.push('<?xpacket end="w"?>');
  return lines.join("\n");
}

export type BuildTdmRepParams = {
  /**
   * URL of a TDM policy document describing licensing conditions. Omitted
   * means "reserved, no policy published" (a plain reservation).
   */
  policyUrl?: string;
  /** Path prefix the reservation applies to. Default "/" (the whole site). */
  location?: string;
};

/**
 * Build the contents of /.well-known/tdmrep.json per the W3C TDM Reservation
 * Protocol (TDMRep). tdm-reservation 1 means rights are reserved.
 */
export function buildTdmRepJson(params: BuildTdmRepParams = {}): string {
  const entry: Record<string, unknown> = {
    location: params.location ?? "/",
    "tdm-reservation": 1,
  };
  if (params.policyUrl !== undefined && params.policyUrl.length > 0) {
    entry["tdm-policy"] = params.policyUrl;
  }
  return `${JSON.stringify([entry], null, 2)}\n`;
}

/** The HTTP response header equivalent of the TDMRep reservation. */
export const TDM_RESERVATION_HEADER = "tdm-reservation: 1";

/** Media categories ai.txt can disallow, with the extensions they cover. */
export const AI_TXT_MEDIA_EXTENSIONS = {
  images: ["jpg", "jpeg", "png", "gif", "webp", "avif", "tif", "tiff", "bmp", "svg"],
  text: ["txt", "html", "htm", "md", "pdf", "doc", "docx"],
  audio: ["mp3", "wav", "flac", "ogg", "m4a"],
  video: ["mp4", "webm", "mov", "avi", "mkv"],
  code: ["js", "ts", "py", "rb", "go", "rs", "java", "c", "cpp", "css"],
} as const;

export type AiTxtMediaCategory = keyof typeof AI_TXT_MEDIA_EXTENSIONS;

export type BuildAiTxtParams = {
  /**
   * Categories to disallow for AI/TDM use. Default: all of them (deny all).
   * An empty array produces an explicit allow-all file.
   */
  disallow?: AiTxtMediaCategory[];
};

/**
 * Build an ai.txt file (Spawning's robots.txt-style opt-out): one Disallow
 * line per file extension of each opted-out media category.
 */
export function buildAiTxt(params: BuildAiTxtParams = {}): string {
  const categories =
    params.disallow ?? (Object.keys(AI_TXT_MEDIA_EXTENSIONS) as AiTxtMediaCategory[]);
  for (const category of categories) {
    if (!(category in AI_TXT_MEDIA_EXTENSIONS)) {
      throw new Error(
        `Unknown ai.txt media category "${String(category)}". Use one of: ${Object.keys(AI_TXT_MEDIA_EXTENSIONS).join(", ")}.`,
      );
    }
  }
  const lines: string[] = [
    "# ai.txt - AI/TDM usage reservation (generated by openartshield)",
    "# Spec: https://spawning.ai/ai-txt",
    "User-Agent: *",
  ];
  if (categories.length === 0) {
    lines.push("Allow: /");
  } else {
    for (const category of categories) {
      lines.push(`# ${category}`);
      for (const ext of AI_TXT_MEDIA_EXTENSIONS[category]) {
        lines.push(`Disallow: /*.${ext}$`);
      }
    }
    lines.push("Allow: /");
  }
  return `${lines.join("\n")}\n`;
}

/**
 * robots.txt lines that ask the major AI-training crawlers to stay away.
 * Informational output for the CLI - we never overwrite a robots.txt.
 */
export const AI_CRAWLER_ROBOTS_SNIPPET = [
  "User-agent: GPTBot",
  "Disallow: /",
  "",
  "User-agent: ClaudeBot",
  "Disallow: /",
  "",
  "User-agent: Google-Extended",
  "Disallow: /",
  "",
  "User-agent: CCBot",
  "Disallow: /",
  "",
  "User-agent: Bytespider",
  "Disallow: /",
].join("\n");
