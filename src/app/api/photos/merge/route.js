import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getGuestIdentity } from "@/lib/guest";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
  const store = await cookies();
  if (!store.get("mf_guest_id")?.value) return NextResponse.json({ merged: 0 });
  const guest = await getGuestIdentity();
  if (guest.user.id === session.user.id) return NextResponse.json({ merged: 0 });
  const result = await prisma.userPhoto.updateMany({
    where: { userId: guest.user.id },
    data: { userId: session.user.id },
  });
  return NextResponse.json({ merged: result.count });
}
