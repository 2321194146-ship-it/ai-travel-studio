import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import config from "@/lib/config";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  generateImages,
  saveImagesToStorage,
  cleanupOldUploads,
  safeError,
} from "@/lib/services/ai";
import { buildHairTryOnPrompt } from "@/lib/try-on-prompts.mjs";
import { isAllowedImageReference } from "@/lib/image-access.mjs";

const ALLOWED_TIERS = new Set(["standard", "high", "flagship"]);

// 兼容旧 MuAPI 模型名 → 档位（后端只认档位，前端不再传模型名）
const LEGACY_MODEL_TIER = {
  "nano-banana-2-edit": "standard",
  "bytedance-seedream-5.0-pro-edit": "high",
  "bytedance-seedream-5.0-lite-edit": "high",
  "nano-banana-pro-edit": "flagship",
  "gpt-image-2-image-to-image": "standard",
};

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const {
      imageUrl,
      imageUrls,
      imageRoles,
      sceneReferenceUrl,
      prompt,
      destination = "Paris",
      modelTier,
      modelName,
      aspectRatio = "Auto",
      resolution = "1k",
      outputFormat = "jpg",
      count = 1,
      similarity = 85,
      texture = 78,
      hairName,
      faceLock = true,
      realistic = true,
    } = body;

    const isHairTryOn = destination === "发型试穿";
    const finalPrompt = isHairTryOn
      ? buildHairTryOnPrompt({ hairName, faceLock, realistic })
      : String(prompt || "").trim();

    // 档位解析：优先 modelTier，兼容旧 modelName
    let tier = ALLOWED_TIERS.has(modelTier) ? modelTier : null;
    if (!tier && modelName && LEGACY_MODEL_TIER[modelName]) {
      tier = LEGACY_MODEL_TIER[modelName];
    }
    tier = tier || "standard";

    // 档位与套餐绑定：标准卡及以下只能用标准档，高清卡可用高清，旗舰卡全开；管理员不限
    const actor = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { membership: true, role: true },
    });
    if (actor?.role !== "ADMIN") {
      const order = ["standard", "high", "flagship"];
      const maxTier =
        { FLAGSHIP: "flagship", HIGH: "high" }[actor?.membership] || "standard";
      if (order.indexOf(tier) > order.indexOf(maxTier)) tier = maxTier;
    }

    // 多图数组（AI改造）或单图（旧版展示面），向下兼容
    const inputImages =
      Array.isArray(imageUrls) && imageUrls.length > 0
        ? imageUrls.filter((u) => typeof u === "string" && u.trim())
        : imageUrl
          ? [imageUrl]
          : [];
    if (typeof sceneReferenceUrl === "string" && sceneReferenceUrl.trim())
      inputImages.push(sceneReferenceUrl.trim());

    if (inputImages.length === 0) {
      return new NextResponse("Image URL is required", { status: 400 });
    }
    if (inputImages.some((image) => !isAllowedImageReference(image, session.user.id))) {
      return NextResponse.json({ error: "图片必须来自你自己的照片档案或站内素材" }, { status: 400 });
    }
    if (inputImages.length > 6) {
      return new NextResponse("参考图过多：人物照片 + 参考图 + 衣服参考图合计最多 6 张", { status: 400 });
    }
    // 图片角色：person_main/person_aux/reference/reference_outfit。前端按角色提交，供应商截断时按角色
    // 优先级保留（先丢辅助人物照，绝不让主参考图或衣服参考图被挤掉）；缺省时保持旧行为（按顺序）。
    const allowedRoles = new Set(["person_main", "person_aux", "reference", "reference_outfit"]);
    const normalizedRoles =
      Array.isArray(imageRoles) &&
      imageRoles.length === inputImages.length &&
      imageRoles.every((role) => allowedRoles.has(role))
        ? imageRoles
        : null;
    if (!finalPrompt) {
      return new NextResponse("Prompt is required", { status: 400 });
    }
    const requestedCount = Math.min(Math.max(Number(count) || 1, 1), 9);
    const requestedSimilarity = Math.min(
      Math.max(Number(similarity) || 85, 0),
      100,
    );
    const requestedTexture = Math.min(Math.max(Number(texture) || 78, 0), 100);

    // 速率限制：每用户每分钟最多 5 次生成
    const rl = checkRateLimit(`gen:${session.user.id}`, 5, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many requests. Retry after ${rl.retryAfter}s` },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    // 按档位定价：只有成功生成才扣次数
    const tierCfg = config.ai.tiers[tier] || config.ai.tiers.standard;
    const modelCosts = tierCfg.cost || { "1k": 2, "2k": 3, "4k": 4 };
    const costPerOutput = modelCosts[resolution] || modelCosts["1k"];
    const totalCost = costPerOutput * requestedCount;

    // 事务：扣积分 + 创建 processing 记录，保证一致
    let record;
    try {
      record = await prisma.$transaction(async (tx) => {
        if (totalCost > 0) {
          const deducted = await tx.user.updateMany({
            where: { id: session.user.id, credits: { gte: totalCost } },
            data: { credits: { decrement: totalCost } },
          });
          if (deducted.count === 0) {
            throw new Error("Insufficient credits");
          }
        }
        const generation = await tx.generation.create({
          data: {
            userId: session.user.id,
            inputImages,
            outputImages: [],
            templateName: destination,
            category: destination,
            prompt: finalPrompt,
            modelName: tier,
            status: "processing",
            creditCost: totalCost,
          },
        });
        if (totalCost > 0) {
          const balance = await tx.user.findUnique({
            where: { id: session.user.id },
            select: { credits: true },
          });
          await tx.creditLedger.create({
            data: {
              userId: session.user.id,
              amount: -totalCost,
              balance: balance.credits,
              reason: "AI生成扣费",
              sourceType: "GENERATION",
              sourceId: generation.id,
            },
          });
        }
        return generation;
      });
    } catch (e) {
      if (e.message === "Insufficient credits") {
        return new NextResponse("Insufficient credits", { status: 402 });
      }
      throw e;
    }

    // 调用统一 AI 服务层（主模型失败自动切备用）
    let result;
    try {
      result = await generateImages({
        tier,
        prompt: finalPrompt,
        inputImages,
        imageRoles: normalizedRoles,
        resolution,
        aspectRatio,
        count: requestedCount,
        requestedModel: modelName || null,
      });
    } catch (error) {
      // 失败 / 超时 / 审核拦截：全额退回积分，记录失败原因与尝试过的供应商
      const reason = error?.reason || safeError(error);
      await prisma.$transaction(async (tx) => {
        if (totalCost > 0) {
          await tx.user.update({
            where: { id: session.user.id },
            data: { credits: { increment: totalCost } },
          });
          const balance = await tx.user.findUnique({
            where: { id: session.user.id },
            select: { credits: true },
          });
          await tx.creditLedger.create({
            data: {
              userId: session.user.id,
              amount: totalCost,
              balance: balance.credits,
              reason: "AI生成失败退款",
              sourceType: "REFUND",
              sourceId: record.id,
            },
          });
        }
        await tx.generation.update({
          where: { id: record.id },
          data: {
            status: "failed",
            failureReason: reason,
            provider: error.provider || null,
            actualModel: error.model || null,
          },
        });
      });
      console.error("[GENERATION_FAILED]", reason);
      return NextResponse.json(
        { error: "Prediction failed", reason },
        { status: 500 },
      );
    }

    // 成功：保存图片到本地，只按实际产出扣费
    let savedUrls;
    try {
      savedUrls = await saveImagesToStorage({
        dataUrls: result.images,
        dir: "outputs",
        userId: session.user.id,
        prefix: "gen",
      });
    } catch (error) {
      const reason = safeError(error);
      await prisma.$transaction(async (tx) => {
        if (totalCost > 0) {
          await tx.user.update({
            where: { id: session.user.id },
            data: { credits: { increment: totalCost } },
          });
          const balance = await tx.user.findUnique({
            where: { id: session.user.id },
            select: { credits: true },
          });
          await tx.creditLedger.create({
            data: {
              userId: session.user.id,
              amount: totalCost,
              balance: balance.credits,
              reason: "保存生成结果失败退款",
              sourceType: "REFUND",
              sourceId: record.id,
            },
          });
        }
        await tx.generation.update({
          where: { id: record.id },
          data: {
            status: "failed",
            failureReason: `save_output_failed: ${reason}`,
            provider: result.provider,
            actualModel: result.model,
          },
        });
      });
      console.error("[GENERATION_SAVE_FAILED]", reason);
      return NextResponse.json(
        { error: "Prediction failed", reason: "保存生成结果失败" },
        { status: 500 },
      );
    }

    const finalCost = costPerOutput * savedUrls.length;
    await prisma.$transaction(async (tx) => {
      const refund = totalCost - finalCost;
      if (refund > 0) {
        await tx.user.update({
          where: { id: session.user.id },
          data: { credits: { increment: refund } },
        });
        const balance = await tx.user.findUnique({
          where: { id: session.user.id },
          select: { credits: true },
        });
        await tx.creditLedger.create({
          data: {
            userId: session.user.id,
            amount: refund,
            balance: balance.credits,
            reason: "未产出图片退款",
            sourceType: "REFUND",
            sourceId: record.id,
          },
        });
      }
      await tx.generation.update({
        where: { id: record.id },
        data: {
          status: "completed",
          outputImages: savedUrls,
          creditCost: finalCost,
          provider: result.provider,
          actualModel: result.model,
        },
      });
    });

    // 主模型失败走了回退时留痕，便于发现某条渠道持续不可用
    if (Array.isArray(result.failures) && result.failures.length) {
      console.error("[GENERATION_FALLBACK]", JSON.stringify(result.failures));
    }

    // 人脸照片仅在生成期间必要：成功后清理过期上传（保留 TTL 策略）
    try {
      await cleanupOldUploads(session.user.id);
    } catch {
      // 清理失败不影响主流程
    }

    return NextResponse.json({
      id: record.id,
      resultImage: savedUrls[0] || "",
      outputImages: savedUrls,
      requestedCount,
      similarity: requestedSimilarity,
      texture: requestedTexture,
      status: "completed",
      provider: result.provider,
      model: result.model,
      tier,
    });
  } catch (error) {
    console.error("[GENERATION_POST]", safeError(error));
    return new NextResponse("Internal Error", { status: 500 });
  }
}
