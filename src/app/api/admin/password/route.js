import { NextResponse } from "next/server";
import { requireAdmin, writeAdminLog } from "@/lib/admin";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

// 管理员修改自己的密码：校验当前密码 → 写新哈希 + 审计。会话（JWT）不受影响，改完无需重新登录。
export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "新密码至少需要8位" }, { status: 400 });
    }
    if (newPassword === currentPassword) {
      return NextResponse.json({ error: "新密码不能与当前密码相同" }, { status: 400 });
    }
    const admin = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { id: true, passwordHash: true },
    });
    if (!admin || !admin.passwordHash || !verifyPassword(currentPassword, admin.passwordHash)) {
      return NextResponse.json({ error: "当前密码不正确" }, { status: 400 });
    }
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: admin.id },
        data: { passwordHash: hashPassword(newPassword) },
      });
      await writeAdminLog(tx, admin.id, "ADMIN_PASSWORD_CHANGED", "USER", admin.id, { via: "admin-panel" });
    });
    return NextResponse.json({ success: true, message: "密码已修改，下次登录请使用新密码" });
  } catch (error) {
    return NextResponse.json({ error: error.message || "修改密码失败" }, { status: 400 });
  }
}
