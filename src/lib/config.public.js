// 公开配置：可安全地用于客户端组件。
// 任何敏感信息（API 密钥、Stripe Secret 等）严禁加入此文件，请保留在 lib/config.js 中仅供服务端使用。
const publicConfig = {
  appName: "型男制造机",
  appDesc: "AI男性形象改造工具 - 上传照片，AI诊断形象，一键生成高质感展示面",
  theme: "slate-indigo",
};

export default publicConfig;
