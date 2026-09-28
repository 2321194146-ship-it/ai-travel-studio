import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOwnedStoredImagePath } from "@/lib/image-access.mjs";

function guestTokenFromRequest(request) {
  const cookie = request.headers.get("cookie") || "";
  const entry = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("mf_guest_id="));
  const token = entry?.slice("mf_guest_id=".length) || "";
  return /^[a-f0-9]{16}$/i.test(token) ? token : null;
}

export async function canReadStoredImage(request, directory, segments) {
  if (!["uploads", "outputs"].includes(directory) || !Array.isArray(segments) || !segments.length || (directory === "uploads" && segments.length < 2) || segments.some((part) =>
    typeof part !== "string" || !part || part.startsWith(".") || part.includes("/") || part.includes("\\")
  )) return false;

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  const isAdmin = session?.user?.role === "ADMIN" || adminEmails.includes(String(session?.user?.email || "").toLowerCase());

  if (directory === "uploads" && segments[0] === "settlement") {
    if (!segments[1] || segments.length !== 2) return false;
    const requestId = segments[1].replace(/\.[^.]+$/, "");
    const settlement = await prisma.siteSettlementRequest.findUnique({
      where: { id: requestId },
      select: { subsite: { select: { ownerId: true } } },
    });
    return Boolean(settlement && (isAdmin || settlement.subsite.ownerId === userId));
  }

  if (isOwnedStoredImagePath(directory, segments, userId)) return true;
  const url = `/${directory}/${segments.join("/")}`;
  if (userId) {
    const linkedPhoto = await prisma.userPhoto.findFirst({ where: { userId, url }, select: { id: true } });
    if (linkedPhoto) return true;
  } else {
    const token = guestTokenFromRequest(request);
    if (token && segments.length > 1) {
      const guest = await prisma.user.findUnique({ where: { email: `guest_${token}@guest.local` }, select: { id: true } });
      if (guest?.id === segments[0]) return true;
    }
  }

  const canonicalUrl = new URL(url, process.env.NEXTAUTH_URL || "https://face.shuqizhisou.cc").toString();
  const publishedPost = await prisma.circlePost.findFirst({
    where: {
      status: "PUBLISHED",
      OR: [
        { imageUrl: { in: [url, canonicalUrl] } },
        { imageUrls: { array_contains: [url] } },
        { imageUrls: { array_contains: [canonicalUrl] } },
      ],
    },
    select: { id: true },
  });
  return Boolean(publishedPost);
}
