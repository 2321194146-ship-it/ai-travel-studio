// 比帅海报合成引擎：底图 + 用户照片 + 分数/称号/槽点 + 真 QR → 单张 PNG buffer
// 坐标来自 public/mf-battle 五张 941x1672 底图的像素标定（battle-calibration.json）
import sharp from "sharp";
import QRCode from "qrcode";
import path from "node:path";
import { fileURLToPath } from "node:url";
import calibration from "./battle-calibration.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSET_DIR = path.join(__dirname, "..", "..", "public", "mf-battle");
const W = 941, H = 1672;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function photoPlaceholderSvg(w2, h2, photoUrl) {
  // 有真照片则 cover 裁剪填充；无照片用金属渐变剪影占位
  const img = photoUrl
    ? `<image href="${esc(photoUrl)}" x="0" y="0" width="${w2}" height="${h2}" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect width="${w2}" height="${h2}" fill="url(#pg)"/><circle cx="${w2 / 2}" cy="${h2 * 0.36}" r="${w2 * 0.17}" fill="#3a2c14"/><rect x="${w2 * 0.22}" y="${h2 * 0.55}" width="${w2 * 0.56}" height="${h2 * 0.3}" rx="18" fill="#3a2c14"/>`;
  return `<svg width="${w2}" height="${h2}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d8b16b"/><stop offset="1" stop-color="#6a4d22"/></linearGradient></defs>${img}</svg>`;
}

function overlaySvg(kind, data) {
  const c = calibration[kind];
  const patch = (z) => `<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" fill="rgb(${z.fill.r},${z.fill.g},${z.fill.b})"/>`;
  const label = (z, text, size, fill, stroke) =>
    `<text x="${z.x + z.w / 2}" y="${z.y + z.h / 2 + Math.round(size * 0.35)}" font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif" font-size="${size}" font-weight="900" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="2.5"` : ""} text-anchor="middle">${esc(text)}</text>`;
  const gold = "url(#gold)";
  const parts = [];
  const digits = data.scores; // [颜值, 氛围, 上镜]
  const digitZones = c.digits || [];

  if (kind === "win") {
    parts.push(patch(c.plate));
    parts.push(label(c.plate, `+${data.gap.toFixed(1)} 分`, 68, gold, "#4a3210"));
  } else if (kind === "lose") {
    parts.push(patch(c.taunt));
    parts.push(label(c.taunt, data.tauntLine, 42, "#241505", null));
  } else {
    for (const z of digitZones) parts.push(patch(z));
    digitZones.forEach((z, i) => {
      if (digits[i] != null) parts.push(label(z, String(digits[i]), 96, gold, "#4a3210"));
    });
    if (c.badgeText) {
      parts.push(patch(c.badgeText));
      parts.push(label(c.badgeText, data.title, 34, "#f3e2b8", "#241505"));
    }
    if (c.titleDigits) {
      parts.push(patch(c.titleDigits));
      parts.push(label(c.titleDigits, String(digits[0] ?? ""), 118, gold, "#4a3210"));
    }
    if (c.caption && digits[0] != null) {
      parts.push(patch(c.caption));
      parts.push(label(c.caption, `我 ${digits[0]} 分`, 34, gold, "#4a3210"));
    }
  }
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6d997"/><stop offset="0.5" stop-color="#e2b45f"/><stop offset="1" stop-color="#a9762e"/></linearGradient></defs>${parts.join("")}</svg>`;
}

async function qrPngBuffer(url, size) {
  return QRCode.toBuffer(url, { width: size, margin: 1, color: { dark: "#141008", light: "#ffffff" } });
}

// kind: war-boxing | war-gentleman | war-street | win | lose
// data: { scores:[a,b,c], title, tauntLine, gap, photoUrl, photoUrl2, ctaUrl }
export async function composeBattlePoster(kind, data) {
  const c = calibration[kind];
  if (!c) throw new Error("unknown poster kind: " + kind);
  const layers = [];

  if (kind === "win") {
    // 用户要求：胜利版不放头像占位，保留底图原剪影与装饰
  } else {
    layers.push({ input: Buffer.from(photoPlaceholderSvg(c.photo.w, c.photo.h, data.photoUrl)), left: c.photo.x, top: c.photo.y });
  }
  layers.push({ input: Buffer.from(overlaySvg(kind, data)), left: 0, top: 0 });
  if (data.ctaUrl && c.qr) {
    // 先用白圆角矩形铺满整个白框区（盖掉底图旧码任何残留），再把新码居中放在其中
    const inner = Math.round(Math.min(c.qr.w, c.qr.h) * 0.88);
    const whiteRect = Buffer.from(`<svg width="${c.qr.w}" height="${c.qr.h}" xmlns="http://www.w3.org/2000/svg"><rect width="${c.qr.w}" height="${c.qr.h}" rx="8" fill="#ffffff"/></svg>`);
    const qr = await qrPngBuffer(data.ctaUrl, inner);
    layers.push({ input: whiteRect, left: c.qr.x, top: c.qr.y });
    layers.push({ input: qr, left: c.qr.x + Math.round((c.qr.w - inner) / 2), top: c.qr.y + Math.round((c.qr.h - inner) / 2) });
  }

  const buf = await sharp(path.join(ASSET_DIR, kind + ".png")).composite(layers).png().toBuffer();
  // 输出压缩版（微信分享友好）：宽 1080 内
  return sharp(buf).resize(1080).jpeg({ quality: 88 }).toBuffer();
}
