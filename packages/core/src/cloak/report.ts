import type { CloakReport } from "./types.js";

export function serializeCloakReport(report: CloakReport): string {
  return JSON.stringify(report, null, 2);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(value: number | null, digits = 4): string {
  return value === null ? "&mdash;" : value.toFixed(digits);
}

/** Render a cloak report as a standalone HTML page. */
export function renderCloakHtmlReport(report: CloakReport): string {
  const { input, output, backend, parameters, result, eot, scoring, robustness } = report;
  const limitations = report.limitations.map((l) => `      <li>${escapeHtml(l)}</li>`).join("\n");

  const scoringRows = scoring.models
    .map(
      (m) => `      <tr>
        <td><code>${escapeHtml(m.model)}</code></td>
        <td class="num">${m.cleanDrift.toFixed(4)}</td>
        <td class="num">${m.averageEotDrift.toFixed(4)}</td>
        <td class="num">${m.minEotDrift.toFixed(4)}</td>
      </tr>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>OpenArtShield cloak report</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 2rem auto; max-width: 820px; padding: 0 1rem; }
  h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
  .sub { color: #777; margin-top: 0; }
  .verdict { display: inline-block; padding: 0.15rem 0.6rem; border-radius: 4px; font-weight: 600; font-size: 0.85rem; }
  .yes { background: #2e7d3222; color: #2e7d32; }
  .no { background: #c6282822; color: #c62828; }
  .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 0.5rem 1.5rem; margin: 1.25rem 0; }
  .meta div { font-size: 0.9rem; }
  .meta b { display: block; color: #777; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85em; }
  h2 { font-size: 1.1rem; margin-top: 2rem; }
  table { border-collapse: collapse; width: 100%; margin-top: 0.5rem; }
  th, td { padding: 0.4rem 0.6rem; border-bottom: 1px solid #8883; text-align: left; }
  th { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; color: #777; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .note { margin-top: 1.5rem; padding: 0.75rem 1rem; border-left: 3px solid #f0ad4e; background: #f0ad4e1a; font-size: 0.88rem; }
  .note ul { margin: 0.4rem 0 0; padding-left: 1.1rem; }
  footer { margin-top: 2rem; color: #888; font-size: 0.8rem; }
</style>
</head>
<body>
  <h1>OpenArtShield cloak report</h1>
  <p class="sub">
    Backend: <code>${escapeHtml(backend.id)}</code>${backend.model ? ` &middot; model <code>${escapeHtml(backend.model)}</code>` : ""} &middot; schema v${escapeHtml(report.version)}
  </p>

  <p>
    <span class="verdict ${result.improved ? "yes" : "no"}">${result.improved ? "improved drift" : "no improvement"}</span>
  </p>

  <div class="meta">
    <div><b>Input</b>${input.path ? escapeHtml(input.path) + " &middot; " : ""}${input.width}&times;${input.height}</div>
    <div><b>Output</b>${output.path ? escapeHtml(output.path) : "(not written)"}</div>
    <div><b>Strength / steps</b>${parameters.strength} / ${parameters.steps}</div>
    <div><b>Optimizer</b>${escapeHtml(parameters.optimizer)}</div>
    <div><b>Seed</b>${parameters.seed}</div>
    <div><b>Initial drift</b>${result.initialDrift.toFixed(4)}</div>
    <div><b>Best drift</b>${result.bestDrift.toFixed(4)}</div>
    <div><b>PSNR (dB)</b>${fmt(result.psnr, 2)}</div>
    <div><b>SSIM</b>${result.ssim.toFixed(4)}</div>
    <div><b>Candidates rejected</b>${result.candidatesRejected}</div>
    <div><b>EOT mode</b>${escapeHtml(eot.mode)}</div>
    <div><b>Clean drift</b>${eot.cleanDrift.toFixed(4)}</div>
    <div><b>Avg EOT drift</b>${eot.averageDrift.toFixed(4)}</div>
    <div><b>Min EOT drift</b>${eot.minDrift.toFixed(4)}</div>
    <div><b>Embedding evaluations</b>${eot.embeddingEvaluations}</div>
    <div><b>EOT transforms</b>${eot.transforms.map((t) => `<code>${escapeHtml(t)}</code>`).join(", ")}</div>
    <div><b>Mean drift after transforms</b>${robustness.averageDriftAfterTransforms.toFixed(4)} (${robustness.transformsTested})</div>
  </div>

  <h2>Model scoring (${escapeHtml(scoring.mode)})</h2>
  <div class="meta">
    <div><b>Primary model</b><code>${escapeHtml(scoring.primaryModel)}</code></div>
    <div><b>Score models</b>${
      scoring.scoreModels.length > 0
        ? scoring.scoreModels.map((m) => `<code>${escapeHtml(m)}</code>`).join(", ")
        : "(none)"
    }</div>
    <div><b>Aggregate average drift</b>${scoring.aggregateAverageDrift.toFixed(4)}</div>
    <div><b>Weakest model drift</b>${scoring.aggregateMinModelDrift.toFixed(4)}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Model</th>
        <th class="num">Clean drift</th>
        <th class="num">Avg EOT drift</th>
        <th class="num">Min EOT drift</th>
      </tr>
    </thead>
    <tbody>
${scoringRows}
    </tbody>
  </table>

  <div class="note">
    <strong>Limitations</strong>
    <ul>
${limitations}
    </ul>
  </div>

  <footer>Generated by OpenArtShield &middot; <code>oas cloak</code></footer>
</body>
</html>
`;
}
