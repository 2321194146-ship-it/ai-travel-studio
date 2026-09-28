import { stripe } from "../stripe";
import config from "../config";
import { prisma } from "../prisma";

export const BillingService = {
  async createCheckoutSession(userId, planId) {
    const plan = config.stripe.plans[planId];
    if (!plan) throw new Error("Invalid plan selected");

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: config.stripe.currency,
            product_data: {
              name: `${config.stripe.plans[planId].name}`,
              description: `Purchase ${plan.credits} credits to perform AI generations.`,
            },
            unit_amount: plan.price,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${config.auth.url}/pricing?success=true`,
      cancel_url: `${config.auth.url}/pricing?canceled=true`,
      metadata: { userId, planId, credits: plan.credits.toString() },
    });

    return session.url;
  },

  async handleWebhook(body, signature) {
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      config.stripe.webhookSecret,
    );
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session.metadata?.userId;
      const credits = parseInt(session.metadata?.credits || "0", 10);

      if (userId && credits > 0) {
        try {
          await prisma.$transaction(async (tx) => {
            // 先对用户行加锁再入账，使并发的重复推送串行化；
            // 再查流水做幂等：同一 checkout 会话只入账一次。
            const updated = await tx.user.update({
              where: { id: userId },
              data: { credits: { increment: credits } },
              select: { credits: true },
            });
            const duplicate = await tx.creditLedger.findFirst({
              where: { userId, sourceType: "PAYMENT", sourceId: session.id },
              select: { id: true },
            });
            if (duplicate) throw new Error("DUPLICATE_PAYMENT_EVENT");
            await tx.creditLedger.create({
              data: {
                userId,
                amount: credits,
                balance: updated.credits,
                reason: "Stripe 充值",
                sourceType: "PAYMENT",
                sourceId: session.id,
              },
            });
          });
          return { success: true, userId, credits };
        } catch (err) {
          if (err?.message === "DUPLICATE_PAYMENT_EVENT") {
            return { success: false, duplicate: true, userId, credits };
          }
          throw err;
        }
      }
    }
    return { success: false };
  },
};
