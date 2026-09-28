import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  generateImages,
  saveImagesToStorage,
  safeError,
} from "@/lib/services/ai";
import { buildOutfitTryOnPrompt } from "@/lib/try-on-prompts.mjs";
import { isAllowedImageReference } from "@/lib/image-access.mjs";

// 穿搭试穿按次计费：旗舰 SeedEdit 编辑，与 /api/generation 同一套账本逻辑（先扣后退）
const DRESS_COST = 6;

async function refundAndFail(userId, recordId, cost, reason) {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { credits: { increment: cost } },
    });
    const balance = await tx.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });
    await tx.creditLedger.create({
      data: {
        userId,
        amount: cost,
        balance: balance.credits,
        reason: "穿搭试穿失败退款",
        sourceType: "REFUND",
        sourceId: recordId,
      },
    });
    await tx.generation.update({
      where: { id: recordId },
      data: { status: "failed", failureReason: reason },
    });
  });
}

export async function POST(req) {
  const { session, error } = await withAuth();
  if (error) return error;

  try {
    // 限流防止被刷成旗舰生成入口
    const rl = checkRateLimit(`dress:${session.user.id}`, 5, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many requests. Retry after ${rl.retryAfter}s` },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    const body = await req.json();
    const modelImageUrl = String(body.modelImageUrl || "").trim();
    const garmentImageUrl = String(body.garmentImageUrl || "").trim();
    if (!isAllowedImageReference(modelImageUrl, session.user.id) || !isAllowedImageReference(garmentImageUrl, session.user.id)) {
      return NextResponse.json({ error: "图片必须来自你自己的照片档案或站内素材" }, { status: 400 });
    }
    const fullBodyPhoto = await prisma.userPhoto.findFirst({
      where: { userId: session.user.id, label: "全身照", url: modelImageUrl },
      select: { id: true },
    });
    if (!fullBodyPhoto) {
      return NextResponse.json(
        { error: "穿搭试穿必须使用已标记为全身照的档案照片，请先上传全身照" },
        { status: 400 },
      );
    }
    const prompt = buildOutfitTryOnPrompt({
      faceLock: body.faceLock !== false,
      realistic: body.realistic !== false,
    });
    if (!modelImageUrl || !garmentImageUrl) {
      return NextResponse.json(
        { error: "Model and garment images are required" },
        { status: 400 },
      );
    }

    // 先扣积分再生成，扣不出足够余额直接 402
    let record;
    try {
      record = await prisma.$transaction(async (tx) => {
        const deducted = await tx.user.updateMany({
          where: { id: session.user.id, credits: { gte: DRESS_COST } },
          data: { credits: { decrement: DRESS_COST } },
        });
        if (deducted.count === 0) {
          throw new Error("Insufficient credits");
        }
        const generation = await tx.generation.create({
          data: {
            userId: session.user.id,
            inputImages: [modelImageUrl, garmentImageUrl],
            outputImages: [],
            templateName: "穿搭试穿",
            category: "dress-change",
            prompt,
            modelName: "flagship-edit",
            status: "processing",
            creditCost: DRESS_COST,
          },
        });
        const balance = await tx.user.findUnique({
          where: { id: session.user.id },
          select: { credits: true },
        });
        await tx.creditLedger.create({
          data: {
            userId: session.user.id,
            amount: -DRESS_COST,
            balance: balance.credits,
            reason: "穿搭试穿扣费",
            sourceType: "GENERATION",
            sourceId: generation.id,
          },
        });
        return generation;
      });
    } catch (e) {
      if (e.message === "Insufficient credits") {
        return NextResponse.json(
          { error: `剩余次数不够：穿搭试穿每次需要 ${DRESS_COST} 次生成额度，可在充值页补充` },
          { status: 402 },
        );
      }
      throw e;
    }

    // 旗舰 SeedEdit 图生图编辑，失败自动回退千问图像
    let result;
    try {
      result = await generateImages({
        tier: "flagship",
        mode: "edit",
        prompt,
        inputImages: [modelImageUrl, garmentImageUrl],
        resolution: "2k",
        aspectRatio: "3:4",
        count: 1,
      });
    } catch (err) {
      console.error("Dress-change failed:", safeError(err));
      await refundAndFail(session.user.id, record.id, DRESS_COST, safeError(err));
      return NextResponse.json(
        { error: "Dress-change service error", id: record.id },
        { status: 502 },
      );
    }

    const savedUrls = await saveImagesToStorage({
      dataUrls: result.images,
      dir: "outputs",
      userId: session.user.id,
      prefix: "dress",
    }).catch((saveErr) => {
      console.error("[DRESS_CHANGE_SAVE]", safeError(saveErr));
      return null;
    });
    const output = savedUrls?.[0] || "";

    if (!output) {
      // 已扣费但拿不到成图：全额退款，避免用户白扣积分
      await refundAndFail(session.user.id, record.id, DRESS_COST, "output save failed");
      return NextResponse.json(
        { error: "Dress-change failed", id: record.id },
        { status: 502 },
      );
    }

    await prisma.generation.update({
      where: { id: record.id },
      data: {
        status: "completed",
        outputImages: [output],
        provider: result.provider,
        actualModel: result.model,
      },
    });

    return NextResponse.json({
      id: record.id,
      resultImage: output,
      outputImages: [output],
      status: "completed",
      provider: result.provider,
      model: result.model,
    });
  } catch (err) {
    console.error("[DRESS_CHANGE_POST]", safeError(err));
    return NextResponse.json(
      { error: "Dress-change service error" },
      { status: 500 },
    );
  }
}
