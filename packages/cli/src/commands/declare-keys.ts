import { generateDeclareKeys, type GenerateDeclareKeysResult } from "@openartshield/node";
import { info, success } from "../utils/output.js";

export type DeclareKeysOptions = {
  /** Name recorded in the certificate (shown by validators). */
  name: string;
  /** Output directory. Default "." */
  outDir?: string;
  /** Certificate validity in days. Default 365. */
  days?: number;
};

export async function runDeclareKeys(
  options: DeclareKeysOptions,
): Promise<GenerateDeclareKeysResult> {
  return generateDeclareKeys({
    outDir: options.outDir ?? ".",
    name: options.name,
    ...(options.days !== undefined ? { days: options.days } : {}),
  });
}

export async function declareKeysCommand(options: DeclareKeysOptions): Promise<void> {
  const result = await runDeclareKeys(options);

  info("OpenArtShield declare-keys");
  info("");
  success(`Certificate written to ${result.certificatePath}`);
  success(`Private key written to ${result.privateKeyPath}`);
  info("");
  info("Keep the private key private; anyone holding it can sign in your name.");
  info(
    "This is a self-signed certificate: signatures verify cryptographically and carry " +
      "your name, but validators will flag the credential as not on the C2PA trust list.",
  );
  info("");
  info("Sign an image with:");
  info(
    `  oas declare artwork.png --out artwork.declared.png --cert ${result.certificatePath} --key ${result.privateKeyPath}`,
  );
}
