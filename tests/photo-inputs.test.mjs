import test from "node:test";
import assert from "node:assert/strict";
import { hasPhotoInput, resolvePhotoInputs } from "../src/lib/photo-inputs.mjs";

test("档案照片可提交，演示预览不可作为本人照片", () => {
  assert.equal(hasPhotoInput({ archiveUrl: "/uploads/front.jpg" }), true);
  assert.equal(hasPhotoInput({ file: { name: "front.jpg" } }), true);
  assert.equal(hasPhotoInput({ preview: "/demo.jpg", demo: true }), false);
  assert.equal(hasPhotoInput(null), false);
});

test("复用档案正面照，不重新上传，并保留稀疏照片的原始档案位", async () => {
  const uploaded = [];
  const result = await resolvePhotoInputs([
    { archiveUrl: "/uploads/front.jpg" }, null, { file: { name: "body.jpg" } },
  ], async (file, index) => {
    uploaded.push({ name: file.name, index });
    return "/uploads/body.jpg";
  });
  assert.deepEqual(uploaded, [{ name: "body.jpg", index: 2 }]);
  assert.deepEqual(result, [
    { url: "/uploads/front.jpg", index: 0 },
    { url: "/uploads/body.jpg", index: 2 },
  ]);
});

test("纯档案照片无需上传，演示图被跳过", async () => {
  const result = await resolvePhotoInputs([
    { preview: "/demo.jpg" }, { archiveUrl: "/uploads/saved.jpg" },
  ], () => assert.fail("不应重新上传"));
  assert.deepEqual(result, [{ url: "/uploads/saved.jpg", index: 1 }]);
});

test("上传失败中止生成，不能把空 URL 当成功", async () => {
  await assert.rejects(resolvePhotoInputs([{ file: {} }], async () => {
    throw new Error("上传失败");
  }), /上传失败/);
});
