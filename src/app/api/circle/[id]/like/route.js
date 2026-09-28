import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_request, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const post = await prisma.circlePost.findFirst({ where: { id, status: "PUBLISHED" }, select: { id: true } });
  if (!post) return NextResponse.json({ error: "动态不存在" }, { status: 404 });
  const existing = await prisma.circleLike.findUnique({ where: { postId_userId: { postId: id, userId: session.user.id } } });
  if (existing) await prisma.circleLike.delete({ where: { id: existing.id } });
  else await prisma.circleLike.create({ data: { postId: id, userId: session.user.id } });
  const likes = await prisma.circleLike.count({ where: { postId: id } });
  return NextResponse.json({ liked: !existing, likes });
}
