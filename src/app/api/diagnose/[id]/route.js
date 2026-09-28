import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(_request, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });
  const resolvedParams = await params;
  const id = String(resolvedParams?.id || "");
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
  const result = await prisma.diagnose.deleteMany({ where: { id, userId: session.user.id } });
  if (!result.count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
