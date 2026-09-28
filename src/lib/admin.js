import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const allowed = (process.env.ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  const email = String(session.user.email || "").toLowerCase();
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, email: true, role: true } });
  if (!user || (user.role !== "ADMIN" && !allowed.includes(email))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, user };
}

export async function writeAdminLog(tx, actorId, action, targetType, targetId, detail) {
  return tx.adminAuditLog.create({ data: { actorId, action, targetType, targetId, detail } });
}

export function parseAdminPagination(request, defaults = {}) {
  const params = new URL(request.url).searchParams;
  const requestedLimit = Number.parseInt(params.get("limit") || "", 10);
  const requestedOffset = Number.parseInt(params.get("offset") || "", 10);
  const max = defaults.max ?? 100;
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), max) : (defaults.limit ?? 50);
  const offset = Number.isFinite(requestedOffset) ? Math.max(requestedOffset, 0) : 0;
  return { params, limit, offset };
}

function collectImageUrls(value, output) {
  if (typeof value === "string") {
    const candidate = value.trim();
    if (candidate && !candidate.startsWith("data:") && candidate.length <= 4096 && (/^(https?:)?\//.test(candidate) || candidate.startsWith("/"))) {
      output.push(candidate);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectImageUrls(item, output));
    return;
  }
  if (value && typeof value === "object") {
    ["url", "imageUrl", "src", "uri"].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(value, key)) collectImageUrls(value[key], output);
    });
  }
}

export function summarizeImageUrls(value) {
  const urls = [];
  collectImageUrls(value, urls);
  return [...new Set(urls)];
}

export function adminUserSelect() {
  return {
    id: true,
    name: true,
    phone: true,
    email: true,
    image: true,
    credits: true,
    membership: true,
    membershipExpiresAt: true,
    role: true,
    inviteCode: true,
    referredById: true,
    _count: { select: { referrals: true } },
  };
}

export function toAdminUserSummary(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    image: user.image,
    credits: user.credits,
    membership: user.membership,
    membershipExpiresAt: user.membershipExpiresAt,
    role: user.role,
    inviteCode: user.inviteCode,
    referredById: user.referredById,
    referralCount: user._count?.referrals ?? 0,
  };
}
