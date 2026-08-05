# Security policy

## Reporting a vulnerability

Please report security issues privately via
[GitHub Security Advisories](https://github.com/jherediagu/open-art-shield/security/advisories/new)
rather than public issues. Include reproduction steps and affected
package(s)/version(s). You can expect an acknowledgement within a week.

In scope: the packages in this repo (`core`, `node`, `cli`, `web`, `server`)
and the Docker image build. Out of scope: the _protection strength_ of
watermarks/cloaks against removal - that is a research property, documented
honestly in the [threat model](docs/threat-model.md) and measured by the
[benchmark](docs/benchmarks/latest.md), not a vulnerability.

## Hardening notes for deployers

- The REST server has **no authentication** by design; run it behind your
  gateway and cap request sizes (`maxBodyBytes`).
- Image parsing is delegated to `sharp`/libvips - keep it updated
  (`pnpm update sharp`).
- Optional native/model dependencies (`c2pa-node`, `onnxruntime-node`)
  download binaries/models on first use; pin versions and vendor the models
  if your environment requires it.
- Private keys from `oas declare-keys` sign in your name - store them like
  any signing credential.

## Posture

The project follows the
[OpenSSF Best Practices](https://www.bestpractices.dev/) criteria
(reproducible tests in CI, no committed secrets, dependency pinning via the
lockfile, reviewed changes). The badge application and Scorecard tracking are
maintained by the repo owner.
