import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteUploadedFile } from "@/lib/services/ai";
import { getGuestIdentity, setGuestCookie } from "@/lib/guest";

async function currentIdentity() {
  const session = await getServerSession(authOptions);
  return session?.user ? { user: session.user, isGuest: false } : { ...(await getGuestIdentity()), isGuest: true };
}

export async function GET() {
  const identity = await currentIdentity();
  const user = identity.user;
  const photos = await prisma.userPhoto.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  const response = NextResponse.json(photos);
  if (identity.isGuest && identity.isNew) setGuestCookie(response, identity.token);
  return response;
}

export async function POST(req) {
  const identity = await currentIdentity();
  const user = identity.user;
  const { url, label, thumbUrl } = await req.json();
  if (!url || typeof url !== "string" || !url.startsWith(`/uploads/${user.id}/profile_`)) {
    return NextResponse.json({ error: "无效的档案照片" }, { status: 400 });
  }
  const photo = await prisma.userPhoto.create({ data: { userId: user.id, url, thumbUrl: typeof thumbUrl === "string" ? thumbUrl : null, label: typeof label === "string" && label.trim() ? label.trim() : "未分类" } });
  const response = NextResponse.json({ ...photo, guest: identity.isGuest });
  if (identity.isGuest && identity.isNew) setGuestCookie(response, identity.token);
  return response;
}

export async function DELETE(req) {
  const identity = await currentIdentity();
  const user = identity.user;
  const { id } = await req.json();
  const photo = await prisma.userPhoto.findFirst({ where: { id, userId: user.id } });
  if (!photo) return NextResponse.json({ error: "照片不存在" }, { status: 404 });
  await prisma.userPhoto.delete({ where: { id: photo.id } });
  await Promise.all([
    deleteUploadedFile(photo.url),
    photo.thumbUrl && photo.thumbUrl !== photo.url ? deleteUploadedFile(photo.thumbUrl) : null,
  ]);
  return NextResponse.json({ success: true });
}
