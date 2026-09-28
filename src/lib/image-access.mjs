const SAFE_SEGMENT = /^[\p{L}\p{N}._-]+$/u;

export function isOwnedStoredImagePath(directory, segments, userId) {
  return ["uploads", "outputs"].includes(directory) && Boolean(userId) &&
    Array.isArray(segments) && segments.length >= 2 && segments[0] === String(userId);
}

// Image inputs must be same-app paths. Remote URLs are rejected so callers
// cannot use server-side image processing to reach private network services.
export function isAllowedImageReference(value, userId) {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/") || value.startsWith("//")) return false;
  if (value.includes("\\") || value.includes("?") || value.includes("#")) return false;

  const segments = value.slice(1).split("/");
  if (segments.length < 2 || segments.some((segment) => {
    if (!segment) return true;
    try {
      const decoded = decodeURIComponent(segment);
      return decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\") || !SAFE_SEGMENT.test(decoded);
    } catch {
      return true;
    }
  })) return false;

  if (segments[0] === "mf-assets") return true;
  if (["uploads", "outputs"].includes(segments[0])) {
    return isOwnedStoredImagePath(segments[0], segments.slice(1), userId);
  }
  return false;
}
