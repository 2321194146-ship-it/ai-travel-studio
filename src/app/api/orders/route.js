import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });
  const orders = await prisma.manualOrder.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, planId: true, planName: true, amount: true, status: true, orderType: true, deliveryStatus: true, channel: true, createdAt: true, paidAt: true, deliveredAt: true },
  });
  return NextResponse.json(orders);
}
