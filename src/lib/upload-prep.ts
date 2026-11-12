/**
 * Prepares a file for upload in the browser:
 *  - HEIC / HEIF photos (iPhone) are converted to JPEG,
 *  - photos larger than 2000 px on the long edge are downscaled (JPEG quality 0.85),
 *  - PDFs and small images are uploaded unchanged,
 *  - the SHA-256 of the bytes that are stored is computed for duplicate detection.
 */
export const MAX_EDGE = 2000;
export const JPEG_QUALITY = 0.85;
export const MAX_BYTES = 20 * 1024 * 1024;
export const ACCEPTED = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];

export interface PreparedUpload {
  blob: Blob;
  mimeType: string;
  ext: string;
  sha256: string;
  width?: number;
  height?: number;
  /** Small JPEG preview (~320 px) stored next to the original as <path>.thumb.jpg. */
  thumb?: Blob;
}

export const THUMB_EDGE = 320;

/** Small JPEG preview for lists; null when the browser cannot draw the image. */
export async function makeThumb(blob: Blob): Promise<Blob | null> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return null;
  const bitmap = await createImageBitmap(blob);
  const size = fitWithin(bitmap.width, bitmap.height, THUMB_EDGE);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.7));
}

const isHeic = (f: File) => /image\/hei[cf]/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(await blob.arrayBuffer()));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Long edge scaled down to `max`, keeping the aspect ratio. */
export function fitWithin(width: number, height: number, max = MAX_EDGE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    scaled: scale < 1,
  };
}

async function convertHeic(file: File): Promise<Blob> {
  const { default: heic2any } = await import("heic2any");
  const out = await heic2any({ blob: file, toType: "image/jpeg", quality: JPEG_QUALITY });
  return Array.isArray(out) ? out[0]! : out;
}

async function downscale(
  blob: Blob,
): Promise<{ blob: Blob; width: number; height: number } | null> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return null;
  const bitmap = await createImageBitmap(blob);
  const size = fitWithin(bitmap.width, bitmap.height);
  if (!size.scaled) {
    bitmap.close();
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const out = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  return out ? { blob: out, width: size.width, height: size.height } : null;
}

export async function prepareUpload(file: File): Promise<PreparedUpload> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    if (file.size > MAX_BYTES) throw new Error(`${file.name} is larger than 20 MB.`);
    return { blob: file, mimeType: "application/pdf", ext: "pdf", sha256: await sha256Hex(file) };
  }
  let blob: Blob = file;
  let mimeType = file.type || "image/jpeg";
  if (isHeic(file)) {
    blob = await convertHeic(file);
    mimeType = "image/jpeg";
  }
  if (!/^image\/(jpeg|png|webp)$/.test(mimeType))
    throw new Error(`${file.name}: use a JPG, PNG, WebP, HEIC photo or a PDF.`);
  const scaled = await downscale(blob).catch(() => null);
  if (scaled) {
    blob = scaled.blob;
    mimeType = "image/jpeg";
  }
  if (blob.size > MAX_BYTES) throw new Error(`${file.name} is larger than 20 MB.`);
  const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const thumb = await makeThumb(blob).catch(() => null);
  return {
    blob,
    mimeType,
    ext,
    sha256: await sha256Hex(blob),
    ...(scaled ? { width: scaled.width, height: scaled.height } : {}),
    ...(thumb ? { thumb } : {}),
  };
}
