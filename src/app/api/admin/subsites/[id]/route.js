import { NextResponse } from "next/server";
import { requireAdmin, writeAdminLog } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

// 分站状态切换（SUSPEND/ACTIVATE）与代理划积分（GRANT，正负皆可），均记账 + 审计
export async function PATCH(request, { params }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const body = await request.json();
    const subsite = await prisma.subsite.findUnique({ where: { id }, select: { id: true, slug: true, ownerId: true, status: true } });
    if (!subsite) return NextResponse.json({ error: "分站不存在" }, { status: 404 });
    if (body.action === "SUSPENDED" || body.action === "SUSPEND") {
      const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.subsite.update({ where: { id }, data: { status: "SUSPENDED" } });
        await writeAdminLog(tx, auth.user.id, "SUSPEND_SUBSITE", "SUBSITE", id, { slug: subsite.slug });
        return next;
      });
      return NextResponse.json({ data: { id: updated.id, status: updated.status } });
    }
    if (body.action === "ACTIVE" || body.action === "ACTIVATE") {
      const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.subsite.update({ where: { id }, data: { status: "ACTIVE" } });
        await writeAdminLog(tx, auth.user.id, "ACTIVATE_SUBSITE", "SUBSITE", id, { slug: subsite.slug });
        return next;
      });
      return NextResponse.json({ data: { id: updated.id, status: updated.status } });
    }
    if (body.action === "GRANT") {
      const credits = Math.trunc(Number(body.credits));
      if (!Number.isFinite(credits) || credits === 0) return NextResponse.json({ error: "划转积分必须是非 0 整数" }, { status: 400 });
      const note = String(body.note || "").trim() || (credits > 0 ? "管理员划入积分" : "管理员扣减积分");
      await prisma.$transaction(async (tx) => {
        const owner = await tx.user.update({ where: { id: subsite.ownerId }, data: { credits: { increment: credits } }, select: { credits: true } });
        await tx.creditLedger.create({
          data: { userId: subsite.ownerId, amount: credits, balance: owner.credits, reason: note, sourceType: "SITE_GRANT", sourceId: subsite.id },
        });
        await writeAdminLog(tx, auth.user.id, "GRANT_SUBSITE_CREDITS", "SUBSITE", id, { slug: subsite.slug, credits, note, balance: owner.credits });
      });
      return NextResponse.json({ success: true, credits });
    }
    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "操作失败" }, { status: 400 });
  }
}
