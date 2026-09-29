"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { signOut } from "next-auth/react";
import { hasPhotoInput, resolvePhotoInputs } from "@/lib/photo-inputs.mjs";
import {
  BACKGROUND_OPTIONS,
  OUTFIT_OPTIONS,
  actionNameById,
  buildDisplayPrompt,
  buildImagePlan,
  compatibleActions,
  optionLabel,
  summarizeDraft,
} from "@/lib/display-compose.mjs";

const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
import {
  FaArrowLeft,
  FaArrowRight,
  FaBars,
  FaCheck,
  FaChevronRight,
  FaCloudUploadAlt,
  FaCut,
  FaDownload,
  FaHeart,
  FaHistory,
  FaHome,
  FaImage,
  FaLightbulb,
  FaLock,
  FaMagic,
  FaPlus,
  FaRegBell,
  FaRegCommentDots,
  FaRegBookmark,
  FaRegHeart,
  FaRegUser,
  FaSearch,
  FaShareAlt,
  FaSignal,
  FaTshirt,
  FaTicketAlt,
  FaSyncAlt,
  FaUser,
  FaUsers,
  FaWifi,
  FaBatteryFull,
  FaExclamationTriangle,
} from "react-icons/fa";
import { buildReportInsights } from "@/lib/makeover-report.mjs";
import {
  tryOnButtonLabel,
  tryOnFailureMessage,
  tryOnLoginUrl,
} from "@/lib/try-on-access.mjs";
import { membershipCopy, profileToolNames } from "@/lib/profile-copy.mjs";
import PurchasePromptModal from "@/components/PurchasePromptModal";
import DiagnosisReport from "@/components/DiagnosisReport";
import { SERVICE_CATALOG } from "@/lib/service-catalog";
import { REPORT_OUTFIT_CATALOG } from "@/lib/makeover-catalog.mjs";
// 场景文字描述已由模板图片接管（display-compose），此处不再引用 scenePrompt

const images = {
  lead: "/mf-assets/book-man.png",
  leadAlt: "/mf-assets/cafe-man.png",
  style: "/mf-assets/market-man.png",
  compare: "/mf-assets/studio-before-after.png",
  river: "/mf-assets/cafe-man.png",
  market: "/mf-assets/market-man.png",
  cafe: "/mf-assets/cafe-man.png",
  night: "/mf-assets/night-man.png",
  book: "/mf-assets/book-man.png",
  store: "/mf-assets/night-man.png",
};

const scenes = [
  { id: "shop", name: "店内随拍", tag: "场景", image: "/mf-assets/inspiration-reference/IMG_4989.jpg" },
  { id: "car", name: "车内抓拍", tag: "姿势", image: "/mf-assets/inspiration-reference/IMG_4990.jpg" },
  { id: "cafe", name: "咖啡店", tag: "场景", image: "/mf-assets/inspiration-reference/IMG_4991.jpg" },
  { id: "airport", name: "机场候机", tag: "场景", image: "/mf-assets/inspiration-reference/IMG_4992.jpg" },
  { id: "outdoor-cafe", name: "户外咖啡", tag: "场景", image: "/mf-assets/inspiration-reference/IMG_4993.jpg" },
  { id: "casual-seat", name: "室内坐姿", tag: "姿势", image: "/mf-assets/inspiration-reference/IMG_4994.jpg" },
  { id: "street-seat", name: "街边坐姿", tag: "姿势", image: "/mf-assets/inspiration-reference/IMG_4995.jpg" },
  { id: "market", name: "超市随拍", tag: "场景", image: "/mf-assets/inspiration-reference/IMG_4996.jpg" },
  { id: "subway", name: "地铁通勤", tag: "穿搭", image: "/mf-assets/inspiration-reference/IMG_4997.jpg" },
  { id: "dark-cafe", name: "暗调咖啡", tag: "穿搭", image: "/mf-assets/inspiration-reference/IMG_4998.jpg" },
  { id: "city-walk", name: "城市散步", tag: "场景", image: "/mf-assets/inspiration-reference/IMG_4999.jpg" },
  { id: "balcony", name: "窗边休闲", tag: "姿势", image: "/mf-assets/inspiration-reference/IMG_5001.jpg" },
  { id: "selfie", name: "自然自拍", tag: "姿势", image: "/mf-assets/inspiration-reference/IMG_5002.jpg" },
  { id: "outdoor-seat", name: "户外休闲", tag: "场景", image: "/mf-assets/inspiration-reference/IMG_5003.jpg" },
  { id: "restaurant", name: "餐厅坐姿", tag: "穿搭", image: "/mf-assets/inspiration-reference/IMG_5004.jpg" },
  { id: "dining", name: "餐桌随拍", tag: "场景", image: "/mf-assets/inspiration-reference/IMG_5005.jpg" },
  { id: "beach", name: "海边休闲", tag: "场景", image: "/mf-assets/inspiration-reference/IMG_5006.jpg" },
  { id: "window-cafe", name: "窗边咖啡", tag: "姿势", image: "/mf-assets/inspiration-reference/IMG_5008.jpg" },
  { id: "bedroom", name: "卧室松弛感", tag: "场景", image: "/mf-assets/inspiration-reference/IMG_5009.jpg" },
  { id: "night-home", name: "室内夜景", tag: "场景", image: "/mf-assets/inspiration-reference/IMG_5010.jpg" },
  { id: "mirror", name: "镜前穿搭", tag: "穿搭", image: "/mf-assets/inspiration-reference/IMG_5011.jpg" },
];

const makeoverServices = [
  { icon: FaSignal, title: "AI 形象诊断", text: "脸型 · 气质 · 上镜度" },
  { icon: FaCut, title: "发型建议", text: "最多 5 款适配发型" },
  { icon: FaTshirt, title: "穿搭方案", text: "最多 5 套适合你的方向" },
  { icon: FaMagic, title: "生成展示面", text: "穿搭试穿需补全身照" },
];

const DIAG_ESTIMATE_COPY = "生成时间会随照片和服务响应而变化。";
const DIAG_QUOTA_COPY = "新用户累计免费 3 次；会员有效期内每天免费 3 次。免费次数用完后，访客需登录继续；已登录用户每次扣 1 次生成额度，失败自动退还。";

function formatWaitDuration(seconds = 0) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = String(total % 60).padStart(2, "0");
  return minutes ? `${minutes}:${remainder}` : `0:${remainder}`;
}

const reportDeliverables = [
  ["01", "面部轮廓定位", "找到优先改造点"],
  ["02", "风格气质定位", "明确适合你的路线"],
  ["03", "发型方向建议", "每个推荐都有理由"],
  ["04", "穿搭方向建议", "版型、颜色与避雷"],
  ["05", "真人试穿入口", "选定方案后生成"],
  ["06", "拍照执行清单", "角度、光线和姿势"],
];

const hairInspirations = [
  ["微分碎盖", "5015-1"], ["龙须背头", "5015-2"], ["三七侧背", "5015-3"],
  ["括号刘海", "5015-4"], ["美式前刺", "5015-5"], ["短碎发", "5015-6"],
  ["中分", "5015-7"], ["逗号刘海", "5015-8"], ["二八侧分", "5015-9"],
  ["自然纹理", "5016-1"], ["港风背头", "5016-2"], ["短发微分", "5016-3"],
  ["中分纹理", "5016-4"], ["三七纹理", "5016-5"], ["摩根前刺", "5016-6"],
  ["微分碎盖", "5016-7"], ["二八侧背", "5016-8"], ["长发狼尾", "5016-9"],
  ["羊毛卷", "5017-1"], ["锡纸烫", "5017-2"], ["韩式烫", "5017-3"],
  ["烟花烫", "5017-4"], ["法式烫", "5017-5"], ["钢夹前刺", "5017-6"],
  ["钢夹烫", "5017-7"], ["莱斯利卷", "5017-8"], ["造型烫", "5017-9"],
  ["蝴蝶烫", "5017-10"], ["束状纹理", "5017-11"], ["摩根烫", "5017-12"],
  ["碎盖前刺", "5018-1"], ["摩根前刺", "5018-2"], ["中式前刺", "5018-3"],
  ["韩式前刺", "5018-4"], ["美式前刺", "5018-5"], ["侧背前刺", "5018-6"],
  ["立体前刺", "5018-7"], ["上扬前刺", "5018-8"], ["纹理前刺", "5018-9"],
  ["钢夹前刺", "5018-10"], ["中分前刺", "5018-11"], ["凌乱前刺", "5018-12"],
  ["气垫烫", "5019-1"], ["纹理烫", "5019-2"], ["钢夹烫", "5019-3"],
  ["羊毛卷", "5019-4"], ["蝴蝶烫", "5019-5"], ["锡纸烫", "5019-6"],
  ["漫画烫", "5019-7"], ["法式烫", "5019-8"], ["摩根碎盖", "5019-9"],
  ["韩式烫", "5019-10"], ["莱斯利卷", "5019-11"], ["束状纹理", "5019-12"],
  ["长发纹理", "5020-1"], ["蝴蝶烫", "5020-2"], ["微分碎盖", "5020-3"],
  ["束状纹理", "5020-4"], ["羊毛卷", "5020-5"], ["漫画烫", "5020-6"],
  ["纹理烫", "5020-7"], ["凌乱背头", "5020-8"], ["自然纹理", "5020-9"],
  ["懒惰卷", "5020-10"], ["钢夹前刺", "5020-11"], ["纹理三七", "5020-12"],
  ["美式前刺", "5020-13"], ["日系纹理", "5020-14"], ["气垫烫", "5020-15"], ["摩根烫", "5020-16"],
].map(([name, file], index) => ({
  id: `hair-${file}`,
  name,
  tag: "发型",
  image: `/mf-assets/inspiration-reference/hairstyles/${file}.jpg`,
  index,
}));

const outfitInspirations = [
  "IMG_5022.JPG", "IMG_5023.JPG", "IMG_5024.JPG", "IMG_5025.JPG", "IMG_5026.JPG", "IMG_5027.JPG", "IMG_5028.JPG", "IMG_5029.JPG",
  "IMG_5031.JPG", "IMG_5032.JPG", "IMG_5033.JPG", "IMG_5034.JPG", "IMG_5035.JPG", "IMG_5036.JPG", "IMG_5037.JPG", "IMG_5038.JPG",
  "IMG_5040.JPG", "IMG_5040-2.JPG", "IMG_5041.JPG", "IMG_5041-2.JPG", "IMG_5043.JPG", "IMG_5043-2.JPG", "IMG_5047.JPG", "IMG_5048.JPG", "IMG_5049.JPG",
  "IMG_5051.JPG", "IMG_5052.JPG", "IMG_5053.JPG", "IMG_5054.JPG", "IMG_5055.JPG", "IMG_5056.JPG", "IMG_5058.JPG", "IMG_5059.JPG", "IMG_5060.JPG", "IMG_5061.JPG",
  "IMG_5062.JPG", "IMG_5063.JPG", "IMG_5064.JPG", "IMG_5065.JPG", "IMG_5067.JPG", "IMG_5068.JPG", "IMG_5069.JPG", "IMG_5070.JPG", "IMG_5071.JPG", "IMG_5072.JPG",
  "IMG_5073.JPG", "IMG_5074.JPG", "IMG_5075.JPG", "IMG_5076.JPG", "IMG_5077.JPG", "IMG_5078.JPG", "IMG_5080.JPG", "IMG_5081.JPG", "IMG_5082.JPG", "IMG_5083.JPG",
  "IMG_5084.JPG", "IMG_5085.JPG", "IMG_5086.JPG", "IMG_5087.JPG", "IMG_5088.JPG", "IMG_5089.JPG", "IMG_5090.JPG", "IMG_5091.JPG", "IMG_5092.JPG", "IMG_5094.JPG",
  "IMG_5095.JPG", "IMG_5096.JPG", "IMG_5097.JPG", "IMG_5098.JPG", "IMG_5099.JPG",
].filter((file) => !["IMG_5040-2.JPG", "IMG_5041-2.JPG", "IMG_5043.JPG"].includes(file)).map((file, index) => ({
  id: `outfit-${index + 1}`,
  name: REPORT_OUTFIT_CATALOG.find((item) => item.id === `outfit-${index + 1}`)?.name || `穿搭参考 ${String(index + 1).padStart(2, "0")}`,
  tag: "穿搭",
  image: `/mf-assets/inspiration-reference/outfits/${file}`,
  ...(REPORT_OUTFIT_CATALOG.find((item) => item.id === `outfit-${index + 1}`) || {}),
}));

const poseInspirations = [
  "IMG_5100.JPG", "IMG_5101.JPG", "IMG_5102.JPG", "IMG_5103.JPG", "IMG_5104.JPG", "IMG_5105.JPG", "IMG_5106.JPG", "IMG_5107.JPG", "IMG_5108.JPG",
  "IMG_5111.JPG", "IMG_5112.JPG", "IMG_5113.JPG", "IMG_5114.JPG", "IMG_5115.JPG", "IMG_5116.JPG", "IMG_5117.JPG", "IMG_5118.JPG", "IMG_5119.JPG",
  "IMG_5121.JPG", "IMG_5122.JPG", "IMG_5123.JPG", "IMG_5124.JPG", "IMG_5125.JPG", "IMG_5126.JPG", "IMG_5127.JPG", "IMG_5128.JPG", "IMG_5129.JPG",
  "IMG_5130.JPG", "IMG_5131.JPG", "IMG_5132.JPG", "IMG_5133.JPG", "IMG_5134.JPG", "IMG_5135.JPG", "IMG_5136.JPG", "IMG_5137.JPG", "IMG_5138.JPG",
  "IMG_5139.JPG", "IMG_5141-1.JPG", "IMG_5141-2.JPG", "IMG_5141-3.JPG", "IMG_5141-4.JPG", "IMG_5142-1.JPG", "IMG_5142-2.JPG", "IMG_5142-3.JPG", "IMG_5142-4.JPG",
  "IMG_5143-1.JPG", "IMG_5143-2.JPG", "IMG_5143-3.JPG", "IMG_5143-4.JPG", "IMG_5144-1.JPG", "IMG_5144-2.JPG", "IMG_5144-3.JPG", "IMG_5144-4.JPG",
].map((file, index) => ({
  id: `pose-${index + 1}`,
  name: `姿势灵感 ${String(index + 1).padStart(2, "0")}`,
  tag: "姿势",
  source: "pose",
  image: `/mf-assets/inspiration-reference/poses/${file}`,
})).filter((_, index) => index !== 27);

const results = [
  images.river,
  images.market,
  images.cafe,
  images.night,
  images.book,
  images.leadAlt,
];

function recommendationName(item, fallback) {
  if (typeof item === "string") return item;
  const name = item?.name || item?.title || item?.style || item?.label || fallback;
  return name.replace(/侧背短[cC]/g, "侧背短发");
}

function normalizeRecommendationName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function scoreReason(report, key, fallback) {
  const aliases = {
    face: ["face", "score"],
    aura: ["aura", "auraScore"],
    camera: ["camera", "cameraScore"],
  };
  const value = (aliases[key] || [key])
    .map((alias) => report?.scoreReasons?.[alias])
    .find((item) => item !== undefined && item !== null);
  if (typeof value === "string" && value.trim()) {
    return { basis: value.trim(), opportunity: "" };
  }
  if (value && typeof value === "object") {
    const basis = [value.basis, value.reason, fallback].find(
      (item) => typeof item === "string" && item.trim(),
    );
    const opportunity = typeof value.opportunity === "string" ? value.opportunity : "";
    return {
      basis,
      opportunity,
    };
  }
  return { basis: fallback, opportunity: "" };
}

const REPORT_HAIR_IMAGE_PREFERENCES = {
  "微分碎盖": "hair-5016-7",
  "韩式烫": "hair-5019-10",
};

function resolveInspiration(items, item, index, preferredImageIds = {}) {
  const requestedName = recommendationName(item, "");
  const requested = normalizeRecommendationName(requestedName);
  const catalogId = item && typeof item === "object" ? item.catalogId || item.id : "";
  const preferredImage = !catalogId && preferredImageIds[requestedName]
    ? items.find((entry) => entry.id === preferredImageIds[requestedName])
    : null;
  const matched = (catalogId ? items.find((entry) => entry.id === catalogId) : null)
    || preferredImage
    || (requested ? items.find((entry) => normalizeRecommendationName(entry.name) === requested) : null);
  const fallback = matched || null;
  return {
    ...(item && typeof item === "object" ? item : {}),
    id: fallback?.id || catalogId || `unmatched-${index}-${requested || "style"}`,
    name: fallback?.name || requestedName || "未命名建议",
    image: fallback?.image || "",
    palette: item?.palette || fallback?.palette || "",
    items: item?.items || fallback?.items || "",
    scene: item?.scene || fallback?.scene || "",
    catalogMatch: Boolean(fallback),
  };
}

// 主站可见套餐过滤：tenantOnly（分站专属）与 agentOnly（代理专属）套餐不在主站 UI 展示。
// page.js 不渲染主站套餐列表（在 /pricing），此 helper 供分站中心的充值包渲染兜底。
function isPublicPlan(plan) {
  return Boolean(plan) && !plan.tenantOnly && !plan.agentOnly;
}

// 代理充值包（agentOnly）：只在分站中心展示，走平台主收款（后端另校验购买者必须是站长）
const AGENT_PACKS = [
  { planId: "agent_pack_200", title: "充值 200 积分", price: "¥200", agentOnly: true },
  { planId: "agent_pack_500", title: "充值 500 积分", price: "¥500", agentOnly: true },
];

export default function StudioPage() {
  const hydrated = useSyncExternalStore(subscribeToHydration, clientReady, serverReady);
  const [screen, setScreen] = useState("home");
  const [makeoverStep, setMakeoverStep] = useState(1);
  const [makeoverPhotos, setMakeoverPhotos] = useState([null, null, null]);
  const [diagnosis, setDiagnosis] = useState(null);
  const [tryOnMode, setTryOnMode] = useState("hair");
  const [selectedHair, setSelectedHair] = useState(0);
  const [selectedOutfit, setSelectedOutfit] = useState(0);
  const [tryOnResult, setTryOnResult] = useState("");
  const [displayDraft, setDisplayDraft] = useState(null);
  const [displayPreview, setDisplayPreview] = useState(false);
  const [generationId, setGenerationId] = useState(null);
  const [resultImages, setResultImages] = useState([]);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [busyKind, setBusyKind] = useState("");
  const [busyElapsedSeconds, setBusyElapsedSeconds] = useState(0);
  const [makeoverPreview, setMakeoverPreview] = useState(false);
  const [displayScene, setDisplayScene] = useState(0);
  const [sessionUser, setSessionUser] = useState(null);
  const [purchasePromptOpen, setPurchasePromptOpen] = useState(false);
  const [profilePhotos, setProfilePhotos] = useState([]);
  const [pendingFeature, setPendingFeature] = useState("");
  const [battleData, setBattleData] = useState(null);
  const [battleLoading, setBattleLoading] = useState(false);
  const [inviteData, setInviteData] = useState(null);
  const [creationRecords, setCreationRecords] = useState([]);
  const [tenantName, setTenantName] = useState("");
  const [tenantStatus, setTenantStatus] = useState("");
  const [tenantUnavailable, setTenantUnavailable] = useState(false);
  const [subsiteCenter, setSubsiteCenter] = useState(null);
  const scrollRef = useRef(null);
  const noticeTimerRef = useRef(null);
  const busyStartedAtRef = useRef(0);

  useEffect(() => {
    if (!busy || !busyStartedAtRef.current) return;
    const timer = window.setInterval(() => {
      const startedAt = busyStartedAtRef.current;
      if (startedAt) setBusyElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  function startWork(kind) {
    busyStartedAtRef.current = Date.now();
    setBusyElapsedSeconds(0);
    setBusyKind(kind);
    setBusy(true);
  }

  function finishWork() {
    busyStartedAtRef.current = 0;
    setBusyElapsedSeconds(0);
    setBusyKind("");
    setBusy(false);
  }

const previewPhotos = [
    { preview: "/mf-assets/home-ref-avatar-centered.png" },
    { preview: images.leadAlt },
    { preview: images.style },
  ];
  const previewDiagnosis = {
    faceShape: "偏椭圆脸",
    faceBalance: "五官比例协调",
    jawline: "下颌线清晰",
    score: 68,
    aura: "清爽自然",
    auraScore: 62,
    camera: "上镜稳定",
    cameraScore: 58,
    suggestion: "示例报告用于预览页面结构，不代表任何真实用户的诊断结论。",
    focus: "示例内容：从正面照检查发型轮廓、肩线和光线呈现。",
    goal: "示例目标：让发型、服装和拍摄状态更统一。",
    hairReason: "示例内容：根据照片中可见的脸部比例与发型轮廓选择发型。",
    outfitAdvice: "示例内容：从肩线清晰、颜色克制的搭配开始。",
    avoid: "示例内容：照片无法确认全身比例和衣物实际版型。",
    inputQuality: "这是演示预览，不是个人照片分析。",
    confidence: 88,
    review: { status: "approved", confidence: 88, provider: "示例" },
    styles: [{ name: "清爽·都市·利落", reason: "演示用风格方向", keywords: ["清爽", "都市", "利落"] }],
    scoreReasons: {
      face: { basis: "演示依据：面部轮廓清晰可见，整体比例接近均衡。", strength: "演示优势：正面照清楚，五官边界容易观察。", opportunity: "演示提升项：可通过发型顶部层次增加立体感。" },
      aura: { basis: "演示依据：表情、光线和服装风格整体协调。", strength: "演示优势：画面干净，状态自然。", opportunity: "演示提升项：统一服装配色并强化肩线。" },
      camera: { basis: "演示依据：主体清楚，镜头角度基本平视。", strength: "演示优势：脸部没有明显遮挡。", opportunity: "演示提升项：靠近柔和窗光拍摄，背景保持简洁。" },
    },
    actionPlan: ["示例：先选择一款适合当前轮廓的发型。", "示例：尝试低饱和配色和清晰肩线。", "示例：用柔和正面光线重新拍一张。"],
    hairstyles: [
      { name: "自然纹理", why: "示例推荐：顶部增加自然纹理，减轻发型贴头的感觉。", execution: "顶部保留约 4—6 厘米，两侧做自然渐层，避免推得过高。", maintenance: "吹干后用少量发泥抓出纹理，定型喷雾轻喷即可。", demoImage: "/mf-assets/report-demo/hair-textured-crop.jpg" },
      { name: "短碎发", why: "示例推荐：短碎层次能让轮廓更清楚，日常也好打理。", execution: "顶部做轻层次，两侧收净但保留自然过渡。", maintenance: "洗后吹干，用少量哑光发泥整理发束。", demoImage: "/mf-assets/report-demo/hair-short-frenchcrop.jpg" },
      { name: "三七侧背", why: "示例推荐：侧分能增加成熟感，同时保持面部露出。", execution: "按自然分缝做三七分，顶部保留松度，两侧不要贴头皮。", maintenance: "吹风时先固定分缝，再用轻质发蜡定型。", demoImage: "/mf-assets/report-demo/hair-natural-sidepart.jpg" },
    ],
    outfits: REPORT_OUTFIT_CATALOG.slice(0, 3).map((item, index) => ({
      ...item,
      why: "示例搭配：用清晰肩线和低饱和配色营造利落、日常都能穿的感觉。",
      scene: item.scene,
      palette: index === 0 ? "米白、深蓝、炭灰" : "橄榄、棕",
      demoImage: index === 0 ? "/mf-assets/report-demo/outfit-city-navy.jpg" : "/mf-assets/report-demo/outfit-cafe-olive.jpg",
    })),
  };

  // 比帅/邀请 URL 参数：?ref=邀请码（登记，注册时自动带上）；?battle=战书ID（打开展开落地）
  useEffect(() => {
    const controller = new AbortController();
    const frame = window.requestAnimationFrame(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get("ref");
      if (ref && /^[A-Z0-9]{6,10}$/i.test(ref)) window.localStorage.setItem("mf_ref", ref.toUpperCase());
      const battleId = params.get("battle");
      if (battleId && !window.sessionStorage.getItem("mf_battle_opened_" + battleId)) {
        window.sessionStorage.setItem("mf_battle_opened_" + battleId, "1");
        setScreen("battle");
        setBattleLoading(true);
        fetch(`/api/battle/${encodeURIComponent(battleId)}`, { signal: controller.signal })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error("not found"))))
          .then((payload) => setBattleData(payload.data))
          .catch(() => { if (!controller.signal.aborted) setBattleData(null); })
          .finally(() => { if (!controller.signal.aborted) setBattleLoading(false); });
      }
    } catch {}
    });
    return () => { window.cancelAnimationFrame(frame); controller.abort(); };
  }, []);

  // 分站识别：泛域名反代注入 x-tenant-slug（nginx），页面注入 window.__TENANT_NAME__；
  // 两者都没有时拉 /api/subsite/info 兜底，主站请求返回空，行为不变。
  // 停用的分站会拿到 status=SUSPENDED，页面顶部显示暂停营业提示。
  useEffect(() => {
    let cancelled = false;
    fetch("/api/subsite/info")
      .then(async (response) => {
        if (response.status === 404) return { invalid: true };
        return response.ok ? response.json() : null;
      })
      .then((payload) => {
        if (cancelled) return;
        if (payload?.invalid) {
          setTenantUnavailable(true);
          return;
        }
        const site = payload?.data;
        if (!site) return;
        if (typeof site.siteName === "string" && site.siteName.trim()) setTenantName(site.siteName.trim());
        if (typeof site.status === "string") setTenantStatus(site.status);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // 分站中心数据：200 = 登录用户是站长；404 = 普通用户（隐藏入口）
  useEffect(() => {
    if (!sessionUser) return;
    let cancelled = false;
    fetch("/api/subsite/center")
      .then(async (response) => {
        if (!response.ok) return null;
        const payload = await response.json();
        const inner = payload?.data || payload;
        return inner?.subsite ? inner : null;
      })
      .then((data) => {
        if (!cancelled) setSubsiteCenter(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionUser]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session")
      .then((response) => (response.ok ? response.json() : null))
      .then(async (session) => {
        if (cancelled) return;
        if (session?.user) setSessionUser(session.user);
        if (session?.user) await fetch("/api/photos/merge", { method: "POST" }).catch(() => {});
        const photosResponse = await fetch("/api/photos");
        if (photosResponse.ok) {
          const photos = await photosResponse.json();
          if (!cancelled && Array.isArray(photos)) setProfilePhotos(photos);
          const params = new URLSearchParams(window.location.search);
          if (
            !cancelled &&
            session?.user &&
            Array.isArray(photos) &&
            params.get("resume") === "tryon"
          ) {
            const labels = ["正面照", "侧脸照", "半身照"];
            const unclassified = photos.filter(
              (item) => ![...labels, "全身照"].includes(item.label),
            );
            setMakeoverPhotos((current) =>
              labels.map((label, index) => {
                const photo =
                  photos.find((item) => item.label === label) ||
                  unclassified[index];
                return photo
                  ? {
                      archiveUrl: photo.url,
                      preview: photo.url,
                      label: photo.label,
                    }
                  : current[index] || null;
              }),
            );
            setTryOnMode(params.get("mode") === "outfit" ? "outfit" : "hair");
            setMakeoverStep(3);
            setScreen("makeover");
            window.history.replaceState({}, "", "/");
          }
        }
        if (!session?.user) return;
        if (window.location.pathname !== "/") return;
        let shouldShowPurchasePrompt = false;
        try {
          shouldShowPurchasePrompt = window.sessionStorage.getItem("mf_show_purchase_prompt") === "1";
          if (shouldShowPurchasePrompt) window.sessionStorage.removeItem("mf_show_purchase_prompt");
        } catch {}
        if (shouldShowPurchasePrompt) {
          const ordersResponse = await fetch("/api/orders");
          const orders = ordersResponse.ok ? await ordersResponse.json() : [];
          if (!cancelled && Array.isArray(orders) && !orders.some((order) => order.status === "PAID")) {
            setPurchasePromptOpen(true);
          }
        }
        const diagnosisResponse = await fetch("/api/diagnose");
        if (diagnosisResponse.ok) {
          const diagnosisPayload = await diagnosisResponse.json();
          const latestDiagnosis = Array.isArray(diagnosisPayload?.data)
            ? diagnosisPayload.data[0]
            : null;
          if (!cancelled && latestDiagnosis) {
            setDiagnosis(latestDiagnosis);
          }
        }
        const response = await fetch("/api/creations");
        if (!response.ok) return;
        const records = await response.json();
        if (!cancelled && Array.isArray(records)) setCreationRecords(records);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function openPreview(type, record = null) {
    // 展示面参考卡：有档案直接进工作台，没有先去照片档案
    if (type === "display") {
      if (profilePhotos.length > 0) {
        setDisplayPreview(false);
        go("display");
      } else {
        setPendingFeature("display");
        showNotice("先上传一张照片，上传完成后自动开始");
        go("photos");
      }
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    // 已有可用照片（档案或本次会话上传）时，试穿入口直接走真实模式，不再显示模特示例图
    if (type === "tryon" && (profilePhotos.length > 0 || makeoverPhotos.some(hasPhotoInput))) {
      if (!makeoverPhotos.some(hasPhotoInput)) {
        const labels = ["正面照", "侧脸照", "半身照"];
        const unclassified = profilePhotos.filter((item) => ![...labels, "全身照"].includes(item.label));
        setMakeoverPhotos((current) => labels.map((label, index) => {
          const photo = profilePhotos.find((item) => item.label === label) || unclassified[index];
          return photo ? { archiveUrl: photo.url, preview: photo.url, label: photo.label } : current[index] || null;
        }));
      }
      setMakeoverPreview(false);
      setTryOnResult("");
      setMakeoverStep(3);
      setScreen("makeover");
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const isMakeoverPreview = type !== "result";
    setMakeoverPreview(isMakeoverPreview);
    if (isMakeoverPreview) setTryOnResult(images.leadAlt);
    if (type === "result") {
      const output = Array.isArray(record?.outputImages)
        ? record.outputImages.filter(
            (item) => typeof item === "string" && item.trim(),
          )
        : [];
      setGenerationId(record?.id || null);
      setDisplayDraft({ scene: record?.templateName || "河边散步" });
      setResultImages(output.length ? output : results);
      setScreen("display-result");
    } else {
      setMakeoverStep(type === "tryon" ? 3 : 2);
      setScreen("makeover");
    }
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  useEffect(() => {
    const generation = new URLSearchParams(window.location.search).get(
      "generation",
    );
    if (!generation) return;

    let cancelled = false;
    fetch(`/api/creations?id=${encodeURIComponent(generation)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        return response.json();
      })
      .then((record) => {
        const output = Array.isArray(record.outputImages)
          ? record.outputImages.filter(
              (item) => typeof item === "string" && item.trim(),
            )
          : [];
        if (cancelled || !output.length || record.status !== "completed") {
          if (!cancelled) showNotice("这条生成记录还没有可分享的结果");
          return;
        }
        setGenerationId(record.id);
        setResultImages(output);
        setDisplayDraft({ scene: record.templateName || "生活展示面" });
        setScreen("display-result");
      })
      .catch(() => {
        if (!cancelled) showNotice("分享链接已失效，或你还没有登录");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => {
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
  }, []);

  function showNotice(message, options = {}) {
    // 纯文本兼容旧调用；传 { actionLabel, onAction } 时弹窗带操作按钮（如"去充值"）
    const notice =
      typeof message === "string" && (options.actionLabel || options.onAction)
        ? { text: message, ...options }
        : message;
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    setNotice(notice);
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice("");
      noticeTimerRef.current = null;
    }, 6000);
  }

  async function uploadToServer(file, purpose = "") {
    const form = new FormData();
    form.append("file", file);
    if (purpose) form.append("purpose", purpose);
    const response = await fetch("/api/upload", { method: "POST", body: form });
    if (!response.ok) throw new Error(await response.text());
    const payload = await response.json();
    if (!payload.url) throw new Error("上传没有返回图片地址");
    return payload.url;
  }

  async function archivePhoto(url, label, thumbUrl) {
    const response = await fetch("/api/photos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, label, thumbUrl }),
    });
    if (!response.ok) throw new Error("照片档案保存失败");
    const photo = await response.json();
    setProfilePhotos((current) => [photo, ...current]);
    return photo;
  }

  async function diagnose() {
    const primary = makeoverPhotos[0];
    if (!hasPhotoInput(primary)) {
      showNotice("请先上传正面照，AI 才能开始诊断");
      return;
    }
    startWork("diagnosis");
    try {
      const uploadedPhotos = await resolvePhotoInputs(makeoverPhotos, async (file, index) => {
        const payloadUrl = await (async () => {
          const form = new FormData();
          form.append("file", file);
          form.append("purpose", "profile");
          const response = await fetch("/api/upload", { method: "POST", body: form });
          if (!response.ok) throw new Error(await response.text());
          const payload = await response.json();
          if (!payload.url) throw new Error("上传没有返回图片地址");
          return payload;
        })();
        await archivePhoto(payloadUrl.url, ["正面照", "侧脸照", "半身照"][index] || "未分类", payloadUrl.thumbUrl);
        return payloadUrl.url;
      });
      const imageUrl = uploadedPhotos.find((item) => item.index === 0)?.url;
      const response = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        const message = detail?.error || "诊断失败，本次未扣除次数，请稍后重试";
        if (response.status === 402) {
          if (sessionUser) {
            showNotice(message, {
              actionLabel: "去充值",
              onAction: () => window.location.assign("/pricing"),
            });
          } else {
            showNotice(message, {
              actionLabel: "注册领次数",
              onAction: () => window.location.assign(`/login?callbackUrl=${encodeURIComponent("/")}`),
            });
          }
          return;
        }
        throw new Error(message);
      }
      const payload = await response.json();
      const report = payload?.data || payload;
      if (!report || !report.faceShape) {
        throw new Error("诊断接口返回内容不完整");
      }
      setDiagnosis(report);
      setMakeoverStep(2);
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      showNotice("诊断完成，报告已生成");
    } catch (error) {
      if (error.message.includes("Unauthorized")) {
        window.location.assign("/login?callbackUrl=%2F");
        return;
      }
      let message = "诊断失败，本次未扣除次数，请稍后重试";
      try {
        const detail = JSON.parse(error.message);
        if (detail?.error) message = detail.error;
      } catch {}
      showNotice(message);
    } finally {
      finishWork();
    }
  }

  // 发起比帅：用当前诊断分数创建战书，成功后弹出分享
  async function startBattle() {
    if (!sessionUser) {
      window.location.assign(`/login?callbackUrl=${encodeURIComponent("/?resume=battle")}`);
      return;
    }
    if (!diagnosis || !Number.isFinite(diagnosis.score)) {
      showNotice("先完成 AI 诊断，才能用分数发起比帅");
      return;
    }
    setBusy(true);
    try {
      const photo = makeoverPhotos[0]?.archiveUrl || profilePhotos[0]?.url || null;
      const response = await fetch("/api/battle/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          score: diagnosis.score,
          scores: [diagnosis.score, diagnosis.auraScore, diagnosis.cameraScore].map((n) => (Number.isFinite(n) ? n : diagnosis.score)),
          photoUrl: photo,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "创建战书失败");
      setScreen("battle");
      setBattleLoading(true);
      const detail = await fetch(`/api/battle/${payload.data.battleId}`).then((r) => r.json());
      setBattleData(detail.data);
      setBattleLoading(false);
      showNotice("战书已生成，把它发给兄弟吧！", { actionLabel: "看战书海报", onAction: () => window.open(`/api/battle/${payload.data.battleId}/poster`, "_blank") });
    } catch (error) {
      showNotice(error.message.includes("登录") ? error.message : "发起比帅失败：" + error.message);
    } finally {
      setBusy(false);
    }
  }

  async function openInviteCenter() {
    if (!sessionUser) {
      window.location.assign(`/login?callbackUrl=${encodeURIComponent("/?screen=profile")}`);
      return;
    }
    setScreen("invite");
    setInviteData(null);
    try {
      const response = await fetch("/api/battle/invite");
      const payload = await response.json();
      if (response.ok) setInviteData(payload.data);
    } catch {}
  }

  async function generateDisplay(draft) {
    if (!draft.personPhotos.some(hasPhotoInput)) {
      showNotice("请先上传至少一张本人照片");
      return;
    }
      startWork("display");
      setDisplayDraft(draft);
      try {
        const resolvedPhotos = await resolvePhotoInputs(draft.personPhotos, (file) => uploadToServer(file));
        const uploaded = resolvedPhotos.map((item) => item.url);
        // 参考来源二选一：模板模式用模板库图片作主参考图（此前模板图只当缩略图、从不进生成请求，
        // 是"货不对板"的根源）；参考图模式用用户上传的目标照片。
        const referenceUrl =
          draft.mode === "reference"
            ? draft.referencePhoto?.file
              ? await uploadToServer(draft.referencePhoto.file)
              : null
            : scenes[draft.sceneIndex]?.image || null;
        const referenceOutfitUrl = draft.referenceOutfit?.file
          ? await uploadToServer(draft.referenceOutfit.file)
          : null;
        const plan = buildImagePlan({
          personPhotos: uploaded,
          referenceImage: referenceUrl,
          referenceOutfit: referenceOutfitUrl,
        });
        if (!plan.roles.includes("reference")) {
          finishWork();
          showNotice("请先选择一个模板，或上传一张参考图");
          return;
        }
        if (plan.droppedPersonPhotos > 0) {
          const kept = plan.roles.filter((role) => role !== "reference" && role !== "reference_outfit").length;
          showNotice(`为保证参考图生效，仅使用前 ${kept} 张人物照片`);
        }
        const prompt = buildDisplayPrompt({
          mode: draft.mode,
          templateName: draft.mode === "reference" ? "" : scenes[draft.sceneIndex]?.name,
          background: draft.background,
          customBackground: draft.customBackground,
          outfit: draft.outfit,
          customOutfit: draft.customOutfit,
          actionName: draft.actionId ? actionNameById(draft.actionId) : null,
          mood: draft.mood,
          extraPrompt: [draft.reportAdvice, draft.prompt].filter(Boolean).join("；"),
          similarity: draft.similarity,
          personCount: plan.roles.filter((role) => role !== "reference" && role !== "reference_outfit").length,
          hasReferenceOutfit: Boolean(draft.referenceOutfit),
        });
        const response = await fetch("/api/generation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrls: plan.images,
            imageRoles: plan.roles,
            prompt,
            destination: draft.mode === "reference" ? "我的参考图" : scenes[draft.sceneIndex]?.name || "生活展示面",
            modelTier: draft.tier || "standard",
            aspectRatio: draft.ratio,
            count: draft.count,
            similarity: draft.similarity,
          }),
        });

      if (!response.ok) throw new Error(await response.text());
      const payload = await response.json();
      const output = Array.isArray(payload.outputImages)
        ? payload.outputImages
        : [payload.resultImage].filter(Boolean);
      if (!output.length) throw new Error("生成服务没有返回图片");
      setGenerationId(payload.id || null);
      setResultImages(output);
      setScreen("display-result");
    } catch (error) {
      if (error.status === 402 || (error.message && error.message.includes("Insufficient credits"))) {
        showNotice("生成次数不足，请先充值", {
          actionLabel: "去充值",
          onAction: () => window.location.assign("/pricing"),
        });
        return;
      }
      if (error.message.includes("Unauthorized")) {
        window.location.assign("/login?callbackUrl=%2F");
        return;
      }
      showNotice("生成失败，未扣除本次生成次数，请稍后重试");
    } finally {
      finishWork();
    }
  }

  async function generateTryOn({ mode, garmentPhoto, hairName, hairImage, outfitImage, faceLock, realistic, hairCustomPhoto = null }) {
    if (!sessionUser) {
      window.location.assign(tryOnLoginUrl(mode));
      return;
    }
    const profileModel = profilePhotos.find((photo) => photo.label === "正面照") || profilePhotos[0];
    const fullBodyModel = profilePhotos.find((photo) => photo.label === "全身照" && photo.url === makeoverPhotos[0]?.archiveUrl)
      || profilePhotos.find((photo) => photo.label === "全身照");
    if (mode === "outfit" && !fullBodyModel) {
      showNotice("穿搭试穿必须使用全身照，请先到「我的 → 管理照片」上传并标记为全身照");
      return;
    }
    const modelPhoto = mode === "outfit" ? null : makeoverPhotos[0]?.file;
    const modelArchiveUrl = mode === "outfit"
      ? fullBodyModel?.url
      : makeoverPhotos[0]?.archiveUrl || (!modelPhoto ? profileModel?.url : null);
    if (!modelPhoto && !modelArchiveUrl) {
      showNotice("请先完成正面照上传");
      go("photos");
      return;
    }
    if (mode === "outfit" && !garmentPhoto?.file && !outfitImage) {
      showNotice("请先选择穿搭库中的方案，或上传想试穿的衣服图片");
      return;
    }
    setTryOnResult("");
    startWork(mode === "outfit" ? "outfit" : "hair");
    try {
      const modelImageUrl = modelArchiveUrl || await uploadToServer(modelPhoto);
      if (mode === "hair" && hairCustomPhoto?.file) {
        const customHairUrl = await uploadToServer(hairCustomPhoto.file);
        const response = await fetch("/api/generation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrls: [modelImageUrl, customHairUrl].filter(Boolean),
            destination: "发型试穿",
            hairName: "自定义发型",
            faceLock,
            realistic,
            aspectRatio: "3:4",
            count: 1,
          }),
        });
        if (!response.ok) {
          const failure = new Error(await response.text());
          failure.status = response.status;
          throw failure;
        }
        const payload = await response.json();
        setTryOnResult(payload.resultImage || payload.outputImages?.[0] || "");
        setMakeoverPreview(false);
        showNotice("试穿效果已生成");
        return;
      }
      if (mode === "outfit") {
        const garmentImageUrl = garmentPhoto?.file
          ? await uploadToServer(garmentPhoto.file)
          : outfitImage;
        const response = await fetch("/api/dress-change", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelImageUrl, garmentImageUrl, faceLock, realistic }),
        });
        if (!response.ok) {
          const failure = new Error(await response.text());
          failure.status = response.status;
          throw failure;
        }
        const payload = await response.json();
        setTryOnResult(payload.resultImage || payload.outputImages?.[0] || "");
      } else {
        const response = await fetch("/api/generation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrls: [modelImageUrl, hairImage].filter(Boolean),
            destination: "发型试穿",
            hairName,
            faceLock,
            realistic,
            aspectRatio: "3:4",
            count: 1,
          }),
        });
        if (!response.ok) {
          const failure = new Error(await response.text());
          failure.status = response.status;
          throw failure;
        }
        const payload = await response.json();
        setTryOnResult(payload.resultImage || payload.outputImages?.[0] || "");
      }
      setMakeoverPreview(false);
      showNotice("试穿效果已生成");
    } catch (error) {
      if (error.status === 401) {
        window.location.assign(tryOnLoginUrl(mode));
        return;
      }
      if (error.status === 402) {
        showNotice("生成次数已用完，去充值马上继续", {
          actionLabel: "去充值",
          onAction: () => window.location.assign("/pricing"),
        });
        return;
      }
      showNotice(tryOnFailureMessage(error.status));
    } finally {
      finishWork();
    }
  }

  function go(screenName) {
    setScreen(screenName);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openFeature(screenName) {
    if (!profilePhotos.length) {
      setPendingFeature(screenName);
      if (screenName !== "makeover") {
        showNotice("先上传并保存一张照片，之后会自动返回当前功能");
      }
      go("photos");
      return;
    }
    if (screenName === "makeover") {
      if (!profilePhotos.some((item) => item.label === "正面照")) {
        setPendingFeature(screenName);
        showNotice("形象诊断需要一张正面照，先补充正面照即可；其他照片会保留在档案里");
        go("photos");
        return;
      }
      const labels = ["正面照", "侧脸照", "半身照"];
      const unclassified = profilePhotos.filter((item) => ![...labels, "全身照"].includes(item.label));
      setMakeoverPhotos((current) => labels.map((label, index) => {
        const photo = profilePhotos.find((item) => item.label === label) || (index > 0 ? unclassified[index - 1] : null);
        return photo ? { archiveUrl: photo.url, preview: photo.url, label: photo.label } : current[index] || null;
      }));
    }
    go(screenName);
  }

  return (
    <>
    {!hydrated && (
      <div className="mf-interaction-loading" role="status">
        <span>正在加载交互功能，请稍候…</span>
        {/* A native link must work even when the client bundle failed to load. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/">重新加载</a>
      </div>
    )}
    <noscript><p className="mf-interaction-loading">请启用 JavaScript 后使用形象改造功能。</p></noscript>
    {tenantUnavailable ? (
      <main className="mf-tenant-not-found" role="alert">
        <span className="mf-auth-kicker">SUBSITE NOT FOUND</span>
        <h1>这个分站地址暂不可用</h1>
        <p>请核对推广链接是否完整，或联系提供链接的代理确认分站状态。</p>
        <a href="https://face.shuqizhisou.cc/">返回型男制造机主站</a>
      </main>
    ) : <main className="mf-shell" inert={!hydrated} aria-busy={!hydrated} data-interactive={hydrated}>
      {screen === "home" && (
        <header className="mf-topbar">
          <div className="mf-logo">
            {tenantName ? (
              <>
                <span className="mf-logo-brand">型男制造机</span>
                <em className="mf-logo-tenant">{tenantName}</em>
              </>
            ) : "型男制造机"}
          </div>
          <div className="mf-top-actions">
            <button
              className="mf-icon-button"
              aria-label="通知"
              onClick={() => showNotice("暂时没有新的通知")}
            >
              <FaRegBell />
              <i />
            </button>
            <button
              type="button"
              className="mf-avatar"
              aria-label={sessionUser ? "进入我的页面" : "登录 / 注册"}
              onClick={() => (sessionUser ? go("profile") : window.location.assign("/login?callbackUrl=%2F"))}
            >
              <img
                src={sessionUser?.image || "/mf-assets/home-ref-avatar-centered.webp"}
                width={42}
                height={42}
                decoding="async"
                alt="我的头像"
              />
            </button>
          </div>
        </header>
      )}
      {screen === "home" && tenantStatus === "SUSPENDED" && (
        <div className="mf-tenant-suspended" role="alert">
          该分站已暂停营业，暂时无法购买；浏览功能不受影响。
        </div>
      )}
      <div className="mf-scroll" ref={scrollRef}>
        {screen === "home" && (
          <HomeScreen
            onMakeover={() => {
              setMakeoverPreview(false);
              setMakeoverStep(1);
              openFeature("makeover");
            }}
            onDisplay={() => {
              setDisplayPreview(false);
              openFeature("display");
            }}
            onNotice={showNotice}
            onPreview={openPreview}
            onOpenPhotos={() => go("photos")}
            onOpenReport={() => {
              if (!diagnosis?.id) return;
              setMakeoverPhotos((current) => [
                { archiveUrl: diagnosis.inputImage, preview: diagnosis.inputImage, label: "本次诊断正面照" },
                current[1] || null,
                current[2] || null,
              ]);
              setMakeoverPreview(false);
              setMakeoverStep(2);
              go("makeover");
            }}
            records={creationRecords}
            user={sessionUser}
            profilePhotos={profilePhotos}
            diagnosis={diagnosis}
          />
        )}
        {screen === "makeover" && (
          <MakeoverScreen
            step={makeoverStep}
            setStep={setMakeoverStep}
            photos={makeoverPreview ? previewPhotos : makeoverPhotos}
            setPhotos={setMakeoverPhotos}
            diagnosis={makeoverPreview ? previewDiagnosis : diagnosis}
            demoPreview={makeoverPreview}
            busy={busy}
            busyKind={busyKind}
            busyElapsedSeconds={busyElapsedSeconds}
            onBack={() => go("home")}
            onDiagnose={diagnose}
            onOpenPhotos={() => go("photos")}
            onStartBattle={startBattle}
            onInviteCenter={openInviteCenter}
            onOpenCircle={() => go("circle")}
            onTryOnGenerate={generateTryOn}
            tryOnResult={tryOnResult}
            onFinish={() => {
              setDisplayPreview(false);
              go("display");
            }}
            selectedHair={selectedHair}
            setSelectedHair={setSelectedHair}
            selectedOutfit={selectedOutfit}
            setSelectedOutfit={setSelectedOutfit}
            tryOnMode={tryOnMode}
            setTryOnMode={setTryOnMode}
            onNotice={showNotice}
            profilePhotos={profilePhotos}
            isLoggedIn={Boolean(sessionUser)}
          />
        )}
        {screen === "display" && (
          <DisplayScreen
            busy={busy}
            busyKind={busyKind}
            busyElapsedSeconds={busyElapsedSeconds}
            onBack={() => go("home")}
            onGenerate={generateDisplay}
            onPreviewGenerate={() => {
              setDisplayDraft({ scene: scenes[0].name });
              setResultImages(results);
              setScreen("display-result");
              scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
            }}
            onNotice={showNotice}
            preview={displayPreview}
            initialScene={displayScene}
            diagnosis={makeoverPreview ? previewDiagnosis : diagnosis}
            profilePhotos={profilePhotos}
            membership={sessionUser?.membership || "NONE"}
            userCredits={sessionUser?.credits}
          />
        )}
        {screen === "display-result" && (
          <ResultScreen
            images={resultImages}
            draft={displayDraft}
            generationId={generationId}
            onBack={() => go("display")}
            onNotice={showNotice}
            creationRecords={creationRecords}
            onGoToRecords={() => go("profile")}
            onForceOpenTool="生成记录"
          />
        )}
        {screen === "create" && (
          <CreateScreen
            onMakeover={() => {
              setMakeoverPreview(false);
              setMakeoverStep(1);
              openFeature("makeover");
            }}
            onDisplay={() => {
              setDisplayPreview(false);
              setDisplayScene(0);
              openFeature("display");
            }}
            onPreview={openPreview}
            onNotice={showNotice}
          />
        )}
        {screen === "inspiration" && (
          <InspirationScreen
            onBack={() => go("home")}
            onNotice={showNotice}
            onApplyScene={(index) => {
              setDisplayPreview(false);
              setDisplayScene(index);
              go("display");
            }}
            onApplyHair={(item) => {
              // 选中该发型并进试穿（走与创作页参考卡相同的真实模式分支）
              openPreview("tryon");
              // openPreview 已带档案照片；此处把发型库选中项指向该灵感（匹配 tryOnItems 顺序）
              const hairIndex = hairInspirations.findIndex((entry) => entry[0] === item.name || entry[0].includes(item.name) || item.name.includes(entry[0]));
              if (hairIndex >= 0) setSelectedHair(hairIndex);
            }}
            onApplyPose={() => {
              // 姿势灵感不再假装"选中"某个编号姿势（此前调用不存在的 setSelectedPose 直接报错）：
              // 动作现在跟模板/参考图走，进入展示面后可用「换个动作」微调
              setDisplayPreview(false);
              go("display");
              showNotice("进入展示面选一张模板，可用「换个动作」微调姿势");
            }}
            onApplyOutfit={(item) => {
              // 穿搭灵感 → 穿搭试穿流程（此前跳展示面且选择不带过去，等于死路）
              const outfitIndex = outfitInspirations.findIndex((entry) => entry.id === item.id);
              if (outfitIndex >= 0) setSelectedOutfit(outfitIndex);
              setTryOnMode("outfit");
              setMakeoverPreview(false);
              openPreview("tryon");
            }}
          />
        )}
        {screen === "circle" && <CircleScreen onNotice={showNotice} />}
        {screen === "battle" && (
          <BattleScreen
            data={battleData}
            loading={battleLoading}
            busy={busy}
            isLoggedIn={!!sessionUser}
            onAccept={async (challengerScores) => {
              if (!sessionUser) {
                window.location.assign(`/login?callbackUrl=${encodeURIComponent(window.location.pathname + "?battle=" + (battleData?.id || ""))}`);
                return;
              }
              setBusy(true);
              try {
                const response = await fetch(`/api/battle/${battleData.id}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ score: challengerScores[0], scores: challengerScores }),
                });
                const payload = await response.json();
                if (!response.ok) throw new Error(payload.error || "应战失败");
                const detail = await fetch(`/api/battle/${battleData.id}`).then((r) => r.json());
                setBattleData(detail.data);
                showNotice("战绩已锁定，看看谁更帅！");
              } catch (error) {
                showNotice(error.message);
              } finally {
                setBusy(false);
              }
            }}
            onGoDiagnose={() => {
              setMakeoverPreview(false);
              setMakeoverStep(1);
              openFeature("makeover");
            }}
            onHome={() => go("home")}
            onNotice={showNotice}
          />
        )}
        {screen === "invite" && (
          <InviteCenterScreen
            data={inviteData}
            onBack={() => go("profile")}
            onNotice={showNotice}
          />
        )}
        {screen === "profile" && (
          <ProfileScreen
            user={sessionUser}
            creationRecords={creationRecords}
            onNotice={showNotice}
            onOpenPhotos={() => go("photos")}
            onOpenPricing={() => window.location.assign("/pricing")}
            onUserUpdated={setSessionUser}
            pendingFeature={pendingFeature}
            onInviteCenter={openInviteCenter}
            onClearPendingFeature={() => setPendingFeature("")}
            subsiteCenter={subsiteCenter}
            onOpenSubsite={() => go("subsite")}
            onOpenRecord={(record) => openPreview("result", record)}
            profilePhotoCount={profilePhotos.length}
          />
        )}
        {screen === "subsite" && (
          <SubsiteCenterScreen
            data={subsiteCenter}
            onBack={() => go("profile")}
            onNotice={showNotice}
          />
        )}
        {screen === "photos" && (
          <PhotoLibraryScreen
            profilePhotos={profilePhotos}
            setProfilePhotos={setProfilePhotos}
            pendingFeature={pendingFeature}
            onNotice={showNotice}
            onBack={() => go("profile")}
            onPhotosSaved={(photo) => {
              if (pendingFeature === "makeover") {
                if (photo?.label !== "正面照") {
                  showNotice("照片已保存。形象诊断还需要正面照，请选择「正面照」上传。");
                  return;
                }
                setMakeoverPhotos((current) => {
                  const next = [...current];
                  next[0] = { archiveUrl: photo.url, preview: photo.url, label: photo.label };
                  return next;
                });
              }
              if (pendingFeature) {
                const next = pendingFeature;
                setPendingFeature("");
                go(next);
              }
            }}
          />
        )}
      </div>
      {purchasePromptOpen && <PurchasePromptModal onClose={() => setPurchasePromptOpen(false)} />}
      {notice && (
        <div className="mf-toast" role="status">
          <span>{typeof notice === "string" ? notice : notice.text}</span>
          {typeof notice === "object" && notice.actionLabel && (
            <button
              className="mf-toast-action"
              onClick={() => {
                const action = notice.onAction;
                setNotice("");
                if (action) action();
              }}
            >
              {notice.actionLabel}
            </button>
          )}
        </div>
      )}
      {[
        "home",
        "profile",
        "create",
        "inspiration",
        "circle",
      ].includes(screen) && (
        <BottomNav
          screen={screen}
          onHome={() => go("home")}
          onCreate={() => go("create")}
          onInspiration={() => go("inspiration")}
          onCircle={() => go("circle")}
          onProfile={() => go("profile")}
        />
      )}
    </main>}
    </>
  );
}

function HomeScreen({ onMakeover, onDisplay, onOpenPhotos, onOpenReport, onNotice, onPreview, user, profilePhotos = [], diagnosis = null }) {
  const ProfileStyleContainer = diagnosis?.id ? "button" : "div";
  const [caseIndex, setCaseIndex] = useState(0);
  const caseSlides = [
    {
      image: "/mf-assets/home-ref-recommend-hd.webp",
      title: "发型 + 穿搭改造",
      detail: "脸部特征保持一致，整体气质焕然一新",
      action: onMakeover,
    },
    {
      image: "/mf-assets/home-case-transformation.webp",
      title: "同一张脸，也能更上镜",
      detail: "从普通状态到清爽高级，改变看得见",
      action: () => onPreview("tryon"),
    },
  ];
  useEffect(() => {
    const timer = window.setInterval(
      () => setCaseIndex((index) => (index + 1) % caseSlides.length),
      4800,
    );
    return () => window.clearInterval(timer);
  }, [caseSlides.length]);
  const creditLabel = Number.isFinite(user?.credits) ? user.credits : "—";
  const hasCredits = Number.isFinite(user?.credits);
  const profileLabels = ["正面照", "侧脸照", "半身照"];
  const usedPhotoIds = new Set();
  const profileSlots = profileLabels.map((label, index) => {
    const labeled = profilePhotos.find((photo) => photo.label === label && !usedPhotoIds.has(photo.id));
    const fallback = profilePhotos.find((photo) => photo.label !== "全身照" && !usedPhotoIds.has(photo.id));
    const photo = labeled || fallback || null;
    if (photo?.id) usedPhotoIds.add(photo.id);
    return photo ? { ...photo, display: photo.thumbUrl || photo.url } : null;
  });
  const styleLabels = [];
  (Array.isArray(diagnosis?.styles) ? diagnosis.styles : []).forEach((item) => {
    if (typeof item === "string") {
      if (item.trim() && !styleLabels.includes(item.trim())) styleLabels.push(item.trim());
      return;
    }
    // 主风格名 + 它的关键词（最多 2 个），比只显示两个风格名更有信息量
    [item?.name, ...(Array.isArray(item?.keywords) ? item.keywords.slice(0, 2) : []), item?.tags, item?.title, item?.style, item?.label].flat().forEach((value) => {
      if (typeof value === "string" && value.trim() && !styleLabels.includes(value.trim())) styleLabels.push(value.trim());
    });
  });
  const hasProfilePhotos = profileSlots.some(Boolean);
  const placeholderSlots = [
    "/mf-assets/home-ref-profile-1.png",
    "/mf-assets/home-ref-profile-2.png",
    "/mf-assets/home-ref-profile-3.png",
  ];
  const hasStyleProfile = styleLabels.length > 0;
  return (
    <section className="mf-screen mf-home-screen">
      <div className="mf-home-subtitle">
        <span>AI 助你变帅，打造你的最佳展示面</span>
      </div>
      <div className="mf-home-cards">
        <button className="mf-home-card" onClick={onMakeover} aria-label="变帅改造">
          <img className="mf-home-snapshot" src="/mf-assets/home-ref-makeover-hd.webp" alt="" />
        </button>
        <button className="mf-home-card" onClick={onDisplay} aria-label="生活展示面">
          <img className="mf-home-snapshot" src="/mf-assets/home-ref-display-hd.webp" alt="" />
        </button>
      </div>
      <div className="mf-section-head mf-home-recommend-head">
        <b>今日推荐</b>
      </div>
      <div className="mf-home-case-carousel" aria-label="变帅改造案例">
        <button
          className="mf-home-recommend mf-home-case-slide"
          onClick={() => caseSlides[caseIndex].action()}
          aria-label={`${caseSlides[caseIndex].title}案例`}
        >
          <img src={caseSlides[caseIndex].image} alt="" />
          <span className="mf-demo-case-badge">案例示意 · 非个人结果</span>
        </button>
        <div className="mf-home-case-controls">
          <span>{String(caseIndex + 1).padStart(2, "0")} / {String(caseSlides.length).padStart(2, "0")}</span>
          <div>
            {caseSlides.map((slide, index) => (
              <button
                key={slide.title}
                type="button"
                className={index === caseIndex ? "active" : ""}
                onClick={() => setCaseIndex(index)}
                aria-label={`查看第 ${index + 1} 个案例`}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="mf-section-head mf-home-quick-head"><b>快速开始</b></div>
      <div className="mf-home-quick-grid">
        <button onClick={onMakeover} aria-label="上传照片做诊断">
          <img className="mf-home-snapshot" src="/mf-assets/home-ref-quick-diagnose.png" alt="" />
        </button>
        <button onClick={() => onPreview("tryon")} aria-label="试穿发型穿搭">
          <img className="mf-home-snapshot" src="/mf-assets/home-ref-quick-tryon.png" alt="" />
        </button>
        <button onClick={onDisplay} aria-label="生成展示面">
          <img className="mf-home-snapshot" src="/mf-assets/home-ref-quick-display.png" alt="" />
        </button>
      </div>
      <div className="mf-section-head mf-home-profile-head"><b>我的档案</b></div>
      <div className="mf-home-profile-card">
        <div className="mf-home-profile-photos">
          <b>{hasProfilePhotos ? `我的照片（已保存 ${profilePhotos.length} 张）` : "档案示例（上传后替换）"}</b>
          {profileSlots.map((photo, index) => (
            <span className={!photo ? "empty" : ""} key={profileLabels[index]}>
              {photo ? <img loading="lazy" decoding="async" src={photo.display} alt={photo.label || profileLabels[index]} /> : hasProfilePhotos ? <small>{profileLabels[index]}</small> : <img loading="lazy" decoding="async" src={placeholderSlots[index]} alt={`${profileLabels[index]}示例`} />}
            </span>
          ))}
          <button onClick={onOpenPhotos}>管理照片</button>
        </div>
        <ProfileStyleContainer className={`mf-home-profile-style${diagnosis?.id ? " is-report-link" : ""}`} type={diagnosis?.id ? "button" : undefined} onClick={diagnosis?.id ? onOpenReport : undefined} aria-label={diagnosis?.id ? "查看我的形象报告" : undefined}>
          <span className="mf-home-style-heading"><b>风格画像</b>{diagnosis?.id && <i>查看 <FaChevronRight /></i>}</span>
          {hasStyleProfile ? styleLabels.slice(0, 4).map((label) => <span key={label}>{label}</span>) : <span className="empty">完成 AI 诊断后生成</span>}
        </ProfileStyleContainer>
        <div className="mf-home-profile-credits">
          <b>剩余次数</b>
          <strong>{creditLabel}</strong>
          <small>{hasCredits ? "次" : "登录后同步"}</small>
          <button
            className="mf-home-credit-action"
            onClick={() => window.location.assign("/pricing")}
          >
            获取更多
          </button>
        </div>
      </div>
    </section>
  );
}

function CreateScreen({ onMakeover, onDisplay, onPreview, onNotice }) {
  const [filter, setFilter] = useState("全部");
  const history = [
    { title: "发型试穿", date: "2024-05-20", image: "/mf-ui-mobile-v3/reference-create/history-1.png", type: "tryon" },
    { title: "穿搭方案", date: "2024-05-18", image: "/mf-assets/market-man.png", type: "tryon" },
    { title: "生活展示面", date: "2024-05-15", image: "/mf-assets/river-man.png", type: "display" },
  ];
  return (
    <section className="mf-screen mf-create-screen">
      <div className="mf-create-header">
        <div>
          <h1>创作</h1>
        </div>
        <button aria-label="创作记录" onClick={() => onNotice("这里会展示你的全部创作记录")}>
          <FaHistory /><span>历史记录</span>
        </button>
      </div>
      <div className="mf-create-tabs" role="tablist" aria-label="创作类型">
        {["全部", "变帅改造", "生活展示面"].map((item) => (
          <button
            key={item}
            className={filter === item ? "active" : ""}
            onClick={() => setFilter(item)}
            role="tab"
            aria-selected={filter === item}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="mf-new-creation">
        <div className="mf-section-head mf-create-section-head">
          <b>开始新创作</b>
        </div>
        {(filter === "全部" || filter === "变帅改造") && (
          <button className="mf-creation-option" onClick={onMakeover}>
            <span className="mf-creation-icon"><FaMagic /></span>
            <span>
              <b>变帅改造</b>
              <small>脸型分析 · 发型试穿 · 穿搭建议</small>
            </span>
            <img src="/mf-ui-mobile-v3/reference-create/makeover-person.png" alt="变帅改造示例" />
            <FaChevronRight />
          </button>
        )}
        {(filter === "全部" || filter === "生活展示面") && (
          <button className="mf-creation-option" onClick={onDisplay}>
            <span className="mf-creation-icon"><FaImage /></span>
            <span>
              <b>生活展示面</b>
              <small>多角度建档 · 场景模板 · 一键生成</small>
            </span>
            <img src="/mf-ui-mobile-v3/reference-create/display-person.png" alt="生活展示面示例" />
            <FaChevronRight />
          </button>
        )}
      </div>
      <div className="mf-section-head mf-create-history-head">
        <b>参考案例</b>
        <button onClick={() => onNotice("当前为产品示例；完成真实生成后会保存到你的作品记录")}>示例说明 <FaChevronRight /></button>
      </div>
      <div className="mf-create-history-grid">
        {history.map((item) => (
          <button key={item.title} onClick={() => onPreview(item.type)}>
            <img src={item.image} alt={item.title} loading="lazy" decoding="async" />
            <span>{item.title}</span>
            <small>{item.date} · 示例</small>
          </button>
        ))}
      </div>
      <div className="mf-create-helper">
        <div className="mf-helper-title"><b>创作小助手</b></div>
        <div className="mf-helper-body">
          <div className="mf-helper-list">
            <span><i><FaCloudUploadAlt /></i><b>先上传 3 张角度照片</b><small>正面、侧面、半身更有助于精准建模</small></span>
            <span><i><FaUser /></i><b>保持脸部一致性</b><small>避免遮挡、夸张表情，效果更稳定</small></span>
            <span><i><FaImage /></i><b>参考图越清晰，效果越稳定</b><small>光线充足、五官清晰的照片更理想</small></span>
          </div>
          <img src="/mf-ui-mobile-v3/reference-create/helper-person.png" alt="创作小助手示例" />
        </div>
      </div>
    </section>
  );
}

function CircleScreen({ onNotice }) {
  const [posts, setPosts] = useState([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState({});
  const [imageFiles, setImageFiles] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [commentOpen, setCommentOpen] = useState(null);
  const [savedPostIds, setSavedPostIds] = useState([]);

  useEffect(() => {
    fetch("/api/circle")
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => setPosts(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (!content.trim()) return onNotice("写点你的改变，再发布吧");
    setSending(true);
    try {
      const imageUrls = [];
      for (const imageFile of imageFiles) {
        const form = new FormData();
        form.append("file", imageFile);
        const uploadResponse = await fetch("/api/upload", { method: "POST", body: form });
        const uploadData = await uploadResponse.json();
        if (!uploadResponse.ok || !uploadData.url) throw new Error(uploadData.error || "图片上传失败");
        imageUrls.push(uploadData.url);
      }
      const response = await fetch("/api/circle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, imageUrls }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "发布失败");
      setContent("");
      setImageFiles([]);
      setImagePreviews([]);
      onNotice(data.message || "已提交审核");
    } catch (error) { onNotice(error.message); } finally { setSending(false); }
  }

  async function toggleLike(post) {
    const response = await fetch(`/api/circle/${post.id}/like`, { method: "POST" });
    const data = await response.json();
    if (!response.ok) return onNotice(response.status === 401 ? "登录后才能点赞" : data.error || "操作失败");
    setPosts((current) => current.map((item) => item.id === post.id ? { ...item, likes: data.likes, _count: { ...item._count, likesBy: data.likes } } : item));
  }

  async function submitComment(post) {
    const content = (commentDrafts[post.id] || "").trim();
    if (!content) return;
    const response = await fetch(`/api/circle/${post.id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) });
    const data = await response.json();
    if (!response.ok) return onNotice(response.status === 401 ? "登录后才能评论" : data.error || "评论失败");
    setCommentDrafts((current) => ({ ...current, [post.id]: "" }));
    onNotice(data.message || "评论已提交审核");
  }

  function sharePost(post) {
    const url = `${window.location.origin}/?circle=${encodeURIComponent(post.id)}`;
    if (navigator.share) navigator.share({ title: "型男制造机圈子", text: post.content, url }).catch(() => {});
    else navigator.clipboard?.writeText(url).then(() => onNotice("分享链接已复制"), () => onNotice("分享链接已生成"));
  }

  return <section className="mf-screen mf-circle-screen">
    <div className="mf-circle-head"><div><small>型男制造机 · 社区</small><h1>圈子</h1></div><button className="mf-circle-add" type="button" aria-label="发布动态" onClick={() => setComposerOpen((open) => !open)}><FaPlus /><span>{composerOpen ? "收起" : "发布"}</span></button></div>
    <div className="mf-circle-feed-tabs"><button className="active" type="button">推荐</button><button type="button" onClick={() => onNotice("关注功能即将开放")}>关注</button><span>记录改变，分享更好的自己</span></div>
    {composerOpen && <form className="mf-circle-compose" onSubmit={submit}><textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={500} placeholder="记录今天的状态、穿搭或展示面…" />{imagePreviews.length > 0 && <div className="mf-circle-compose-previews">{imagePreviews.map((src) => <img key={src} src={src} alt="待发布配图预览" />)}</div>}<div><label className="mf-circle-image-picker"><FaImage /> 添加图片（最多9张）<input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => { const files = [...(event.target.files || [])].slice(0, 9); if (files.some((file) => file.size > 5 * 1024 * 1024)) return onNotice("单张图片不能超过 5MB"); setImageFiles(files); setImagePreviews(files.map((file) => URL.createObjectURL(file))); }} /></label><small>{content.length}/500 · 发布前会由管理员审核</small><button type="submit" disabled={sending}>{sending ? "提交中" : "发布动态"}</button></div></form>}
    <div className="mf-circle-feed">
      {loading && <div className="mf-circle-loading"><i />正在加载圈子内容…</div>}
      {!loading && posts.length === 0 && <div className="mf-circle-empty">还没有公开动态，来分享第一条吧</div>}
      {posts.map((post) => <article className="mf-circle-post" key={post.id}>
        <div className="mf-circle-post-body">
          <div className="mf-circle-meta"><div className="mf-circle-author"><img src={post.user?.image || "/mf-assets/home-ref-avatar.png"} alt="" /><span><b>{post.user?.name || "型男朋友"}</b><small>{new Date(post.createdAt).toLocaleDateString("zh-CN")} · 分享了改变</small></span></div><span className="mf-circle-more">···</span></div>
          <p>{post.content}</p>
          {(Array.isArray(post.imageUrls) && post.imageUrls.length ? post.imageUrls : [post.imageUrl].filter(Boolean)).length > 0 && <div className={`mf-circle-post-images count-${(Array.isArray(post.imageUrls) && post.imageUrls.length ? post.imageUrls : [post.imageUrl].filter(Boolean)).length}`}>{(Array.isArray(post.imageUrls) && post.imageUrls.length ? post.imageUrls : [post.imageUrl].filter(Boolean)).map((src) => <img key={src} src={src} loading="lazy" decoding="async" alt="圈子动态配图" />)}</div>}
          {post.comments?.map((comment) => <div className="mf-circle-comment" key={comment.id}><b>{comment.user?.name || "型男朋友"}</b> {comment.content}</div>)}
          <div className="mf-circle-actions"><button type="button" onClick={() => setCommentOpen((current) => current === post.id ? null : post.id)}><FaRegCommentDots /> {post.comments?.length || 0}</button><button type="button" onClick={() => toggleLike(post)}><FaRegHeart /> {post.likes ?? post._count?.likesBy ?? 0}</button><button type="button" className={savedPostIds.includes(post.id) ? "saved" : ""} onClick={() => setSavedPostIds((current) => current.includes(post.id) ? current.filter((id) => id !== post.id) : [...current, post.id])}><FaRegBookmark /> {savedPostIds.includes(post.id) ? "已收藏" : "收藏"}</button><button type="button" onClick={() => sharePost(post)}><FaShareAlt /> 分享</button></div>
          {commentOpen === post.id && <div className="mf-circle-comment-box"><input value={commentDrafts[post.id] || ""} onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))} maxLength={200} placeholder="说点友善的话…" /><button type="button" onClick={() => submitComment(post)}>发送</button></div>}
        </div>
      </article>)}
    </div>
  </section>;
}

function InspirationScreen({ onNotice, onApplyScene, onApplyHair, onApplyPose, onApplyOutfit }) {
  const [filter, setFilter] = useState("全部");
  const [saved, setSaved] = useState([]);
  const categoryItems = {
    场景: scenes,
    姿势: poseInspirations,
    穿搭: outfitInspirations,
    发型: hairInspirations,
  };
  const items = filter === "全部" ? [...scenes, ...poseInspirations, ...outfitInspirations, ...hairInspirations] : (categoryItems[filter] || []);
  const visible = items;
  return (
    <section className="mf-screen mf-inspiration-screen">
      <div className="mf-inspiration-brand-row">
        <span>型男制造机</span>
        <div>
          <button aria-label="搜索灵感" onClick={() => onNotice("搜索场景、姿势或穿搭风格")}><FaSearch /></button>
          <button aria-label="我的收藏" onClick={() => onNotice(`已收藏 ${saved.length} 个模板`)}><FaRegBookmark /></button>
        </div>
      </div>
      <div className="mf-inspiration-title-row"><h1>灵感</h1></div>
      <p className="mf-inspiration-subtitle">找到适合你的展示面风格</p>
      <div className="mf-inspiration-filters" role="tablist" aria-label="灵感分类">
        {["全部", "场景", "姿势", "穿搭", "发型"].map((item) => (
          <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>
        ))}
      </div>
      <div className="mf-inspiration-grid">
        {visible.map((item) => {
          const sceneIndex = scenes.findIndex((entry) => entry.id === item.id);
          const isSaved = saved.includes(item.name);
          return (
            <article className="mf-inspiration-card" key={item.id}>
              <button className="mf-inspiration-image" onClick={() => item.tag === "发型" ? onApplyHair?.(item) : item.source === "pose" ? onApplyPose?.(item) : onApplyScene(sceneIndex)}>
                <img src={item.image} alt={item.name} loading="lazy" decoding="async" />
                <span>{item.name}</span>
              </button>
              <div>
                <small>{item.tag}</small>
                <button aria-label={`收藏${item.name}`} className={isSaved ? "saved" : ""} onClick={() => setSaved((current) => isSaved ? current.filter((name) => name !== item.name) : [...current, item.name])}>
                  <FaHeart />
                </button>
              </div>
              {item.tag === "发型" ? <button className="mf-apply-template" onClick={() => onApplyHair?.(item)}>选择发型 <FaChevronRight /></button> : item.source === "pose" ? <button className="mf-apply-template" onClick={() => onApplyPose?.(item)}>选择姿势 <FaChevronRight /></button> : <button className="mf-apply-template" onClick={() => onApplyScene(sceneIndex)}>套用模板 <FaChevronRight /></button>}
            </article>
          );
        })}
      </div>
      <div className="mf-hot-styles">
        <div className="mf-section-head"><b>热门风格</b><small>本周最受欢迎</small></div>
        <div>{["都市休闲", "清爽干净", "松弛感"].map((item) => <button key={item} onClick={() => onNotice(`已选择${item}风格`)}>{item}</button>)}</div>
      </div>
    </section>
  );
}

function AIWorkStatus({
  type,
  primaryImage,
  secondaryImage,
  selectedLabel,
  elapsedSeconds = 0,
  compact = false,
}) {
  const copy = {
    diagnosis: {
      title: "正在分析这张照片",
      detail: "正在整理面部轮廓、上镜状态和个性化改造建议。",
    },
    hair: {
      title: "正在生成发型试穿",
      detail: selectedLabel ? `正在为你预览「${selectedLabel}」效果。` : "正在把选中的发型应用到你的照片上。",
    },
    outfit: {
      title: "正在生成穿搭效果",
      detail: selectedLabel ? `正在把「${selectedLabel}」搭配到你的全身照上。` : "正在把选中的搭配应用到你的全身照上。",
    },
    display: {
      title: "正在生成生活展示面",
      detail: selectedLabel ? `正在根据「${selectedLabel}」生成你的展示面。` : "正在根据你选择的画面设置生成成片。",
    },
  }[type] || { title: "正在处理", detail: "生成完成后会自动显示结果。" };

  return (
    <section className={`mf-ai-work-status${compact ? " is-compact" : ""}`}>
      <div className="mf-ai-work-visual" aria-hidden="true">
        {primaryImage ? <img className="mf-ai-work-source" src={primaryImage} alt="" /> : <span className="mf-ai-work-placeholder" />}
        {secondaryImage && (
          <span className="mf-ai-work-target"><img src={secondaryImage} alt="" /></span>
        )}
        <span className="mf-ai-work-scan" />
        <span className="mf-ai-work-corner tl" />
        <span className="mf-ai-work-corner br" />
      </div>
      <div className="mf-ai-work-copy">
        <div className="mf-ai-work-meta">
          <span className="mf-ai-work-live" role="status" aria-live="polite"><i />AI 正在处理</span>
          <time aria-live="off">{formatWaitDuration(elapsedSeconds)}</time>
        </div>
        <b>{copy.title}</b>
        <p>{copy.detail}</p>
        <div className="mf-ai-work-track" role="progressbar" aria-label="AI 正在处理中" aria-valuetext="正在处理，进度未知"><span /></div>
        <small>完成后会自动显示结果，无需重复点击</small>
      </div>
    </section>
  );
}

function MakeoverScreen({
  step,
  setStep,
  photos,
  setPhotos,
  diagnosis,
  demoPreview,
  busy,
  busyKind,
  busyElapsedSeconds,
  onBack,
  onDiagnose,
  onTryOnGenerate,
  tryOnResult,
  onFinish,
  onOpenPhotos,
  onStartBattle,
  onInviteCenter,
  onOpenCircle,
  selectedHair,
  setSelectedHair,
  selectedOutfit,
  setSelectedOutfit,
  tryOnMode,
  setTryOnMode,
  onNotice,
  profilePhotos = [],
  isLoggedIn = false,
}) {
  const fileRef = useRef(null);
  const clothingRef = useRef(null);
  const tryonBoxRef = useRef(null);
  const [tryonBoxH, setTryonBoxH] = useState(null);
  useEffect(() => {
    // 每格高 = 格宽 × 4/3（左右各为 3:4）；受可视高度 62% 上限约束
    // 从报告页切到试穿步骤时容器才挂载，必须在该时机重算，否则 fallback 比例会把格子拉变形
    function fit() {
      const box = tryonBoxRef.current;
      if (!box) return;
      const paneW = box.clientWidth / 2;
      const h = Math.min(Math.round(paneW * 4 / 3), Math.round(window.innerHeight * 0.62));
      setTryonBoxH(h);
    }
    if (step !== 3 || demoPreview) {
      const frame = window.requestAnimationFrame(() => setTryonBoxH(null));
      return () => window.cancelAnimationFrame(frame);
    }
    const raf = window.requestAnimationFrame(fit);
    window.addEventListener("resize", fit);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", fit);
    };
  }, [step, tryOnMode, demoPreview]);
  const [clothingPhoto, setClothingPhoto] = useState(null);
  const hairRef = useRef(null);
  const [hairPhoto, setHairPhoto] = useState(null);
  const [faceLock, setFaceLock] = useState(true);
  const [realistic, setRealistic] = useState(true);
  const [libraryStart, setLibraryStart] = useState(0);
  const [libraryExpanded, setLibraryExpanded] = useState(false);
  const [slotPickerIndex, setSlotPickerIndex] = useState(null);
  function pick(index, file) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      onNotice("仅支持 JPG、PNG、WebP 图片");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      onNotice("图片不能超过 5MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const next = [...photos];
      next[index] = { file, preview: reader.result };
      setPhotos(next);
    };
    reader.readAsDataURL(file);
  }
  const report = diagnosis || {};
  const reportInsights = buildReportInsights(report);
  const recommendedHair = (Array.isArray(report.hairstyles) ? report.hairstyles : [])
    .slice(0, 5).map((item, index) => resolveInspiration(hairInspirations, item, index, REPORT_HAIR_IMAGE_PREFERENCES));
  const recommendedOutfits = (Array.isArray(report.outfits) ? report.outfits : [])
    .slice(0, 5).map((item, index) => resolveInspiration(outfitInspirations, item, index));
  const hairLibrary = [
    ...recommendedHair,
    ...hairInspirations.filter((entry) => !recommendedHair.some((item) => item.id === entry.id)),
  ];
  const outfitLibrary = [
    ...recommendedOutfits,
    ...outfitInspirations.filter((entry) => !recommendedOutfits.some((item) => item.id === entry.id)),
  ];
  const selectedFullBodyPhoto = profilePhotos.find((photo) => photo.label === "全身照" && photo.url === photos[0]?.archiveUrl)
    || profilePhotos.find((photo) => photo.label === "全身照");

  function goToTryOn(mode, item) {
    const library = mode === "hair" ? hairLibrary : outfitLibrary;
    const index = library.findIndex((entry) => entry.id === item.id);
    if (mode === "outfit" && !profilePhotos.some((photo) => photo.label === "全身照")) {
      onNotice("穿搭试穿需要本人全身照，请先添加一张全身照。", {
        actionLabel: "去添加全身照",
        onAction: onOpenPhotos,
      });
      return;
    }
    if (mode === "hair") {
      setSelectedHair(Math.max(0, index));
      setTryOnMode("hair");
    } else {
      setSelectedOutfit(Math.max(0, index));
      setTryOnMode("outfit");
    }
    setStep(3);
    document.querySelector(".mf-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
  }
  const tryOnItems = tryOnMode === "hair" ? hairLibrary : outfitLibrary;
  const selectedLibraryIndex = tryOnMode === "hair" ? selectedHair : selectedOutfit;
  const visibleLibraryItems = libraryExpanded
    ? tryOnItems
    : tryOnItems.slice(libraryStart, libraryStart + 8);
  return (
    <section className={`mf-screen mf-flow-screen${step === 2 ? " mf-diagnosis-flow" : ""}`}>
      {step !== 2 && (
        <FlowHeader
          title={step === 3 ? "试穿预览" : "变帅改造"}
          step={step}
          total={3}
          onBack={onBack}
          disabled={busy}
        />
      )}
      {step === 1 && (
        <>
          <FlowIntro
            eyebrow="先建立你的专属档案"
            title="上传照片"
            text="先看照片诊断，再按报告选发型、搭穿搭，最后生成专属展示面。"
          />
          <div className="mf-service-overview" aria-label="变帅改造服务">
            <div className="mf-service-overview-head">
              <b>上传一次，获得 4 项专属结果</b>
              <span>先诊断 · 再决定</span>
            </div>
            <div className="mf-service-overview-grid">
              {makeoverServices.map(({ icon: Icon, title, text }) => (
                <div key={title} className="mf-service-overview-item">
                  <Icon />
                  <b>{title}</b>
                  <small>{text}</small>
                </div>
              ))}
            </div>
          </div>
          {profilePhotos.length > 0 && (
            <p className="mf-archive-hint">已从照片档案自动带出正面照 · 点照片右下角“换”可更换</p>
          )}
          <div className="mf-upload-slots mf-upload-slots-single">
            {[0].map((index) => (
              <button
                key="正面照"
                className={`mf-upload-slot mf-slot-primary ${photos[index] ? "filled" : ""}`}
                onClick={() => {
                  fileRef.current.dataset.index = index;
                  fileRef.current.click();
                }}
              >
                {photos[index] ? (
                  <img src={photos[index].preview} alt="正面照" />
                ) : (
                  <>
                    <span
                      className="mf-silhouette mf-silhouette-0"
                      aria-hidden="true"
                    />
                    <b>正面照</b>
                    <small>AI 诊断用 · 正面无遮挡，光线均匀</small>
                  </>
                )}
                {photos[index] && (
                  <i>
                    <FaCheck />
                  </i>
                )}
                {profilePhotos.length > 0 && (
                  <em
                    className="mf-slot-swap"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSlotPickerIndex(index);
                    }}
                  >
                    换
                  </em>
                )}
              </button>
            ))}
          </div>

          {slotPickerIndex !== null && (() => {
            const slotLabel = ["正面照", "侧脸照", "半身照", "全身照"][slotPickerIndex] || "照片";
            const isOutfitSlot = tryOnMode === "outfit" && slotPickerIndex === 0;
            const fullBody = profilePhotos.filter((photo) => photo.label === "全身照");
            const candidates = isOutfitSlot && fullBody.length ? fullBody : profilePhotos;
            return (
            <div className="mf-slot-picker" role="dialog" aria-label="从照片档案更换">
              <div className="mf-slot-picker-head">
                <b>更换{isOutfitSlot ? "全身照" : slotLabel}</b>
                <button onClick={() => setSlotPickerIndex(null)}>关闭</button>
              </div>
              {isOutfitSlot && !fullBody.length && (
                <p className="mf-slot-picker-hint">档案里还没有全身照 · 建议到「我的 → 管理照片」上传一张（类型选全身照），穿搭效果会完整很多</p>
              )}
              <div className="mf-slot-picker-grid">
                {candidates.map((photo) => (
                  <button
                    key={photo.id}
                    className={photos[slotPickerIndex]?.archiveUrl === photo.url ? "active" : ""}
                    onClick={() => {
                      const next = [...photos];
                      next[slotPickerIndex] = { archiveUrl: photo.url, preview: photo.url, label: photo.label };
                      setPhotos(next);
                      setSlotPickerIndex(null);
                    }}
                  >
                    <img src={photo.url} alt={photo.label || "档案照片"} />
                    <span>{photo.label || "未分类"}</span>
                  </button>
                ))}
              </div>
            </div>
            );
          })()}
          <p className="mf-upload-requirement">
            <b>一张清晰正面照即可开始诊断</b> · 试穿穿搭需另补本人全身照；侧脸照可稍后添加
          </p>
          <button
            className={`mf-primary mf-upload-primary ${!photos[0] || busy ? "disabled" : ""}`}
            onClick={onDiagnose}
            disabled={!photos[0] || busy}
          >
            {busy && busyKind === "diagnosis" ? <><span className="mf-loading-spinner" />正在分析你的照片…</> : "开始 AI 诊断"}
            {photos[0] && <FaArrowRight />}
          </button>
          {busy && busyKind === "diagnosis" && <AIWorkStatus type="diagnosis" primaryImage={photos[0]?.preview || photos[0]?.archiveUrl} elapsedSeconds={busyElapsedSeconds} />}
          <p className="mf-upload-cta-note">{DIAG_ESTIMATE_COPY} {DIAG_QUOTA_COPY}</p>
          <p className="mf-privacy">
            <FaLock /> 照片会发送给 AI 服务分析，并随诊断记录保存。<a href="/privacy">查看隐私说明</a>
          </p>
          <input
            ref={fileRef}
            hidden
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) =>
              pick(
                Number(event.target.dataset.index || 0),
                event.target.files?.[0],
              )
            }
          />
          <div className="mf-tip-panel">
            <div>
              <b>
                <FaLock /> 拍照小贴士
              </b>
              <span>• 光线均匀，避免强光或逆光</span>
              <span>• 背景干净，避免杂乱环境</span>
              <span>• 五官清晰，表情自然</span>
            </div>
            <img src={images.leadAlt} alt="拍照示例" />
          </div>
          <div className="mf-service-trust">
            <span>失败自动退回次数</span>
            <span>结果自动保存</span>
            <span>可先看诊断再生成</span>
          </div>
          <button className="mf-circle-cta" onClick={onOpenCircle || (() => {})}>
            <span><b>看看兄弟们的真实改变</b><small>圈子里的前后对比，都是这么来的</small></span>
            <FaArrowRight />
          </button>
        </>
      )}
      {step === 2 && (
        <>
          <DiagnosisReport
            photo={photos[0]?.preview || report.inputImage || images.lead}
            report={report}
            insights={reportInsights}
            hairItems={recommendedHair}
            outfitItems={recommendedOutfits}
            isDemo={demoPreview}
            isLoggedIn={isLoggedIn}
            onBack={onBack}
            onTryHair={(item) => goToTryOn("hair", item)}
            onTryOutfit={(item) => goToTryOn("outfit", item)}
            onDisplay={onFinish}
            onStartBattle={onStartBattle}
            onNotice={onNotice}
          />
        </>
      )}
      {step === 3 && (
        <>
          <div className="mf-segment">
            <button
              className={tryOnMode === "hair" ? "active" : ""}
              disabled={busy}
              onClick={() => setTryOnMode("hair")}
            >
              发型
            </button>
            <button
              className={tryOnMode === "outfit" ? "active" : ""}
              disabled={busy}
              onClick={() => setTryOnMode("outfit")}
            >
              穿搭
            </button>
          </div>
          {demoPreview ? (
            <ComparisonFrame
              className="mf-tryon-hero"
              demo
              before=""
              after=""
            />
          ) : (
            <div className="mf-tryon-real" ref={tryonBoxRef} style={tryonBoxH ? { height: tryonBoxH + "px" } : { aspectRatio: "3 / 4" }}>
              <div className="mf-tryon-pane">
                {(tryOnMode === "outfit" ? selectedFullBodyPhoto : photos[0]) ? (
                  <img
                    src={tryOnMode === "outfit"
                      ? selectedFullBodyPhoto?.url
                      : photos[0].preview || photos[0].archiveUrl}
                    alt={tryOnMode === "outfit" ? "我的全身照" : "我的照片"}
                  />
                ) : (
                  <div className="mf-tryon-empty"><b>还没有照片</b><small>{tryOnMode === "outfit" ? "请到照片档案上传全身照" : "回到上一步上传正面照"}</small></div>
                )}
                <small className="mf-tryon-tag">{tryOnMode === "outfit" ? "Before · 我的全身照" : "Before · 我的照片"}</small>
                {profilePhotos.length > 0 && (
                  <em
                    className="mf-slot-swap"
                    onClick={() => setSlotPickerIndex(0)}
                    role="button"
                    aria-label={tryOnMode === "outfit" ? "更换穿搭参考全身照" : "更换发型参考正面照"}
                  >
                    换
                  </em>
                )}
              </div>
              <div className="mf-tryon-pane">
                {tryOnResult ? (
                  <>
                    <img src={tryOnResult} alt="试穿结果" />
                    <a className="mf-tryon-save" href={tryOnResult} download="试穿结果.png" target="_blank" rel="noreferrer">保存</a>
                    <p className="mf-tryon-keep-hint">已存到生成记录，可回来下载</p>
                  </>
                ) : (
                  busy && busyKind === (tryOnMode === "outfit" ? "outfit" : "hair") ? (
                    <AIWorkStatus
                      type={tryOnMode === "outfit" ? "outfit" : "hair"}
                      primaryImage={tryOnMode === "outfit" ? selectedFullBodyPhoto?.url : photos[0]?.preview || photos[0]?.archiveUrl}
                      secondaryImage={tryOnMode === "hair" ? (hairPhoto?.preview || tryOnItems[selectedLibraryIndex]?.image) : (clothingPhoto?.preview || tryOnItems[selectedLibraryIndex]?.image)}
                      selectedLabel={hairPhoto?.file && tryOnMode === "hair" ? "自定义发型" : tryOnItems[selectedLibraryIndex]?.name}
                      elapsedSeconds={busyElapsedSeconds}
                      compact
                    />
                  ) : (
                    <div className="mf-tryon-empty">
                      <b>{tryOnMode === "outfit" ? "生成后显示穿搭效果" : "生成后显示新发型"}</b>
                      <small>{tryOnMode === "outfit" ? "必须先上传并选择全身照" : "先在下方选择一款发型"}</small>
                    </div>
                  )
                )}
              </div>
            </div>
          )}
          {slotPickerIndex !== null && (() => {
            const fullBody = profilePhotos.filter((photo) => photo.label === "全身照");
            const isOutfitSlot = tryOnMode === "outfit";
            const candidates = isOutfitSlot ? fullBody : profilePhotos;
            return (
            <div className="mf-slot-picker" role="dialog" aria-label="从照片档案更换">
              <div className="mf-slot-picker-head">
                <b>更换{isOutfitSlot ? "全身照" : "正面照"}</b>
                <button onClick={() => setSlotPickerIndex(null)}>关闭</button>
              </div>
              {isOutfitSlot && !fullBody.length && (
                <p className="mf-slot-picker-hint">档案里还没有全身照。穿搭试穿不会使用半身照，请到「我的 → 管理照片」上传一张并将类型标记为“全身照”。</p>
              )}
              <div className="mf-slot-picker-grid">
                {candidates.map((photo) => (
                  <button
                    key={photo.id}
                    className={photos[0]?.archiveUrl === photo.url ? "active" : ""}
                    onClick={() => {
                      const next = [...photos];
                      next[0] = { archiveUrl: photo.url, preview: photo.url, label: photo.label };
                      setPhotos(next);
                      setSlotPickerIndex(null);
                    }}
                  >
                    <img src={photo.url} alt={photo.label || "档案照片"} />
                    <span>{photo.label || "未分类"}</span>
                  </button>
                ))}
              </div>
            </div>
            );
          })()}
          <div className="mf-panel">
            <div className="mf-panel-title">
              <b>{tryOnMode === "hair" ? `发型库 · ${hairInspirations.length} 款` : `穿搭库 · ${outfitInspirations.length} 套`}</b>
              {tryOnItems.length > 8 && (
                <span className="mf-library-actions">
                  <button type="button" disabled={busy} onClick={() => setLibraryExpanded((value) => !value)}>{libraryExpanded ? "收起" : "展开全部"}</button>
                  {!libraryExpanded && <button type="button" disabled={busy} onClick={() => setLibraryStart((value) => (value + 8) % tryOnItems.length)}>换一批</button>}
                </span>
              )}
            </div>
            <div className="mf-option-row mf-library-grid">
              {visibleLibraryItems.map((item, index) => {
                const absoluteIndex = libraryExpanded ? index : (libraryStart + index) % tryOnItems.length;
                const isSelected = selectedLibraryIndex === absoluteIndex;
                return (
                <button
                  key={`${item.id}-${absoluteIndex}`}
                  className={isSelected ? "selected" : ""}
                  disabled={busy}
                  onClick={() => tryOnMode === "hair" ? setSelectedHair(absoluteIndex) : setSelectedOutfit(absoluteIndex)}
                >
                  <img src={item.image} alt={item.name} />
                  <span>{item.name}</span>
                  {isSelected && (
                    <i>
                      <FaCheck />
                    </i>
                  )}
                </button>
                );
              })}
            </div>
            <div className="mf-switch-line">
              <span>保持脸部一致</span>
              <button
                type="button"
                className={`mf-switch ${faceLock ? "on" : ""}`}
                disabled={busy}
                onClick={() => setFaceLock(!faceLock)}
                aria-label="切换保持脸部一致"
              />
            </div>
            <div className="mf-switch-line">
              <span>真实质感</span>
              <button
                type="button"
                className={`mf-switch ${realistic ? "on" : ""}`}
                disabled={busy}
                onClick={() => setRealistic(!realistic)}
                aria-label="切换真实质感"
              />
            </div>
            {tryOnMode === "hair" && (
              <>
                <button
                  className="mf-reference mf-clothing-upload"
                  disabled={busy}
                  onClick={() => hairRef.current?.click()}
                >
                  <FaCloudUploadAlt />
                  <span>
                    {hairPhoto ? "已上传自定义发型图" : "上传自己想要的发型"}
                  </span>
                  <small>库里没有想要的款式？传一张参考图</small>
                  <FaChevronRight />
                </button>
                <input
                  ref={hairRef}
                  hidden
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
                      onNotice("请上传 5MB 以内的 JPG、PNG 或 WebP 图片");
                      return;
                    }
                    setHairPhoto({ file, preview: URL.createObjectURL(file) });
                    onNotice("自定义发型图已就绪，直接点生成");
                  }}
                />
              </>
            )}
            {tryOnMode === "outfit" && (
              <>
                <button
                  className="mf-reference mf-clothing-upload"
                  disabled={busy}
                  onClick={() => clothingRef.current?.click()}
                >
                  <FaCloudUploadAlt />
                  <span>
                    {clothingPhoto ? "已上传衣服图片" : "上传想试穿的衣服"}
                  </span>
                  <small>支持抖音商品截图</small>
                  <FaChevronRight />
                </button>
                <input
                  ref={clothingRef}
                  hidden
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (
                      !["image/jpeg", "image/png", "image/webp"].includes(
                        file.type,
                      )
                    ) {
                      onNotice("仅支持 JPG、PNG、WebP 图片");
                      return;
                    }
                    if (file.size > 5 * 1024 * 1024) {
                      onNotice("图片不能超过 5MB");
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () =>
                      setClothingPhoto({ file, preview: reader.result });
                    reader.readAsDataURL(file);
                  }}
                />
              </>
            )}
          </div>
          <div className="mf-tryon-actions">
            {tryOnMode === "outfit" && !profilePhotos.some((photo) => photo.label === "全身照") && (
              <p className="mf-tryon-requirement">穿搭试穿必须使用全身照，当前没有可用的全身照。</p>
            )}
            <button
              className="mf-secondary"
              disabled={busy}
              onClick={() =>
                tryOnMode === "hair"
                  ? setSelectedHair((selectedHair + 1) % tryOnItems.length)
                  : setSelectedOutfit((selectedOutfit + 1) % tryOnItems.length)
              }
            >
              <FaSyncAlt /> 换一个
            </button>
            <button
              className={`mf-primary ${busy || (tryOnMode === "outfit" && (!profilePhotos.some((photo) => photo.label === "全身照") || (!clothingPhoto && !outfitLibrary[selectedOutfit]))) ? "disabled" : ""}`}
              disabled={busy || (tryOnMode === "outfit" && (!profilePhotos.some((photo) => photo.label === "全身照") || (!clothingPhoto && !outfitLibrary[selectedOutfit])))}
              onClick={() =>
                onTryOnGenerate({
                  mode: tryOnMode,
                  garmentPhoto: clothingPhoto,
                  hairCustomPhoto: tryOnMode === "hair" ? hairPhoto : null,
                  hairName: tryOnMode === "hair" ? tryOnItems[selectedHair]?.name : undefined,
                  hairImage: tryOnMode === "hair" ? tryOnItems[selectedHair]?.image : undefined,
                  outfitImage: tryOnMode === "outfit" ? tryOnItems[selectedOutfit]?.image : undefined,
                  faceLock,
                  realistic,
                })
              }
            >
              {busy ? <><span className="mf-loading-spinner" aria-hidden="true" />正在生成{tryOnMode === "hair" ? "新发型" : "穿搭效果"}…</> : tryOnButtonLabel(tryOnMode, isLoggedIn)}
            </button>
            <small className="mf-tryon-cost-note">
              {tryOnMode === "outfit"
                ? "每次消耗 6 次生成额度，失败自动退回；必须使用全身照"
                : "标准发型试穿每次消耗 2 次生成额度，实际按会员档位计费，失败自动退回"}
            </small>
          </div>
        </>
      )}
    </section>
  );
}

function DisplayScreen({
  onBack,
  onGenerate,
  onPreviewGenerate,
  busy,
  busyKind,
  busyElapsedSeconds,
  onNotice,
  preview,
  initialScene = 0,
  diagnosis = null,
  profilePhotos = [],
  membership = "NONE",
  userCredits,
}) {
  // 参考来源二选一：template=模板库图片作主参考图；reference=用户上传目标照片。
  // 模板图/用户参考图负责场景、姿势、构图、光线；用户照片只管身份。
  const [tab, setTab] = useState("template");
  const [photos, setPhotos] = useState([
    ...(preview
      ? [
          { preview: images.lead, demo: true },
          { preview: images.leadAlt, demo: true },
          { preview: images.style, demo: true },
        ]
      : [null, null, null, null]),
  ]);
  const [scene, setScene] = useState(initialScene);
  const [sceneStart, setSceneStart] = useState(0);
  const [sceneExpanded, setSceneExpanded] = useState(false);
  const [profilePhotoStart, setProfilePhotoStart] = useState(0);
  // 动作微调：null=跟随模板/参考图（默认）；选中只改动作文字，不传动作图
  const [actionId, setActionId] = useState(null);
  const [mood, setMood] = useState("自然抓拍");
  const [background, setBackground] = useState("keep");
  const [customBackground, setCustomBackground] = useState("");
  const [outfit, setOutfit] = useState("adjust");
  const [customOutfit, setCustomOutfit] = useState("");
  const [ratio, setRatio] = useState("3:4");
  // 默认标准档 + 1 张：最低成本路径；高清/旗舰由用户主动选择
  const [count, setCount] = useState(1);
  const [similarity, setSimilarity] = useState(85);
  const [tier, setTier] = useState("standard");
  const [prompt, setPrompt] = useState("");
  const [referencePhoto, setReferencePhoto] = useState(null);
  const [referenceOutfit, setReferenceOutfit] = useState(null);
  const [profilePhotoSlot, setProfilePhotoSlot] = useState(0);
  const [profilePhotoExpanded, setProfilePhotoExpanded] = useState(false);
  const inputRef = useRef(null);
  const referenceRef = useRef(null);
  const referenceOutfitRef = useRef(null);
  const autoFilledRef = useRef(false);
  useEffect(() => {
    // 档案自动填位只在进入时做一次；用户手动清空后不再回填，否则参考位永远删不掉
    if (!preview && !autoFilledRef.current && !photos.some(hasPhotoInput) && (profilePhotos.length || diagnosis?.inputImage)) {
      autoFilledRef.current = true;
      const timer = window.setTimeout(() => {
        // 优先带入档案照片；没有档案时，直接沿用刚完成诊断的那张照片。
        if (profilePhotos.length) {
          const slotLabels = ["正面照", "侧脸照", "半身照", "全身照"];
          const used = new Set();
          setPhotos(slotLabels.map((label) => {
            const matched = profilePhotos.find((p) => p.label === label && !used.has(p.id));
            const photo = matched || profilePhotos.find((p) => !used.has(p.id));
            if (photo) used.add(photo.id);
            return photo ? { archiveUrl: photo.url, preview: photo.url, label: photo.label } : null;
          }));
        } else if (diagnosis?.inputImage) {
          setPhotos([{ archiveUrl: diagnosis.inputImage, preview: diagnosis.inputImage, label: "本次诊断正面照" }, null, null, null]);
        }
      }, 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [photos, preview, profilePhotos, diagnosis?.inputImage]);
  const uploadedCount = photos.filter(hasPhotoInput).length;
  const displayedCount = preview ? 3 : uploadedCount;
  // 我的参考图模式下必须先有参考图才能生成
  const canGenerate = preview || (photos.some(hasPhotoInput) && (tab === "template" || Boolean(referencePhoto)));
  const countOptions = tier === "standard" ? [1, 4, 6] : [1, 4, 6, 9];
  // 档位与会员等级绑定：NONE/STANDARD→标准档，HIGH→高清，FLAGSHIP→旗舰
  const tierOrder = ["standard", "high", "flagship"];
  const maxTier =
    membership === "FLAGSHIP" ? "flagship" : membership === "HIGH" ? "high" : "standard";
  // 费用与摘要一律按实际执行的档位算，杜绝"页面显示旗舰价、后台按标准档扣"的错位
  const effectiveTier = tierOrder.indexOf(tier) > tierOrder.indexOf(maxTier) ? maxTier : tier;
  const actions = compatibleActions(scenes[scene]?.name);
  const summary = summarizeDraft({
    mode: tab === "reference" ? "reference" : "template",
    templateName: scenes[scene]?.name,
    hasReference: tab === "template" || Boolean(referencePhoto),
    hasReferenceOutfit: Boolean(referenceOutfit),
    personLabels: photos
      .map((photo, index) => (photo ? ["正面照", "侧脸照", "半身照", "全身照"][index] : null))
      .filter(Boolean),
    actionName: actionId ? actionNameById(actionId) : null,
    background,
    outfit,
    ratio,
    count,
    tier: effectiveTier,
    cost: count * ({ standard: 2, high: 4, flagship: 6 }[effectiveTier] || 2),
  });
  const sceneChoices = sceneExpanded ? scenes : scenes.slice(sceneStart, sceneStart + 4);
  function addPhoto(file, index) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      onNotice("仅支持 JPG、PNG、WebP 图片");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      onNotice("图片不能超过 5MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const next = [...photos];
      next[index] = { file, preview: reader.result };
      setPhotos(next);
    };
    reader.readAsDataURL(file);
  }
  function selectProfilePhoto(photo) {
    const next = [...photos];
    next[profilePhotoSlot] = { archiveUrl: photo.url, preview: photo.url, label: photo.label };
    setPhotos(next);
    onNotice(`已放入${["主参考 · 正面照", "辅助 · 侧脸照", "辅助 · 半身照", "辅助 · 全身照"][profilePhotoSlot]}`);
  }
  const visibleProfilePhotos = profilePhotoExpanded ? profilePhotos : profilePhotos.slice(profilePhotoStart, profilePhotoStart + 4);
  const selectedProfileSummary = photos
    .map((photo, index) => photo ? `${["正面照", "侧脸照", "半身照", "全身照"][index] || "照片"} · ${photo.label || (photo.archiveUrl ? "档案照片" : "本次上传")}` : null)
    .filter(Boolean);
  const diagnosisStyleNote = [
    diagnosis?.styles?.[0]?.name,
    diagnosis?.hairstyles?.[0]?.name ? `发型方向：${diagnosis.hairstyles[0].name}` : "",
    diagnosis?.outfits?.[0]?.items ? `穿搭方向：${diagnosis.outfits[0].items}` : "",
    diagnosis?.scoreReasons?.camera?.opportunity
      ? `拍摄建议：${diagnosis.scoreReasons.camera.opportunity}`
      : diagnosis?.camera ? `拍摄建议：${diagnosis.camera}` : "",
  ].filter(Boolean).join("；");
  // 动作微调面板：模板/参考图两种模式共用；默认跟随参考图，选中只改动作文字
  const actionPanel = (
    <div className="mf-panel">
      <div className="mf-panel-title">
        <b>动作（可选）</b>
        <span>{actionId ? "已微调" : "跟随参考图"}</span>
      </div>
      <p className="mf-field-hint">默认跟着模板/参考图里的动作走；想换就点一个，只改动作，不改场景。</p>
      <div className="mf-chip-row">
        <button className={actionId === null ? "selected" : ""} onClick={() => setActionId(null)}>跟随参考图</button>
        {actions.map((item) => (
          <button
            key={item.id}
            className={actionId === item.id ? "selected" : ""}
            onClick={() => setActionId(actionId === item.id ? null : item.id)}
          >
            {item.name}
          </button>
        ))}
      </div>
    </div>
  );
  // 参考衣服面板：模板/参考图两种模式共用；上传后画面中的人物会换上这件衣服
  const outfitPanel = (
    <div className="mf-panel">
      <div className="mf-panel-title">
        <b>参考衣服（可选）</b>
        <span>{referenceOutfit ? "已上传" : "上传即生效"}</span>
      </div>
      <button
        className={`mf-reference ${referenceOutfit ? "has-preview" : ""}`}
        onClick={() => referenceOutfitRef.current?.click()}
      >
        {referenceOutfit?.preview ? (
          <img src={referenceOutfit.preview} alt="已上传参考衣服" />
        ) : (
          <FaTshirt />
        )}
        <span>
          {referenceOutfit
            ? "已上传参考衣服"
            : "上传你想穿的衣服"}
        </span>
        <small>{referenceOutfit ? "点击可重新上传" : "拍张衣服照：画面中的人物会换成这件衣服"}</small>
        <FaChevronRight />
      </button>
      <p className="mf-field-hint">不上传就按模板/参考图的服装生成；上传后画面中的人物会换上这件衣服。</p>
      <input
        ref={referenceOutfitRef}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
            onNotice("仅支持 JPG、PNG、WebP 图片");
            return;
          }
          if (file.size > 5 * 1024 * 1024) {
            onNotice("图片不能超过 5MB");
            return;
          }
          const reader = new FileReader();
          reader.onload = () => setReferenceOutfit({ file, preview: reader.result });
          reader.readAsDataURL(file);
        }}
      />
    </div>
  );
  return (
    <section className="mf-screen mf-display-screen" aria-busy={busy}>
      <div className="mf-display-header">
        <button onClick={onBack} aria-label="返回" disabled={busy}>
          <FaArrowLeft />
        </button>
        <b>生活展示面</b>
      </div>
      {diagnosisStyleNote && (
        <div className="mf-display-diagnosis-bridge">
          <span>PERSONAL STYLE BRIEF</span>
          <b>已带入本次形象报告建议</b>
          <p>{diagnosisStyleNote}</p>
          <small>生成展示面时会一并参考这些方向；你仍可在下方自行调整。</small>
        </div>
      )}
      <div className="mf-segment mf-main-segment">
        <button
          className={tab === "template" ? "active" : ""}
          onClick={() => setTab("template")}
        >
          用模板生成
        </button>
        <button
          className={tab === "reference" ? "active" : ""}
          onClick={() => setTab("reference")}
        >
          按我的参考图
        </button>
      </div>
      <div className="mf-panel mf-identity-panel">
        <div className="mf-panel-title">
          <b>本次人物参考（{displayedCount}/4）</b>
          <span>第一张是主参考</span>
        </div>
        <p className="mf-profile-photo-note">第一张（正面照）是身份主参考，后面三张帮助 AI 保持一致；只放一张也能生成。点空格可直接上传，或在下方档案里挑照片填入。</p>
        <div className="mf-identity-row">
          {[0, 1, 2, 3].map((index) => (
            <button
              key={index}
              className={`${index === 0 ? "mf-ref-main" : "mf-ref-aux"} ${photos[index] ? "filled" : ""}`}
              onClick={() => {
                setProfilePhotoSlot(index);
                inputRef.current.dataset.index = index;
                inputRef.current.click();
              }}
            >
              {photos[index] ? (
                <img src={photos[index].preview} alt={["主参考 · 正面", "辅助 · 侧脸", "辅助 · 半身", "辅助 · 全身"][index]} />
              ) : (
                <>
                  <FaCloudUploadAlt />
                  <span>{["主参考 · 正面照", "辅助 · 侧脸", "辅助 · 半身", "辅助 · 全身"][index]}</span>
                </>
              )}
              {photos[index] && (
                <span
                  role="button"
                  tabIndex={0}
                  className="mf-ref-remove"
                  aria-label={`移除${["主参考正面照", "侧脸照", "半身照", "全身照"][index]}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPhotos((current) => current.map((item, i) => (i === index ? null : item)));
                    onNotice("已移除该参考照片，可重新上传或从档案再选一张");
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    event.stopPropagation();
                    setPhotos((current) => current.map((item, i) => (i === index ? null : item)));
                    onNotice("已移除该参考照片，可重新上传或从档案再选一张");
                  }}
                >
                  ×
                </span>
              )}
              {index === 0 && <em className="mf-ref-main-badge">主参考</em>}
            </button>
          ))}
        </div>
        {profilePhotos.length > 0 && (
          <div className="mf-profile-photo-picker">
            <div><b>从照片档案填入</b><span className="mf-profile-photo-actions">{profilePhotos.length > 4 && <><button onClick={() => setProfilePhotoExpanded((value) => !value)}>{profilePhotoExpanded ? "收起" : "展开全部"}</button><button onClick={() => setProfilePhotoStart((value) => (value + 4) % profilePhotos.length)}>换一批</button></>}</span></div>
            <p className="mf-profile-photo-note">先在上方点选要填的参考位，再点下面的照片；带“本次使用”标记的都会作为人物参考。人物照片只管脸，画面效果由模板/参考图决定。</p>
            {selectedProfileSummary.length > 0 && <div className="mf-profile-photo-current"><b>本次生成将使用</b><span>{selectedProfileSummary.join(" · ")}</span></div>}
            <div className="mf-profile-photo-slots">{["主参考 · 正面", "辅助 · 侧脸", "辅助 · 半身", "辅助 · 全身"].map((label, index) => <button className={profilePhotoSlot === index ? "active" : ""} key={label} onClick={() => setProfilePhotoSlot(index)}>{label}</button>)}</div>
            <div className="mf-profile-photo-grid">{visibleProfilePhotos.map((photo) => <button className={photos.some((item) => item?.archiveUrl === photo.url) ? "selected" : ""} key={photo.id} onClick={() => selectProfilePhoto(photo)}><img src={photo.url} alt={photo.label} /><span>{photo.label || "未分类"}</span>{photos.some((item) => item?.archiveUrl === photo.url) && <em>本次使用</em>}</button>)}</div>
          </div>
        )}

        <input
          ref={inputRef}
          hidden
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) =>
            addPhoto(
              event.target.files?.[0],
              Number(event.target.dataset.index || 0),
            )
          }
        />
      </div>
      {tab === "template" ? (
        <>
          <div className="mf-panel">
            <div className="mf-panel-title">
              <b>模板库</b>
              <button
                onClick={() =>
                  setSceneStart((current) => (current + 4) % scenes.length)
                }
              >
                换一批 <FaSyncAlt />
              </button>
              <button onClick={() => setSceneExpanded((current) => !current)}>{sceneExpanded ? "收起" : "查看全部"}</button>
            </div>
            <p className="mf-field-hint">选中哪张，就按哪张生成：场景、姿势、构图和光线都跟随模板图片，AI 把画面里的人物换成你。</p>
            <div className="mf-scene-grid">
              {sceneChoices.map((item) => {
                const index = scenes.indexOf(item);
                return (
                <button
                  key={item.id}
                  className={scene === index ? "selected" : ""}
                  onClick={() => setScene(index)}
                >
                  <img src={item.image} alt={item.name} />
                  <span>{item.name}</span>
                  {scene === index && (
                    <i>
                      <FaCheck />
                    </i>
                  )}
                </button>
                );
              })}
            </div>
          </div>
          {actionPanel}
          {outfitPanel}
        </>
      ) : (
        <>
          <div className="mf-panel">
            <div className="mf-panel-title">
              <b>我的参考图</b>
              <span>{referencePhoto ? "已上传" : "待上传"}</span>
            </div>
            <button
              className={`mf-reference ${referencePhoto ? "has-preview" : ""}`}
              onClick={() => referenceRef.current?.click()}
            >
              {referencePhoto?.preview ? (
                <img src={referencePhoto.preview} alt="已上传展示面参考图" />
              ) : (
                <FaImage />
              )}
              <span>
                {referencePhoto
                  ? "已上传展示面参考图"
                  : "上传你喜欢的照片当参考"}
              </span>
              <small>{referencePhoto ? "点击可重新上传参考图" : "把你放进这张画面：场景、姿势、构图都跟着它走"}</small>
              <FaChevronRight />
            </button>
            <p className="mf-field-hint">生成时只替换画面里的人物，长相和穿着不会带进你的成片。</p>
            <input
              ref={referenceRef}
              hidden
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (
                  !["image/jpeg", "image/png", "image/webp"].includes(file.type)
                ) {
                  onNotice("仅支持 JPG、PNG、WebP 图片");
                  return;
                }
                if (file.size > 5 * 1024 * 1024) {
                  onNotice("图片不能超过 5MB");
                  return;
                }
                const reader = new FileReader();
                reader.onload = () =>
                  setReferencePhoto({ file, preview: reader.result });
                reader.readAsDataURL(file);
              }}
            />
          </div>
          {outfitPanel}
          <div className="mf-panel">
            <div className="mf-panel-title">
              <b>画面怎么调整</b>
              <span>可选</span>
            </div>
            <div className="mf-setting-line">
              <span>背景</span>
              <div className="mf-chip-row">
                {BACKGROUND_OPTIONS.map((item) => (
                  <button
                    key={item.value}
                    className={background === item.value ? "selected" : ""}
                    onClick={() => setBackground(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            {background === "custom" && (
              <div className="mf-option-input">
                <textarea
                  value={customBackground}
                  onChange={(event) => setCustomBackground(event.target.value)}
                  placeholder="例：换成夜晚的便利店门口"
                />
              </div>
            )}
            <div className="mf-setting-line">
              <span>服装</span>
              <div className="mf-chip-row">
                {OUTFIT_OPTIONS.map((item) => (
                  <button
                    key={item.value}
                    className={outfit === item.value ? "selected" : ""}
                    onClick={() => setOutfit(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            {outfit === "custom" && (
              <div className="mf-option-input">
                <textarea
                  value={customOutfit}
                  onChange={(event) => setCustomOutfit(event.target.value)}
                  placeholder="例：换成黑色大衣的简约风格"
                />
              </div>
            )}
            <p className="mf-field-hint">不选就按默认来：背景保持参考图，服装微调到适合你。</p>
          </div>
          {actionPanel}
          <div className="mf-panel mf-prompt-panel">
            <div className="mf-panel-title">
              <b>补充描述</b>
              <span>可选</span>
            </div>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="例：周六下午在便利店买饮料，朋友抓拍，自然松弛，不看镜头"
            />
            <div className="mf-chip-row">
              {["河边随手拍", "窗边阅读", "夜晚便利店"].map((item) => (
                <button key={item} onClick={() => setPrompt(item)}>
                  {item}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <div className="mf-panel mf-settings">
        <div className="mf-panel-title">
          <b>生成设置</b>
          <span>保持真实感</span>
        </div>
        <div className="mf-setting-line">
          <span>风格偏好</span>
          <div className="mf-chip-row">
            {["自然抓拍", "松弛感", "氛围感"].map((item) => (
              <button
                key={item}
                className={mood === item ? "selected" : ""}
                onClick={() => setMood(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="mf-setting-line">
          <span>成片比例</span>
          <select
            className="mf-select"
            value={ratio}
            onChange={(event) => setRatio(event.target.value)}
            aria-label="选择画面比例"
          >
            {["3:4", "4:3", "9:16"].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <div className="mf-setting-line">
          <span>
            生成数量 <em>{count} 张</em>
          </span>
          <div className="mf-chip-row">
            {countOptions.map((item) => (
              <button
                key={item}
                className={count === item ? "selected" : ""}
                onClick={() => setCount(item)}
              >
                {item} 张
              </button>
            ))}
          </div>
        </div>
        <p className="mf-field-hint">选 1 张先看效果；选 4/6/9 张可批量生成同一风格下的不同动作、构图和细节。</p>
        <div className="mf-setting-line">
          <span>生成档位</span>
          <div className="mf-chip-row">
            {[
              { value: "standard", label: "小帅档" },
              { value: "high", label: "大帅档" },
              { value: "flagship", label: "顶帅档" },
            ].map((item) => {
              const locked = tierOrder.indexOf(item.value) > tierOrder.indexOf(maxTier);
              return (
                <button
                  key={item.value}
                  type="button"
                  className={tier === item.value ? "selected" : ""}
                  style={locked ? { opacity: 0.45 } : undefined}
                  aria-disabled={locked}
                  title={locked ? "开通对应套餐后解锁" : undefined}
                  onClick={() => {
                    if (locked) {
                      const planName = item.value === "flagship" ? "旗舰卡" : "标准卡";
                      onNotice(`${item.label}需要开通${planName}`, {
                        actionLabel: "去充值",
                        onAction: () => window.location.assign("/pricing"),
                      });
                      return;
                    }
                    setTier(item.value);
                    if (item.value === "standard" && count === 9) setCount(6);
                  }}
                >
                  {item.label}
                  {locked ? " 🔒" : ""}
                </button>
              );
            })}
          </div>
        </div>
        <RangeLine
          label="人物相似度"
          value={similarity}
          onChange={setSimilarity}
        />
        <p className="mf-slider-hint">越高越像你本人，越低越接近参考姿势 · 建议 80—90</p>
      </div>
      <div className="mf-generate-summary">
        <div className="mf-panel-title">
          <b>生成前确认</b>
        </div>
        <p>{summary.source}</p>
        <p>{summary.action} · {summary.background} · {summary.outfit}</p>
        <p>{summary.people}</p>
        <p>{summary.settings}</p>
      </div>
      <p className="mf-generate-cost">
        本次将消耗 <b>{count * ({ standard: 2, high: 4, flagship: 6 }[effectiveTier] || 2)}</b> 次生成额度（{tier === "flagship" ? "顶帅档" : tier === "high" ? "大帅档" : "小帅档"} · {({ standard: 2, high: 4, flagship: 6 })[effectiveTier]} 次/张{count > 1 ? ` × ${count} 张` : ""}）
        {" · 失败自动退回"}
      </p>
      {busy && busyKind === "display" && (
        <AIWorkStatus
          type="display"
          primaryImage={photos.find(hasPhotoInput)?.preview || ""}
          secondaryImage={tab === "reference" ? referencePhoto?.preview : scenes[scene]?.image}
          selectedLabel={tab === "reference" ? "自选参考画面" : scenes[scene]?.name}
          elapsedSeconds={busyElapsedSeconds}
        />
      )}
      <button
        className={`mf-primary ${busy || !canGenerate ? "disabled" : ""}`}
        disabled={busy || !canGenerate}
        onClick={() =>
          preview
            ? onPreviewGenerate()
            : onGenerate({
                personPhotos: photos,
                mode: tab === "reference" ? "reference" : "template",
                referencePhoto,
                referenceOutfit,
                sceneIndex: scene,
                reportAdvice: diagnosisStyleNote,
                scene: scenes[scene]?.name,
                actionId,
                background,
                customBackground,
                outfit,
                customOutfit,
                mood,
                ratio,
                count,
                similarity,
                tier,
                prompt,
              })
        }
      >
        {busy ? <><span className="mf-loading-spinner" aria-hidden="true" />正在生成你的展示面…</> : <>开始生成</>}
      </button>
    </section>
  );
}

function ResultScreen({
  images: output,
  draft,
  generationId,
  onBack,
  onNotice,
  creationRecords = [],
  onGoToRecords,
}) {
  const [selected, setSelected] = useState(0);
  const [liked, setLiked] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const gallery = output?.length ? output : [];
  const selectedImage = gallery[selected] || gallery[0] || null;
  const sceneLabel = draft?.mode === "reference"
    ? "我的参考图"
    : draft?.scene || "生活展示面";

  function save() {
    onNotice(
      generationId
        ? "生成记录已自动保存到我的作品"
        : "请先完成真实生成后再保存",
    );
  }

  async function download() {
    if (!generationId) {
      onNotice("当前没有可下载的真实生成记录");
      return;
    }
    setDownloadBusy(true);
    try {
      const response = await fetch(
        `/api/download?id=${encodeURIComponent(generationId)}&index=${selected}`,
      );
      if (!response.ok) throw new Error("下载失败");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `型男制造机展示面-${selected + 1}.png`;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      onNotice("图片已准备下载");
    } catch {
      onNotice("下载失败，请长按图片保存或稍后重试");
    } finally {
      setDownloadBusy(false);
    }
  }

  async function share() {
    const shareUrl = generationId
      ? `${window.location.origin}/?generation=${encodeURIComponent(generationId)}`
      : window.location.href;
    try {
      if (navigator.share)
        await navigator.share({
          title: "我的展示面",
          text: "看看我的新展示面",
          url: shareUrl,
        });
      else await navigator.clipboard.writeText(shareUrl);
      onNotice("分享内容已准备好");
    } catch {
      onNotice("分享已取消");
    }
  }

  return (
    <section className="mf-screen mf-result-screen">
      <div className="mf-result-header">
        <button onClick={onBack}>
          <FaArrowLeft />
        </button>
        <div>
          <b>本次生成</b>
          <small>{sceneLabel}</small>
        </div>
        <button className="mf-result-count" onClick={() => setLiked(!liked)}>
          已选{selected + 1}张{liked ? " · 已收藏" : ""}
        </button>
      </div>
      {selectedImage && (
        <div className="mf-result-hero">
          <img src={selectedImage} alt={`展示面主图 ${selected + 1}`} />
        </div>
      )}
      {gallery.length > 1 && (
        <div className={`mf-result-grid count-${Math.min(gallery.length, 6)}`}>
          {gallery.map((src, index) => (
            <button
              key={`${src}-${index}`}
              className={selected === index ? "selected" : ""}
              onClick={() => setSelected(index)}
            >
              <img src={src} alt={`展示面结果 ${index + 1}`} />
              {selected === index && (
                <i>
                  <FaCheck />
                </i>
              )}
            </button>
          ))}
        </div>
      )}
      <div className="mf-result-copy">
        <span>生活展示面</span>
        <b>{sceneLabel}</b>
        <small>保留你的面部特征，按参考画面生成自然生活感照片。</small>
      </div>
      <p className="mf-result-keep-hint">
        已保存到「我的 → 生成记录」，点「查看历史」就能看到。
      </p>
      <div className="mf-result-actions">
        <button onClick={save}>
          <FaHeart />
          保存
        </button>
        <button onClick={download} disabled={downloadBusy}>
          <FaDownload />
          {downloadBusy ? "准备下载…" : "下载"}
        </button>
        <button onClick={share}>
          <FaShareAlt />
          分享
        </button>
        <button onClick={onBack}>
          <FaSyncAlt />
          重新生成
        </button>
      </div>
      <div className="mf-result-cta-row">
        <button className="primary" onClick={onBack}>
          继续生成同风格 <FaChevronRight />
        </button>
        {onGoToRecords && creationRecords.length > 0 && (
          <button className="mf-result-history-btn" onClick={onGoToRecords}>
            查看历史 <FaHistory />
          </button>
        )}
        <button
          onClick={() => window.location.assign("/services#service-showcase")}
          className="gold"
        >
          获取完整改造方案 <FaChevronRight />
        </button>
      </div>
      <div className="mf-training-card">
        <FaMagic />
        <div>
          <b>7 天展示面训练营</b>
          <small>每天 15 分钟，打造高质量个人展示面</small>
        </div>
        <img src={images.style} alt="训练营示例" />
        <button onClick={() => window.location.assign("/services#service-training")}>查看启动营</button>
      </div>
    </section>
  );
}

function PhotoLibraryScreen({ profilePhotos = [], setProfilePhotos, pendingFeature = "", onNotice, onBack, onPhotosSaved }) {
  const photoRef = useRef(null);
  const [uploadLabel, setUploadLabel] = useState("正面照");
  const [isUploading, setIsUploading] = useState(false);
  const isDiagnosisEntry = pendingFeature === "makeover";
  const photoHints = {
    正面照: "正脸清晰、无遮挡 · 光线均匀",
    侧脸照: "侧脸轮廓清晰，不要遮挡",
    半身照: "从头部到腰部清晰入镜",
    全身照: "从头到脚完整入镜",
  };
  async function addProfilePhoto(file) {
    if (!file || isUploading) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) return onNotice("请上传 5MB 以内的 JPG、PNG 或 WebP 图片");
    setIsUploading(true);
    let savedPhoto = null;
    try {
      const form = new FormData(); form.append("file", file); form.append("purpose", "profile");
      const upload = await fetch("/api/upload", { method: "POST", body: form }); const uploadData = await upload.json();
      if (!upload.ok) throw new Error(uploadData.error || "上传失败");
      const save = await fetch("/api/photos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: uploadData.url, label: uploadLabel }) }); const photo = await save.json();
      if (!save.ok) throw new Error(photo.error || "保存失败");
      setProfilePhotos((current) => [photo, ...current]); onNotice("照片已保存到我的档案"); savedPhoto = photo;
    } catch (error) { onNotice(error.message || "照片保存失败"); }
    finally { setIsUploading(false); }
    if (savedPhoto) onPhotosSaved?.(savedPhoto);
  }
  async function removeProfilePhoto(photo) {
    const response = await fetch("/api/photos", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: photo.id }) });
    if (response.ok) { setProfilePhotos((current) => current.filter((item) => item.id !== photo.id)); onNotice("照片已删除"); }
  }
  return <section className="mf-screen mf-profile-screen">
    <div className="mf-profile-header">
      <button aria-label="返回" onClick={onBack}><FaArrowLeft /></button>
      <div>
        <span>{isDiagnosisEntry ? "DIAGNOSIS · STEP 01" : "MY PHOTO LIBRARY"}</span>
        <h1>照片档案</h1>
      </div>
      <span aria-hidden="true" />
    </div>
    <p className="mf-photo-library-intro">
      {isDiagnosisEntry
        ? "诊断只需一张正面照；侧脸、半身和全身照可按需保存。"
        : "保存你自己的照片，诊断、试穿和生活展示面都可以直接调用。"}
    </p>
    {isDiagnosisEntry && (
      <div className="mf-photo-task" role="status">
        <div className="mf-photo-task-title">
          <i><FaMagic /></i>
          <div><small>形象诊断 · 准备 1/2</small><b>先上传一张正面照</b></div>
        </div>
        <div className="mf-photo-task-steps">
          <span className="active"><b>01</b>上传照片</span><i /><span><b>02</b>开始诊断</span>
        </div>
        <p>正面照保存后会自动回到诊断页；侧脸、半身和全身照可按需选择并保存在档案里。</p>
      </div>
    )}
    <div className={`mf-photo-label-picker${isDiagnosisEntry ? " is-diagnosis" : ""}`}>
      <div className="mf-photo-label-heading">
        <b>上传照片类型</b>
        {isDiagnosisEntry && <small>正面照为诊断必需，其余可选</small>}
      </div>
      {[["正面照", "必需"], ["侧脸照", "可选"], ["半身照", "可选"], ["全身照", "可选"]].map(([label, requirement]) => (
        <button className={uploadLabel === label ? "active" : ""} key={label} disabled={isUploading} onClick={() => setUploadLabel(label)}>
          <span>{label}</span>{isDiagnosisEntry && <small>{requirement}</small>}
        </button>
      ))}
    </div>
    <div className={`mf-photo-library mf-photo-library-page${profilePhotos.length ? "" : " is-empty"}`}>
      {profilePhotos.map((photo) => (
        <div className="mf-photo-library-item" key={photo.id}>
          <img src={photo.url} alt={photo.label} />
          <small>{photo.label}</small>
          <button disabled={isUploading} onClick={() => removeProfilePhoto(photo)}>删除</button>
        </div>
      ))}
      <button
        className={`mf-photo-library-add${profilePhotos.length ? "" : " is-empty"}${isDiagnosisEntry ? " is-diagnosis" : ""}`}
        disabled={isUploading}
        onClick={() => photoRef.current?.click()}
      >
        {isUploading ? <span className="mf-photo-upload-spinner" aria-hidden="true" /> : profilePhotos.length > 0 && !isDiagnosisEntry ? "＋" : <FaCloudUploadAlt aria-hidden="true" />}
        <span>{isUploading ? "正在上传并保存…" : isDiagnosisEntry ? `选择${uploadLabel}` : profilePhotos.length ? "上传照片" : `上传第一张${uploadLabel}`}</span>
        {!isUploading && !profilePhotos.length && <small>{photoHints[uploadLabel] || photoHints["正面照"]}{isDiagnosisEntry ? "" : " · JPG / PNG / WebP · 5MB 以内"}</small>}
        {!isUploading && !profilePhotos.length && isDiagnosisEntry && <em>JPG / PNG / WebP · 5MB 以内</em>}
      </button>
    </div>
    {isDiagnosisEntry && (
      <div className="mf-photo-tips">
        <div className="mf-photo-tips-head"><b><FaLightbulb /> 拍摄小贴士</b><small>让分析更贴近本人</small></div>
        <div className="mf-photo-tips-grid">
          <div><FaCheck /><span><b>正脸清晰</b><small>眉眼和轮廓可见</small></span></div>
          <div><FaCheck /><span><b>光线均匀</b><small>避免逆光和过曝</small></span></div>
          <div><FaCheck /><span><b>自然状态</b><small>摘下帽子和墨镜</small></span></div>
        </div>
      </div>
    )}
    {isDiagnosisEntry && (
      <p className="mf-photo-trust-note"><FaLock /> 照片会保存在个人档案；开始诊断后将发送给 AI 服务分析。<a href="/privacy">隐私说明</a></p>
    )}
    <input
      ref={photoRef}
      hidden
      type="file"
      accept="image/jpeg,image/png,image/webp"
      disabled={isUploading}
      onChange={(event) => {
        const input = event.currentTarget;
        addProfilePhoto(input.files?.[0]).finally(() => { input.value = ""; });
      }}
    />
  </section>;
}

function ProfileScreen({ user, creationRecords = [], profilePhotoCount = 0, onNotice, onOpenPhotos, onOpenPricing, onUserUpdated, pendingFeature = "", onClearPendingFeature, onInviteCenter, subsiteCenter = null, onOpenSubsite, onOpenRecord, onForceOpenTool }) {
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);
  const [activeTool, setActiveTool] = useState(onForceOpenTool || "");
  const [redeemInput, setRedeemInput] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  useEffect(() => {
    if (!onForceOpenTool) return undefined;
    const frame = window.requestAnimationFrame(() => setActiveTool(onForceOpenTool));
    return () => window.cancelAnimationFrame(frame);
  }, [onForceOpenTool]);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [diagnosisCount, setDiagnosisCount] = useState(0);
  const [orders, setOrders] = useState([]);
  const displayName = user?.name || "未登录访客";
  const hasCredits = Number.isFinite(user?.credits);
  const membership = membershipCopy(user);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      fetch("/api/orders").then((response) => (response.ok ? response.json() : [])),
      fetch("/api/diagnose").then((response) => (response.ok ? response.json() : [])),
    ])
      .then(([orderData, diagnosisData]) => {
        setOrders(Array.isArray(orderData) ? orderData : []);
        setDiagnosisCount(Array.isArray(diagnosisData?.data) ? diagnosisData.data.length : Array.isArray(diagnosisData) ? diagnosisData.length : 0);
      })
      .catch(() => {
        setOrders([]);
        setDiagnosisCount(0);
      });
  }, [user]);

  async function exportData() {
    try {
      const response = await fetch("/api/data-export");
      if (!response.ok) throw new Error("数据导出失败，请稍后重试");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "型男制造机-我的数据.json";
      anchor.click();
      URL.revokeObjectURL(url);
      onNotice("数据导出已开始");
    } catch (error) {
      onNotice(error.message || "数据导出失败");
    }
  }

  async function saveProfile() {
    const name = nameInput.trim();
    if (!name) return onNotice("请输入昵称");
    setSaving(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "资料保存失败");
      onUserUpdated?.(data);
      setEditing(false);
      onNotice("资料已保存");
    } catch (error) {
      onNotice(error.message || "资料保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function submitRedeemCode(event) {
    event.preventDefault();
    if (!user) {
      window.location.assign("/login?callbackUrl=%2F");
      return;
    }
    const code = redeemInput.trim().toUpperCase();
    if (!code) return onNotice("请输入兑换码");
    setRedeeming(true);
    try {
      const response = await fetch("/api/redeem-codes/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "兑换失败，请稍后重试");
      onUserUpdated?.({ ...user, ...payload.data.user });
      setRedeemInput("");
      const { plan } = payload.data;
      const rewards = [
        plan.membershipDays > 0 ? `会员有效期增加 ${plan.membershipDays} 天` : "",
        plan.credits > 0 ? `增加 ${plan.credits} 次生成额度` : "",
      ].filter(Boolean).join("，");
      onNotice(`兑换成功：${plan.name}${rewards ? `，${rewards}` : ""}`);
    } catch (error) {
      onNotice(error.message || "兑换失败，请稍后重试");
    } finally {
      setRedeeming(false);
    }
  }

  const toolIcons = { "照片档案": <FaUser />, "生成记录": <FaImage />, "购买记录": <FaBars />, "兑换码": <FaTicketAlt /> };
  const featureNames = { makeover: "变帅改造", display: "生活展示面" };
  return (
    <section className="mf-screen mf-profile-screen">
      {pendingFeature && (
        <div className="mf-pending-banner" role="status">
          <div className="mf-pending-banner-content">
            <FaImage />
            <div>
              <b>上传照片后即可开始{featureNames[pendingFeature] || "功能"}</b>
              <small>先建立你的专属照片档案，诊断、试穿和展示面都可以直接调用</small>
            </div>
          </div>
          <div className="mf-pending-banner-actions">
            <button className="mf-pending-banner-primary" onClick={onOpenPhotos}>立即上传</button>
            <button className="mf-pending-banner-close" aria-label="关闭提示" onClick={onClearPendingFeature}>×</button>
          </div>
        </div>
      )}
      <div className="mf-profile-header">
        <div>
          <h1>我的</h1>
        </div>
        <button aria-label="设置" onClick={() => onNotice("设置功能正在完善") }><FaBars /></button>
      </div>
      <div className="mf-account-card">
        <div className="mf-profile-avatar">
          <img src={user?.image || "/mf-ui-mobile-v3/reference-profile/avatar.png"} alt="头像" />
        </div>
        <div className="mf-account-copy">
          <b>{displayName}</b>
          <small>我的风格：清爽干净 / 都市休闲</small>
          {editing ? (
            <div className="mf-inline-edit"><input value={nameInput} maxLength={30} onChange={(event) => setNameInput(event.target.value)} aria-label="昵称" /><button onClick={saveProfile} disabled={saving}>{saving ? "保存中" : "保存"}</button><button onClick={() => setEditing(false)}>取消</button></div>
          ) : (
            <button onClick={() => user ? setEditing(true) : window.location.assign("/login?callbackUrl=%2F")}>编辑资料 <FaChevronRight /></button>
          )}
        </div>
      </div>
      <div className="mf-membership-card">
        <div><span>{membership.title}</span><small>AI 形象方案会员</small><small>{membership.subtitle}</small></div>
        <div className="mf-membership-credits">
          <b>剩余 <strong>{hasCredits ? user.credits : "—"}</strong> 次</b>
          {!hasCredits && <small>登录后同步</small>}
        </div>
        <button
          onClick={() =>
            user
              ? onOpenPricing()
              : window.location.assign("/login?callbackUrl=%2F")
          }
        >
          {user ? "续费 / 获取次数" : "登录 / 注册"}
        </button>
      </div>
      <button className="mf-invite-banner" onClick={onInviteCenter || (() => {})}>
        <span className="mf-invite-banner-icon">⚔</span>
        <span style={{ flex: 1, minWidth: 0 }}><b>推广中心 · 分享赚次数</b><small>兄弟注册多得 4 次 · TA 付费你最高赚 20 次</small></span>
        <FaChevronRight />
      </button>
      {subsiteCenter?.subsite && (
        <button className="mf-invite-banner mf-subsite-banner" onClick={onOpenSubsite || (() => {})}>
          <span className="mf-invite-banner-icon">◈</span>
          <span style={{ flex: 1, minWidth: 0 }}><b>分站中心 · 我的代理站</b><small>{subsiteCenter.subsite.siteName || subsiteCenter.subsite.slug || "我的分站"} · 余额 {Number.isFinite(subsiteCenter.credits) ? subsiteCenter.credits : "—"} 积分</small></span>
          <FaChevronRight />
        </button>
      )}
      <button className="mf-invite-banner" onClick={() => window.location.assign("/partner")}>
        <span className="mf-invite-banner-icon">🤝</span>
        <span style={{ flex: 1, minWidth: 0 }}><b>商务合作 · 男性情感赛道计划</b><small>AI 写真蓝海项目 · 区域合伙人限量招募</small></span>
        <FaChevronRight />
      </button>
      <div className="mf-profile-section-head"><b>我的工具</b></div>
      <div className="mf-tools-grid">
        {profileToolNames().map((item) => (
          <button key={item} onClick={() => item === "照片档案" ? onOpenPhotos() : setActiveTool((current) => current === item ? "" : item)}>
            <span>{toolIcons[item]}</span>
            <b>{item}</b>
          </button>
        ))}
      </div>
            {activeTool === "生成记录" && <div className="mf-profile-data-panel"><b>真实生成记录</b>{creationRecords.length ? <ul className="mf-record-list">{creationRecords.map((record) => {
                const imgs = Array.isArray(record.outputImages) ? record.outputImages.filter((u) => typeof u === "string" && u.trim()) : [];
                const statusLabel = record.status === "completed" ? "已完成" : record.status === "failed" ? "失败" : "处理中";
                const dateStr = new Date(record.createdAt).toLocaleDateString("zh-CN");
                const isDone = record.status === "completed" && imgs.length > 0;
                return (
                  <li key={record.id}>
                    {isDone ? (
                      <button type="button" className="mf-record-card" onClick={() => onOpenRecord(record, "result", imgs)}>
                        <img className="mf-record-thumb" src={imgs[0]} alt="生成结果" loading="lazy" />
                      </button>
                    ) : (
                      <div className="mf-record-thumb mf-record-thumb-empty">—</div>
                    )}
                    <div className="mf-record-info">
                      <b>{record.templateName || record.category || "AI 生成"}</b>
                      <small>{statusLabel} · {dateStr}{isDone ? " · 点击查看" : ""}</small>
                    </div>
                  </li>
                );
              })}</ul> : <small>暂无真实生成记录。完成一次 AI 生成后会自动显示在这里。</small>}</div>}
      {activeTool === "购买记录" && <div className="mf-profile-data-panel"><b>真实购买记录</b>{orders.length ? orders.map((order) => <div key={order.id}><span>{order.planName}</span><small>¥{(order.amount / 100).toFixed(2)} · {order.status === "PAID" ? "已开通" : order.status === "REFUNDED" ? "已退款" : order.status === "CANCELLED" ? "已取消" : "待支付"} · {new Date(order.createdAt).toLocaleDateString("zh-CN")}</small></div>) : <small>{user ? "暂无购买记录" : "登录后查看购买记录"}</small>}</div>}
      {activeTool === "兑换码" && <div className="mf-profile-data-panel">
        <b>兑换会员 / 生成次数</b>
        <small>输入兑换码后，将按兑换码内容开通会员或增加生成次数。</small>
        {user ? <form className="mf-redeem-card" onSubmit={submitRedeemCode}>
          <div><b>兑换码</b><small>每个兑换码仅可使用一次</small></div>
          <div><input value={redeemInput} maxLength={27} autoCapitalize="characters" autoComplete="off" spellCheck="false" placeholder="XNM-XXXXX-XXXXX-XXXXX-XXXXX" aria-label="兑换码" onChange={(event) => setRedeemInput(event.target.value.toUpperCase())} /><button type="submit" disabled={redeeming}>{redeeming ? "兑换中…" : "立即兑换"}</button></div>
        </form> : <button className="mf-redeem-login" onClick={() => window.location.assign("/login?callbackUrl=%2F")}>登录后兑换</button>}
      </div>}
      <div className="mf-profile-section-head"><b>服务中心</b></div>
      <div className="mf-service-list">
        {SERVICE_CATALOG.map((service) => (
          <button key={service.id} onClick={() => window.location.assign(`/services#service-${service.id}`)}>
            <span><b>{service.title}</b><small>{service.short}</small></span><em>查看详情</em><FaChevronRight />
          </button>
        ))}
      </div>
      <button className="mf-privacy-row" onClick={() => setPrivacyOpen(true)}>隐私与数据管理 <FaChevronRight /></button>
      {privacyOpen && <PrivacyDataSheet user={user} profilePhotoCount={profilePhotoCount} generationCount={creationRecords.length} diagnosisCount={diagnosisCount} orderCount={orders.length} onClose={() => setPrivacyOpen(false)} onOpenPhotos={onOpenPhotos} onExport={exportData} onNotice={onNotice} />}
      {user && (
        <button
          className="mf-privacy-row"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          退出登录 <FaChevronRight />
        </button>
      )}
    </section>
  );
}


function PrivacyDataSheet({ user, profilePhotoCount, generationCount, diagnosisCount, orderCount, onClose, onOpenPhotos, onExport, onNotice }) {
  return <div className="mf-sheet-layer"><button className="mf-sheet-scrim" aria-label="关闭" onClick={onClose} /><section className="mf-sheet"><button className="mf-sheet-close" onClick={onClose} aria-label="关闭">×</button><span className="mf-auth-kicker">YOUR DATA</span><h2>隐私与数据管理</h2><p>照片档案和生成结果会与账号关联。你可以管理照片、删除作品，并导出当前账号可读取的数据摘要；第三方 AI 和支付服务的保存期限按其政策执行。</p><div className="mf-data-summary"><span>档案照片 <b>{profilePhotoCount}</b></span><span>生成记录 <b>{generationCount}</b></span><span>诊断记录 <b>{diagnosisCount}</b></span><span>购买记录 <b>{orderCount}</b></span></div><div className="mf-sheet-actions"><button onClick={onOpenPhotos}>管理照片</button><button onClick={onExport}>导出我的数据</button><button onClick={() => { onClose(); onNotice("账号注销需要人工审核，请通过服务中心提交申请"); }}>提交注销申请</button><button onClick={() => window.location.assign("/privacy")}>查看完整隐私说明</button></div><small className="mf-sheet-note">当前支持删除档案照片和生成作品；诊断、订单和支付审计记录可能因服务与对账需要保留。</small></section></div>;
}

function BattleScreen({ data, loading, busy, isLoggedIn, onAccept, onGoDiagnose, onHome, onNotice }) {
  const scoreInput = useState(["", "", ""]);
  if (loading) {
    return (
      <section className="mf-screen mf-battle-screen">
        <div className="mf-battle-loading" role="status">战书装载中…</div>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="mf-screen mf-battle-screen">
        <FlowHeader title="比帅大赛" onBack={onHome} />
        <div className="mf-battle-missing">
          <b>这份战书走丢了</b>
          <p>链接可能不完整，让兄弟重新发你一份。</p>
          <button className="mf-primary" onClick={onHome}>回首页</button>
        </div>
      </section>
    );
  }
  const finished = data.status === "FINISHED";
  const posterUrl = finished
    ? `/api/battle/${data.id}/poster?style=${data.winnerSide === "initiator" ? "win" : "lose"}`
    : `/api/battle/${data.id}/poster?style=war-boxing`;
  return (
    <section className="mf-screen mf-battle-screen">
      <FlowHeader title={finished ? "战绩揭晓" : "战书"} onBack={onHome} />
      {!finished && (
        <div className="mf-battle-callout">
          <b>{data.initiator} 向你发起比帅挑战</b>
          <span>AI 已给 TA 打分：{data.initiatorScore} 分（{data.initiatorTitle}）。敢来应战吗？</span>
        </div>
      )}
      {finished && (
        <div className="mf-battle-callout">
          <b>{data.winnerSide === "initiator" ? `${data.initiator} 获胜` : "挑战者获胜"}</b>
          <span>{data.initiatorScore} 分 vs {data.challengerScore} 分{data.crush ? ` · ${data.crushLine}` : ""}{data.tauntLine && data.winnerSide === "challenger" ? ` · ${data.tauntLine}` : ""}</span>
        </div>
      )}
      <div className="mf-battle-poster-wrap">
        <img src={posterUrl} alt="比帅海报" />
        <a className="mf-battle-save" href={posterUrl} download="比帅海报.jpg" target="_blank" rel="noreferrer">保存海报 · 发到兄弟群</a>
      </div>
      {!finished && (
        <div className="mf-battle-cta">
          {isLoggedIn ? (
            <>
              <p>上传你的照片完成 AI 诊断，自动结算胜负。</p>
              <button className="mf-primary" onClick={onGoDiagnose} disabled={busy}>上传照片 · 接受挑战</button>
            </>
          ) : (
            <button className="mf-primary" onClick={() => onAccept(null)}>登录后应战</button>
          )}
        </div>
      )}
      {finished && (
        <div className="mf-battle-cta">
          <button className="mf-primary" onClick={onGoDiagnose}>不服？换张照片再战</button>
          <button className="mf-ghost" onClick={() => window.location.assign("/pricing")}>想更帅？获取生成次数</button>
        </div>
      )}
    </section>
  );
}

function InviteCenterScreen({ data, onBack, onNotice }) {
  const [posterKind, setPosterKind] = useState("boxing"); // 进页直接出海报
  const copyLink = () => {
    if (!data?.inviteCode) return;
    const link = `${window.location.origin}/?ref=${data.inviteCode}`;
    const finish = () => onNotice("推广链接已复制，发给兄弟就能赚次数");
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(link).then(finish, finish);
    else finish();
  };
  const posterUrl = `/api/invite/poster?kind=${posterKind}`;
  return (
    <section className="mf-screen mf-invite-screen">
      <FlowHeader title="推广中心" onBack={onBack} />
      <div className="mf-invite-poster-wrap">
        <img key={posterKind} src={posterUrl} alt="推广海报" />
        <div className="mf-invite-poster-actions">
          <button className="mf-primary" onClick={copyLink}>复制推广链接</button>
          <a className="mf-primary" href={posterUrl} download={`推广海报-${data?.inviteCode || ""}.jpg`} target="_blank" rel="noreferrer">保存海报</a>
          <button className="mf-ghost" onClick={() => setPosterKind(posterKind === "boxing" ? "invitation" : "boxing")}>换一版风格</button>
        </div>
      </div>
      <div className="mf-invite-stats">
        <div><b>{data?.referredCount ?? "—"}</b><span>已邀请兄弟</span></div>
        <div><b>{data?.totalReward ?? "—"}</b><span>累计赚得次数</span></div>
        <div><b>{data?.inviteCode || "—"}</b><span>我的推广码</span></div>
      </div>
      <div className="mf-invite-rules">
        <b>奖励规则</b>
        <ul>
          <li>兄弟通过链接注册：他多拿 4 次，你 +0（引流无成本）</li>
          {Object.entries(data?.paymentRewards || {}).map(([plan, amount]) => (
            <li key={plan}>兄弟买{plan === "trial" ? "体验卡" : plan === "high" ? "标准卡" : plan === "flagship" ? "旗舰卡" : "次数补充包"}：你 +{amount} 次</li>
          ))}
          <li>服务订单（资料课、训练营等）不参与推广奖励</li>
        </ul>
        <small>次数永不过期、只在本站使用，不能转卖提现。</small>
      </div>
    </section>
  );
}

function SubsiteCenterScreen({ data, onBack, onNotice }) {
  const [busyPack, setBusyPack] = useState("");
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleQr, setSettleQr] = useState(null);
  const [settleNote, setSettleNote] = useState("");
  const [settleBusy, setSettleBusy] = useState(false);
  const settleQrInputRef = useRef(null);
  const subsite = data?.subsite || null;
  const orders = Array.isArray(data?.orders) ? data.orders : [];
  const income = data?.income || null;
  const settleReq = data?.settlementRequest || null;
  const siteUrl = subsite?.slug ? `${subsite.slug}.face.shuqizhisou.cc` : "";
  const pendingAmount = Number(income?.pendingAmount) || 0;
  const hasPendingRequest = settleReq?.status === "PENDING";

  const copySiteUrl = () => {
    if (!siteUrl) return;
    const finish = () => onNotice("分站地址已复制");
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(siteUrl).then(finish, finish);
    else finish();
  };

  async function submitSettleRequest() {
    if (settleBusy) return;
    if (!settleQr?.url) { onNotice("请先上传你的微信收款码截图"); return; }
    setSettleBusy(true);
    try {
      const r = await fetch("/api/subsite/settlement-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectQrUrl: settleQr.url, note: settleNote }),
      });
      const payload = await r.json();
      if (!r.ok) throw new Error(payload.error || "提交失败");
      onNotice("打款申请已提交，等待平台处理");
      setSettleOpen(false);
      setSettleQr(null);
      setSettleNote("");
    } catch (error) {
      onNotice(error.message || "提交失败，请稍后重试");
    } finally {
      setSettleBusy(false);
    }
  }

  // 代理充值：agent_pack_* 走平台主收款，成功后跳收银台
  async function recharge(packId) {
    if (busyPack) return;
    setBusyPack(packId);
    try {
      const response = await fetch("/api/checkout/epay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: packId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "订单创建失败，请稍后重试");
      if (!payload.url) throw new Error("收银台地址获取失败");
      window.location.assign(payload.url);
    } catch (error) {
      onNotice(error.message || "订单创建失败，请稍后重试");
      setBusyPack("");
    }
  }

  const statusText = subsite?.status === "ACTIVE" ? "营业中" : subsite?.status === "SUSPENDED" ? "已暂停" : "";
  return (
    <section className="mf-screen mf-subsite-screen">
      <FlowHeader title="分站中心" onBack={onBack} />
      {!subsite && (
        <div className="mf-subsite-empty">
          <b>还没有开通分站</b>
          <p>成为代理后即可拥有自己的独立站点，自主收款。</p>
        </div>
      )}
      {subsite && (
        <>
          <div className="mf-subsite-address">
            <span className="mf-subsite-kicker">我的分站地址</span>
            <div className="mf-subsite-url-row">
              <b>{siteUrl}</b>
              <button onClick={copySiteUrl}>复制</button>
            </div>
            {statusText && <small>状态：{statusText}</small>}
            {subsite.payMode === "platform" && <small>收款方式：平台代收 · 货款由平台与你人工结算</small>}
            {subsite.payMode === "own" && <small>收款方式：你自己的易支付商户 · 货款直达你，发货扣积分</small>}
          </div>
          <div className="mf-subsite-credits">
            <div>
              <span>当前积分余额</span>
              <b>{Number.isFinite(data?.credits) ? data.credits : "—"}</b>
            </div>
            <small>{subsite.payMode === "own" ? "客户每笔订单下单即预扣实付 30% 的平台供货费（积分不足将无法接单），余额低于 20 请及时充值" : "平台代收模式下不扣积分，积分余额仅用于主站消费"}</small>
          </div>
          <div className="mf-subsite-credits">
            <div>
              <span>累计销售{subsite.payMode === "own" ? "（货款在您的商户）" : ""}</span>
              <b>¥{((Number(data?.income?.salesTotal) || 0) / 100).toFixed(2)}</b>
            </div>
            <small>已成交 {Number(data?.income?.paidOrders) || 0} 单{subsite.payMode === "own" ? " · 平台按实付 30% 预扣供货费" : ""}</small>
          </div>
          {subsite.payMode === "platform" && (
            <div className="mf-subsite-credits">
              <div>
                <span>我的分成收入（实付 70%）</span>
                <b>¥{(((Number(data?.income?.agentShareTotal) || 0)) / 100).toFixed(2)}</b>
              </div>
              <small>待打款 ¥{(pendingAmount / 100).toFixed(2)}（{Number(income?.pendingCount) || 0} 单），由平台人工结算</small>
              {hasPendingRequest ? (
                <small>已提交打款申请 ¥{((Number(settleReq.amount) || 0) / 100).toFixed(2)} · 等待平台处理{settleReq.collectQrUrl ? ` · 收款码已收到` : ""}</small>
              ) : (
                <button className="mf-primary" type="button" disabled={pendingAmount <= 0 || busyPack} onClick={() => setSettleOpen(true)}>
                  {pendingAmount > 0 ? `申请结算 ¥${(pendingAmount / 100).toFixed(2)}` : "暂无可结算金额"}
                </button>
              )}
            </div>
          )}
          {settleOpen && (
            <div className="mf-sheet-layer">
              <button className="mf-sheet-scrim" aria-label="关闭" onClick={() => setSettleOpen(false)} />
              <section className="mf-sheet">
                <button className="mf-sheet-close" onClick={() => setSettleOpen(false)} aria-label="关闭">×</button>
                <span className="mf-auth-kicker">SETTLEMENT</span>
                <h2>申请打款</h2>
                <p>本次申请金额 <b>¥{(pendingAmount / 100).toFixed(2)}</b>（覆盖 {Number(income?.pendingCount) || 0} 笔已成交订单）。上传你的微信收款码，平台扫码打款后此单自动标记已结算。</p>
                <button className={`mf-reference ${settleQr ? "has-preview" : ""}`} onClick={() => settleQrInputRef.current?.click()}>
                  {settleQr?.preview ? (
                    <img src={settleQr.preview} alt="已上传收款码" />
                  ) : (
                    <FaTshirt />
                  )}
                  <span>{settleQr ? "已上传收款码" : "上传微信收款码截图"}</span>
                  <small>{settleQr ? "点击可重新上传" : "微信 → 收付款 → 二维码收款，截图后上传"}</small>
                  <FaChevronRight />
                </button>
                <input
                  ref={settleQrInputRef}
                  hidden
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { onNotice("仅支持 JPG、PNG、WebP 图片"); return; }
                    if (file.size > 5 * 1024 * 1024) { onNotice("图片不能超过 5MB"); return; }
                    setSettleBusy(true);
                    const form = new FormData();
                    form.append("file", file);
                    form.append("purpose", "profile");
                    fetch("/api/upload", { method: "POST", body: form })
                      .then(async (r) => {
                        const payload = await r.json().catch(() => ({}));
                        if (!r.ok) throw new Error(payload.error || "上传失败");
                        setSettleQr({ url: payload.url, preview: payload.url });
                      })
                      .catch((e) => onNotice(e.message || "上传失败"))
                      .finally(() => setSettleBusy(false));
                  }}
                />
                <input placeholder="留言（可选）：打款备注" value={settleNote} onChange={(event) => setSettleNote(event.target.value)} />
                <button className="mf-primary" disabled={settleBusy || !settleQr} onClick={submitSettleRequest}>{settleBusy ? "提交中…" : "提交打款申请"}</button>
                <button className="mf-sheet-secondary" onClick={() => setSettleOpen(false)}>稍后再说</button>
              </section>
            </div>
          )}
          <div className="mf-subsite-section-head"><b>算力充值</b><span>1 元 = 1 积分 · 200 积分起充</span></div>
          <div className="mf-subsite-packs">
            {AGENT_PACKS.filter((pack) => pack.agentOnly || isPublicPlan(pack)).map((pack) => (
              <button
                key={pack.planId}
                className="mf-subsite-pack"
                onClick={() => recharge(pack.planId)}
                disabled={Boolean(busyPack)}
              >
                <b>{pack.title}</b>
                <span>{pack.price}</span>
                <small>{busyPack === pack.planId ? "正在跳转…" : "易支付 · 平台主收款"}</small>
              </button>
            ))}
          </div>
          <div className="mf-subsite-section-head"><b>分站订单</b><span>客户在你的分站购买的单张写真</span></div>
          <div className="mf-subsite-orders">
            {orders.length ? orders.map((order) => {
              const statusLabel = { PAID: "已成交", PENDING: "待支付", CANCELLED: "已取消", REFUNDED: "已退款" }[order.status] || order.status;
              const settleLabel = order.settlementStatus === "SETTLED" ? " · 已结算 ¥" + ((Number(order.settlementAmount) || 0) / 100).toFixed(2) : order.settlementStatus === "PENDING" ? " · 待结算" : "";
              return (
                <div className="mf-subsite-order" key={order.id}>
                  <span>{order.planName || "AI写真·单张"}</span>
                  <small>
                    ¥{((Number(order.amount) || 0) / 100).toFixed(2)} · {statusLabel}{order.createdAt ? ` · ${new Date(order.createdAt).toLocaleDateString("zh-CN")}` : ""}{order.platformFeeCredits ? ` · 平台供货 -${order.platformFeeCredits} 分` : ""}{settleLabel}{order.tradeTail ? ` · 流水尾号 ${order.tradeTail}` : ""}
                  </small>
                </div>
              );
            }) : <small className="mf-subsite-orders-empty">暂无订单。把分站推广出去，客户下单后会显示在这里。</small>}
          </div>
        </>
      )}
    </section>
  );
}

function FlowHeader({ title, step, total, onBack, rightAction, disabled = false }) {
  return (
    <>
      <div className="mf-flow-header">
        <button onClick={onBack} disabled={disabled}>
          <FaArrowLeft />
        </button>
        <div>
          <b>{title}</b>
          {!step && <small>智能创作工作台</small>}
        </div>
        {rightAction ||
          (step ? (
            <span>
              {step}/{total}
            </span>
          ) : (
            <span />
          ))}
      </div>
    </>
  );
}

function ComparisonFrame({ className, before, after, demo }) {
  return (
    <div className={className}>
      {demo ? (
        <div
          className="mf-demo-pair"
          style={{ backgroundImage: `url(${images.compare})` }}
          aria-label="参考图 Before/After 预览"
        />
      ) : (
        <>
          <img src={before} alt="改造前" />
          <img src={after} alt="改造后" />
        </>
      )}
      <div className="mf-compare-handle">◀▶</div>
      <small className="before">Before</small>
      <small className="after">After</small>
      {demo && <span className="mf-demo-badge">示例对比 · 非个人结果</span>}
    </div>
  );
}
function FlowIntro({ eyebrow, title, text }) {
  return (
    <div className="mf-flow-intro">
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
function Metric({ label, value, level, detail }) {
  return (
    <div>
      <span>{label}</span>
      <b>{value}</b>
      <small>{level} · {detail}</small>
    </div>
  );
}
function RangeLine({ label, value, onChange }) {
  return (
    <div className="mf-range-line">
      <label>
        {label}
        <em>{value}%</em>
      </label>
      <input
        type="range"
        min="50"
        max="100"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
function BottomNav({ screen, onHome, onCreate, onInspiration, onCircle, onProfile }) {
  return (
    <nav className="mf-bottom-nav">
      <button className={screen === "home" ? "active" : ""} onClick={onHome}>
        <FaHome />
        <span>首页</span>
      </button>
      <button
        className={
          screen === "makeover" || screen === "display" ? "active" : ""
        }
        onClick={onCreate}
      >
        <FaMagic />
        <span>创作</span>
      </button>
      <button className={screen === "circle" ? "active" : ""} onClick={onCircle}>
        <FaUsers />
        <span>圈子</span>
      </button>
      <button
        className={screen === "inspiration" || screen === "display-result" ? "active" : ""}
        onClick={onInspiration}
      >
        <FaLightbulb />
        <span>灵感</span>
      </button>
      <button
        className={screen === "profile" ? "active" : ""}
        onClick={onProfile}
      >
        <FaRegUser />
        <span>我的</span>
      </button>
    </nav>
  );
}
