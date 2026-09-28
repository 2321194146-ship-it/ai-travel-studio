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
export function siteCollectionMode(subsite) {
  const hasPid = Boolean(String(subsite?.epayPid || "").trim());
  const hasKey = Boolean(String(subsite?.epayKey || "").trim());
  const hasUrl = Boolean(String(subsite?.epayApiUrl || "").trim());
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
