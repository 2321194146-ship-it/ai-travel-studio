import { NextResponse } from "next/server";
import { requireAdmin, parseAdminPagination } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET(request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { params, limit, offset } = parseAdminPagination(request, { limit: 50, max: 100 });
  const action = params.get("action")?.trim();
  const targetType = params.get("targetType")?.trim();
  const q = params.get("q")?.trim();
  const where = {
    ...(action ? { action } : {}),
    ...(targetType ? { targetType } : {}),
    ...(q ? {
      OR: [
        { action: { contains: q, mode: "insensitive" } },
        { targetType: { contains: q, mode: "insensitive" } },
        { targetId: { contains: q, mode: "insensitive" } },
        { actor: { is: { phone: { contains: q } } } },
        { actor: { is: { email: { contains: q, mode: "insensitive" } } } },
      ],
    } : {}),
  };
  const [total, logs] = await Promise.all([
    prisma.adminAuditLog.count({ where }),
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      select: { id: true, action: true, targetType: true, targetId: true, detail: true, createdAt: true, actor: { select: { name: true, phone: true, email: true } } },
    }),
  ]);
  return NextResponse.json({ data: logs, total, limit, offset });
}
