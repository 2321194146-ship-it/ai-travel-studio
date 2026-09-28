import crypto from "node:crypto";

// 对接自建的聚合支付平台（易支付协议）。
// 密钥只从环境变量读取：EPAY_PID / EPAY_KEY / EPAY_API_URL / EPAY_NOTIFY_URL / EPAY_RETURN_URL
function epayConfig() {
  return {
    pid: process.env.EPAY_PID || "",
    key: process.env.EPAY_KEY || "",
    submitUrl: process.env.EPAY_API_URL || "",
    notifyUrl: process.env.EPAY_NOTIFY_URL || "",
    returnUrl: process.env.EPAY_RETURN_URL || "",
  };
}

export function epayEnabled() {
  const c = epayConfig();
  return Boolean(c.pid && c.key && c.submitUrl);
}

// 易支付签名规则：参数名 ASCII 升序，空值与 sign/sign_type 不参与，
// 以 k=v&k=v 拼接后直接拼接商户密钥，MD5 32 位小写。
export function signEpayParams(params, key) {
  const keys = Object.keys(params)
    .filter((k) => k !== "sign" && k !== "sign_type" && params[k] !== "" && params[k] != null)
    .sort();
  const query = keys.map((k) => `${k}=${params[k]}`).join("&");
  return crypto.createHash("md5").update(query + key, "utf8").digest("hex");
}

// overrides：分站代收时用代理自己的商户配置覆盖默认 env（不传则行为不变）
export function buildSubmitUrl({ orderNo, name, moneyYuan, type = "alipay", overrides = {} }) {
  const c = { ...epayConfig(), ...overrides };
  if (!(c.pid && c.key && c.submitUrl)) throw new Error("EPAY_DISABLED");
  const origin = new URL(c.submitUrl).origin;
  const params = {
    pid: c.pid,
    type,
    out_trade_no: orderNo,
    notify_url: c.notifyUrl,
    return_url: c.returnUrl,
    name: String(name).slice(0, 120),
    money: Number(moneyYuan).toFixed(2),
    sitename: "型男制造机",
  };
  const sign = signEpayParams(params, c.key);
  const qs = new URLSearchParams({ ...params, sign, sign_type: "MD5" }).toString();
  return `${origin}/submit.php?${qs}`;
}

// 验证网关回调（GET query）。验签通过返回参数对象，否则返回 null。
// keyOverride：分站订单用代理自己的密钥验签，不传时用平台 env 密钥。
export function verifyNotifyParams(searchParams, keyOverride) {
  const key = keyOverride || epayConfig().key;
  if (!key) return null;
  const params = {};
  for (const [k, v] of searchParams.entries()) params[k] = v;
  const sign = String(params.sign || "").toLowerCase();
  if (!sign) return null;
  if (signEpayParams(params, key) !== sign) return null;
  return params;
}
