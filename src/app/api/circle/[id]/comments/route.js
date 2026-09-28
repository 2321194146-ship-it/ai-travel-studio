import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_request, { params }) {
  const { id } = await params;
  const comments = await prisma.circleComment.findMany({ where: { postId: id, status: "PUBLISHED" }, orderBy: { createdAt: "asc" }, take: 100, include: { user: { select: { name: true } } } });
  return NextResponse.json(comments);
}

export async function POST(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (content.length < 1 || content.length > 200) return NextResponse.json({ error: "评论需为 1-200 个字" }, { status: 400 });
  const post = await prisma.circlePost.findFirst({ where: { id, status: "PUBLISHED" }, select: { id: true } });
  if (!post) return NextResponse.json({ error: "动态不存在" }, { status: 404 });
  const comment = await prisma.circleComment.create({ data: { postId: id, userId: session.user.id, content, status: "PENDING" } });
  return NextResponse.json({ data: comment, message: "评论已提交，审核通过后显示" }, { status: 201 });
}
