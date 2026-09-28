export function tryOnButtonLabel(mode, isLoggedIn) {
  if (mode === "outfit") return isLoggedIn ? "生成穿搭效果 · 消耗6次" : "生成穿搭效果";
  return isLoggedIn ? "生成发型效果 · 消耗2次" : "生成发型效果";
}

export function tryOnFailureMessage(status) {
  if (status === 402) return "生成次数不足，请先获取生成次数";
  return "试穿失败，本次未扣除生成次数，请稍后重试";
}

export function tryOnLoginUrl(mode) {
  const safeMode = mode === "outfit" ? "outfit" : "hair";
  const callbackUrl = `/?resume=tryon&mode=${safeMode}`;
  return `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}
