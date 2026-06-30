/**
 * Downscale an image to fit within `maxEdge` on its widest side (preserving
 * aspect ratio) and re-encode it as JPEG before upload. Keeps stored files
 * small and consistent. Falls back to the original file if anything fails or
 * the input isn't a raster image we can decode.
 */
export async function processImageForUpload(
  file: File,
  maxEdge = 1024,
  quality = 0.9,
): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    return file;
  }
  try {
    const source = await loadImage(file);
    const sw = "width" in source ? source.width : 0;
    const sh = "height" in source ? source.height : 0;
    if (!sw || !sh) return file;

    const scale = Math.min(1, maxEdge / Math.max(sw, sh));
    const w = Math.round(sw * scale);
    const h = Math.round(sh * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // JPEG has no alpha — flatten onto white so transparency doesn't go black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0, w, h);
    if ("close" in source) source.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to <img> decoding */
    }
  }
  return await new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode failed"));
    };
    img.src = url;
  });
}
