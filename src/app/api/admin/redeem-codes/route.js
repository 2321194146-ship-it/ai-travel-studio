import { NextResponse } from "next/server";
import { requireAdmin, parseAdminPagination, writeAdminLog } from "@/lib/admin";
import { createRedeemCode, getPublicPlans, hashRedeemCode } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";

const ALLOWED_STATUSES = new Set(["ACTIVE", "REDEEMED", "REVOKED", "EXPIRED"]);

export async function GET(request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { params, limit, offset } = parseAdminPagination(request, { limit: 50, max: 100 });
  const requestedStatus = params.get("status")?.trim().toUpperCase();
  const q = params.get("q")?.trim().slice(0, 80);
  const conditions = [];
  const now = new Date();
  if (requestedStatus === "ACTIVE") {
    conditions.push({ status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] });
  } else if (requestedStatus === "EXPIRED") {
    conditions.push({ OR: [{ status: "EXPIRED" }, { status: "ACTIVE", expiresAt: { lte: now } }] });
  } else if (ALLOWED_STATUSES.has(requestedStatus)) {
    conditions.push({ status: requestedStatus });
  }
  if (q) {
    conditions.push({ OR: [
      { codeLast4: { contains: q, mode: "insensitive" } },
      { planName: { contains: q, mode: "insensitive" } },
      { planId: { contains: q, mode: "insensitive" } },
    ] });
  }
  const where = conditions.length ? { AND: conditions } : {};

  const [total, rows] = await Promise.all([
    prisma.redeemCode.count({ where }),
    prisma.redeemCode.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      select: {
        id: true,
        codeLast4: true,
        planId: true,
        planName: true,
        membershipDays: true,
        credits: true,
        status: true,
        expiresAt: true,
        redeemedAt: true,
        createdAt: true,
        redeemedBy: { select: { id: true, name: true, phone: true, email: true } },
      },
    }),
  ]);

  return NextResponse.json({
    data: rows.map((row) => ({
      ...row,
      effectiveStatus: row.status === "ACTIVE" && row.expiresAt && row.expiresAt <= now ? "EXPIRED" : row.status,
    })),
    total,
    limit,
    offset,
    plans: getPublicPlans().map(({ id, name, credits, membershipDays }) => ({ id, name, credits, membershipDays })),
  });
}

export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求内容无效" }, { status: 400 });
  }

  const plan = getPublicPlans().find(({ id }) => id === body?.planId);
  const count = Number(body?.count);
  const expiresInDays = body?.expiresInDays === undefined || body?.expiresInDays === ""
    ? 0
    : Number(body.expiresInDays);
  if (!plan) return NextResponse.json({ error: "请选择可兑换的会员或次数套餐" }, { status: 400 });
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    return NextResponse.json({ error: "每批只能生成 1 到 100 个兑换码" }, { status: 400 });
  }
  if (!Number.isInteger(expiresInDays) || expiresInDays < 0 || expiresInDays > 3650) {
    return NextResponse.json({ error: "有效天数请填写 0 到 3650；0 表示永不过期" }, { status: 400 });
  }

  const expiresAt = expiresInDays > 0 ? new Date(Date.now() + expiresInDays * 86_400_000) : null;
  const codes = Array.from({ length: count }, () => createRedeemCode());
  const rows = codes.map((code) => ({
    codeHash: hashRedeemCode(code),
    codeLast4: code.slice(-4),
    planId: plan.id,
    planName: plan.name,
    membershipDays: plan.membershipDays,
    credits: plan.credits,
    status: "ACTIVE",
    expiresAt,
  }));

  try {
    await prisma.$transaction(async (tx) => {
      await tx.redeemCode.createMany({ data: rows });
      await writeAdminLog(tx, auth.user.id, "CREATE_REDEEM_CODE_BATCH", "REDEEM_CODE_BATCH", null, {
        planId: plan.id,
        planName: plan.name,
        count,
        expiresAt: expiresAt?.toISOString() || null,
      });
    });
    // Plaintext codes are returned once to the authenticated admin and are never stored or logged.
    return NextResponse.json({ data: { codes, count, planName: plan.name, expiresAt } }, { status: 201 });
  } catch (error) {
    console.error("批量生成兑换码失败", error?.name || "UnknownError");
    return NextResponse.json({ error: "生成失败，请稍后重试" }, { status: 500 });
  }
}
