import test from "node:test";
import assert from "node:assert/strict";
import {
  BACKGROUND_OPTIONS,
  OUTFIT_OPTIONS,
  actionNameById,
  buildDisplayPrompt,
  buildImagePlan,
  compatibleActions,
  optionLabel,
  summarizeDraft,
  templateKind,
} from "../src/lib/display-compose.mjs";

test("buildImagePlan：人物在前、参考图收尾、角色正确", () => {
  const plan = buildImagePlan({
    personPhotos: ["p1.png", "p2.png", "p3.png"],
    referenceImage: "tpl.jpg",
  });
  assert.deepEqual(plan.images, ["p1.png", "p2.png", "p3.png", "tpl.jpg"]);
  assert.deepEqual(plan.roles, ["person_main", "person_aux", "person_aux", "reference"]);
  assert.equal(plan.droppedPersonPhotos, 0);
});

test("buildImagePlan：4 人物 + 1 参考图正好在上限内，不丢弃", () => {
  const plan = buildImagePlan({
    personPhotos: ["p1.png", "p2.png", "p3.png", "p4.png"],
    referenceImage: "tpl.jpg",
  });
  assert.equal(plan.images.length, 5);
  assert.equal(plan.roles[plan.roles.length - 1], "reference");
  assert.equal(plan.roles[0], "person_main");
  assert.equal(plan.droppedPersonPhotos, 0);
});

test("buildImagePlan：超出 6 张上限时从尾部丢辅助人物照，保住主参考图", () => {
  const plan = buildImagePlan({
    personPhotos: ["p1.png", "p2.png", "p3.png", "p4.png", "p5.png", "p6.png"],
    referenceImage: "tpl.jpg",
  });
  assert.equal(plan.images.length, 6);
  assert.equal(plan.roles[plan.roles.length - 1], "reference");
  assert.equal(plan.roles[0], "person_main");
  assert.equal(plan.droppedPersonPhotos, 1);
  assert.ok(!plan.images.includes("p6.png"));
});

test("buildImagePlan：只有参考图没有人物照也要成立", () => {
  const plan = buildImagePlan({ personPhotos: [], referenceImage: "tpl.jpg" });
  assert.deepEqual(plan.images, ["tpl.jpg"]);
  assert.deepEqual(plan.roles, ["reference"]);
});

test("buildImagePlan：空输入不抛错", () => {
  const plan = buildImagePlan({});
  assert.deepEqual(plan.images, []);
  assert.deepEqual(plan.roles, []);
});

test("模板提示词：包含模板名与替换声明，不再有默认场景硬拼", () => {
  const prompt = buildDisplayPrompt({
    mode: "template",
    templateName: "咖啡店",
    personCount: 2,
  });
  assert.ok(prompt.includes("咖啡店"));
  assert.ok(prompt.includes("替换成用户本人"));
  assert.ok(!prompt.includes("店内随拍"));
});

test("参考图提示词：绝不叠加默认场景", () => {
  const prompt = buildDisplayPrompt({ mode: "reference", personCount: 1 });
  assert.ok(prompt.includes("最后一张参考图是目标画面"));
  assert.ok(!prompt.includes("店内随拍"));
  assert.ok(!prompt.includes("模板"));
});

test("背景/服装选项如实进入提示词", () => {
  const keep = buildDisplayPrompt({ mode: "reference", background: "keep", outfit: "keep" });
  assert.ok(keep.includes("背景保持参考图原样"));
  assert.ok(keep.includes("服装保持参考图原样"));
  const adjust = buildDisplayPrompt({ mode: "reference", background: "adjust", outfit: "adjust" });
  assert.ok(adjust.includes("轻微调整"));
  assert.ok(adjust.includes("适配人物身材与气质"));
  const custom = buildDisplayPrompt({
    mode: "reference",
    background: "custom",
    customBackground: "夜晚便利店门口",
    outfit: "custom",
    customOutfit: "黑色大衣",
  });
  assert.ok(custom.includes("背景改为：夜晚便利店门口"));
  assert.ok(custom.includes("服装风格改为：黑色大衣"));
});

test("动作微调：选中才出现在提示词，未选不出现姿势编号", () => {
  const withAction = buildDisplayPrompt({ mode: "template", actionName: "单手托腮" });
  assert.ok(withAction.includes("人物动作改为：单手托腮"));
  const without = buildDisplayPrompt({ mode: "template" });
  assert.ok(!without.includes("人物动作改为"));
  assert.ok(!without.includes("姿势灵感"));
});

test("动作库：坐姿模板推坐姿动作，站姿模板推站姿动作，语义名而非编号", () => {
  assert.equal(templateKind("室内坐姿"), "sitting");
  assert.equal(templateKind("地铁通勤"), "standing");
  const sitting = compatibleActions("餐厅坐姿");
  assert.ok(sitting.some((item) => item.name === "单手托腮"));
  assert.ok(!sitting.some((item) => item.name === "双手插兜"));
  const standing = compatibleActions("城市散步");
  assert.ok(standing.some((item) => item.name === "双手插兜"));
  assert.ok(!standing.some((item) => item.name === "单手托腮"));
  assert.ok(compatibleActions("自然自拍").length > 0);
  assert.equal(actionNameById("phone"), "低头看手机");
  assert.equal(actionNameById("not-exist"), null);
});

test("选项标签：非法值回退默认", () => {
  assert.equal(optionLabel(BACKGROUND_OPTIONS, "keep"), "保持参考图");
  assert.equal(optionLabel(BACKGROUND_OPTIONS, "bogus"), "保持参考图");
  assert.equal(optionLabel(OUTFIT_OPTIONS, "adjust"), "调整适合我");
});

test("生成前摘要：模板/参考图两种模式与实际档位计费", () => {
  const tpl = summarizeDraft({
    mode: "template",
    templateName: "咖啡店",
    personLabels: ["正面照"],
    count: 2,
    tier: "standard",
    cost: 4,
  });
  assert.ok(tpl.source.includes("咖啡店"));
  assert.equal(tpl.action, "动作跟随参考图");
  assert.ok(tpl.cost.includes("4"));
  const ref = summarizeDraft({ mode: "reference", hasReference: true, cost: 2 });
  assert.ok(ref.source.includes("我的参考图"));
  const adjusted = summarizeDraft({
    mode: "template",
    templateName: "咖啡店",
    tier: "standard",
    cost: 2,
  });
  // 调用方传入钳制后的实际档位，摘要如实显示（页面用 effectiveTier）
  assert.ok(adjusted.settings.includes("小帅档"));
  const action = summarizeDraft({ actionName: "低头看手机" });
  assert.equal(action.action, "动作改为低头看手机");
});
