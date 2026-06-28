import { describe, expect, it } from "vitest";
import { renderHtmlReport } from "../src/audit/html.js";
import type { AuditReport } from "../src/audit/types.js";

const report: AuditReport = {
  version: "0.1.0",
  image: { path: "protected.png", width: 384, height: 384, channels: 3 },
  watermark: {
    expectedMessage: "artist=demo;license=no-ai-training",
    seed: 123,
    strength: 8,
    repetitions: 5,
  },
  results: [
    {
      transform: "identity",
      recoveredMessage: "artist=demo;license=no-ai-training",
      messageRecovered: true,
      checksumValid: true,
      bitAccuracy: 1,
      psnr: null,
      ssim: 1,
    },
    {
      transform: "resize_50",
      recoveredMessage: null,
      messageRecovered: false,
      checksumValid: false,
      bitAccuracy: 0.74,
      psnr: 30.2,
      ssim: 0.95,
    },
  ],
  summary: { totalTransforms: 2, successfulRecoveries: 1, averageBitAccuracy: 0.87 },
};

describe("renderHtmlReport", () => {
  it("produces a self-contained HTML document", () => {
    const html = renderHtmlReport(report);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("</html>");
    expect(html).toContain("<style>");
    // No external resources to keep it portable.
    expect(html).not.toMatch(/src=|href=http/);
  });

  it("includes the watermark metadata and every transform row", () => {
    const html = renderHtmlReport(report);
    expect(html).toContain("artist=demo;license=no-ai-training");
    expect(html).toContain("identity");
    expect(html).toContain("resize_50");
    expect(html).toContain("1 / 2");
  });

  it("escapes HTML in the message to avoid breaking the page", () => {
    const html = renderHtmlReport({
      ...report,
      watermark: { ...report.watermark, expectedMessage: "<script>alert(1)</script>" },
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("keeps the honest disclaimer in the output", () => {
    const html = renderHtmlReport(report);
    expect(html.toLowerCase()).toContain("does");
    expect(html.toLowerCase()).toContain("not");
    expect(html).toContain("experimental");
  });
});
