import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const posts = await prisma.circlePost.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { user: { select: { name: true, image: true } }, comments: { where: { status: "PUBLISHED" }, orderBy: { createdAt: "asc" }, take: 20, include: { user: { select: { name: true } } } }, _count: { select: { likesBy: true } } },
  });
  return NextResponse.json(posts);
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : null;
  const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls.filter((item) => typeof item === "string").slice(0, 9) : [];
  if (content.length < 2 || content.length > 500) return NextResponse.json({ error: "内容需为 2-500 个字" }, { status: 400 });
  if (imageUrl || imageUrls.length) {
    try {
      const parsed = new URL(imageUrl, "https://face.shuqizhisou.cc");
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("invalid");
    } catch { return NextResponse.json({ error: "图片地址无效" }, { status: 400 }); }
  }
  const allImages = imageUrls.length ? imageUrls : (imageUrl ? [imageUrl] : []);
  for (const url of allImages) {
    try { const parsed = new URL(url, "https://face.shuqizhisou.cc"); if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("invalid"); } catch { return NextResponse.json({ error: "图片地址无效" }, { status: 400 }); }
  }
  const post = await prisma.circlePost.create({ data: { userId: session.user.id, content, imageUrl: allImages[0] || null, imageUrls: allImages, status: "PENDING" } });
  return NextResponse.json({ data: post, message: "已提交，审核通过后会出现在圈子里" }, { status: 201 });
}
