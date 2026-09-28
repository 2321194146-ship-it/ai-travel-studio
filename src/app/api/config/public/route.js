import { NextResponse } from "next/server";

// 返回可安全暴露给客户端的公开配置（无任何密钥）
export async function GET() {
  return NextResponse.json({
    appName: process.env.NEXT_PUBLIC_APP_NAME || "型男制造机",
    theme: "slate-indigo",
    stripe: {
      publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
    },
    plans: [
      { id: "standard", name: "标准生成卡", price: 29.9, images: 12, tier: "standard", expiresDays: 30 },
      { id: "high", name: "高清生成卡", price: 99, images: 30, tier: "high", expiresDays: 60 },
      { id: "flagship", name: "旗舰精修卡", price: 199, images: 60, tier: "flagship", expiresDays: 90 },
    ],
  });
}
