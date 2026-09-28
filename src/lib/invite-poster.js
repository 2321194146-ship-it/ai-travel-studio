// 邀请海报合成引擎：邀请底图 + 真 QR（?ref=邀请码）+ 邀请码文字重写 → 单张 JPEG buffer
// 坐标来自 public/mf-invite 两张 1024x1536 底图的像素标定（invite-calibration.json）
// 方法论同 battle-poster：同色补丁盖旧字 + 重写；白圆角矩形铺满白框区再居中贴真码
import sharp from "sharp";
import QRCode from "qrcode";
import path from "node:path";
import { fileURLToPath } from "node:url";
import calibration from "./invite-calibration.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSET_DIR = path.join(__dirname, "..", "..", "public", "mf-invite");
const W = 1024, H = 1536;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// kind: boxing | invitation
// data: { inviteCode, ctaUrl }
export async function composeInvitePoster(kind, data) {
  const c = calibration[kind];
  if (!c) throw new Error("unknown invite poster kind: " + kind);
  const code = String(data.inviteCode || "");
  const t = c.codeText;

  const qrPng = await QRCode.toBuffer(data.ctaUrl, {
    width: 420, margin: 1, color: { dark: "#141008", light: "#ffffff" },
  });

  // 邀请码文字：同色补丁盖住底图画死的示例码，再按各版字体/颜色重写
  const patchAttrs = `x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}"`;
  const strokeAttr = t.stroke ? ` stroke="${t.stroke}" stroke-width="2.5"` : "";
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6d997"/><stop offset="0.5" stop-color="#e2b45f"/><stop offset="1" stop-color="#c39145"/></linearGradient></defs>`
    + `<rect ${patchAttrs} fill="${kind === "boxing" ? "#030301" : "#eee4cf"}"/>`
    + `<text x="${t.centerX}" y="${t.y + t.h / 2 + Math.round(t.fontSize * 0.34)}" font-family="${t.font}" font-size="${t.fontSize}" font-weight="900" fill="${t.fill}"${strokeAttr} text-anchor="middle">邀请码：${esc(code)}</text>`
    + `</svg>`;

  const inner = Math.round(Math.min(c.qr.w, c.qr.h) * 0.88);
  // 先用白圆角矩形铺满整个白框区（盖掉底图旧码任何残留），再把新码居中放在其中
  const whiteRect = Buffer.from(`<svg width="${c.qr.w}" height="${c.qr.h}" xmlns="http://www.w3.org/2000/svg"><rect width="${c.qr.w}" height="${c.qr.h}" rx="10" fill="#ffffff"/></svg>`);
  const base = await sharp(path.join(ASSET_DIR, c.file))
    .composite([
      { input: whiteRect, left: c.qr.x, top: c.qr.y },
      { input: Buffer.from(svg), left: 0, top: 0 },
    ])
    .toBuffer();
  const qrBuf = await sharp(qrPng).resize(inner, inner).png().toBuffer();
  return sharp(base)
    .composite([{ input: qrBuf, left: Math.round(c.qrCenter.x - inner / 2), top: Math.round(c.qrCenter.y - inner / 2) }])
    .jpeg({ quality: 92 })
    .toBuffer();
}
