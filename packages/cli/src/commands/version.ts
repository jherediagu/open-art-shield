import { CLI_VERSION, raw } from "../utils/output.js";

export function getVersion(): string {
  return CLI_VERSION;
}

export function versionCommand(): void {
  raw(CLI_VERSION);
}
