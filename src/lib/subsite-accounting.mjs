export const SITE_COLLECTION_MODES = Object.freeze({ PLATFORM: "PLATFORM", AGENT: "AGENT" });
export const SITE_PLATFORM_FEE_BPS = 3000;
export const SITE_TENANT_SUFFIX = ".face.shuqizhisou.cc";

// 分站订单分账：按客户实付金额计，平台 30%（费率以基点快照，当前 3000bps）。
// 代理份额 = 实付 - 平台份额；平台份额同时折算成供货扣分（1 积分 = 100 分，向上取整）。
// 本模块保持无依赖纯函数，可被 node --test 直接加载。
export function calculateSiteSplit(amountCents, platformRateBps = SITE_PLATFORM_FEE_BPS) {
  const amount = Math.max(0, Math.trunc(Number(amountCents) || 0));
  const rate = Math.min(10000, Math.max(0, Math.trunc(Number(platformRateBps) || 0)));
  const platformFeeAmount = Math.round((amount * rate) / 10000);
  const agentShareAmount = amount - platformFeeAmount;
  return {
    platformFeeBps: rate,
    platformFeeAmount,
    agentShareAmount,
    platformFeeCredits: Math.ceil(platformFeeAmount / 100),
  };
}

// 收款模式只看商户配置：三件齐全 = 自有商户；三件全空 = 平台代收；部分填写视为配置错误（null）。
// subsite 缺失时返回 null（无配置可判定）。
export function siteCollectionMode(subsite) {
  if (!subsite) return null;
  const hasPid = Boolean(String(subsite.epayPid || "").trim());
  const hasKey = Boolean(String(subsite.epayKey || "").trim());
  const hasUrl = Boolean(String(subsite.epayApiUrl || "").trim());
  if (!hasPid && !hasKey && !hasUrl) return SITE_COLLECTION_MODES.PLATFORM;
  if (hasPid && hasKey && hasUrl) return SITE_COLLECTION_MODES.AGENT;
  return null;
}

export function siteTenantHost(slug) {
  return `${String(slug || "").toLowerCase()}.face.shuqizhisou.cc`;
}

export function isValidSiteHost(host, slug) {
  return String(host || "").toLowerCase() === siteTenantHost(slug);
}

// 结算申请资格：仅平台代收分站；有待结算金额；没有进行中的申请（一次一笔，打款后才能再申请）。
export function canRequestSettlement({ payMode, pendingAmount, hasPendingRequest }) {
  if (payMode !== SITE_COLLECTION_MODES.PLATFORM) return { ok: false, error: "自有商户模式的货款直达商户，无需申请结算" };
  if (hasPendingRequest) return { ok: false, error: "已有待处理的打款申请，请等待平台处理" };
  const amount = Math.max(0, Math.trunc(Number(pendingAmount) || 0));
  if (amount <= 0) return { ok: false, error: "当前没有可结算的订单" };
  return { ok: true, amount };
}
