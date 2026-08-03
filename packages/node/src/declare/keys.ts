import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Self-signed signing credentials for the Declare layer.
//
// There is no free path onto the C2PA trust list (certificates come from
// commercial CAs), so the honest entry-level DX is a local ES256 keypair and
// a self-signed certificate: signatures verify cryptographically and carry
// the artist's name, but validators will flag the credential as not on a
// trust list. That trade-off is documented, not hidden.
//
// We shell out to openssl rather than reimplementing X.509: generating
// certificates in pure Node has no stdlib support, and openssl ships with
// macOS/Linux and Git-for-Windows. The extensions below are what the C2PA
// certificate profile requires of an end-entity signing cert.

export type GenerateDeclareKeysOptions = {
  /** Directory to write the PEM files into (created if missing). */
  outDir: string;
  /** Name recorded as the certificate's O/CN - shown as issuer by validators. */
  name: string;
  /** Certificate validity in days. Default 365. */
  days?: number;
};

export type GenerateDeclareKeysResult = {
  certificatePath: string;
  privateKeyPath: string;
};

export const DECLARE_CERT_FILENAME = "openartshield-cert.pem";
export const DECLARE_KEY_FILENAME = "openartshield-key.pem";

/**
 * Generate an ES256 private key and a self-signed certificate that satisfies
 * the C2PA certificate profile (digitalSignature key usage, emailProtection
 * EKU, CA:FALSE). Requires the `openssl` binary on PATH.
 */
export async function generateDeclareKeys(
  options: GenerateDeclareKeysOptions,
): Promise<GenerateDeclareKeysResult> {
  if (options.name.length === 0) throw new Error("Certificate name must not be empty.");
  const days = options.days ?? 365;
  if (!Number.isInteger(days) || days <= 0) {
    throw new Error(`Certificate validity must be a positive number of days, got ${days}.`);
  }

  await mkdir(options.outDir, { recursive: true });
  const certificatePath = join(options.outDir, DECLARE_CERT_FILENAME);
  const privateKeyPath = join(options.outDir, DECLARE_KEY_FILENAME);

  // openssl's -subj parses "/" as a field separator; strip it from names.
  const name = options.name.replaceAll("/", " ");
  const args = [
    "req",
    "-x509",
    "-newkey",
    "ec",
    "-pkeyopt",
    "ec_paramgen_curve:prime256v1",
    "-keyout",
    privateKeyPath,
    "-out",
    certificatePath,
    "-days",
    String(days),
    "-nodes",
    "-subj",
    `/O=${name}/CN=${name}`,
    "-addext",
    "keyUsage=critical,digitalSignature",
    "-addext",
    "extendedKeyUsage=emailProtection",
    "-addext",
    "basicConstraints=critical,CA:FALSE",
  ];

  try {
    await execFileAsync("openssl", args);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(
        "Generating keys requires the 'openssl' binary, which was not found on PATH. " +
          "Install OpenSSL, or bring your own ES256 certificate and key.",
      );
    }
    const stderr = (error as { stderr?: string }).stderr;
    throw new Error(`openssl failed to generate the certificate${stderr ? `: ${stderr}` : "."}`);
  }

  return { certificatePath, privateKeyPath };
}
