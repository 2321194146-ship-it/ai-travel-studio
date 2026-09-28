import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_request, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const order = await prisma.manualOrder.findFirst({
    where: { id: String(id || ""), userId: session.user.id },
    select: { id: true, planId: true, planName: true, amount: true, status: true, orderType: true, deliveryStatus: true, createdAt: true, paidAt: true, deliveredAt: true },
  });
  if (!order) return NextResponse.json({ error: "订单不存在" }, { status: 404 });
  return NextResponse.json({ data: order });
}
