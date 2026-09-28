// 生活展示面的参考逻辑纯函数：参考来源（模板库/用户参考图）、动作微调、
// 背景/服装调整选项 → 图片角色数组 + 生成提示词 + 生成前摘要。
// UI 与请求组装都从这里取值，保证页面文案、摘要和真实发给模型的内容一致。

// 动作微调候选：真实语义名称（不再是"姿势灵感 01"编号），kind 用于按模板类型过滤。
// 第一轮动作只走文字描述，不传动作参考图——模板/参考图本身已含姿势，文字足以微调，
// 且姿势灵感库图片没有可靠的动作标注，乱传图反而会把陌生人背景带进成片。
export const POSE_ACTIONS = [
  { id: "chin-rest", name: "单手托腮", kind: "sitting" },
  { id: "phone", name: "低头看手机", kind: "sitting" },
  { id: "window-gaze", name: "望向窗外", kind: "sitting" },
  { id: "lean-forward", name: "身体前倾撑桌", kind: "sitting" },
  { id: "arms-crossed", name: "双臂交叉放松", kind: "sitting" },
  { id: "pockets", name: "双手插兜", kind: "standing" },
  { id: "wall-lean", name: "靠墙站立", kind: "standing" },
  { id: "street-look", name: "环顾街头", kind: "standing" },
  { id: "sleeve", name: "整理衣袖", kind: "standing" },
  { id: "smile", name: "看镜头微笑", kind: "any" },
  { id: "soft-smile", name: "低头浅笑", kind: "any" },
  { id: "afar", name: "望向远方", kind: "any" },
  { id: "side", name: "轻微侧身", kind: "any" },
];

// 模板名 → 动作类型：坐姿类模板推坐姿动作，其余推站姿/通用动作
const SITTING_HINTS = ["坐", "咖啡", "餐桌", "餐厅", "车", "窗", "卧室", "沙发"];
const STANDING_HINTS = ["散步", "通勤", "地铁", "机场", "超市", "店内", "街", "市场"];

export function templateKind(templateName) {
  const name = String(templateName || "");
  if (SITTING_HINTS.some((hint) => name.includes(hint))) return "sitting";
  if (STANDING_HINTS.some((hint) => name.includes(hint))) return "standing";
  return "any";
}

export function compatibleActions(templateName) {
  const kind = templateKind(templateName);
  if (kind === "sitting") {
    return [
      ...POSE_ACTIONS.filter((item) => item.kind === "sitting"),
      ...POSE_ACTIONS.filter((item) => item.kind === "any"),
    ].slice(0, 7);
  }
  if (kind === "standing") {
    return [
      ...POSE_ACTIONS.filter((item) => item.kind === "standing"),
      ...POSE_ACTIONS.filter((item) => item.kind === "any"),
    ].slice(0, 7);
  }
  return POSE_ACTIONS.filter((item) => item.kind === "any");
}

export function actionNameById(id) {
  return POSE_ACTIONS.find((item) => item.id === id)?.name || null;
}

// 背景与服装调整选项（页面 chips 与提示词共用同一份定义）
export const BACKGROUND_OPTIONS = [
  { value: "keep", label: "保持参考图" },
  { value: "adjust", label: "轻微调整" },
  { value: "custom", label: "按描述更换" },
];

export const OUTFIT_OPTIONS = [
  { value: "keep", label: "保持参考图" },
  { value: "adjust", label: "调整适合我" },
  { value: "custom", label: "按描述更换" },
];

export function optionLabel(options, value) {
  return options.find((item) => item.value === value)?.label || options[0].label;
}

const MAX_TOTAL_IMAGES = 6;

// 图片角色数组：人物在前（第一张主参考），主参考图（模板或用户上传）其后，
// 衣服参考图作独立角色紧跟主参考图。总图片数超限时先丢辅助人物照，
// 绝不让主参考图或衣服参考图被挤掉。
export function buildImagePlan({ personPhotos = [], referenceImage = null, referenceOutfit = null } = {}) {
  const people = personPhotos.filter(Boolean).map((url, index) => ({
    url,
    role: index === 0 ? "person_main" : "person_aux",
  }));
  const reference = referenceImage ? [{ url: referenceImage, role: "reference" }] : [];
  const outfit = referenceOutfit ? [{ url: referenceOutfit, role: "reference_outfit" }] : [];
  const core = reference.length + outfit.length;
  const overflow = people.length + core - MAX_TOTAL_IMAGES;
  const keptPeople = overflow > 0 ? people.slice(0, people.length - overflow) : people;
  const dropped = people.length - keptPeople.length;
  return {
    images: [...keptPeople, ...reference, ...outfit].map((item) => item.url),
    roles: [...keptPeople, ...reference, ...outfit].map((item) => item.role),
    droppedPersonPhotos: dropped,
  };
}

// 提示词组装：主参考图（模板/用户上传）负责场景、姿势、构图、光线；
// 文字只表达调整规则，不再叠加默认场景名，也不会出现"姿势灵感 01"这类编号。
export function buildDisplayPrompt({
  mode = "template",
  templateName = "",
  background = "keep",
  customBackground = "",
  outfit = "adjust",
  customOutfit = "",
  actionName = null,
  mood = "自然抓拍",
  extraPrompt = "",
  similarity = 85,
  personCount = 1,
  hasReferenceOutfit = false,
} = {}) {
  const lines = [];
  lines.push(
    mode === "reference"
      ? "最后一张参考图是目标画面：生成的照片必须还原它的场景、背景、姿势、构图和光线，把画面中的人物替换成用户本人。"
      : `最后一张参考图是平台模板「${templateName}」：生成的照片必须还原模板的场景、背景、姿势、构图和光线，把画面中的人物替换成用户本人。`,
  );

  if (background === "keep") lines.push("背景保持参考图原样。");
  else if (background === "adjust") lines.push("背景在参考图基础上轻微调整，保持同一场景氛围。");
  else if (background === "custom" && String(customBackground || "").trim())
    lines.push(`背景改为：${String(customBackground).trim()}。其余画面尽量参考模板构图。`);

  if (outfit === "keep") lines.push("服装保持参考图原样。");
  else if (outfit === "adjust") lines.push("服装按参考图风格自然适配人物身材与气质，可轻微调整。");
  else if (outfit === "custom" && String(customOutfit || "").trim())
    lines.push(`服装风格改为：${String(customOutfit).trim()}。`);

  if (hasReferenceOutfit) {
    lines.push("用户已上传一张衣服参考图（紧跟主参考图之后），请把画面中的人物替换为穿上这件参考衣服；保持人物相貌、姿势和场景不变。");
  }

  if (actionName) lines.push(`人物动作改为：${actionName}；其余画面尽量与参考图保持一致。`);
  lines.push(`整体风格：${mood}，真实生活抓拍质感。`);
  if (String(extraPrompt || "").trim()) lines.push(`补充要求：${String(extraPrompt).trim()}`);
  lines.push(
    `图1到图${personCount}是同一个人的不同角度参考照片，生成的人物必须和这些照片是同一张脸，相似度${similarity}；最后一张参考图只提供场景、姿势和构图，忽略图中人物的相貌、穿着和背景。`,
  );
  return lines.join(" ");
}

// 生成前摘要：用户点生成前看到的内容 = 真实发给模型的内容
export function summarizeDraft({
  mode = "template",
  templateName = "",
  hasReference = false,
  hasReferenceOutfit = false,
  personLabels = [],
  actionName = null,
  background = "keep",
  outfit = "adjust",
  ratio = "3:4",
  count = 1,
  tier = "standard",
  cost = 0,
} = {}) {
  return {
    source:
      mode === "reference"
        ? "我的参考图 · 把我的人物替换进去"
        : `模板「${templateName}」 · 把我的人物替换进去`,
    people: personLabels.length ? personLabels.join(" · ") : "至少 1 张本人照片",
    action: actionName ? `动作改为${actionName}` : "动作跟随参考图",
    background: `背景：${optionLabel(BACKGROUND_OPTIONS, background)}`,
    outfit: hasReferenceOutfit
      ? "服装：用参考衣服图替换"
      : `服装：${optionLabel(OUTFIT_OPTIONS, outfit)}`,
    settings: `${ratio} · ${count} 张 · ${tier === "flagship" ? "顶帅档" : tier === "high" ? "大帅档" : "小帅档"}`,
    cost: `消耗 ${cost} 次生成额度`,
  };
}
