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
    // 供应商：阿里云百炼千问（OpenAI 兼容）+ 火山方舟豆包
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
        // 注意：方舟模型必须填控制台创建的「推理接入点 Endpoint ID」，不是模型名称。
        imageModel: process.env.ARK_IMAGE_MODEL || "",
        visionModel: process.env.ARK_VISION_MODEL || "",
      },
      // GPT-Image：本机 CLIProxyAPI（systemd: cliproxy-api，经 mihomo 美国节点出海）
      // 仅展示面生图链路使用；发型/穿搭仍走 qwen/ark。
      gptimage: {
        apiKey: process.env.GPTIMAGE_API_KEY,
        baseUrl: (process.env.GPTIMAGE_BASE_URL || "http://127.0.0.1:8317/v1").replace(/\/+$/, ""),
        imageModel: process.env.GPTIMAGE_MODEL || "gpt-image-2",
      },
    },
    // 档位 → 主供应商/备用供应商（自动切换）
    tiers: {
      // 标准档 → 豆包（千问生图模型当前无权限 403，留作回退）；高清档 → 豆包；旗舰档 → GPT-Image（订阅额度，效果最好）
      // GPT-Image 走本机 CLIProxyAPI 8317（经 mihomo 美国节点出海）
      standard: {
        provider: "ark",
        model: process.env.ARK_IMAGE_MODEL || "",
        // 当前 Qwen 图像模型返回 AccessDenied.Unpurchased，不作为生图回退。
        fallbackProvider: null,
        fallbackModel: "",
        cost: { "1k": 2, "2k": 3, "4k": 4 },
      },
      high: {
        provider: "ark",
        model: process.env.ARK_IMAGE_MODEL || "",
        // 当前 Qwen 图像模型返回 AccessDenied.Unpurchased，不作为生图回退。
        fallbackProvider: null,
        fallbackModel: "",
        cost: { "1k": 4, "2k": 6, "4k": 8 },
      },
      flagship: {
        provider: "gptimage",
        model: process.env.GPTIMAGE_MODEL || "gpt-image-2",
        fallbackProvider: "ark",
        fallbackModel: process.env.ARK_IMAGE_MODEL || "",
        cost: { "1k": 6, "2k": 9, "4k": 12 },
      },
    },
    // 换发型 / 换衣服 / 局部细节编辑 → 旗舰 SeedEdit；当前 Qwen 图像权限未开通，不作为回退。
    edit: {
      provider: "ark",
      model: process.env.ARK_IMAGE_MODEL || "",
      fallbackProvider: null,
      fallbackModel: "",
    },
  },
};

export default config;
