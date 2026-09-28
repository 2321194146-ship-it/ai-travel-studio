import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { storedImageResponse } from "../src/lib/stored-image.mjs";

test("new stored images are readable without restarting the server", async () => {
  const previous = process.cwd();
  const previousStorage = process.env.IMAGE_STORAGE_DIR;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "report-image-test-"));
  try {
    process.chdir(root);
    delete process.env.IMAGE_STORAGE_DIR;
    for (const directory of ["uploads", "outputs"]) {
      await fs.mkdir(path.join(root, ".data", directory, "test-user"), { recursive: true });
      await fs.writeFile(path.join(root, ".data", directory, "test-user", "new.jpg"), "synthetic-test-bytes");
      const response = await storedImageResponse(directory, Promise.resolve({ path: ["test-user", "new.jpg"] }));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "image/jpeg");
      assert.equal(await response.text(), "synthetic-test-bytes");
    }
    for (const segments of [["..", ".env"], ["test-user", "missing.jpg"], ["test-user", "new.txt"], ["test-user/new.jpg"], ["test-user", "..\\.env"]]) {
      assert.equal((await storedImageResponse("uploads", Promise.resolve({ path: segments }))).status, 404);
    }
    await fs.writeFile(path.join(root, "outside.jpg"), "outside");
    await fs.symlink(path.join(root, "outside.jpg"), path.join(root, ".data", "uploads", "test-user", "escape.jpg"));
    assert.equal((await storedImageResponse("uploads", Promise.resolve({ path: ["test-user", "escape.jpg"] }))).status, 404);
    await assert.rejects(fs.access(path.join(root, "public", "uploads")));
  } finally {
    process.chdir(previous);
    if (previousStorage === undefined) delete process.env.IMAGE_STORAGE_DIR;
    else process.env.IMAGE_STORAGE_DIR = previousStorage;
    await fs.rm(root, { recursive: true, force: true });
  }
});
