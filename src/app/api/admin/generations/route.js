import { NextResponse } from "next/server";
import { requireAdmin, parseAdminPagination, summarizeImageUrls, toAdminUserSummary, adminUserSelect } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET(request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { params, limit, offset } = parseAdminPagination(request, { limit: 50, max: 100 });
  const q = params.get("q")?.trim();
  const status = params.get("status")?.trim();
  const tier = params.get("tier")?.trim();
  const where = {
    ...(status ? { status } : {}),
    ...(tier ? { modelName: tier } : {}),
    ...(q ? {
      OR: [
        { id: { contains: q, mode: "insensitive" } },
        { requestId: { contains: q, mode: "insensitive" } },
        { templateName: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
        { modelName: { contains: q, mode: "insensitive" } },
        { prompt: { contains: q, mode: "insensitive" } },
        { user: { is: { phone: { contains: q, mode: "insensitive" } } } },
        { user: { is: { email: { contains: q, mode: "insensitive" } } } },
        { user: { is: { name: { contains: q, mode: "insensitive" } } } },
      ],
    } : {}),
  };

  const [total, generations] = await Promise.all([
    prisma.generation.count({ where }),
    prisma.generation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      select: {
        id: true,
        userId: true,
        requestId: true,
        inputImages: true,
        outputImages: true,
        templateId: true,
        templateName: true,
        category: true,
        prompt: true,
        modelName: true,
        status: true,
        creditCost: true,
        provider: true,
        actualModel: true,
        failureReason: true,
        createdAt: true,
        user: { select: adminUserSelect() },
      },
    }),
  ]);

  const data = generations.map((generation) => ({
    ...generation,
    inputImages: summarizeImageUrls(generation.inputImages),
    outputImages: summarizeImageUrls(generation.outputImages),
    user: toAdminUserSummary(generation.user),
  }));
  return NextResponse.json({ data, total, limit, offset });
}
