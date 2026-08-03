# @openartshield/web

Browser bindings for [OpenArtShield](https://github.com/jherediagu/open-art-shield):
canvas/ImageData IO for the pure core SDK, plus in-browser TrustMark
verification. Everything runs client-side - **the image never leaves the
page**.

```ts
import {
  loadPixelImage,
  pixelImageToBlob,
  embedWatermark,
  extractWatermark,
  createTrustmarkWebDecoder,
} from "@openartshield/web";

// Decode a user-selected file entirely in the browser.
const image = await loadPixelImage(fileInput.files[0]);

// The whole pure SDK is re-exported: DCT watermarking, audits, payload codecs.
const { image: protectedImage } = embedWatermark(image, {
  message: "artist=jane",
  seed: 123,
});
const blob = await pixelImageToBlob(protectedImage);

// In-browser TrustMark verification (optional 'onnxruntime-web' dependency;
// the decoder model downloads from Adobe's CDN and caches in the browser).
const decoder = createTrustmarkWebDecoder();
const decoded = await decoder.decodeText(image);
```

Honest limits: the canvas helpers need a browser (OffscreenCanvas); the
TrustMark decoder is decode-only (embedding lives in `@openartshield/node`);
and none of this is protection by itself - see the root
[readme](../../readme.md) for the framing and the measured robustness numbers.
