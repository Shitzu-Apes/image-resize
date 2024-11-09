import decodeJpeg, { init as initJpegDecWasm } from "@jsquash/jpeg/decode";
import decodePng, { init as initPngDecWasm } from "@jsquash/png/decode";
import decodeWebp, { init as initWebpDecWasm } from "@jsquash/webp/decode";
import encodeWebp, { init as initWebpEncWasm } from "@jsquash/webp/encode";
import resize, { initResize } from "@jsquash/resize";

// @ts-ignore
import JPEG_DEC_WASM from "../../node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm";
// @ts-ignore
import PNG_DEC_WASM from "../../node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm";
// @ts-ignore
import WEBP_DEC_WASM from "../../node_modules/@jsquash/webp/codec/dec/webp_dec.wasm";
// @ts-ignore
import WEBP_ENC_WASM from "../../node_modules/@jsquash/webp/codec/enc/webp_enc.wasm";
// @ts-ignore
import RESIZE_WASM from "../../node_modules/@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm";

export async function convertImage(
  base64Icon: string,
  width?: number,
  height?: number,
  fitMethod?: "contain" | "stretch"
): Promise<string> {
  // Remove data URL prefix to get raw base64
  const base64Data = base64Icon.replace(/^data:[^,]+,/, "");

  const imageBuffer = Uint8Array.from(
    atob(base64Data.replace(/^data[^,]+,/, "")),
    (v) => v.charCodeAt(0)
  );

  console.log("imageBuffer", base64Icon.slice(0, 100));
  let sourceType: "jpeg" | "png" | "webp";
  if (base64Icon.includes("image/png")) {
    sourceType = "png";
  } else if (base64Icon.includes("image/jpeg")) {
    sourceType = "jpeg";
  } else if (base64Icon.includes("image/webp")) {
    sourceType = "webp";
  } else {
    throw new Error("Unsupported image format");
  }

  const decodedImage = await decode(sourceType, imageBuffer);

  await initResize(RESIZE_WASM);
  let resizedImage;
  if (width && height) {
    resizedImage = await resize(decodedImage, {
      width,
      height,
      fitMethod: fitMethod ?? "contain",
    });
  } else {
    resizedImage = decodedImage;
  }

  const encodedImage = await encode(resizedImage);
  const base64String = btoa(
    String.fromCharCode(...new Uint8Array(encodedImage))
  );

  return `data:image/webp;base64,${base64String}`;
}

async function decode(
  sourceType: "jpeg" | "png" | "webp",
  fileBuffer: Uint8Array
) {
  let result;
  switch (sourceType) {
    case "jpeg":
      await initJpegDecWasm(JPEG_DEC_WASM);
      result = await decodeJpeg(fileBuffer);
      break;
    case "png":
      await initPngDecWasm(PNG_DEC_WASM);
      result = decodePng(fileBuffer);
      break;
    case "webp":
      await initWebpDecWasm(WEBP_DEC_WASM);
      result = decodeWebp(fileBuffer);
      break;
    default:
      throw new Error(`Unknown source type: ${sourceType}`);
  }
  return result;
}

async function encode(imageData: ImageData) {
  await initWebpEncWasm(WEBP_ENC_WASM);
  return encodeWebp(imageData);
}
