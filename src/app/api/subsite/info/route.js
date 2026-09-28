import { NextResponse } from "next/server";
import { getSubsiteFromRequest } from "@/lib/subsite";

// 分站公开信息：泛域名 {slug}.face.shuqizhisou.cc 的请求带 x-tenant-slug（nginx 注入），
// 主站请求无此头，返回空 data，前端据此显示"官方分站"或不显示。
// 停用分站返回 status=SUSPENDED，前端明确提示暂停营业，不伪装成主站。
export async function GET(req) {
  const tenant = await getSubsiteFromRequest(req);
  if (tenant.kind === "MAIN") return NextResponse.json({ data: null });
  if (tenant.kind === "INVALID") return NextResponse.json({ error: "分站不存在" }, { status: 404 });
  if (tenant.kind === "SUSPENDED") {
    return NextResponse.json({ data: { slug: tenant.slug, siteName: tenant.subsite.siteName, status: "SUSPENDED" } });
  }
  return NextResponse.json({
    data: { slug: tenant.subsite.slug, siteName: tenant.subsite.siteName, status: tenant.subsite.status },
  });
}
