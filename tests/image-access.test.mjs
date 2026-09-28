import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedImageReference, isOwnedStoredImagePath } from "../src/lib/image-access.mjs";

const owner = "cm123456789abcdef";

test("allows same-user uploads, outputs, and bundled reference assets", () => {
  assert.equal(isAllowedImageReference(`/uploads/${owner}/profile_1.png`, owner), true);
  assert.equal(isAllowedImageReference(`/outputs/${owner}/result_1.jpg`, owner), true);
  assert.equal(isAllowedImageReference("/mf-assets/home-ref-profile-1.png", owner), true);
});

test("rejects other users' files and unknown local folders", () => {
  assert.equal(isAllowedImageReference("/uploads/another-user/profile.png", owner), false);
  assert.equal(isAllowedImageReference("/outputs/another-user/result.png", owner), false);
  assert.equal(isAllowedImageReference("/etc/passwd", owner), false);
});

test("rejects remote, encoded traversal, protocol-relative, and malformed paths", () => {
  for (const value of [
    "http://127.0.0.1/private.png",
    "https://example.com/image.png",
    "//169.254.169.254/latest/meta-data",
    `/uploads/${owner}/%2e%2e/secret.png`,
    `/uploads/${owner}/%2fetc%2fpasswd`,
    `/uploads/${owner}/image.png?download=1`,
    `/uploads/${owner}/image.png#fragment`,
    `/uploads/${owner}/bad\\path.png`,
    "data:image/png;base64,AAAA",
  ]) assert.equal(isAllowedImageReference(value, owner), false, value);
});

test("root-level images are not treated as private files owned by a user", () => {
  assert.equal(isOwnedStoredImagePath("outputs", ["legacy-public.jpg"], "user-1"), false);
  assert.equal(isOwnedStoredImagePath("uploads", ["user-1", "photo.jpg"], "user-1"), true);
  assert.equal(isOwnedStoredImagePath("outputs", ["user-2", "photo.jpg"], "user-1"), false);
});
