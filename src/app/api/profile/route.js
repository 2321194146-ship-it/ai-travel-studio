import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });
  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    if (!name || name.length > 30) {
      return NextResponse.json({ error: "昵称需为1-30个字符" }, { status: 400 });
    }
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { name },
      select: { id: true, name: true, phone: true, image: true, credits: true, membership: true, membershipExpiresAt: true },
    });
    return NextResponse.json(user);
  } catch (error) {
    console.error("[PROFILE_PATCH]", error.message || error);
    return NextResponse.json({ error: "资料保存失败" }, { status: 500 });
  }
}
