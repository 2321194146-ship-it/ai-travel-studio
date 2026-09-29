// 服务端配置。此文件包含敏感 API 密钥，绝不能导入客户端组件。
// 客户端请使用 lib/config.public.js 或 /api/config/public 接口。

// 运行时守卫：阻止在客户端 bundle 中意外使用
if (typeof window !== "undefined") {
  throw new Error(
    "server-only config imported on the client. Use lib/config.public.js instead.",
  );
}

const config = {
  appName: "型男制造机",
  appDesc: "AI男性形象改造工具 - 上传照片，AI诊断形象，一键生成高质感展示面",
  auth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
    secret: process.env.NEXTAUTH_SECRET,
    url: process.env.NEXTAUTH_URL || "http://localhost:3000",
    webhook_url:
      process.env.WEBHOOK_URL ||
      process.env.NEXTAUTH_URL ||
      "http://localhost:3000",
  },
  stripe: {
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    currency: "cny",
    plans: {
      trial: { id: "trial", name: "体验卡", credits: 8, price: 990, modelTier: "standard", expiresDays: 30 },
      high: { id: "high", name: "高清生成卡", credits: 36, price: 3990, modelTier: "high", expiresDays: 30 },
      flagship: { id: "flagship", name: "旗舰精修卡", credits: 90, price: 9900, modelTier: "flagship", expiresDays: 60 },
      refill: { id: "refill", name: "次数补充包", credits: 15, price: 1990, modelTier: null, expiresDays: 0 },
    },
  },
  ai: {
    // 三家适配器保留；默认路由只走火山方舟豆包，可通过 AI_*_PROVIDER 配置切换。
    providers: {
      qwen: {
        apiKey: process.env.QWEN_API_KEY,
        baseUrl: (
          process.env.QWEN_BASE_URL ||
          "https://dashscope.aliyuncs.com/compatible-mode/v1"
        ).replace(/\/+$/, ""),
        visionModel: process.env.QWEN_VISION_MODEL || "qwen3.5-omni-plus",
        imageModel: process.env.QWEN_IMAGE_MODEL || "qwen-image-3.0",
      },
      ark: {
        apiKey: process.env.ARK_API_KEY,
        baseUrl: (
          process.env.ARK_BASE_URL ||
          "https://ark.cn-beijing.volces.com/api/v3"
        ).replace(/\/+$/, ""),
        // API Key 可直接调用已开通的公开 Model ID，也支持自定义 Endpoint ID。
        // 兼容已有单模型配置；可分别指定 Seedream Flash / Pro 模型或接入点。
        imageModel: process.env.ARK_IMAGE_MODEL || "",
        flashImageModel: process.env.ARK_IMAGE_MODEL_FLASH || "",
        proImageModel: process.env.ARK_IMAGE_MODEL_PRO || "",
        visionModel: process.env.ARK_VISION_MODEL || "",
      },
      // GPT-Image adapter 保留，默认不调用。
      gptimage: {
        apiKey: process.env.GPTIMAGE_API_KEY,
        baseUrl: (process.env.GPTIMAGE_BASE_URL || "http://127.0.0.1:8317/v1").replace(/\/+$/, ""),
        imageModel: process.env.GPTIMAGE_MODEL || "gpt-image-2",
      },
    },
    // 默认只调用豆包。其他供应商 adapter 保留，可用环境变量切换；fallback 默认关闭。
    tiers: {
      // 普通档优先使用单独配置的 Seedream Flash 接入点；未配置时兼容旧豆包接入点。
      standard: {
        provider: process.env.AI_STANDARD_IMAGE_PROVIDER || "ark",
        model: process.env.AI_STANDARD_IMAGE_MODEL || "",
        fallbackProvider: process.env.AI_STANDARD_IMAGE_FALLBACK_PROVIDER || null,
        fallbackModel: process.env.AI_STANDARD_IMAGE_FALLBACK_MODEL || "",
        cost: { "1k": 2, "2k": 3, "4k": 4 },
      },
      // 高清和旗舰档使用 Seedream Pro；未配置独立接入点时兼容旧豆包接入点。
      high: {
        provider: process.env.AI_HIGH_IMAGE_PROVIDER || "ark",
        model: process.env.AI_HIGH_IMAGE_MODEL || "",
        fallbackProvider: process.env.AI_HIGH_IMAGE_FALLBACK_PROVIDER || null,
        fallbackModel: process.env.AI_HIGH_IMAGE_FALLBACK_MODEL || "",
        cost: { "1k": 4, "2k": 6, "4k": 8 },
      },
      flagship: {
        provider: process.env.AI_FLAGSHIP_IMAGE_PROVIDER || "ark",
        model: process.env.AI_FLAGSHIP_IMAGE_MODEL || "",
        fallbackProvider: process.env.AI_FLAGSHIP_IMAGE_FALLBACK_PROVIDER || null,
        fallbackModel: process.env.AI_FLAGSHIP_IMAGE_FALLBACK_MODEL || "",
        cost: { "1k": 6, "2k": 9, "4k": 12 },
      },
    },
    // 发型、穿搭和局部编辑默认使用豆包 Pro；跨供应商 fallback 默认关闭。
    edit: {
      provider: process.env.AI_EDIT_IMAGE_PROVIDER || "ark",
      model: process.env.AI_EDIT_IMAGE_MODEL || "",
      fallbackProvider: process.env.AI_EDIT_IMAGE_FALLBACK_PROVIDER || null,
      fallbackModel: process.env.AI_EDIT_IMAGE_FALLBACK_MODEL || "",
    },
    // 诊断草稿与复核固定使用同一个可配置供应商；默认为豆包，不自动跨供应商。
    visionProvider: process.env.AI_VISION_PROVIDER || "ark",
  },
};

export default config;
