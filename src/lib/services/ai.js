// 统一 AI 服务层：保留千问、GPT-Image、豆包适配器；默认路由只调用豆包。
//
// 只允许在服务端使用，严禁被客户端组件 import。
// - 所有 API Key 只来自服务器 .env，绝不进入前端 / 日志 / Git。
// - 后端按档位选择模型：普通档优先 Seedream Flash，高档/旗舰/编辑优先 Seedream Pro。
// - 仅在明确配置 fallback 时才跨供应商重试；默认失败即返回，不产生意外的第三方费用。
// - 人脸照片只保存在服务器本地必要时间（TTL），并提供删除能力。

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import config from "@/lib/config";
import { privateImageDirectory, resolvePrivateImagePath } from "@/lib/image-storage.mjs";
import { REPORT_HAIR_CATALOG, outfitCatalogPrompt } from "@/lib/makeover-catalog.mjs";

// ── 本地存储（人脸照片 / 生成结果）────────────────────────────
export const UPLOAD_DIR = privateImageDirectory("uploads");
export const OUTPUT_DIR = privateImageDirectory("outputs");
const UPLOAD_TTL_MS =
  (Number(process.env.UPLOAD_TTL_HOURS) || 24) * 60 * 60 * 1000;

export class AiError extends Error {
  constructor(
    message,
    { provider = null, model = null, reason = null, code = null } = {},
  ) {
    super(message);
    this.name = "AiError";
    this.provider = provider;
    this.model = model;
    this.reason = reason;
    this.code = code;
  }
}

// 错误信息兜底清洗：避免任何疑似 Key 的片段进入日志/数据库
export function safeError(e) {
  let m = e instanceof Error ? e.message : String(e);
  m = m.replace(
    /((?:Bearer\s+|api[_-]?key[=:\s]+|sk-[A-Za-z0-9]))[A-Za-z0-9_\-\.]{6,}/gi,
    "$1***",
  );
  return m.slice(0, 500);
}

// ── 图片解析：URL / 本地路径 / data URI → data URI ─────────────
function localPathFromUrl(url) {
  if (typeof url !== "string") return null;
  const privateMatch = url.match(/^\/(uploads|outputs)\/(.+)$/);
  if (privateMatch) {
    return resolvePrivateImagePath(privateMatch[1], privateMatch[2].split("/"))?.filePath || null;
  }
  if (!url.startsWith("/mf-assets/") || url.includes("\\") || url.includes("?") || url.includes("#")) return null;
  const publicRoot = path.resolve(process.cwd(), "public");
  const segments = url.slice(1).split("/");
  try {
    if (segments.some((segment) => !segment || segment.startsWith(".") || decodeURIComponent(segment) !== segment)) return null;
  } catch {
    return null;
  }
  const candidate = path.resolve(publicRoot, ...segments);
  return candidate.startsWith(`${publicRoot}${path.sep}`) ? candidate : null;
}

async function fileToDataUri(absPath) {
  const buf = await fs.readFile(absPath);
  const ext = path.extname(absPath).toLowerCase().replace(".", "") || "jpeg";
  const mime =
    ext === "jpg"
      ? "jpeg"
      : ["png", "webp", "gif", "bmp", "tiff"].includes(ext)
        ? ext
        : "jpeg";
  return `data:image/${mime};base64,${buf.toString("base64")}`;
}

export async function resolveImageData(source) {
  if (typeof source !== "string" || !source.trim()) {
    throw new AiError("Invalid image source", { reason: "empty_source" });
  }
  const s = source.trim();
  const local = localPathFromUrl(s);
  if (local) {
    try {
      return await fileToDataUri(local);
    } catch (e) {
      throw new AiError(`Local image not found: ${s}`, {
        reason: "file_missing",
        code: "E404",
      });
    }
  }

  throw new AiError("Only local app image paths are accepted", { reason: "invalid_image_source" });
}

// ── OpenAI 兼容 Chat Completions（千问视觉 / 方舟视觉）────────
export async function chatCompletion({
  baseUrl,
  apiKey,
  model,
  systemPrompt,
  userPrompt,
  images = [],
  temperature = 0,
  maxTokens,
  responseFormat,
  timeoutMs = 90_000,
}) {
  const content = [{ type: "text", text: userPrompt }];
  for (const img of images) {
    content.push({ type: "image_url", image_url: { url: img } });
  }
  const body = {
    model,
    messages: [
      ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
      { role: "user", content },
    ],
    temperature,
  };
  if (maxTokens) body.max_tokens = maxTokens;
  if (responseFormat) body.response_format = responseFormat;

  const res = await fetch(`${String(baseUrl).replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    // 上游挂起时主动中断，避免请求无限占用（Nginx 300s 先行 504 会造成用户重试重复扣费）
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new AiError(`Chat completion failed (${res.status})`, {
      reason: safeError(raw).slice(0, 300),
    });
  }
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new AiError("Bad chat completion response", { reason: "bad_json" });
  }
  const text = extractText(json);
  if (!text) {
    throw new AiError("Empty chat completion output", { reason: "empty" });
  }
  return text;
}

function extractText(json) {
  const msg = json?.choices?.[0]?.message;
  if (!msg) return "";
  const c = msg.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((b) => {
        if (typeof b === "string") return b;
        if (b?.type === "text") return b.text ?? "";
        if (b?.text) return b.text;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function extractImages(json) {
  const out = [];
  const msg = json?.choices?.[0]?.message;
  if (msg) {
    if (Array.isArray(msg.content)) {
      for (const b of msg.content) {
        if (b?.type === "image_url" && b?.image_url?.url) out.push(b.image_url.url);
        else if (b?.type === "image" && b?.image?.url) out.push(b.image.url);
        else if (typeof b?.image === "string") out.push(b.image);
        else if (typeof b === "string" && /^(data:image|https?:)/.test(b)) out.push(b);
      }
    }
    if (Array.isArray(msg.images)) out.push(...msg.images);
    if (typeof msg.image === "string") out.push(msg.image);
  }
  if (Array.isArray(json?.images)) out.push(...json.images);
  if (Array.isArray(json?.output)) {
    for (const o of json.output) {
      if (typeof o === "string" && /^(data:image|https?:)/.test(o)) out.push(o);
      else if (o?.url) out.push(o.url);
      else if (o?.b64_json) out.push(`data:image/jpeg;base64,${o.b64_json}`);
    }
  }
  return [...new Set(out.filter(Boolean))];
}

// ── 千问图像生成（qwen-image，OpenAI 兼容多模态）─────────────
async function generateQwenImage({ model, prompt, images = [], count = 1 }) {
  const cfg = config.ai.providers.qwen;
  if (!cfg.apiKey || !model) {
    throw new AiError("Qwen image provider not configured", {
      provider: "qwen",
      model,
      reason: "not_configured",
    });
  }
  const content = [];
  // 行业建议（Nano Banana 指南）：输入图不超过 5 张，超出后身份一致性明显下降
  for (const img of images.slice(0, 5)) content.push({ image: img });
  content.push({ text: prompt });
  const nativeBaseUrl = cfg.baseUrl.replace(/\/compatible-mode\/v1\/?$/, "");
  const res = await fetch(
    `${nativeBaseUrl}/api/v1/services/aigc/multimodal-generation/generation`,
    {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: { messages: [{ role: "user", content }] },
      parameters: {
        prompt_extend: true,
        n: Math.min(Math.max(count, 1), 6),
        watermark: false,
      },
    }),
    signal: AbortSignal.timeout(240_000),
  },
  );
  const raw = await res.text();
  if (!res.ok) {
    throw new AiError(`Qwen image failed (${res.status})`, {
      provider: "qwen",
      model,
      reason: safeError(raw).slice(0, 300),
    });
  }
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new AiError("Bad qwen image response", {
      provider: "qwen",
      model,
      reason: "bad_json",
    });
  }
  const urls = extractImages(json?.output || json);
  if (!urls.length) {
    throw new AiError("Qwen image returned no output", {
      provider: "qwen",
      model,
      reason: "empty_output",
    });
  }
  return urls.slice(0, count);
}

// ── GPT-Image（本机 CLIProxyAPI 8317，OpenAI images API 兼容）──
async function generateGptImage({ model, prompt, images = [], count = 1 }) {
  const cfg = config.ai.providers.gptimage;
  if (!cfg.apiKey || !model) {
    throw new AiError("GPT image provider not configured", {
      provider: "gptimage",
      model,
      reason: "not_configured",
    });
  }
  const callOnce = async () => {
    let res;
    if (images.length) {
      // 图生图：走 multipart /v1/images/edits（官方支持重复 image[] 传多图）
      // 第 1 张 = 人物主参考；后续 = 姿势/氛围参考（提示词里已声明各自角色）
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", prompt);
      form.append("size", "1024x1536");
      const parts = images.slice(0, 3);
      for (let i = 0; i < parts.length; i += 1) {
        const buf = Buffer.from(
          parts[i].replace(/^data:[^,]+,/, ""),
          "base64",
        );
        const blob = new Blob([buf], { type: "image/jpeg" });
        form.append(i === 0 ? "image" : "image[]", blob, `input${i}.jpg`);
      }
      res = await fetch(`${cfg.baseUrl}/images/edits`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
        body: form,
        signal: AbortSignal.timeout(300_000),
      });
    } else {
      // 文生图
      res = await fetch(`${cfg.baseUrl}/images/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model,
          prompt,
          size: "1024x1536",
        }),
        signal: AbortSignal.timeout(300_000),
      });
    }
    const raw = await res.text();
    if (!res.ok) {
      throw new AiError(`GPT image failed (${res.status})`, {
        provider: "gptimage",
        model,
        reason: safeError(raw).slice(0, 300),
      });
    }
    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new AiError("Bad gpt image response", {
        provider: "gptimage",
        model,
        reason: "bad_json",
      });
    }
    for (const d of json.data || []) {
      if (d?.b64_json) return `data:image/png;base64,${d.b64_json}`;
      if (d?.url) return d.url;
    }
    throw new AiError("GPT image returned no output", {
      provider: "gptimage",
      model,
      reason: "empty_output",
    });
  };
  const n = Math.min(Math.max(count, 1), 4);
  const out = await Promise.all(Array.from({ length: n }, () => callOnce()));
  return out;
}

// ── 火山方舟豆包图片生成（Seedream / SeedEdit）──────────────
async function generateArkImage({ model, prompt, images = [], size = "2K", count = 1 }) {
  const cfg = config.ai.providers.ark;
  if (!cfg.apiKey || !model) {
    throw new AiError("Ark image provider not configured", {
      provider: "ark",
      model,
      reason: "not_configured",
    });
  }
  const n = Math.min(Math.max(count, 1), 9);

  const callOnce = async () => {
    const body = {
      model,
      prompt,
      ...(images.length
        ? { image: images.length === 1 ? images[0] : images }
        : {}),
      size,
      response_format: "b64_json",
      watermark: false,
      // 注意：seedream-5-0-pro 等模型不支持 sequential_image_generation，
      // 该参数已移除以避免 4xx；需要顺序生成时由调用方控制 count=1。
    };
    const res = await fetch(`${cfg.baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(240_000),
    });
    const raw = await res.text();
    if (!res.ok) {
      throw new AiError(`Ark image failed (${res.status})`, {
        provider: "ark",
        model,
        reason: safeError(raw).slice(0, 300),
      });
    }
    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new AiError("Bad ark image response", {
        provider: "ark",
        model,
        reason: "bad_json",
      });
    }
    for (const d of json.data || []) {
      if (d?.b64_json) return `data:image/jpeg;base64,${d.b64_json}`;
      if (d?.url) return d.url;
    }
    const err = json.data?.[0]?.error;
    throw new AiError("Ark image returned no output", {
      provider: "ark",
      model,
      reason: err ? `${err.code || ""} ${err.message || ""}`.trim() : "empty_output",
    });
  };

  const out = await Promise.all(Array.from({ length: n }, () => callOnce()));
  return out;
}

// ── 档位 → 供应商/模型 路由 ────────────────────────────────
const LEGACY_MODEL_TO_TIER = {
  "nano-banana-2-edit": "standard",
  "bytedance-seedream-5.0-pro-edit": "high",
  "bytedance-seedream-5.0-lite-edit": "high",
  "nano-banana-pro-edit": "flagship",
  "gpt-image-2-image-to-image": "standard",
};

function resolveRoute(tier, mode) {
  const t =
    tier === "high" ? "high" : tier === "flagship" ? "flagship" : "standard";
  const getModel = (provider, selectedTier, explicitModel = "") => {
    if (explicitModel) return explicitModel;
    const providerConfig = config.ai.providers[provider];
    if (!providerConfig) return "";
    if (provider === "ark") {
      if (selectedTier === "standard") {
        return providerConfig.flashImageModel || providerConfig.imageModel;
      }
      return providerConfig.proImageModel || providerConfig.imageModel;
    }
    if (provider === "qwen" || provider === "gptimage") {
      return providerConfig.imageModel;
    }
    return "";
  };
  const makeRoute = (route, selectedTier) => ({
    provider: route.provider,
    model: getModel(route.provider, selectedTier, route.model),
    fallbackProvider: route.fallbackProvider || null,
    fallbackModel: route.fallbackProvider
      ? getModel(route.fallbackProvider, selectedTier, route.fallbackModel)
      : "",
    tier: selectedTier,
  });

  if (mode === "edit") {
    // 编辑涉及本人脸部与身份一致性，使用 Pro 档；fallback 必须显式配置。
    return makeRoute(config.ai.edit, "flagship");
  }
  const tc = config.ai.tiers[t];
  return makeRoute(tc, t);
}

function arkSizeFrom(resolution) {
  const r = String(resolution || "1k").toLowerCase();
  if (r === "4k") return "4K";
  if (r === "2k") return "2K";
  return "1K";
}

// 供应商输入图截断按角色优先级：主人物 > 主参考图 > 辅助人物。
// 之前 GPT 只取前 3 张是盲截，4 张人物照 + 参考图时参考图会被静默丢掉。
const ROLE_PRIORITY = ["person_main", "reference", "reference_outfit", "person_aux", "action"];
function selectImagesByRole(images, roles, max) {
  if (images.length <= max) return images.slice(0, max);
  if (!Array.isArray(roles) || roles.length !== images.length) return images.slice(0, max);
  const indexed = images.map((url, index) => ({ url, role: roles[index] }));
  const kept = [];
  for (const role of ROLE_PRIORITY) {
    for (const item of indexed) {
      if (item.role === role && kept.length < max && !kept.includes(item.url)) kept.push(item.url);
    }
  }
  for (const item of indexed) {
    if (kept.length >= max) break;
    if (!kept.includes(item.url)) kept.push(item.url);
  }
  // 保持原始顺序，与提示词"图1到图N"的声明一致
  return images.filter((url) => kept.includes(url));
}

function withRatioPrompt(prompt, aspectRatio) {
  const ratio = String(aspectRatio || "").toUpperCase();
  if (!ratio || ratio === "AUTO") return prompt;
  const m = ratio.match(/(\d+)[:：](\d+)/);
  if (!m) return prompt;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!w || !h) return prompt;
  const desc =
    w === h ? "1:1 方形" : w > h ? `${w}:${h} 横版构图` : `${w}:${h} 竖版构图`;
  return `${prompt}。请按${desc}比例构图生成。`;
}

// ── 统一生成入口：主模型失败自动切备用 ───────────────────────
export async function generateImages({
  tier = "standard",
  mode,
  prompt,
  inputImages = [],
  imageRoles = null,
  resolution = "1k",
  aspectRatio = "Auto",
  count = 1,
  requestedModel,
}) {
  const finalTier =
    requestedModel && LEGACY_MODEL_TO_TIER[requestedModel]
      ? LEGACY_MODEL_TO_TIER[requestedModel]
      : tier;
  const route = resolveRoute(finalTier, mode);

  const imagesData = [];
  for (const u of inputImages) {
    imagesData.push(await resolveImageData(u));
  }
  const size = arkSizeFrom(resolution);
  const attempts = [];

  const tryOne = async (provider, model) => {
    if (!model) {
      throw new AiError(`${provider} model not configured`, {
        provider,
        model,
        reason: "not_configured",
      });
    }
    if (provider === "ark") {
      return generateArkImage({
        model,
        prompt: withRatioPrompt(prompt, aspectRatio),
        images: imagesData,
        size,
        count,
      });
    }
    if (provider === "gptimage") {
      return generateGptImage({
        model,
        prompt: withRatioPrompt(prompt, aspectRatio),
        images: selectImagesByRole(imagesData, imageRoles, 3),
        count,
      });
    }
    if (provider === "qwen") {
      return generateQwenImage({ model, prompt, images: imagesData, count });
    }
    throw new AiError("Unsupported image provider", {
      provider,
      model,
      reason: "unsupported_provider",
    });
  };

  try {
    const imgs = await tryOne(route.provider, route.model);
    if (imgs && imgs.length) {
      return {
        images: imgs,
        provider: route.provider,
        model: route.model,
        tier: route.tier,
        attempts: 1,
        failures: [],
      };
    }
    throw new AiError("Provider returned empty output", {
      provider: route.provider,
      model: route.model,
      reason: "empty_output",
    });
  } catch (e) {
    attempts.push({
      provider: route.provider,
      model: route.model,
      error: safeError(e),
    });
  }

  if (route.fallbackProvider && route.fallbackModel) {
    try {
      const imgs = await tryOne(route.fallbackProvider, route.fallbackModel);
      if (imgs && imgs.length) {
        return {
          images: imgs,
          provider: route.fallbackProvider,
          model: route.fallbackModel,
          tier: route.tier,
          attempts: 2,
          failures: attempts,
        };
      }
      throw new AiError("Fallback returned empty output", {
        provider: route.fallbackProvider,
        model: route.fallbackModel,
        reason: "empty_output",
      });
    } catch (e) {
      attempts.push({
        provider: route.fallbackProvider,
        model: route.fallbackModel,
        error: safeError(e),
      });
    }
  }

  throw new AiError("All AI providers failed", {
    provider: route.provider,
    model: route.model,
    reason: attempts.map((a) => `${a.provider}:${a.error}`).join(" | "),
  });
}

// ── 形象诊断（千问视觉，失败切方舟视觉）──────────────────────
const VISION_SYSTEM_PROMPT = `你是一位有审美判断和落地经验的男性形象风格改造师，工作方式接近专业造型顾问：先观察证据，再给出改造策略，最后给出用户今天能执行的方案。

你的判断边界：
1. 只能依据照片中真实可见的内容，包括脸部轮廓、五官相对比例、发型轮廓、光线、镜头角度、表情、上半身比例和服装；看不清的内容必须写“无法从这张照片确认”，不能编造。
2. 不评价人的价值、阶层、性格、健康或吸引力，不使用“丑、差、没救”等羞辱性表达；要指出优势，再说明可优化的呈现因素。
3. 评分不是颜值打分，也不是医学或专业机构认证，而是“这张照片当前的呈现质量与可塑性”参考分。分数必须和可见依据一致：不能因为脸型标签就固定给某个分数，也不能为了讨好用户全部给高分。
4. 发型建议要说明顶部高度、两侧体积、刘海/额头露出、纹理和维护难度；穿搭建议要说明领口、肩线、版型、颜色、材质和使用场景。建议必须能被理发师或普通用户执行。
5. 优先给出一个主风格定位，并说明适合的场景；不要堆砌互相冲突的风格词。

评分口径：
- score（轮廓呈现）：脸部纵横比例、下颌/颧骨/额头的视觉平衡，以及发型对轮廓的衬托空间。
- auraScore（气质呈现）：表情、光线、发型、服装和整体风格是否统一，不把天生长相当成气质结论。
- cameraScore（上镜呈现）：镜头角度、光线均匀度、主体清晰度、构图和背景干扰。
每项都要返回 scoreReasons，包含 basis（评分依据）、strength（已有优势）、opportunity（提升空间），每段 20—60 个中文字符。

只输出合法 JSON，不要 markdown，不要解释。字段必须包含：faceShape、faceBalance、jawline、score、aura、auraScore、camera、cameraScore、scoreReasons、suggestion、focus、goal、hairReason、outfitAdvice、avoid、actionPlan、hairstyles、outfits、styles、inputQuality、confidence。
faceBalance 和 jawline 各用一句短句描述照片中可见的五官比例与下颌呈现；若角度、遮挡或光线影响判断，明确写“这张照片无法确认”，不可按脸型套结论。
score、auraScore、cameraScore、confidence 是 0—100 整数；actionPlan 必须正好是 3 条可执行建议；hairstyles 和 outfits 至少返回 3 项、最多 5 项；styles 返回 2—3 项。
faceShape 只能是：圆形脸、方形脸、椭圆形脸、心形脸、长形脸、菱形脸、无法从这张照片确认。照片角度、遮挡或清晰度不足以判断时，必须选择“无法从这张照片确认”，不能猜一个脸型。`;
const VISION_USER_PROMPT = `请完成一次完整的男性形象改造诊断。先用一句话概括照片里最值得保留的优势，再写清楚当前最影响呈现的 1—2 个具体因素。focus 必须指向照片可见的问题，goal 必须对应一个清晰的改造目标，hairReason 和 outfitAdvice 必须解释“为什么适合他”，avoid 必须写明避雷项和原因。

请把 scoreReasons 的三项分别对应 score、auraScore、cameraScore；每项都写 basis、strength、opportunity。inputQuality 写清楚照片是否适合诊断、影响判断的光线/角度/清晰度问题；confidence 是你对本次判断的把握度，不是用户的颜值。

发型推荐必须从以下发型库名称中选择，name 必须逐字匹配其中一项：
${REPORT_HAIR_CATALOG.join("、")}

穿搭推荐必须从以下穿搭库选择 3 套，catalogId 必须逐字使用对应 ID，name 使用对应名称。不要自造库里没有的图片或商品：
${outfitCatalogPrompt()}

hairstyles 返回对象数组，每项包含 name、why、execution、maintenance；至少 3 项。outfits 返回对象数组，每项包含 catalogId、name、why、items、scene；至少 3 项。styles 返回对象数组，每项包含 name、reason、keywords。不要复制参考图片人物，不要凭空假设身高、体重、职业或消费能力。严格按系统要求返回 JSON。`;

const REVIEW_SYSTEM_PROMPT = `你是独立的男性形象诊断质量审核员。你会看到用户这次的原始照片和另一个视觉模型生成的诊断草稿。请逐项核对：照片证据是否可见、评分理由是否对应指标、文字是否把推断说成事实、发型/穿搭是否能落地。

审核规则：
1. 仅保留照片里能直接观察到的描述。任何看不清、被遮挡、无法从单张照片判断的内容，改成“这张照片无法确认”，不要补猜测。
2. 不评价人的价值、阶层、性格、健康或吸引力，不使用羞辱表达。分数只能描述这张照片的呈现质量与可塑性。
3. 不要按脸型模板自动补建议。每一条建议都要能指出它对应的照片特征；否则删掉或改为不确定说明。
4. 必须保留发型库和穿搭库的有效 catalogId。只能在给定目录中选择；不要编造目录条目。
5. 可以改写或删除没有依据的结论，但不要引入草稿和照片都没有的新事实。尽量保留有依据的个性化内容。
6. 返回一份可以直接展示的完整 reviewedReport，包含原诊断的全部必需字段，并提供 verdict、confidence、notes。只输出 JSON，不要 markdown。

JSON 顶层格式：{"verdict":"approved 或 corrected","confidence":0到100整数,"notes":["简短审核说明"],"reviewedReport":{完整诊断对象}}。

reviewedReport 必须满足与草稿相同的数据格式：
- faceShape 必须逐字使用圆形脸、方形脸、椭圆形脸、心形脸、长形脸、菱形脸或“无法从这张照片确认”；偏方、偏长写入 faceBalance，证据不足时选择无法确认，不得强行分类。
- 保留 faceBalance、jawline、score、aura、auraScore、camera、cameraScore、confidence、inputQuality。四个分数与 confidence 均使用 0—100 整数。
- suggestion、focus、goal、hairReason、outfitAdvice、avoid、inputQuality 各写 20—80 个中文字符，内容必须有照片依据；无法确认时说明原因，不能编造。
- actionPlan 必须正好 3 条，每条 20—60 个中文字符，明确可执行动作。
- scoreReasons 必须为 {face:{basis,strength,opportunity},aura:{basis,strength,opportunity},camera:{basis,strength,opportunity}}；每段 20—60 个中文字符。
- hairstyles 至少 3 项，name 必须逐字匹配发型库；why、execution 各 20—60 字，maintenance 15—40 字。
- outfits 至少 3 项，catalogId 与 name 必须逐字匹配穿搭库；why 写 20—60 字。
- styles 至少 2 项，每项包含 name、reason、keywords；reason 写 20—60 字。
不要为满足长度填充空话，无法从照片确认的信息要写清楚限制。`;

function parseModelObject(text, reason) {
  const cleaned = String(text).replace(/```json|```/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new AiError("Vision response is not JSON", { reason });
  return JSON.parse(cleaned.slice(start, end + 1));
}

function parseVisionJson(text) {
  const parsed = parseModelObject(text, "bad_json");
  const score = Number(parsed.score);
  const auraScore = Number(parsed.auraScore);
  const cameraScore = Number(parsed.cameraScore);
  if (!parsed.faceShape || !Number.isFinite(score)) {
    throw new AiError("Vision response is incomplete", { reason: "incomplete" });
  }
  const rawReasons = Array.isArray(parsed.scoreReasons)
    ? {
        face: parsed.scoreReasons[0] || {},
        aura: parsed.scoreReasons[1] || {},
        camera: parsed.scoreReasons[2] || {},
      }
    : parsed.scoreReasons && typeof parsed.scoreReasons === "object"
      ? parsed.scoreReasons
      : {};
  const scoreReasons = {
    face: rawReasons.face || rawReasons.score || {},
    aura: rawReasons.aura || rawReasons.auraScore || {},
    camera: rawReasons.camera || rawReasons.cameraScore || {},
  };
  return {
    ...parsed,
    scoreReasons,
    score: Math.min(Math.max(Math.round(score), 0), 100),
    auraScore: Number.isFinite(auraScore)
      ? Math.min(Math.max(Math.round(auraScore), 0), 100)
      : null,
    cameraScore: Number.isFinite(cameraScore)
      ? Math.min(Math.max(Math.round(cameraScore), 0), 100)
      : null,
    confidence: Number.isFinite(Number(parsed.confidence))
      ? Math.min(Math.max(Math.round(Number(parsed.confidence)), 0), 100)
      : null,
  };
}

export async function analyzeFace({ imageUrl }) {
  const imageData = await resolveImageData(imageUrl);
  const provider = config.ai.visionProvider;
  const candidate = config.ai.providers[provider];
  if (!candidate?.apiKey || !candidate?.visionModel) {
    throw new AiError("Vision analysis failed", {
      provider,
      model: candidate?.visionModel || null,
      reason: "not_configured",
    });
  }
  try {
    const text = await chatCompletion({
      baseUrl: candidate.baseUrl,
      apiKey: candidate.apiKey,
      model: candidate.visionModel,
      systemPrompt: VISION_SYSTEM_PROMPT,
      userPrompt: VISION_USER_PROMPT,
      images: [imageData],
      temperature: 0.2,
      maxTokens: 4096,
      responseFormat: { type: "json_object" },
    });
    return { ...parseVisionJson(text), provider, model: candidate.visionModel };
  } catch (error) {
    throw new AiError("Vision analysis failed", {
      provider,
      model: candidate.visionModel,
      reason: safeError(error),
    });
  }
}

export async function reviewFaceDiagnosis({ imageUrl, diagnosis }) {
  const imageData = await resolveImageData(imageUrl);
  const provider = diagnosis?.provider || config.ai.visionProvider;
  const candidate = config.ai.providers[provider];
  if (!candidate?.apiKey || !candidate?.visionModel) {
    throw new AiError("Vision review failed", {
      provider,
      model: candidate?.visionModel || null,
      reason: "review_not_configured",
    });
  }
  try {
    const text = await chatCompletion({
      baseUrl: candidate.baseUrl,
      apiKey: candidate.apiKey,
      model: candidate.visionModel,
      systemPrompt: REVIEW_SYSTEM_PROMPT,
      userPrompt: `请独立复核下面的诊断草稿。有效发型库名称：\n${REPORT_HAIR_CATALOG.join("、")}\n穿搭库目录如下：\n${outfitCatalogPrompt()}\n\n原始诊断草稿 JSON：\n${JSON.stringify(diagnosis)}`,
      images: [imageData],
      temperature: 0.1,
      maxTokens: 6144,
      responseFormat: { type: "json_object" },
    });
    const result = parseModelObject(text, "review_bad_json");
    const reviewed = result.reviewedReport || result.report;
    if (!reviewed || typeof reviewed !== "object") {
      throw new AiError("Vision review omitted reviewed report", { reason: "review_incomplete" });
    }
    if (!["approved", "corrected"].includes(result.verdict) || !Number.isInteger(Number(result.confidence)) || Number(result.confidence) < 0 || Number(result.confidence) > 100) {
      throw new AiError("Vision review omitted its verdict or confidence", { reason: "review_incomplete" });
    }
    return {
      ...parseVisionJson(JSON.stringify(reviewed)),
      provider: diagnosis.provider,
      model: diagnosis.model,
      review: {
        status: result.verdict === "corrected" ? "corrected" : "approved",
        confidence: Number.isFinite(Number(result.confidence))
          ? Math.min(Math.max(Math.round(Number(result.confidence)), 0), 100)
          : null,
        notes: Array.isArray(result.notes)
          ? result.notes.filter((note) => typeof note === "string").slice(0, 4)
          : [],
        provider,
        model: candidate.visionModel,
      },
    };
  } catch (error) {
    throw new AiError("Vision review failed", {
      provider,
      model: candidate.visionModel,
      reason: safeError(error),
    });
  }
}

// ── 保存生成结果到本地并返回可访问 URL ───────────────────────
export async function saveImagesToStorage({
  dataUrls,
  dir = "outputs",
  userId,
  prefix = "img",
}) {
  const baseDir = dir === "outputs" ? OUTPUT_DIR : UPLOAD_DIR;
  const userDir = path.join(baseDir, String(userId || "anon"));
  await fs.mkdir(userDir, { recursive: true });
  const urls = [];
  for (let i = 0; i < dataUrls.length; i += 1) {
    const data = dataUrls[i];
    let buf;
    let ext = "jpg";
    if (typeof data === "string" && data.startsWith("data:")) {
      const mime = data.slice(5, data.indexOf(";"));
      const b64 = data.slice(data.indexOf(",") + 1);
      buf = Buffer.from(b64, "base64");
      ext = mime.includes("png")
        ? "png"
        : mime.includes("webp")
          ? "webp"
          : "jpg";
    } else if (typeof data === "string" && /^https?:/i.test(data)) {
      const r = await fetch(data, { signal: AbortSignal.timeout(30000) });
      if (!r.ok) {
        throw new AiError("Failed to download generated image", {
          reason: `dl_${r.status}`,
        });
      }
      buf = Buffer.from(await r.arrayBuffer());
      const ct = r.headers.get("content-type") || "";
      ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
    } else {
      throw new AiError("Unsupported image data", { reason: "bad_output" });
    }
    const name = `${prefix}_${Date.now()}_${i}_${crypto
      .randomBytes(3)
      .toString("hex")}.${ext}`;
    await fs.writeFile(path.join(userDir, name), buf);
    urls.push(`/${dir}/${userId || "anon"}/${name}`);
  }
  return urls;
}

// ── 人脸照片 / 生成结果删除 / 过期清理 ──────────────────────
// 仅允许删除本人 uploads 或 outputs 目录下的文件（防路径穿越 / 越权删除）
export async function deleteOwnedFile(url, userId) {
  const local = localPathFromUrl(url);
  if (!local || !userId) return false;
  const resolved = path.resolve(/*turbopackIgnore: true*/ local);
  const allowedRoots = [UPLOAD_DIR, OUTPUT_DIR].map((root) => root + path.sep);
  const ownedByUser = allowedRoots.some(
    (root) =>
      resolved.startsWith(root) &&
      resolved
        .slice(root.length)
        .startsWith(String(userId) + path.sep),
  );
  if (!ownedByUser) return false;
  try {
    await fs.unlink(resolved);
    return true;
  } catch {
    return false;
  }
}

export async function deleteUploadedFile(url) {
  const local = localPathFromUrl(url);
  if (!local) return false;
  const resolved = path.resolve(/*turbopackIgnore: true*/ local);
  const root = path.resolve(UPLOAD_DIR);
  if (!resolved.startsWith(root + path.sep)) return false;
  try {
    await fs.unlink(resolved);
    return true;
  } catch {
    return false;
  }
}

export async function cleanupOldUploads(userId) {
  const userDir = path.join(UPLOAD_DIR, String(userId || ""));
  let files = [];
  try {
    files = await fs.readdir(userDir);
  } catch {
    return 0;
  }
  const now = Date.now();
  let removed = 0;
  for (const f of files) {
    if (f.startsWith("profile_")) continue;
    const fp = path.join(userDir, f);
    try {
      const st = await fs.stat(fp);
      if (now - st.mtimeMs > UPLOAD_TTL_MS) {
        await fs.unlink(fp);
        removed += 1;
      }
    } catch {
      // 忽略单个文件失败
    }
  }
  return removed;
}
