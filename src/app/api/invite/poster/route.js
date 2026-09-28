import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { composeInvitePoster } from "@/lib/invite-poster";
import { publicLineUrl } from "@/lib/public-line";

const KINDS = new Set(["boxing", "invitation"]);

// 邀请海报：?kind=boxing|invitation（缺省随机轮换）。需登录——海报带本人邀请码。
export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { inviteCode: true },
  });
  if (!user) return NextResponse.json({ error: "账号已失效，请重新登录" }, { status: 401 });
  if (!user.inviteCode) return NextResponse.json({ error: "邀请码未生成，请先打开邀请中心" }, { status: 409 });

  const url = new URL(request.url);
  let kind = url.searchParams.get("kind");
  if (!kind) kind = Math.random() < 0.5 ? "boxing" : "invitation";
  if (!KINDS.has(kind)) return NextResponse.json({ error: "未知海报样式" }, { status: 400 });

  const cta = publicLineUrl(`/?ref=${user.inviteCode}`);

  try {
    const buf = await composeInvitePoster(kind, { inviteCode: user.inviteCode, ctaUrl: cta });
    return new NextResponse(buf, {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[INVITE_POSTER]", error.message);
    return NextResponse.json({ error: "海报生成失败" }, { status: 500 });
  }
}
