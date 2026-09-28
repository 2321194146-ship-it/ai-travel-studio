// 简单的内存滑动窗口速率限制（单实例场景适用；多实例部署请换 Redis）
const buckets = new Map();

/**
 * 从请求中提取客户端 IP。
 * 优先用 X-Real-IP（由本站 Nginx 直接写入 $remote_addr，客户端无法伪造）；
 * 其次取 X-Forwarded-For 的最后一跳（离服务器最近的代理写入）。
 * @param {Request} req
 * @returns {string}
 */
export function getClientIp(req) {
  const real = req.headers.get?.("x-real-ip");
  if (real && real.trim()) return real.trim();
  const xff = req.headers.get?.("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return "unknown";
}

/**
 * 检查并记录一次调用。
 * @param {string} key 限流键（如 userId / IP）
 * @param {number} limit 窗口内最大次数
 * @param {number} windowMs 窗口时长（毫秒）
 * @returns {{ allowed: boolean, remaining: number, retryAfter?: number }}
 */
export function checkRateLimit(key, limit = 10, windowMs = 60_000) {
  const now = Date.now();
  const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };

  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  bucket.count += 1;
  buckets.set(key, bucket);
  return { allowed: true, remaining: limit - bucket.count };
}

// 定期清理过期桶，防止内存无限增长
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }, 60_000).unref?.();
}
