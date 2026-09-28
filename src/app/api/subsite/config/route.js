import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 分站公开配置：反代/前端据此注入站点名与状态，无需登录
export async function GET(req) {
  const slug = String(new URL(req.url).searchParams.get("slug") || "").trim();
  if (!slug) {
    return NextResponse.json({ error: "缺少 slug" }, { status: 400 });
  }
  const subsite = await prisma.subsite.findUnique({
    where: { slug },
    select: { siteName: true, status: true },
  });
  if (!subsite) {
    return NextResponse.json({ error: "分站不存在" }, { status: 404 });
  }
  return NextResponse.json({ siteName: subsite.siteName, status: subsite.status });
}
