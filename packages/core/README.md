# @openartshield/core

Pure TypeScript SDK for [OpenArtShield](../../README.md): invisible DCT watermarking, payload encoding with CRC-32 + repetition coding, PSNR/SSIM quality metrics, recovery metrics, and audit primitives. It holds the pure algorithms behind the project's protection layers - Trace (watermark), Measure (embedding audit), Cloak, and Audit.

This package is **pure**: no filesystem access, no Node-specific APIs, and no `sharp` dependency. It operates on raw `PixelImage` data and is fully deterministic.

```ts
import { embedWatermark, extractWatermark } from "@openartshield/core";
```

See the [root README](../../README.md) for full documentation.

> **OpenArtShield does not make images AI-proof. All results should be interpreted as experimental.**

## License

Apache-2.0
