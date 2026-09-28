import { NextResponse } from "next/server";
import { requireAdmin, writeAdminLog } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { execFile } from "node:child_process";

// 分站列表：含代理手机（管理员可见全号）、代理当前积分、已付订单数与金额合计（分），按创建倒序
// 平台代收与自有商户分列统计；平台代收的已付未结金额单列，供人工结算核对
export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const subsites = await prisma.subsite.findMany({
    orderBy: { createdAt: "desc" },
    include: { owner: { select: { phone: true, credits: true } } },
  });
  const ids = subsites.map((subsite) => subsite.id);
  const paidStats = ids.length
    ? await prisma.manualOrder.groupBy({
        by: ["subsiteId", "collectionMode"],
        where: { subsiteId: { in: ids }, status: "PAID", orderType: "SITE_ORDER" },
        _count: { _all: true },
        _sum: { amount: true },
      })
    : [];
  const pendingSettle = ids.length
    ? await prisma.manualOrder.groupBy({
        by: ["subsiteId"],
        where: { subsiteId: { in: ids }, status: "PAID", orderType: "SITE_ORDER", settlementStatus: "PENDING" },
        _count: { _all: true },
        _sum: { settlementAmount: true },
      })
    : [];
  const key = (subsiteId, mode) => `${subsiteId}:${mode}`;
  const statsMap = new Map();
  for (const row of paidStats) statsMap.set(key(row.subsiteId, row.collectionMode), row);
  const settleMap = new Map(pendingSettle.map((row) => [row.subsiteId, row]));
  return NextResponse.json(
    subsites.map((subsite) => {
      const own = statsMap.get(key(subsite.id, "AGENT"));
      const platform = statsMap.get(key(subsite.id, "PLATFORM"));
      const settle = settleMap.get(subsite.id);
      return {
        id: subsite.id,
        slug: subsite.slug,
        siteName: subsite.siteName,
        status: subsite.status,
        siteUrl: `${subsite.slug}.face.shuqizhisou.cc`,
        payMode: subsite.epayPid ? "own" : "platform",
        ownerPhoneTail: subsite.owner?.phone ? `****${subsite.owner.phone.slice(-4)}` : "",
        ownerPhone: subsite.owner?.phone || "",
        credits: subsite.owner?.credits ?? 0,
        ownPaidOrders: own?._count._all || 0,
        ownPaidSum: own?._sum.amount || 0,
        platformPaidOrders: platform?._count._all || 0,
        platformPaidSum: platform?._sum.amount || 0,
        pendingSettleCount: settle?._count._all || 0,
        pendingSettleAmount: settle?._sum.settlementAmount || 0,
        createdAt: subsite.createdAt,
      };
    })
  );
}

// 创建分站：按手机号查代理 → 建 Subsite → 开户赠送积分（CreditLedger）→ 审计，全事务
// 收款二选一：payMode="own" 填代理自己的易支付商户；payMode="platform"（默认）留空 = 平台代收、人工结算
export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const ownerPhone = String(body.ownerPhone || "").trim();
    const slug = String(body.slug || "").trim().toLowerCase();
    const siteName = String(body.siteName || "").trim();
    const payMode = body.payMode === "own" ? "own" : "platform";
    const epayPid = String(body.epayPid || "").trim();
    const epayKey = String(body.epayKey || "").trim();
    const epayApiUrl = String(body.epayApiUrl || "").trim() || process.env.EPAY_API_URL || "";
    const grantCredits = body.grantCredits === "" || body.grantCredits === undefined || body.grantCredits === null || !Number.isFinite(Number(body.grantCredits)) ? 88 : Math.trunc(Number(body.grantCredits));
    if (!ownerPhone || !slug || !siteName) {
      return NextResponse.json({ error: "手机号、slug 与站名均为必填" }, { status: 400 });
    }
    if (payMode === "own" && (!epayPid || !epayKey)) {
      return NextResponse.json({ error: "自有收款需填写商户 PID 与密钥" }, { status: 400 });
    }
    if (payMode === "own" && epayApiUrl && !/^https?:\/\//.test(epayApiUrl)) {
      return NextResponse.json({ error: "易支付网关地址需以 http(s):// 开头" }, { status: 400 });
    }
    if (!/^[a-z0-9-]{2,40}$/.test(slug)) {
      return NextResponse.json({ error: "slug 仅限 2-40 位小写字母、数字与中划线" }, { status: 400 });
    }
    if (grantCredits < 0) {
      return NextResponse.json({ error: "开户积分不能为负数" }, { status: 400 });
    }
    const owner = await prisma.user.findUnique({ where: { phone: ownerPhone }, select: { id: true } });
    if (!owner) return NextResponse.json({ error: "该手机号尚未注册" }, { status: 400 });
    const slugClash = await prisma.subsite.findUnique({ where: { slug }, select: { id: true } });
    if (slugClash) return NextResponse.json({ error: "子域前缀已被占用" }, { status: 400 });
    const ownerClash = await prisma.subsite.findUnique({ where: { ownerId: owner.id }, select: { id: true } });
    if (ownerClash) return NextResponse.json({ error: "该用户已是分站代理" }, { status: 400 });
    const subsite = await prisma.$transaction(async (tx) => {
      const created = await tx.subsite.create({
        data: {
          ownerId: owner.id,
          slug,
          siteName,
          epayPid: payMode === "own" ? epayPid : null,
          epayKey: payMode === "own" ? epayKey : null,
          epayApiUrl: payMode === "own" ? epayApiUrl : null,
          note: body.note ? String(body.note).slice(0, 2000) : null,
        },
      });
      if (grantCredits !== 0) {
        const updated = await tx.user.update({ where: { id: owner.id }, data: { credits: { increment: grantCredits } }, select: { credits: true } });
        await tx.creditLedger.create({
          data: { userId: owner.id, amount: grantCredits, balance: updated.credits, reason: "分站开户赠送", sourceType: "SITE_OPEN_BONUS", sourceId: created.id },
        });
      }
      await writeAdminLog(tx, auth.user.id, "CREATE_SUBSITE", "SUBSITE", created.id, { slug, siteName, ownerPhone, payMode, grantCredits });
      return created;
    });
    // 永不回传商户密钥
    // 自动签发 HTTPS：slug 已通过 ^[a-z0-9-]{2,40}$ 校验后才会走到这里，execFile 不经 shell 无注入面。
    // 脚本幂等（已有证书直接跳过签发），失败不影响开站，可在服务器重跑 add-tenant-https.sh 补救。
    try {
      execFile("/usr/local/bin/add-tenant-https.sh", [slug], { timeout: 120_000 }, (err, stdout, stderr) => {
        console.log("[TENANT_HTTPS]", slug, err ? `failed: ${err.message}` : "ok", String(stdout || stderr || "").slice(-200));
      });
    } catch (e) {
      console.error("[TENANT_HTTPS]", slug, e.message);
    }
    return NextResponse.json({ data: { id: subsite.id, slug: subsite.slug, siteName: subsite.siteName, siteUrl: `${subsite.slug}.face.shuqizhisou.cc`, payMode } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "创建分站失败" }, { status: 400 });
  }
}
