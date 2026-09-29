import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";
import { analyzeFace, reviewFaceDiagnosis, safeError } from "@/lib/services/ai";
import { getGuestIdentity, setGuestCookie } from "@/lib/guest";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { getDiagnosisQuota } from "@/lib/diagnosis-entitlement.mjs";
import { REPORT_HAIR_CATALOG, REPORT_OUTFIT_CATALOG } from "@/lib/makeover-catalog.mjs";
import { diagnosisDetails, restoreDiagnosis } from "@/lib/diagnosis-storage.mjs";
import { isAllowedImageReference } from "@/lib/image-access.mjs";

const FACE_SHAPES = new Set(["圆形脸", "方形脸", "椭圆形脸", "心形脸", "长形脸", "菱形脸", "无法从这张照片确认"]);
const REPORT_TEXT_FIELDS = ["suggestion", "focus", "goal", "hairReason", "outfitAdvice", "avoid", "inputQuality"];
const hasReportText = (value, minimum = 1) =>
  typeof value === "string" && Array.from(value.trim()).length >= minimum;

function assertReviewedReport(report) {
  if (!FACE_SHAPES.has(report?.faceShape)) throw new Error("诊断复核未能确认脸部轮廓，请换一张清晰正面照重试");
  for (const key of ["score", "auraScore", "cameraScore", "confidence"]) {
    if (!Number.isInteger(report[key]) || report[key] < 0 || report[key] > 100) {
      throw new Error("诊断复核结果不完整，请稍后重试");
    }
  }
  const minimumLengths = {
    suggestion: 18,
    focus: 15,
    goal: 15,
    hairReason: 18,
    outfitAdvice: 15,
    avoid: 10,
    inputQuality: 10,
  };
  for (const key of REPORT_TEXT_FIELDS) {
    if (!hasReportText(report[key], minimumLengths[key])) {
      throw new Error("诊断复核结果不完整，请稍后重试");
    }
  }
  if (!Array.isArray(report.actionPlan) || report.actionPlan.length !== 3 || report.actionPlan.some((item) => !hasReportText(item, 12))) {
    throw new Error("诊断复核未提供完整行动建议，请稍后重试");
  }
  if (!Array.isArray(report.hairstyles) || report.hairstyles.length < 3 || report.hairstyles.some((item) =>
    !REPORT_HAIR_CATALOG.includes(item?.name) || !hasReportText(item?.why, 12) || !hasReportText(item?.execution, 12) || !hasReportText(item?.maintenance, 8)
  )) {
    throw new Error("发型建议没有匹配到发型库，请稍后重试");
  }
  if (!Array.isArray(report.outfits) || report.outfits.length < 3 || report.outfits.some((item) => {
    const catalogItem = REPORT_OUTFIT_CATALOG.find((entry) => entry.id === item?.catalogId);
    return !catalogItem || item.name !== catalogItem.name || !hasReportText(item.why, 18);
  })) {
    throw new Error("穿搭建议没有匹配到穿搭库，请稍后重试");
  }
  if (!Array.isArray(report.styles) || report.styles.length < 2 || report.styles.some((item) => !hasReportText(item?.name, 2) || !hasReportText(item?.reason, 12))) {
    throw new Error("个人风格建议不完整，请稍后重试");
  }
  const reasons = report.scoreReasons || {};
  if (["face", "aura", "camera"].some((key) =>
    !["basis", "strength", "opportunity"].every((field) => hasReportText(reasons[key]?.[field], 15))
  )) {
    throw new Error("诊断评分缺少照片依据，请稍后重试");
  }
  if (!report.review || !["approved", "corrected"].includes(report.review.status) || !Number.isInteger(report.review.confidence)) {
    throw new Error("诊断复核结果不完整，请稍后重试");
  }
}

export async function POST(req) {
  // 免费额度外每次诊断扣 1 次生成额度；charged 标记是否已扣费，任何失败路径都要退还。
  const DIAGNOSIS_COST = 1;
  let charged = false;
  let identity = null;
  try {
    const { session, error } = await withAuth();
    identity = session?.user
      ? { user: session.user, isGuest: false }
      : { ...(await getGuestIdentity()), isGuest: true };

    const body = await req.json();
    const { imageUrl } = body;

    if (!imageUrl) {
      return new NextResponse("Image URL is required", { status: 400 });
    }
    if (!isAllowedImageReference(imageUrl, identity.user.id)) {
      return NextResponse.json({ error: "请从照片档案中选择本人照片" }, { status: 400 });
    }

    // 速率限制：诊断会真实调用视觉模型（成本最高）。
    // IP 维度不可被换 Cookie 绕过；用户维度覆盖正常多设备用户。
    const ip = getClientIp(req);
    const rlIp = checkRateLimit(`diag-ip:${ip}`, 12, 60_000);
    if (!rlIp.allowed) {
      return NextResponse.json(
        { error: `Too many requests. Retry after ${rlIp.retryAfter}s` },
        { status: 429, headers: { "Retry-After": String(rlIp.retryAfter) } },
      );
    }
    const rl = checkRateLimit(`diagnose:${identity.user.id}`, 6, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many requests. Retry after ${rl.retryAfter}s` },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    // 未付费用户累计 3 次免费诊断；购买有会员期的套餐后，会员期内每天 3 次。
    // 补充包没有 membershipExpiresAt，不会解锁每日诊断权益。
    // 免费额度用完不锁死：继续诊断每次扣 1 次生成额度（与生图同一本账，失败退还）。
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const [totalCount, todayCount] = await Promise.all([
      prisma.diagnose.count({ where: { userId: identity.user.id } }),
      prisma.diagnose.count({ where: { userId: identity.user.id, createdAt: { gte: dayStart } } }),
    ]);
    const quota = getDiagnosisQuota({
      membership: identity.user.membership,
      membershipExpiresAt: identity.user.membershipExpiresAt,
      totalCount,
      todayCount,
    });
    if (quota.used >= quota.limit) {
      try {
        await prisma.$transaction(async (tx) => {
          const deducted = await tx.user.updateMany({
            where: { id: identity.user.id, credits: { gte: DIAGNOSIS_COST } },
            data: { credits: { decrement: DIAGNOSIS_COST } },
          });
          if (deducted.count === 0) {
            throw new Error("Insufficient credits");
          }
          const balance = await tx.user.findUnique({
            where: { id: identity.user.id },
            select: { credits: true },
          });
          await tx.creditLedger.create({
            data: {
              userId: identity.user.id,
              amount: -DIAGNOSIS_COST,
              balance: balance.credits,
              reason: "诊断扣费",
              sourceType: "DIAGNOSIS",
            },
          });
        });
        charged = true;
      } catch (e) {
        if (e.message === "Insufficient credits") {
          const message = identity.isGuest
            ? "免费诊断已用完，注册登录领取次数后可继续 AI 诊断"
            : "免费诊断额度已用完，剩余次数不足，去充值马上继续";
          return NextResponse.json({ error: message, diagnosisQuota: quota }, { status: 402 });
        }
        throw e;
      }
    }

    // 每份报告经过照片视觉分析和第二次审核；审核失败时由外层统一退款，不回退到脸型模板。
    const draft = await analyzeFace({ imageUrl });
    const vision = await reviewFaceDiagnosis({ imageUrl, diagnosis: draft });
    assertReviewedReport(vision);

    const faceShape = vision.faceShape;
    const score = vision.score;
    const hairstyles = vision.hairstyles.slice(0, 5);
    const outfits = vision.outfits.slice(0, 5).map((item) => {
      const catalogItem = REPORT_OUTFIT_CATALOG.find((entry) => entry.id === item.catalogId);
      return { ...catalogItem, why: item.why };
    });
    const styles = vision.styles.slice(0, 5);
    const suggestion = vision.suggestion;
    const reportDetails = {
      focus: vision.focus,
      goal: vision.goal,
      hairReason: vision.hairReason,
      outfitAdvice: vision.outfitAdvice,
      avoid: vision.avoid,
      actionPlan: vision.actionPlan,
    };

    const completeDetails = diagnosisDetails({
      ...vision,
      ...reportDetails,
      analysisSource: "ai_reviewed",
      analysisNote: "报告经过第二轮视觉复核；结论只描述这张照片的呈现效果，不是对长相的评价。",
    });

    // Save the complete reviewed report before returning success.
    const diagnose = await prisma.diagnose.create({
      data: {
        userId: identity.user.id,
        inputImage: imageUrl,
        faceShape,
        hairstyles,
        outfits,
        styles,
        score,
        suggestion,
        reportData: completeDetails,
      },
    });

    const response = NextResponse.json({
      success: true,
      data: restoreDiagnosis(diagnose),
    });
    if (identity.isGuest && identity.isNew) setGuestCookie(response, identity.token);
    return response;
  } catch (error) {
    console.error("Diagnose error:", safeError(error));
    if (charged && identity?.user?.id) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: identity.user.id },
            data: { credits: { increment: DIAGNOSIS_COST } },
          });
          const balance = await tx.user.findUnique({
            where: { id: identity.user.id },
            select: { credits: true },
          });
          await tx.creditLedger.create({
            data: {
              userId: identity.user.id,
              amount: DIAGNOSIS_COST,
              balance: balance.credits,
              reason: "诊断失败退款",
              sourceType: "REFUND",
            },
          });
        });
      } catch (refundErr) {
        console.error("Diagnose refund error:", safeError(refundErr));
      }
    }
    const isVisionFailure = error?.message === "Vision analysis failed" || error?.message === "Vision review failed";
    const chargedMessage = "诊断失败，本次扣减的次数已退还，请稍后重试";
    const validationMessage = typeof error?.message === "string" && /^(诊断复核|诊断评分|发型建议|穿搭建议|个人风格建议)/.test(error.message)
      ? error.message
      : null;
    return NextResponse.json(
      {
        error: isVisionFailure
          ? charged
            ? `${chargedMessage}；复核服务暂时不可用`
            : "诊断复核服务暂时不可用，请稍后重试；本次未扣除次数"
          : charged
            ? chargedMessage
            : validationMessage || "诊断失败，请稍后重试；本次未扣除次数",
      },
      { status: isVisionFailure ? 503 : validationMessage ? 422 : 500 },
    );
  }
}

// 获取诊断历史
export async function GET(req) {
  try {
    const { session, error } = await withAuth();
    if (error) return error;

    const diagnoses = await prisma.diagnose.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return NextResponse.json({ success: true, data: diagnoses.map(restoreDiagnosis) });
  } catch (error) {
    console.error("Get diagnoses error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
