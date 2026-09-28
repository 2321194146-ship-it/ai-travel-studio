import { NextResponse } from "next/server";
import { requireAdmin, writeAdminLog } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const posts = await prisma.circlePost.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { user: { select: { id: true, phone: true, name: true } } } });
  return NextResponse.json({ data: posts });
}

export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  const seed = [
    ["第一次按建议换了发型，侧脸比以前利落很多。先记录一下这周的状态。", "/mf-assets/river-man.png"],
    ["周末去河边走了走，原来不摆剪刀手，也能拍出自然的生活感。", "/mf-assets/cafe-man.png"],
    ["把黑色外套换成浅色衬衫，整个人没那么闷了，继续慢慢找到适合自己的风格。", "/mf-assets/market-man.png"],
  ];
  if (body.action === "seed") {
    const posts = await prisma.$transaction(seed.map(([content, imageUrl]) => prisma.circlePost.create({ data: { content, imageUrl, status: "PENDING", isSeed: true } })));
    return NextResponse.json({ data: posts }, { status: 201 });
  }
  return NextResponse.json({ error: "不支持的操作" }, { status: 400 });
}

export async function PATCH(request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  const status = ["PUBLISHED", "REJECTED", "PENDING"].includes(body.status) ? body.status : "";
  if (!id || !status) return NextResponse.json({ error: "参数无效" }, { status: 400 });
  const post = await prisma.circlePost.update({ where: { id }, data: { status } });
  await writeAdminLog(prisma, auth.user.id, `CIRCLE_${status}`, "CirclePost", id, { status });
  return NextResponse.json({ data: post });
}
