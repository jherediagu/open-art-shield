import { describe, expect, it } from "vitest";
import {
  AI_CRAWLER_ROBOTS_SNIPPET,
  buildAiTxt,
  buildTdmRepJson,
  buildXmpDataMiningPacket,
  isDataMiningPolicy,
  PLUS_DATA_MINING_VALUES,
  TDM_RESERVATION_HEADER,
} from "../src/optout.js";

describe("buildXmpDataMiningPacket", () => {
  it("embeds the PLUS vocabulary URI for the policy", () => {
    const xmp = buildXmpDataMiningPacket({ policy: "prohibitedAiTraining" });
    expect(xmp).toContain(PLUS_DATA_MINING_VALUES.prohibitedAiTraining);
    expect(xmp).toContain("<plus:DataMining>");
    expect(xmp).toContain('id="W5M0MpCehiHzreSzNTczkc9d"');
    expect(xmp).toContain('<?xpacket end="w"?>');
  });

  it("includes creator, web statement, and constraints when given", () => {
    const xmp = buildXmpDataMiningPacket({
      policy: "prohibited",
      creatorName: "Demo Artist",
      webStatementUrl: "https://example.com/rights",
      constraintInfo: "Contact for licensing.",
    });
    expect(xmp).toContain("<rdf:li>Demo Artist</rdf:li>");
    expect(xmp).toContain("<xmpRights:WebStatement>https://example.com/rights");
    expect(xmp).toContain("<plus:OtherConstraints>Contact for licensing.");
  });

  it("escapes XML in user-provided values", () => {
    const xmp = buildXmpDataMiningPacket({
      policy: "prohibited",
      creatorName: 'A & B <"Studio">',
    });
    expect(xmp).toContain("A &amp; B &lt;&quot;Studio&quot;&gt;");
    expect(xmp).not.toContain('<"Studio">');
  });

  it("rejects unknown policies", () => {
    expect(() => buildXmpDataMiningPacket({ policy: "nope" as never })).toThrow(
      /Unknown data-mining policy/,
    );
  });

  it("is deterministic", () => {
    const params = { policy: "prohibited" as const, creatorName: "X" };
    expect(buildXmpDataMiningPacket(params)).toBe(buildXmpDataMiningPacket(params));
  });
});

describe("buildTdmRepJson", () => {
  it("builds a whole-site reservation by default", () => {
    const parsed = JSON.parse(buildTdmRepJson());
    expect(parsed).toEqual([{ location: "/", "tdm-reservation": 1 }]);
  });

  it("includes the policy URL when given", () => {
    const parsed = JSON.parse(buildTdmRepJson({ policyUrl: "https://example.com/tdm-policy" }));
    expect(parsed[0]["tdm-policy"]).toBe("https://example.com/tdm-policy");
  });

  it("ends with a newline and exposes the header constant", () => {
    expect(buildTdmRepJson().endsWith("\n")).toBe(true);
    expect(TDM_RESERVATION_HEADER).toBe("tdm-reservation: 1");
  });
});

describe("buildAiTxt", () => {
  it("disallows every media category by default", () => {
    const aiTxt = buildAiTxt();
    expect(aiTxt).toContain("User-Agent: *");
    expect(aiTxt).toContain("Disallow: /*.jpg$");
    expect(aiTxt).toContain("Disallow: /*.png$");
    expect(aiTxt).toContain("Disallow: /*.mp3$");
    expect(aiTxt).toContain("Disallow: /*.mp4$");
    expect(aiTxt).toContain("Disallow: /*.py$");
  });

  it("limits the disallow list to the requested categories", () => {
    const aiTxt = buildAiTxt({ disallow: ["images"] });
    expect(aiTxt).toContain("Disallow: /*.png$");
    expect(aiTxt).not.toContain("Disallow: /*.mp3$");
  });

  it("produces an explicit allow-all for an empty list", () => {
    const aiTxt = buildAiTxt({ disallow: [] });
    expect(aiTxt).toContain("Allow: /");
    expect(aiTxt).not.toContain("Disallow:");
  });

  it("rejects unknown categories", () => {
    expect(() => buildAiTxt({ disallow: ["fonts" as never] })).toThrow(/Unknown ai.txt/);
  });
});

describe("robots snippet", () => {
  it("covers the major AI training crawlers", () => {
    for (const bot of ["GPTBot", "ClaudeBot", "Google-Extended", "CCBot", "Bytespider"]) {
      expect(AI_CRAWLER_ROBOTS_SNIPPET).toContain(`User-agent: ${bot}`);
    }
  });
});

describe("isDataMiningPolicy", () => {
  it("accepts known policies and rejects unknown ones", () => {
    expect(isDataMiningPolicy("prohibited")).toBe(true);
    expect(isDataMiningPolicy("prohibitedGenAiTraining")).toBe(true);
    expect(isDataMiningPolicy("banned")).toBe(false);
    expect(isDataMiningPolicy(undefined)).toBe(false);
  });
});
