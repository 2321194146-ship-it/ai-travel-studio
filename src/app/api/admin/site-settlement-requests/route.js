import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

// 打款申请列表（管理员）：PENDING 在前，含代理/分站/收款码
export async function GET(request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const params = new URL(request.url).searchParams;
  const status = params.get("status")?.trim() || "PENDING";
  if (!["PENDING", "PAID", "REJECTED", "ALL"].includes(status)) {
    return NextResponse.json({ error: "状态不正确" }, { status: 400 });
  }
  const requests = await prisma.siteSettlementRequest.findMany({
    where: status === "ALL" ? {} : { status },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 50,
    include: { subsite: { select: { slug: true, siteName: true, owner: { select: { phone: true } } } } },
  });
  return NextResponse.json({
    data: requests.map((r) => ({
      id: r.id,
      amount: r.amount,
      orderCount: r.orderCount,
      status: r.status,
      collectQrUrl: r.collectQrUrl,
      note: r.note,
      createdAt: r.createdAt,
      paidAt: r.paidAt,
      siteName: r.subsite?.siteName || "",
      siteSlug: r.subsite?.slug || "",
      siteUrl: r.subsite ? `${r.subsite.slug}.face.shuqizhisou.cc` : "",
      agentPhoneTail: r.subsite?.owner?.phone ? `****${r.subsite.owner.phone.slice(-4)}` : "",
      agentPhone: r.subsite?.owner?.phone || "",
    })),
  });
}
