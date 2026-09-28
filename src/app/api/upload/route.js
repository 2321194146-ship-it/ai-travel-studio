import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import {
  deleteUploadedFile,
  cleanupOldUploads,
  UPLOAD_DIR,
} from "@/lib/services/ai";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { getGuestIdentity, setGuestCookie } from "@/lib/guest";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const EXT_BY_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function hasValidSignature(file) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (file.type === "image/jpeg")
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.type === "image/png")
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  if (file.type === "image/webp")
    return (
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  return false;
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    const identity = session?.user ? { user: session.user, isNew: false } : await getGuestIdentity();

    // 速率限制：用户维度每分钟 10 次；IP 维度每分钟 20 次，防止换 Cookie 绕过
    const rl = checkRateLimit(`upload:${identity.user.id}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many requests. Retry after ${rl.retryAfter}s` },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }
    const rlIp = checkRateLimit(`upload-ip:${getClientIp(req)}`, 20, 60_000);
    if (!rlIp.allowed) {
      return NextResponse.json(
        { error: `Too many requests. Retry after ${rlIp.retryAfter}s` },
        { status: 429, headers: { "Retry-After": String(rlIp.retryAfter) } },
      );
    }

    const data = await req.formData();
    const file = data.get("file");
    const purpose = data.get("purpose");
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // 类型白名单校验
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Unsupported file type "${file.type}". Allowed: JPG, PNG, WebP`,
        },
        { status: 400 },
      );
    }

    // 大小上限校验
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max: 5 MB`,
        },
        { status: 400 },
      );
    }

    if (!(await hasValidSignature(file))) {
      return NextResponse.json(
        { error: "Invalid image file" },
        { status: 400 },
      );
    }

    // 人脸照片仅保存在服务器本地必要时间（TTL 过期自动清理）
    try {
      await cleanupOldUploads(identity.user.id);
    } catch {
      // 清理失败不影响上传
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const userId = identity.user.id;
    const userDir = path.join(UPLOAD_DIR, userId);
    await fs.mkdir(userDir, { recursive: true });
    const ext = EXT_BY_TYPE[file.type] || "jpg";
    const prefix = purpose === "profile" ? "profile_" : "";
    const name = `${prefix}${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${ext}`;
    await fs.writeFile(path.join(userDir, name), bytes);

    // 档案照同步生成 320px 缩略图（小格子加载用，原图留给 AI 生成）
    let thumbUrl;
    if (purpose === "profile") {
      try {
        const sharp = (await import("sharp")).default;
        const thumbName = `thumb_${name}`;
        await sharp(bytes).rotate().resize(320, 320, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 78 }).toFile(path.join(userDir, thumbName));
        thumbUrl = `/uploads/${userId}/${thumbName}`;
      } catch (thumbErr) {
        console.error("[UPLOAD_THUMB]", thumbErr.message || thumbErr);
      }
    }

    const response = NextResponse.json({ url: `/uploads/${userId}/${name}`, thumbUrl, guest: !session?.user });
    if (!session?.user && identity.isNew) setGuestCookie(response, identity.token);
    return response;
  } catch (err) {
    console.error("[UPLOAD_POST]", err.message || err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// 删除已上传的人脸照片（本人可删，用于满足“人脸照片可删除”要求）
export async function DELETE(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");
    if (!url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    // 仅允许删除本人 uploads 目录下的文件
    const prefix = `/uploads/${session.user.id}/`;
    if (!url.startsWith(prefix)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const removed = await deleteUploadedFile(url);
    return NextResponse.json({ success: true, removed });
  } catch (err) {
    console.error("[UPLOAD_DELETE]", err.message || err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
