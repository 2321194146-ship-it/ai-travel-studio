import { NextResponse } from "next/server";
import { requireAdmin, summarizeImageUrls, toAdminUserSummary, adminUserSelect } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET(_request, { params }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "用户 ID 缺失" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      ...adminUserSelect(),
      accounts: { select: { provider: true } },
      referredBy: { select: { id: true, name: true, phone: true, email: true } },
      referrals: {
        orderBy: { id: "desc" },
        take: 20,
        select: { id: true, name: true, phone: true, email: true, credits: true, membership: true, membershipExpiresAt: true },
      },
    },
  });
  if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

  const [orders, generations, ledger, audit, photos, diagnoses] = await Promise.all([
    prisma.manualOrder.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, channel: true, planId: true, planName: true, amount: true, status: true, paidAt: true, createdAt: true, note: true },
    }),
    prisma.generation.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, status: true, modelName: true, provider: true, actualModel: true, creditCost: true, templateName: true, category: true, failureReason: true, inputImages: true, outputImages: true, createdAt: true },
    }),
    prisma.creditLedger.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, amount: true, balance: true, reason: true, sourceType: true, sourceId: true, createdAt: true },
    }),
    prisma.adminAuditLog.findMany({
      where: { targetType: "USER", targetId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, action: true, detail: true, createdAt: true, actor: { select: { name: true, phone: true, email: true } } },
    }),
    prisma.userPhoto.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, url: true, thumbUrl: true, label: true, createdAt: true } }),
    prisma.diagnose.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, faceShape: true, score: true, suggestion: true, createdAt: true } }),
  ]);

  return NextResponse.json({
    data: {
      ...toAdminUserSummary(user),
      accounts: user.accounts,
      referredBy: user.referredBy,
      referrals: user.referrals,
      orders,
      generations: generations.map((row) => ({ ...row, inputImages: summarizeImageUrls(row.inputImages), outputImages: summarizeImageUrls(row.outputImages) })),
      ledger,
      audit,
      photos,
      diagnoses,
    },
  });
}
