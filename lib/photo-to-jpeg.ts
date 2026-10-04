// Browser-side photo prep for the Inbox camera button: shrink to a sensible size and re-encode as
// JPEG before upload. Re-encoding also drops the EXIF block (GPS location included).
//
// HEIC: iOS Safari hands a file input a JPEG even when the photo is HEIC (WebKit transcodes it,
// whatever the accept attribute says). Desktop Safari 17+ can decode HEIC itself. A browser that
// cannot decode the file at all gets it sent unchanged, and the server stores it as it came.

export const MAX_EDGE = 2048;
export const JPEG_QUALITY = 0.85;

// The size to draw at: the long edge capped at maxEdge, never enlarged.
export function fitWithin(width: number, height: number, maxEdge = MAX_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

type Source = { image: CanvasImageSource; width: number; height: number; close: () => void };

// createImageBitmap first (Safari 15+, applies the EXIF rotation with "from-image"); an <img>
// element as the fallback, which browsers also orient by EXIF.
async function decode(file: Blob): Promise<Source | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return {
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close()
    };
  } catch {}
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return {
      image: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url)
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

// Resolves to a JPEG, or to the original file when this browser can't decode it.
export async function photoToJpeg(
  file: Blob,
  { maxEdge = MAX_EDGE, quality = JPEG_QUALITY } = {}
): Promise<{ blob: Blob; converted: boolean }> {
  const source = await decode(file);
  if (!source) return { blob: file, converted: false };
  try {
    const { width, height } = fitWithin(source.width, source.height, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { blob: file, converted: false };
    // JPEG has no transparency: a white ground instead of black under a transparent PNG.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source.image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    return blob ? { blob, converted: true } : { blob: file, converted: false };
  } finally {
    source.close();
  }
}
