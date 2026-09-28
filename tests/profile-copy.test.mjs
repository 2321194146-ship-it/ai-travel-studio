import test from "node:test";
import assert from "node:assert/strict";

import { membershipCopy, profileToolNames } from "../src/lib/profile-copy.mjs";

test("未登录用户不显示假的专业版身份", () => {
  assert.deepEqual(membershipCopy(null), {
    title: "未登录",
    subtitle: "登录后同步会员与生成次数",
  });
});

test("普通账号显示未开通会员，会员显示真实档位", () => {
  assert.equal(membershipCopy({ membership: "NONE" }).title, "未开通会员");
  assert.equal(membershipCopy({ membership: "HIGH" }).title, "高清会员");
});

test("个人页工具只保留已经有真实数据来源的入口，充值中心直达充值页", () => {
  assert.deepEqual(profileToolNames(), ["照片档案", "生成记录", "购买记录", "充值中心"]);
});
