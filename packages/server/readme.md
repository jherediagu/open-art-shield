# @openartshield/server

Self-hosted REST server for [OpenArtShield](https://github.com/jherediagu/open-art-shield):
watermark embed/extract/verify, robustness audits, and opt-out metadata over a
framework-free JSON API. This is the artifact a platform team evaluates -
`docker run` and you have the protection pipeline behind a port.

## Run

```bash
# From the repo root (the workspace is the build context):
docker build -f packages/server/Dockerfile -t openartshield-server .
docker run --rm -p 8787:8787 openartshield-server

# Or without Docker:
pnpm --filter @openartshield/server build && PORT=8787 pnpm --filter @openartshield/server start
```

## API

JSON in, JSON out; images travel as base64 (deliberately boring - no
multipart, callable from any language). Watermark operations are fast enough
(<1 s) to stay synchronous.

| Route              | What it does                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| `GET /healthz`     | `{ ok, version }`                                                                                  |
| `POST /v1/embed`   | `{ image, message, seed, strength?, repetitions?, format?, quality? }` → protected image + sidecar |
| `POST /v1/extract` | `{ image, seed, messageLength, repetitions? }` → recovered message                                 |
| `POST /v1/verify`  | `{ image, sidecar }` → checksum + recovered message                                                |
| `POST /v1/audit`   | `{ image, message, seed, ... }` → full robustness report                                           |
| `POST /v1/optout`  | `{ image, policy?, creator?, ... }` → image with IPTC XMP opt-out                                  |

```bash
curl -s localhost:8787/v1/embed -H 'content-type: application/json' \
  -d "{\"image\": \"$(base64 -i artwork.png)\", \"message\": \"artist=jane\", \"seed\": 123}"
```

## Honest limits

- v1 is synchronous only: no job queue or webhooks yet (they arrive with the
  slow layers - cloaking needs them, watermarking does not).
- No auth: put it behind your gateway; it is a self-hosted building block.
- The C2PA/TrustMark layers need their optional native dependencies and are
  not exposed over HTTP yet.
