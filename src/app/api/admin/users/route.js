import { NextResponse } from "next/server";
import { requireAdmin, parseAdminPagination } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET(request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { params, limit, offset } = parseAdminPagination(request, { limit: 50, max: 100 });
  const query = params.get("q")?.trim();
  const membership = params.get("membership")?.trim();
  const membershipStatus = params.get("membershipStatus")?.trim();
  const now = new Date();
  const membershipWhere = membershipStatus === "active"
    ? { membershipExpiresAt: { gt: now } }
    : membershipStatus === "expired"
      ? { membershipExpiresAt: { lte: now } }
      : membershipStatus === "none"
        ? { membership: "NONE" }
        : {};
  const where = {
    ...(membership ? { membership } : {}),
    ...membershipWhere,
    ...(query
      ? {
          OR: [
            { id: { contains: query, mode: "insensitive" } },
            { phone: { contains: query } },
            { email: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
            { inviteCode: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: offset,
      take: limit,
      select: {
        id: true,
        phone: true,
        email: true,
        name: true,
        role: true,
        credits: true,
        membership: true,
        membershipExpiresAt: true,
        createdAt: true,
        inviteCode: true,
        referredById: true,
        _count: { select: { referrals: true, generations: true, orders: true } },
      },
    }),
  ]);

  return NextResponse.json({ data: users, total, limit, offset });
}
