import {
  SITE_COLLECTION_MODES,
  calculateSiteSplit,
  siteCollectionMode,
} from "./subsite-accounting.mjs";

// 分站订单账务唯一入口：下单、回调、人工确认、退款都从这里走，保证两种收款模式的记账一致。
// 所有动作都要求调用方传入事务 tx（Next 路由里用 prisma.$transaction 包裹），本模块不直接持有连接。
// 原则：
// - AGENT（代理自有商户）：客户钱直达代理；平台按实付 30% 向代理收供货费，下单即预扣积分，
//   支付成功转 CHARGED，取消释放，退款冲回。
// - PLATFORM（平台代收）：钱进平台主收款；客户照常拿权益，代理 70% 份额记入待人工结算，
//   管理员登记结算后闭环；不扣代理积分。
// 所有余额变动都写 CreditLedger（balance = 变更后余额），分账快照以订单字段为准，不回查动态配置。

export function resolveSiteOrderContext(subsite, plan) {
  const mode = siteCollectionMode(subsite);
  if (!mode) throw new Error("分站收款配置不完整：商户号、密钥与网关必须同时填写，或全部留空改用平台代收");
  if (mode === SITE_COLLECTION_MODES.AGENT && !subsite.epayApiUrl) throw new Error("分站收款配置缺少网关地址");
  const split = calculateSiteSplit(plan.amount, subsite.platformFeeBps ?? SITE_PLATFORM_FEE_BPS);
  return {
    collectionMode: mode,
    collectionPid: mode === SITE_COLLECTION_MODES.AGENT ? subsite.epayPid : null,
    platformFeeBps: split.platformFeeBps,
    platformFeeAmount: split.platformFeeAmount,
    agentShareAmount: split.agentShareAmount,
    platformFeeCredits: split.platformFeeCredits,
    siteCreditsCost: split.platformFeeCredits,
  };
}

export async function reserveSiteFee(tx, order) {
  if (order.collectionMode !== SITE_COLLECTION_MODES.AGENT || order.siteLedgerStatus !== "NOT_REQUIRED") return;
  const credits = Math.max(0, Math.trunc(order.platformFeeCredits ?? 0));
  const ownerId = order.subsite?.ownerId;
  if (!ownerId) throw new Error("分站订单缺少代理归属");
  if (credits > 0) {
    const reserved = await tx.user.updateMany({
      where: { id: ownerId, credits: { gte: credits } },
      data: { credits: { decrement: credits } },
    });
    if (reserved.count !== 1) throw new Error("代理积分余额不足，请先充值后再接受新订单");
    const owner = await tx.user.findUnique({ where: { id: ownerId }, select: { credits: true } });
    await tx.creditLedger.create({
      data: {
        userId: ownerId,
        amount: -credits,
        balance: owner.credits,
        reason: `分站订单平台供货费预扣 ${order.planName}`,
        sourceType: "SITE_ORDER_RESERVE",
        sourceId: order.id,
      },
    });
  }
  await tx.manualOrder.update({
    where: { id: order.id },
    data: { siteCreditsReservedAt: new Date(), siteLedgerStatus: "RESERVED" },
  });
}

export async function releaseSiteFee(tx, order, reason = "分站订单取消，释放预扣供货费") {
  if (order.collectionMode !== SITE_COLLECTION_MODES.AGENT || order.siteLedgerStatus !== "RESERVED") return;
  const credits = Math.max(0, Math.trunc(order.platformFeeCredits ?? 0));
  const ownerId = order.subsite?.ownerId;
  if (!ownerId) throw new Error("分站订单缺少代理归属");
  if (credits > 0) {
    const owner = await tx.user.update({ where: { id: ownerId }, data: { credits: { increment: credits } }, select: { credits: true } });
    await tx.creditLedger.create({
      data: {
        userId: ownerId,
        amount: credits,
        balance: owner.credits,
        reason: `${reason} ${order.planName}`,
        sourceType: "SITE_ORDER_RELEASE",
        sourceId: order.id,
      },
    });
  }
  await tx.manualOrder.update({
    where: { id: order.id },
    data: { siteCreditsReleasedAt: new Date(), siteLedgerStatus: "RELEASED" },
  });
}

// 支付成功（网关回调或人工确认收款）统一调用。调用前保证订单仍是 PENDING。
export async function settleSiteOrderOnPaid(tx, order) {
  if (!order.subsiteId || order.orderType !== "SITE_ORDER") return;
  if (order.collectionMode === SITE_COLLECTION_MODES.AGENT) {
    if (["CHARGED", "RELEASED", "REVERSED"].includes(order.siteLedgerStatus)) throw new Error("分站订单供货状态异常，拒绝确认收款");
    if (order.siteLedgerStatus === "NOT_REQUIRED") await reserveSiteFee(tx, order);
    await tx.manualOrder.update({ where: { id: order.id }, data: { siteLedgerStatus: "CHARGED", settlementStatus: "NOT_REQUIRED" } });
    return;
  }
  if (order.collectionMode === SITE_COLLECTION_MODES.PLATFORM) {
    await tx.manualOrder.update({
      where: { id: order.id },
      data: { settlementStatus: "PENDING", settlementAmount: order.agentShareAmount, siteLedgerStatus: "PLATFORM_DUE" },
    });
    return;
  }
  throw new Error("分站订单缺少有效的收款模式快照");
}

export async function reverseSiteOrderOnRefund(tx, order, reason = "分站订单退款") {
  if (!order.subsiteId || order.orderType !== "SITE_ORDER") return;
  if (order.collectionMode === SITE_COLLECTION_MODES.AGENT && order.siteLedgerStatus === "CHARGED") {
    const credits = Math.max(0, Math.trunc(order.platformFeeCredits ?? 0));
    const ownerId = order.subsite?.ownerId;
    if (!ownerId) throw new Error("分站订单缺少代理归属");
    if (credits > 0) {
      const owner = await tx.user.update({ where: { id: ownerId }, data: { credits: { increment: credits } }, select: { credits: true } });
      await tx.creditLedger.create({
        data: {
          userId: ownerId,
          amount: credits,
          balance: owner.credits,
          reason: `${reason}，冲回平台供货费 ${order.planName}`,
          sourceType: "SITE_ORDER_REVERSAL",
          sourceId: order.id,
        },
      });
    }
    await tx.manualOrder.update({ where: { id: order.id }, data: { siteLedgerStatus: "REVERSED" } });
    return;
  }
  if (order.collectionMode === SITE_COLLECTION_MODES.PLATFORM) {
    if (order.settlementStatus === "SETTLED") throw new Error("平台代收订单已结算给代理，需人工处理退款");
    await tx.manualOrder.update({ where: { id: order.id }, data: { settlementStatus: "NOT_REQUIRED", settlementAmount: null, siteLedgerStatus: "REVERSED" } });
  }
}
