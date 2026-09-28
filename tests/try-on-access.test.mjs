import test from "node:test";
import assert from "node:assert/strict";

import {
  tryOnButtonLabel,
  tryOnFailureMessage,
  tryOnLoginUrl,
} from "../src/lib/try-on-access.mjs";

test("游客按钮不承诺免费次数", () => {
  assert.equal(tryOnButtonLabel("hair", false), "生成发型效果");
  assert.equal(tryOnButtonLabel("outfit", false), "生成穿搭效果");
});

test("登录用户使用次数口径，不出现积分", () => {
  assert.equal(tryOnButtonLabel("hair", true), "生成发型效果 · 消耗2次");
  assert.equal(tryOnButtonLabel("outfit", true), "生成穿搭效果 · 消耗6次");
});

test("登录地址保留发型或穿搭的返回位置", () => {
  assert.equal(tryOnLoginUrl("hair"), "/login?callbackUrl=%2F%3Fresume%3Dtryon%26mode%3Dhair");
  assert.equal(tryOnLoginUrl("outfit"), "/login?callbackUrl=%2F%3Fresume%3Dtryon%26mode%3Doutfit");
});

test("次数不足给出可执行提示，错误文案不出现积分", () => {
  assert.match(tryOnFailureMessage(402), /生成次数不足/);
  assert.doesNotMatch(tryOnFailureMessage(500), /积分/);
});
