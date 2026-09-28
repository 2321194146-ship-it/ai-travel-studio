import { NextResponse } from "next/server";
import { requireAdmin, parseAdminPagination, toAdminUserSummary, adminUserSelect } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET(request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { params, limit, offset } = parseAdminPagination(request, { limit: 50, max: 100 });
  const userId = params.get("userId")?.trim();
  const sourceType = params.get("sourceType")?.trim();
  const q = params.get("q")?.trim();
  const where = {
    ...(userId ? { userId } : {}),
    ...(sourceType ? { sourceType } : {}),
    ...(q ? {
      OR: [
        { id: { contains: q, mode: "insensitive" } },
        { sourceId: { contains: q, mode: "insensitive" } },
        { reason: { contains: q, mode: "insensitive" } },
        { sourceType: { contains: q, mode: "insensitive" } },
        { user: { is: { phone: { contains: q, mode: "insensitive" } } } },
        { user: { is: { email: { contains: q, mode: "insensitive" } } } },
        { user: { is: { name: { contains: q, mode: "insensitive" } } } },
      ],
    } : {}),
  };

  const [total, entries] = await Promise.all([
    prisma.creditLedger.count({ where }),
    prisma.creditLedger.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      select: {
        id: true,
        userId: true,
        amount: true,
        balance: true,
        reason: true,
        sourceType: true,
        sourceId: true,
        createdAt: true,
        user: { select: adminUserSelect() },
      },
    }),
  ]);

  return NextResponse.json({
    data: entries.map((entry) => ({ ...entry, user: toAdminUserSummary(entry.user) })),
    total,
    limit,
    offset,
  });
}
