import fs from "node:fs/promises";
import path from "node:path";
import { resolvePrivateImagePath } from "./image-storage.mjs";

const TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif" };

export async function readStoredImage(directory, segments) {
  const resolved = resolvePrivateImagePath(directory, segments);
  if (!resolved) return null;
  const contentType = TYPES[path.extname(resolved.filePath).toLowerCase()];
  if (!contentType) return null;

  try {
    const actual = await fs.realpath(resolved.filePath);
    if (!actual.startsWith(resolved.root + path.sep)) return null;
    return { bytes: await fs.readFile(actual), contentType };
  } catch {
    return null;
  }
}

// Existing image URLs remain valid, but bytes live outside Next.js public files.
// The route calling this function must enforce authentication and ownership.
export async function storedImageResponse(directory, params, cacheControl = "private, max-age=300") {
  const image = await readStoredImage(directory, (await params)?.path);
  if (!image) return new Response(null, { status: 404 });
  return new Response(image.bytes, { headers: {
    "Content-Type": image.contentType,
    "Content-Length": String(image.bytes.length),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": cacheControl,
  } });
}
