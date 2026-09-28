const IDENTITY =
  "保持原图人物的身份、五官、脸型、肤色、表情、头部比例和身体比例一致";

function cleanName(value, fallback) {
  const name = String(value || "").trim().slice(0, 40);
  return name || fallback;
}

// 参考图多为带文字标注的样式海报，必须明确禁止把文字渲染进成片
const NO_TEXT =
  "参考图中的任何文字、数字、水印、贴纸和标注都只是样式说明，绝对不能出现在成片画面中";

export function buildHairTryOnPrompt({ hairName, faceLock = true, realistic = true } = {}) {
  const identity = faceLock
    ? `${IDENTITY}，脸部不能被重绘或替换`
    : `${IDENTITY}，允许对发型边缘做自然融合但不得改变脸部特征`;
  const texture = realistic
    ? "保留真实皮肤纹理、自然发丝和真实光影"
    : "保持干净自然的发丝边缘和柔和光影";
  return [
    "你是专业男性发型试穿编辑。",
    identity,
    "只修改发型，不改变衣服、耳朵、肩膀、姿势、背景和拍摄角度。",
    "发型参考图只用于参考发型轮廓、长度、刘海方向、层次和纹理，不复制参考图人物的脸、五官、体型或背景。",
    NO_TEXT,
    `选定发型：${cleanName(hairName, "适合本人的自然发型")}。`,
    texture,
    "头顶、发际线、脸部和肩膀完整可见，生成真实的 3:4 竖版人像，发型与原人物头型自然衔接。",
  ].join(" ");
}

export function buildOutfitTryOnPrompt({ faceLock = true, realistic = true } = {}) {
  const identity = faceLock
    ? `${IDENTITY}，脸部不能被重绘或替换`
    : `${IDENTITY}，允许服装边缘自然融合但不得改变脸部特征`;
  const texture = realistic
    ? "保留真实皮肤、面料纹理和自然光影"
    : "保持干净自然的面料边缘和柔和光影";
  return [
    "你是专业男性穿搭试穿编辑。",
    identity,
    "只更换服装，脸部、发型、体型、姿势和背景不变。",
    "服装参考图只用于参考款式、颜色、版型和面料，不复制参考图人物的脸、五官、体型或背景。",
    NO_TEXT,
    texture,
    "服装要合身、自然贴合身体，不出现多余肢体或变形，生成真实的 3:4 竖版人像。",
  ].join(" ");
}
