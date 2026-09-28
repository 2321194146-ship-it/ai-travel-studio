import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readStoredImage } from "@/lib/stored-image.mjs";

export async function GET(req) {
  // 下载必须登录
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  // 仅允许下载本人创作记录中的图片，禁止任意 URL 代理
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const record = await prisma.generation.findFirst({
    where: { id, userId: session.user.id },
  });
  if (
    !record ||
    !Array.isArray(record.outputImages) ||
    record.outputImages.length === 0
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rawIndex = searchParams.get("index");
  const index = rawIndex === null ? 0 : Number.parseInt(rawIndex, 10);
  if (!Number.isInteger(index) || index < 0 || index >= record.outputImages.length) {
    return NextResponse.json({ error: "Invalid image index" }, { status: 400 });
  }
  const imageRef = String(record.outputImages[index]);
  const rawFilename = imageRef.split("/").pop() || `download_${Date.now()}.png`;
  const filename = rawFilename.replace(/[^a-zA-Z0-9._-]/g, "_");

  // 本地产物：直接从磁盘读取返回
  const localImage = imageRef.match(/^\/(outputs|uploads)\/(.+)$/);
  if (localImage) {
    const stored = await readStoredImage(localImage[1], localImage[2].split("/"));
    if (!stored) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new Response(stored.bytes, {
      headers: {
        "Content-Type": stored.contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  // 兼容旧记录：http/https 外链代理
  let parsed;
  try {
    parsed = new URL(imageRef);
  } catch {
    return NextResponse.json({ error: "Invalid image URL" }, { status: 400 });
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return NextResponse.json({ error: "Invalid image URL" }, { status: 400 });
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const res = await fetch(imageRef);
    if (!res.ok) throw new Error("Failed to fetch image");
    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "image/png";
    return new Response(Buffer.from(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: "Image download unavailable" }, { status: 502 });
  }
}
