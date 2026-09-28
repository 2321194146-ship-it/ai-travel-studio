import path from "node:path";

const PRIVATE_IMAGE_DIRS = new Set(["uploads", "outputs"]);

export function privateImageRoot() {
  return path.resolve(/*turbopackIgnore: true*/ process.env.IMAGE_STORAGE_DIR || path.join(process.cwd(), ".data"));
}

export function privateImageDirectory(directory) {
  if (!PRIVATE_IMAGE_DIRS.has(directory)) return null;
  return path.join(/*turbopackIgnore: true*/ privateImageRoot(), directory);
}

export function resolvePrivateImagePath(directory, segments) {
  const root = privateImageDirectory(directory);
  if (!root || !Array.isArray(segments) || !segments.length) return null;

  for (const segment of segments) {
    if (typeof segment !== "string" || !segment || segment.startsWith(".") || segment.includes("/") || segment.includes("\\")) {
      return null;
    }
    try {
      if (decodeURIComponent(segment) !== segment) return null;
    } catch {
      return null;
    }
  }

  const filePath = path.resolve(root, ...segments);
  if (!filePath.startsWith(root + path.sep)) return null;
  return { root, filePath };
}
