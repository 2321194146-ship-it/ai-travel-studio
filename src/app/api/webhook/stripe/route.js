import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { BillingService } from "@/lib/services/billing";

export async function POST(req) {
  try {
    const body = await req.text();
    const headersList = await headers();
    const signature = headersList.get("stripe-signature");

    if (!signature) {
      return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
    }

    const result = await BillingService.handleWebhook(body, signature);
    return NextResponse.json(result);
  } catch (error) {
    // 不回传内部错误细节，避免泄露实现信息
    console.error("Stripe webhook processing error:", error?.message || error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
