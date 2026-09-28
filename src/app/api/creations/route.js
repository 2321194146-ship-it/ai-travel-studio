import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteOwnedFile } from "@/lib/services/ai";

// 生成采用同步完成模式：processing 记录会在请求返回前被更新为终态。
// 此处不再伪装状态，直接返回数据库中的真实记录。
async function syncProcessingRecord(record) {
  return record;
}

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    // Single record fetch
    if (id) {
      let record = await prisma.generation.findFirst({
        where: { id, userId: session.user.id },
      });
      if (!record) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (record.status === "processing") {
        record = await syncProcessingRecord(record);
      }
      return NextResponse.json(record);
    }

    // All records
    let records = await prisma.generation.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Self-heal processing records
    const synced = await Promise.all(
      records.map((r) =>
        r.status === "processing" ? syncProcessingRecord(r) : r,
      ),
    );

    return NextResponse.json(synced);
  } catch (error) {
    console.error("[CREATIONS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    const record = await prisma.generation.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!record) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.generation.delete({ where: { id } });
    // 同步删除本人生成结果文件，避免 outputs 目录无限增长（孤儿文件）
    const outputs = Array.isArray(record.outputImages)
      ? record.outputImages.filter((u) => typeof u === "string" && u.trim())
      : [];
    await Promise.all(outputs.map((u) => deleteOwnedFile(u, session.user.id)));
    return NextResponse.json({ success: true, removedFiles: outputs.length });
  } catch (error) {
    console.error("[CREATIONS_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
