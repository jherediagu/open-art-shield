import {
  createTrustmarkWebDecoder,
  extractWatermark,
  loadPixelImage,
  parseSidecar,
  type PixelImage,
  type TrustmarkWebDecoder,
} from "@openartshield/web";

// The public verifier: everything runs in this page. The image is decoded by
// the browser, verified by the bundled SDK, and never uploaded anywhere.

const imageInput = document.querySelector<HTMLInputElement>("#image-input")!;
const imageStatus = document.querySelector<HTMLElement>("#image-status")!;
const sidecarInput = document.querySelector<HTMLTextAreaElement>("#sidecar-input")!;
const verifyButton = document.querySelector<HTMLButtonElement>("#verify-button")!;
const verifyResult = document.querySelector<HTMLElement>("#verify-result")!;
const trustmarkButton = document.querySelector<HTMLButtonElement>("#trustmark-button")!;
const trustmarkModelInput = document.querySelector<HTMLInputElement>("#trustmark-model")!;
const trustmarkResult = document.querySelector<HTMLElement>("#trustmark-result")!;
const preview = document.querySelector<HTMLImageElement>("#preview")!;

let image: PixelImage | null = null;
let decoder: TrustmarkWebDecoder | null = null;
let decoderSource: string = "";

function setResult(element: HTMLElement, kind: "ok" | "bad" | "info", text: string): void {
  element.dataset.kind = kind;
  element.textContent = text;
}

imageInput.addEventListener("change", async () => {
  const file = imageInput.files?.[0];
  if (!file) return;
  try {
    image = await loadPixelImage(file);
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
    setResult(
      imageStatus,
      "info",
      `${file.name} - ${image.width}x${image.height}, decoded locally.`,
    );
    verifyButton.disabled = false;
    trustmarkButton.disabled = false;
  } catch (error) {
    image = null;
    setResult(imageStatus, "bad", `Could not decode this file: ${String(error)}`);
  }
});

verifyButton.addEventListener("click", () => {
  if (image === null) return;
  try {
    const sidecar = parseSidecar(sidecarInput.value);
    const result = extractWatermark(image, {
      seed: sidecar.seed,
      messageLength: sidecar.messageLength,
      repetitions: sidecar.repetitions,
    });
    if (result.checksumValid && result.recoveredMessage !== null) {
      setResult(verifyResult, "ok", `Watermark verified. Message: "${result.recoveredMessage}"`);
    } else {
      setResult(
        verifyResult,
        "bad",
        "No valid watermark for these parameters (checksum failed). " +
          "The mark may have been degraded, or the sidecar does not match this image.",
      );
    }
  } catch (error) {
    setResult(
      verifyResult,
      "bad",
      `Sidecar problem: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
});

trustmarkButton.addEventListener("click", async () => {
  if (image === null) return;
  setResult(trustmarkResult, "info", "Decoding... (first run loads the ~47 MB decoder model)");
  trustmarkButton.disabled = true;
  try {
    const modelFile = trustmarkModelInput.files?.[0];
    const source = modelFile ? `file:${modelFile.name}` : "cdn";
    if (decoder === null || decoderSource !== source) {
      decoder = createTrustmarkWebDecoder(
        modelFile ? { modelData: await modelFile.arrayBuffer() } : {},
      );
      decoderSource = source;
    }
    const decoded = await decoder.decodeText(image);
    if (decoded === null) {
      setResult(trustmarkResult, "bad", "No TrustMark watermark recovered from this image.");
    } else {
      setResult(
        trustmarkResult,
        "ok",
        `TrustMark recovered: "${decoded.text}" (schema ${decoded.version}, ` +
          `${decoded.correctedBitFlips} corrected bit flips)`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setResult(
      trustmarkResult,
      "bad",
      `${message} - if the model download was blocked (CORS), download decoder_Q.onnx ` +
        "yourself and pick it in the model field above.",
    );
  } finally {
    trustmarkButton.disabled = false;
  }
});
