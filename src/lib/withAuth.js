import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

// 统一的 API 鉴权封装：未登录返回 401
export async function withAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { session: null, error: new Response("Unauthorized", { status: 401 }) };
  }
  return { session, error: null };
}
