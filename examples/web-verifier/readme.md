# Web verifier

A static, fully client-side verifier page built on
[`@openartshield/web`](../../packages/web) - **the image never leaves the
browser**. It checks two things:

- **DCT watermark**: drop the image plus its `*.openartshield.json` sidecar.
- **TrustMark watermark**: no sidecar needed; the ~47 MB decoder model loads
  from Adobe's CDN (or a locally picked `decoder_Q.onnx`) and runs via
  WebGPU/WASM through an import map - no build-time ONNX dependency.

## Run it

```bash
pnpm --filter @openartshield/web-verifier build
cd examples/web-verifier && python3 -m http.server 8123
# open http://localhost:8123/
```

Verified end-to-end in Chrome: DCT verify (valid + tampered-parameters
cases) and in-browser TrustMark recovery of a payload embedded by the Node
backend, straight from a JPEG.

An absent watermark proves nothing, and a motivated adversary can remove any
watermark - see the [threat model](../../docs/threat-model.md).
