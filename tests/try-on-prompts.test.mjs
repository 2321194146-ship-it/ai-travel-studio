import test from "node:test";
import assert from "node:assert/strict";
import { buildHairTryOnPrompt, buildOutfitTryOnPrompt } from "../src/lib/try-on-prompts.mjs";

test("hair try-on prompt preserves identity and changes only hair", () => {
  const prompt = buildHairTryOnPrompt({ hairName: "三七侧背" });

  assert.match(prompt, /保持原图人物的身份/);
  assert.match(prompt, /只修改发型/);
  assert.match(prompt, /三七侧背/);
  assert.match(prompt, /3:4/);
  assert.match(prompt, /不复制参考图人物的脸/);
});

test("outfit try-on prompt preserves face and changes only clothing", () => {
  const prompt = buildOutfitTryOnPrompt();

  assert.match(prompt, /保持原图人物的身份/);
  assert.match(prompt, /只更换服装/);
  assert.match(prompt, /脸部、发型、体型、姿势和背景不变/);
  assert.match(prompt, /3:4/);
});
