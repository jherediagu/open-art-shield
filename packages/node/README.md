# @openartshield/node

Node.js integration for [OpenArtShield](../../README.md): image IO (PNG/JPEG/WebP via [`sharp`](https://sharp.pixelplumbing.com/)), deterministic real-world transformation simulations (JPEG compression, resize, crop, blur, brightness/contrast, screenshot re-upload), and the optional CLIP embedding backend. This is the edge layer that feeds the Audit and Measure layers with real image data - core stays pure.

Core watermarking logic is not duplicated here - it is consumed from [`@openartshield/core`](../core/README.md).

```ts
import { readImage, writeImage, embedAndAudit } from "@openartshield/node";
```

See the [root README](../../README.md) for full documentation.

> **OpenArtShield does not make images AI-proof. All results should be interpreted as experimental.**

## License

Apache-2.0
