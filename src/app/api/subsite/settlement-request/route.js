import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canRequestSettlement } from "@/lib/subsite-accounting.mjs";
import { UPLOAD_DIR } from "@/lib/services/ai";
import fs from "node:fs/promises";
import path from "node:path";

// 代理提交打款申请：平台代收分站，把当前待结算订单（实付 70%）打包成一条申请，
// 收款码从 24h TTL 的个人上传目录复制到永久目录 /uploads/settlement/，防止还没打款图就没了。
export async function POST(req) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const collectQrUrl = String(body.collectQrUrl || "").trim();
    const note = String(body.note || "").slice(0, 300) || null;

    const subsite = await prisma.subsite.findUnique({ where: { ownerId: userId } });
    if (!subsite || subsite.status !== "ACTIVE") return NextResponse.json({ error: "分站不存在或已暂停" }, { status: 403 });
    const payMode = subsite.epayPid ? "AGENT" : "PLATFORM";

    const existingPending = await prisma.siteSettlementRequest.findFirst({ where: { subsiteId: subsite.id, status: "PENDING" } });
    const pendingOrders = await prisma.manualOrder.findMany({
      where: { subsiteId: subsite.id, orderType: "SITE_ORDER", status: "PAID", settlementStatus: "PENDING" },
      select: { id: true, agentShareAmount: true },
      orderBy: { paidAt: "asc" },
    });
    const pendingAmount = pendingOrders.reduce((sum, o) => sum + (o.agentShareAmount ?? 0), 0);
    const check = canRequestSettlement({ payMode, pendingAmount, hasPendingRequest: Boolean(existingPending) });
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
    if (pendingOrders.some((o) => o.agentShareAmount == null)) {
      return NextResponse.json({ error: "存在未冻结分账的历史订单，请联系管理员登记" }, { status: 400 });
    }
    if (!/^\/uploads\/[^/]+\/[^/]+$/.test(collectQrUrl)) {
      return NextResponse.json({ error: "请先上传收款码截图" }, { status: 400 });
    }

    const request = await prisma.$transaction(async (tx) => {
      const created = await tx.siteSettlementRequest.create({
        data: {
          subsiteId: subsite.id,
          amount: pendingAmount,
          orderCount: pendingOrders.length,
          orderIds: pendingOrders.map((o) => o.id),
          collectQrUrl, // 先占位，事务外复制文件后再补真实地址
          status: "PENDING",
          note,
        },
      });
      const ext = path.extname(collectQrUrl) || ".jpg";
      const permanentDir = path.join(UPLOAD_DIR, "settlement");
      await fs.mkdir(permanentDir, { recursive: true });
      const permanentUrl = `/uploads/settlement/${created.id}${ext}`;
      await fs.copyFile(path.join(UPLOAD_DIR, collectQrUrl.replace(/^\/uploads\//, "")), path.join(permanentDir, `${created.id}${ext}`));
      return tx.siteSettlementRequest.update({ where: { id: created.id }, data: { collectQrUrl: permanentUrl } });
    });

    return NextResponse.json({
      data: { id: request.id, amount: request.amount, orderCount: request.orderCount, collectQrUrl: request.collectQrUrl, status: request.status },
      message: "打款申请已提交，平台确认打款后你的订单会自动标记为已结算",
    }, { status: 201 });
  } catch (error) {
    console.error("[SITE_SETTLE_REQ]", error.message || error);
    return NextResponse.json({ error: error.message && !error.message.includes("ENOENT") ? error.message : "提交打款申请失败，请重试" }, { status: 400 });
  }
}
