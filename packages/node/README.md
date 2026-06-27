# @openartshield/node

Node.js integration for [OpenArtShield](../../README.md): image IO (PNG/JPEG/WebP via [`sharp`](https://sharp.pixelplumbing.com/)) and deterministic real-world transformation simulations (JPEG compression, resize, crop, blur, brightness/contrast, screenshot re-upload).

Core watermarking logic is not duplicated here - it is consumed from [`@openartshield/core`](../core/README.md).

```ts
import { readImage, writeImage, embedAndAudit } from "@openartshield/node";
```

See the [root README](../../README.md) for full documentation.

> **OpenArtShield does not make images AI-proof. All results should be interpreted as experimental.**

## License

Apache-2.0
