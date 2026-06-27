import { averageBitAccuracy, recoveryCount } from "../metrics/recovery.js";
import type { AuditReport, AuditResult } from "./types.js";

// Roll up the per-transform results into the report's summary block.
export function buildSummary(results: AuditResult[]): AuditReport["summary"] {
  return {
    totalTransforms: results.length,
    successfulRecoveries: recoveryCount(results.map((r) => r.messageRecovered)),
    averageBitAccuracy: averageBitAccuracy(results.map((r) => r.bitAccuracy)),
  };
}

// Pretty JSON. We don't round the metrics here - let whoever consumes it decide.
export function serializeReport(report: AuditReport): string {
  return JSON.stringify(report, null, 2);
}
