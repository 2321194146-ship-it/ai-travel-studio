import { prisma } from "@/lib/prisma";

// 租户头不存在表示主站；头存在但租户无效/暂停时必须显式拒绝，不能降级为主站。
export async function getSubsiteFromRequest(req) {
  const slug = String(req.headers.get("x-tenant-slug") || "").trim().toLowerCase();
  if (!slug) return { kind: "MAIN", subsite: null };
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return { kind: "INVALID", slug, subsite: null };
  const subsite = await prisma.subsite.findUnique({ where: { slug } });
  if (!subsite) return { kind: "INVALID", slug, subsite: null };
  if (subsite.status !== "ACTIVE") return { kind: "SUSPENDED", slug, subsite };
  return { kind: "ACTIVE", slug, subsite };
}

export function tenantRequestError(tenant) {
  if (tenant?.kind === "SUSPENDED") return { status: 403, error: "该分站已暂停营业，请联系站长" };
  if (tenant?.kind === "INVALID") return { status: 404, error: "分站不存在" };
  return null;
}
