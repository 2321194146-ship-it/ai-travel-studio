"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { FaDownload, FaShareAlt } from "react-icons/fa";
import { FiCamera, FiCheck, FiChevronDown, FiChevronLeft, FiChevronRight, FiEye, FiScissors, FiShare2, FiAlertCircle } from "react-icons/fi";
import { TbHanger, TbTargetArrow } from "react-icons/tb";

const REPORT_SECTIONS = [
  { id: "diagnosis", label: "形象报告" },
  { id: "hair-plan", label: "发型方案" },
  { id: "outfit-plan", label: "穿搭方案" },
];
const PALETTE_SWATCHES = {
  藏蓝: "#243654",
  深蓝: "#252d45",
  蓝: "#6689b1",
  浅蓝: "#a4c3da",
  米白: "#eee7d9",
  白: "#f5f4ef",
  黑: "#222326",
  灰: "#777a7c",
  浅灰: "#b7babb",
  卡其: "#b59a72",
  浅棕: "#a98a69",
  棕: "#755844",
  炭灰: "#3f4040",
  牛仔蓝: "#496582",
  红色点缀: "#9b4d43",
  橄榄: "#4d523b",
};

function cleanText(value, fallback = "这张照片无法确认") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function briefText(value, maxLength = 30, fallback = "照片中暂时无法确认") {
  const text = cleanText(value, fallback).split(/[。；;\n]/)[0].trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function getScoreReason(report, key, legacyKey) {
  const reasons = report?.scoreReasons;
  const reason = Array.isArray(reasons)
    ? reasons[{ face: 0, aura: 1, camera: 2 }[key]]
    : reasons?.[key] || reasons?.[legacyKey];
  return typeof reason === "string" ? { basis: reason } : reason || {};
}

function hasScore(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function adviceParts(value) {
  const text = cleanText(value);
  const split = text.search(/[，,：:]/);
  return split > 0 && split < 16
    ? { title: text.slice(0, split), detail: text.slice(split + 1).trim() }
    : { title: "", detail: text };
}

function drawCoverImage(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const sw = width / scale;
  const sh = height / scale;
  const sx = Math.max(0, (image.width - sw) / 2);
  const sy = Math.max(0, (image.height - sh) * 0.27);
  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
  const chars = Array.from(String(text || ""));
  let line = "";
  let lines = 0;
  for (const char of chars) {
    const next = line + char;
    if (line && ctx.measureText(next).width > maxWidth) {
      ctx.fillText(line, x, y + lines * lineHeight);
      lines += 1;
      line = char;
      if (lines >= maxLines) break;
    } else {
      line = next;
    }
  }
  if (line && lines < maxLines) ctx.fillText(line, x, y + lines * lineHeight);
}

export default function DiagnosisReport({
  photo,
  report = {},
  insights = {},
  hairItems = [],
  outfitItems = [],
  isDemo = false,
  isLoggedIn = false,
  onBack,
  onTryHair,
  onTryOutfit,
  onDisplay,
  onStartBattle,
  onNotice,
}) {
  const [activeSection, setActiveSection] = useState("diagnosis");
  const [shareOpen, setShareOpen] = useState(false);
  const [posterUrl, setPosterUrl] = useState("");
  const [posterBusy, setPosterBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareImageAndScores, setShareImageAndScores] = useState(isDemo);
  const reportPageRef = useRef(null);
  const [shareLink, setShareLink] = useState("");
  const [inviteReady, setInviteReady] = useState(false);
  const [qrPreviewUrl, setQrPreviewUrl] = useState("");
  const faceReason = getScoreReason(report, "face", "score");
  const auraReason = getScoreReason(report, "aura", "auraScore");
  const cameraReason = getScoreReason(report, "camera", "cameraScore");
  const firstStyle = Array.isArray(report.styles) ? report.styles[0] : null;
  const styleKeywords = Array.isArray(firstStyle?.keywords)
    ? firstStyle.keywords.filter((item) => typeof item === "string" && item.trim()).slice(0, 4)
    : typeof firstStyle?.keywords === "string"
      ? firstStyle.keywords.split(/[、,，]/).map((item) => item.trim()).filter(Boolean).slice(0, 4)
      : [];

  useEffect(() => () => {
    if (posterUrl) URL.revokeObjectURL(posterUrl);
  }, [posterUrl]);

  useEffect(() => {
    reportPageRef.current?.scrollTo({ top: 0 });
  }, [activeSection]);

  useEffect(() => {
    if (activeSection !== "outfit-plan") return;
    const url = `${window.location.origin}/?from=report`;
    QRCode.toDataURL(url, { width: 180, margin: 1, color: { dark: "#17130d", light: "#fffdf8" } })
      .then(setQrPreviewUrl)
      .catch(() => setQrPreviewUrl(""));
  }, [activeSection]);

  function jumpToSection(id) {
    setActiveSection(id);
  }

  const recommendedPalette = [...new Set(outfitItems
    .slice(0, 3)
    .flatMap((item) => String(item.palette || "").split(/[、,，]/).map((color) => color.trim()))
    .filter(Boolean))].slice(0, 5);

  async function generatePoster() {
    if (posterBusy) return;
    setPosterBusy(true);
    try {
      let inviteCode = "";
      if (isLoggedIn) {
        const inviteResponse = await fetch("/api/battle/invite");
        if (inviteResponse.ok) {
          const invitePayload = await inviteResponse.json();
          inviteCode = invitePayload?.data?.inviteCode || "";
        }
      }
      const url = `${window.location.origin}/${inviteCode ? `?ref=${encodeURIComponent(inviteCode)}` : "?from=report"}`;
      setShareLink(url);
      setInviteReady(Boolean(inviteCode));
      const qrData = await QRCode.toDataURL(url, { width: 300, margin: 1, color: { dark: "#17130d", light: "#fffdf8" } });
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = shareImageAndScores ? 1920 : 1660;
      const footerTop = canvas.height - 320;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("海报画布初始化失败");

      const background = ctx.createLinearGradient(0, 0, 1080, canvas.height);
      background.addColorStop(0, "#171510");
      background.addColorStop(0.52, "#0c0d0d");
      background.addColorStop(1, "#1b1711");
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, 1080, canvas.height);
      ctx.strokeStyle = "rgba(220,181,112,.42)";
      ctx.lineWidth = 2;
      ctx.strokeRect(34, 34, 1012, canvas.height - 68);

      ctx.fillStyle = "#f2dfb8";
      ctx.textAlign = "center";
      ctx.font = '700 34px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText("型 男 制 造 机", 540, 96);
      ctx.fillStyle = "#b7a27f";
      ctx.font = '24px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText("专属风格 · 更好的自己", 540, 136);
      ctx.textAlign = "left";
      ctx.fillStyle = "#f4ead7";
      ctx.font = '700 56px "Songti SC", "Noto Serif SC", serif';
      ctx.fillText("我的个人形象报告", 72, 216);
      ctx.fillStyle = "#c2b7a3";
      ctx.font = '26px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText("基于本次照片 · AI 分析与复核", 76, 262);

      let portrait = null;
      if (shareImageAndScores) {
        const portraitUrl = photo || report.inputImage;
        if (!portraitUrl) throw new Error("本次报告没有可分享的照片");
        portrait = new Image();
        if (!portraitUrl.startsWith("data:") && new URL(portraitUrl, window.location.href).origin !== window.location.origin) {
          portrait.crossOrigin = "anonymous";
        }
        await new Promise((resolve, reject) => {
          portrait.onload = resolve;
          portrait.onerror = () => reject(new Error("照片暂时无法载入海报，请稍后重试"));
          portrait.src = portraitUrl;
        });
      }
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(70, 304, 940, 690, 28);
      ctx.clip();
      if (portrait) {
        drawCoverImage(ctx, portrait, 70, 304, 940, 690);
        const shade = ctx.createLinearGradient(0, 670, 0, 994);
        shade.addColorStop(0, "rgba(7,7,7,0)");
        shade.addColorStop(1, "rgba(7,7,7,.82)");
        ctx.fillStyle = shade;
        ctx.fillRect(70, 670, 940, 324);
      } else {
        const preview = ctx.createLinearGradient(70, 304, 1010, 994);
        preview.addColorStop(0, "#393126");
        preview.addColorStop(.55, "#1a1916");
        preview.addColorStop(1, "#10100f");
        ctx.fillStyle = preview;
        ctx.fillRect(70, 304, 940, 690);
        ctx.fillStyle = "rgba(215,181,119,.1)";
        ctx.beginPath();
        ctx.arc(540, 610, 218, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#e9d29f";
        ctx.textAlign = "center";
        ctx.font = '700 48px "Songti SC", "Noto Serif SC", serif';
        ctx.fillText(styleKeywords.length ? styleKeywords.join(" · ") : cleanText(firstStyle?.name, "专属风格方案"), 540, 590, 780);
        ctx.font = '28px "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.fillText("专属风格方案", 540, 644);
        ctx.textAlign = "left";
        ctx.fillStyle = "#b8aa91";
        ctx.font = '24px "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.fillText("照片与个人评分未公开", 108, 718);
      }
      ctx.restore();

      ctx.fillStyle = "#f2d08d";
      ctx.font = '700 32px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(`${cleanText(report.faceShape, "个人轮廓待确认")} · ${cleanText(firstStyle?.name, "专属风格")}`, 108, 930);
      const detailOffset = shareImageAndScores ? 0 : -250;
      if (shareImageAndScores) {
        ctx.fillStyle = "#f5efe4";
        ctx.font = '700 30px "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.fillText("本次照片呈现参考", 72, 1060);
        const scoreRows = [
          ["轮廓", report.score],
          ["气质", report.auraScore],
          ["上镜", report.cameraScore],
        ];
        scoreRows.forEach(([label, value], index) => {
          const x = 72 + index * 320;
          ctx.fillStyle = "rgba(255,255,255,.035)";
          ctx.fillRect(x, 1090, 286, 150);
          ctx.strokeStyle = "rgba(219,179,107,.32)";
          ctx.strokeRect(x, 1090, 286, 150);
          ctx.fillStyle = "#c8bda9";
          ctx.font = '22px "PingFang SC", "Microsoft YaHei", sans-serif';
          ctx.fillText(label, x + 24, 1130);
          ctx.fillStyle = "#e5bd74";
          ctx.font = "700 54px Georgia, serif";
          ctx.fillText(hasScore(value) ? String(value) : "—", x + 24, 1205);
        });
      }

      ctx.fillStyle = "#e9d29f";
      ctx.font = '700 28px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText("优先改善", 72, 1315 + detailOffset);
      ctx.fillStyle = "#d3cabc";
      ctx.font = '25px "PingFang SC", "Microsoft YaHei", sans-serif';
      wrapCanvasText(ctx, cleanText(insights.focus), 76, 1360 + detailOffset, 900, 38, 2);
      ctx.fillStyle = "#e9d29f";
      ctx.font = '700 28px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText("推荐方向", 72, 1468 + detailOffset);
      ctx.fillStyle = "#d3cabc";
      ctx.font = '24px "PingFang SC", "Microsoft YaHei", sans-serif';
      wrapCanvasText(ctx, `发型：${hairItems[0]?.name || "以报告建议为准"}    穿搭：${outfitItems[0]?.name || "以报告建议为准"}`, 76, 1510 + detailOffset, 900, 38, 2);

      const qr = new Image();
      await new Promise((resolve, reject) => {
        qr.onload = resolve;
        qr.onerror = () => reject(new Error("分享二维码生成失败"));
        qr.src = qrData;
      });
      ctx.fillStyle = "#fffdf8";
      ctx.fillRect(748, footerTop, 220, 220);
      ctx.drawImage(qr, 760, footerTop + 12, 196, 196);
      ctx.fillStyle = "#f0d08c";
      ctx.font = '700 27px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(inviteCode ? "扫码体验专属邀请入口" : "扫码体验型男制造机", 72, footerTop + 60);
      ctx.fillStyle = "#aaa08f";
      ctx.font = '22px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText("报告分数仅描述照片呈现，不是长相评价", 72, footerTop + 104);
      ctx.fillStyle = "#c4a66e";
      ctx.font = '24px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText("把变帅方案分享给朋友", 72, footerTop + 160);

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.95));
      if (!blob) throw new Error("分享海报生成失败");
      setPosterUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(blob);
      });
    } catch (error) {
      onNotice?.(error.message || "分享海报生成失败");
    } finally {
      setPosterBusy(false);
    }
  }

  async function sharePoster() {
    if (!posterUrl || shareBusy) return;
    setShareBusy(true);
    try {
      const blob = await fetch(posterUrl).then((response) => response.blob());
      const file = new File([blob], "我的形象报告.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ title: "我的个人形象报告", text: "我用型男制造机做了形象诊断，你也来测测适合自己的风格。", files: [file] });
      } else {
        const anchor = document.createElement("a");
        anchor.href = posterUrl;
        anchor.download = "我的形象报告.png";
        anchor.click();
        if (shareLink && navigator.clipboard?.writeText) await navigator.clipboard.writeText(shareLink);
        onNotice?.("海报已保存，邀请链接也已复制");
      }
    } catch (error) {
      if (error?.name !== "AbortError") onNotice?.("分享没有完成，可以先保存海报再发送给朋友");
    } finally {
      setShareBusy(false);
    }
  }

  function downloadPoster() {
    if (!posterUrl) return;
    const anchor = document.createElement("a");
    anchor.href = posterUrl;
    anchor.download = "我的形象报告.png";
    anchor.click();
  }

  const scores = [
    { key: "face", label: "轮廓", value: report.score, reason: faceReason },
    { key: "aura", label: "气质", value: report.auraScore, reason: auraReason },
    { key: "camera", label: "上镜度", value: report.cameraScore, reason: cameraReason },
  ];
  const activeIndex = REPORT_SECTIONS.findIndex((item) => item.id === activeSection);
  const actionPlan = Array.isArray(insights.actionPlan) && insights.actionPlan.length
    ? insights.actionPlan
    : Array.isArray(report.actionPlan) ? report.actionPlan : [];

  return (
    <div className={`mf-diagnosis-report${isDemo ? " is-demo" : ""}`}>
      <header className="mf-report-header">
        <button type="button" onClick={onBack} aria-label="返回"><FiChevronLeft /></button>
        <div><b>型男制造机</b><small>专属风格 · 更好的自己</small></div>
        <div className="mf-report-header-step">
          <span><b>{String(activeIndex + 1).padStart(2, "0")}</b><small>/03</small></span>
          {isDemo && <small className="mf-report-demo-note">示例报告 · 非个人结果</small>}
        </div>
      </header>

      {activeSection === "diagnosis" && (
        <section ref={reportPageRef} className="mf-report-page mf-report-diagnosis" aria-labelledby="mf-report-title">
          <div className="mf-report-title-block">
            <h1 id="mf-report-title">你的个人形象报告</h1>
            <p>根据本次正面照分析</p>
          </div>
          {!isDemo && report.id && !report.review && <p className="mf-report-legacy-note">这是历史报告，部分详细分析当时未保存。页面保留已有结果；重新诊断后可获得完整分析与复核报告。</p>}
          <div className="mf-report-hero-photo">
            {photo ? <img src={photo} alt="本次诊断使用的正面照" /> : <div className="mf-report-photo-empty">本次诊断照片</div>}
            <div className="mf-report-photo-script">更有风格<br />更自信的你</div>
            <div className="mf-report-callout callout-top"><i /><span>{briefText(insights.hairReason || hairItems[0]?.why, 22, "发型状态待确认")}</span></div>
            <div className="mf-report-callout callout-mid"><i /><span>{briefText(insights.faceBalance || report.faceBalance || report.faceShape, 22, "脸型待确认")}</span></div>
            <div className="mf-report-callout callout-jaw"><i /><span>{briefText(insights.jawline || report.jawline || faceReason?.strength || faceReason?.basis, 22, "轮廓细节待确认")}</span></div>
          </div>

          <div className="mf-report-keywords">
            <small>风格关键词</small>
            <b>{styleKeywords.length ? styleKeywords.join(" · ") : cleanText(firstStyle?.name, "专属风格待确认")}</b>
          </div>

          <div className="mf-report-focus-card" aria-label="优先改善建议">
            <span className="mf-report-icon"><TbTargetArrow /></span>
            <div><b>{cleanText(insights.focus)}</b><small>{cleanText(insights.goal, "按照本次照片可见信息制定改造方向")}</small></div>
          </div>

          <div className="mf-report-score-grid">
            {scores.map(({ key, label, value, reason }) => {
              const score = hasScore(value) ? Math.max(0, Math.min(100, Number(value))) : 0;
              return (
                <article className="mf-report-score-card" key={key}>
                  <div className="mf-report-score-ring">
                    <svg viewBox="0 0 100 100" aria-hidden="true"><path className="track" d="M 18.89 81.11 A 44 44 0 1 1 81.11 81.11" /><path className="progress" d="M 18.89 81.11 A 44 44 0 1 1 81.11 81.11" pathLength="100" strokeDasharray={`${score} 100`} /></svg>
                    <div><span>{hasScore(value) ? value : "—"}</span><b>{label}</b></div>
                  </div>
                  <p>{cleanText(reason?.basis)}</p>
                </article>
              );
            })}
          </div>

          <section className="mf-report-evidence">
            <h2><FiEye /> 照片里能看到的</h2>
            <div className="mf-report-evidence-item positive"><b><i><FiCheck /></i>已有优势</b><p>{cleanText(faceReason?.strength)}</p></div>
            <div className="mf-report-evidence-item adjust"><b><i>!</i>优先调整</b><p>{cleanText(faceReason?.opportunity || insights.focus)}</p></div>
            <small><FiAlertCircle /> {cleanText(report.inputQuality, "本次结论仅针对照片中的可见呈现")}</small>
            {(report.faceBalance || report.jawline || [faceReason, auraReason, cameraReason].some((reason) => reason.strength || reason.opportunity)) && <details className="mf-report-full-evidence">
              <summary>查看完整照片观察与调整建议</summary>
              {report.faceBalance && <p><b>五官比例：</b>{report.faceBalance}</p>}
              {report.jawline && <p><b>下颌呈现：</b>{report.jawline}</p>}
              {[["轮廓", faceReason], ["气质", auraReason], ["上镜", cameraReason]].map(([label, reason]) => (
                (reason.strength || reason.opportunity) && <div key={label}><h3>{label}分析</h3>{reason.strength && <p><b>已有优势：</b>{reason.strength}</p>}{reason.opportunity && <p><b>调整建议：</b>{reason.opportunity}</p>}</div>
              ))}
            </details>}
          </section>

        </section>
      )}

      {activeSection === "hair-plan" && (
        <section ref={reportPageRef} className="mf-report-page mf-report-hair" aria-labelledby="mf-hair-title">
          <div className="mf-report-page-heading">
            <FiScissors />
            <div><h1 id="mf-hair-title">发型方案 <small>· 已匹配发型库</small></h1><p>基于你的脸型特征和照片表现，推荐以下发型</p></div>
          </div>
          <div className="mf-report-hair-list">
            {hairItems.slice(0, 3).map((item, index) => (
              <article className="mf-report-hair-card" key={`${item.id || item.name}-${index}`}>
                <div className="mf-report-hair-photo" data-catalog-id={item.id || ""}>
                  {(isDemo && item.demoImage) || item.image ? <img src={isDemo && item.demoImage ? item.demoImage : item.image} alt={`${item.name} 发型库效果参考`} /> : <div className="mf-report-style-placeholder"><FiScissors /><span>{item.name}</span></div>}
                </div>
                <div className="mf-report-hair-copy">
                  <div className="mf-report-hair-title"><b>0{index + 1}</b><h2>{item.name}</h2>{index === 0 && <span>推荐</span>}</div>
                  <p className="mf-report-hair-why"><span className="mf-report-hair-label">适合你的原因</span>{cleanText(item.why)}</p>
                  <p className="mf-report-hair-execution"><FiCheck /><span><b>和理发师这样说</b>{cleanText(item.execution)}</span></p>
                  <details className="mf-report-hair-details">
                    <summary>查看完整分析与打理细节</summary>
                    <p><b>个性化判断：</b>{cleanText(item.why)}</p>
                    <p><b>剪裁沟通：</b>{cleanText(item.execution)}</p>
                    <p><b>日常维护：</b>{cleanText(item.maintenance, "按发型师建议日常维护")}</p>
                  </details>
                  <div className="mf-report-hair-actions">
                    <div className="mf-report-maintenance"><p><FiCheck /><span>打理难度：{Number.isInteger(item.maintenanceLevel) && item.maintenanceLevel >= 1 && item.maintenanceLevel <= 5 ? (["", "简单", "简单", "中等", "较费心", "较费心"][item.maintenanceLevel]) : "按日常习惯调整"}</span></p>{Number.isInteger(item.maintenanceLevel) && item.maintenanceLevel >= 1 && item.maintenanceLevel <= 5 && <span className="mf-report-effort" aria-label={`打理难度 ${item.maintenanceLevel}/5`}>{[1,2,3,4,5].map((level) => <i key={level} className={level <= item.maintenanceLevel ? "filled" : ""} />)}</span>}</div>
                    <button type="button" className="mf-report-gold-button" onClick={() => onTryHair?.(item)}>试戴这款 <FiChevronRight /></button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {hairItems[0] && <button type="button" className="mf-report-more-link" onClick={() => onTryHair?.(hairItems[0])}>更多发型库 <FiChevronRight /></button>}

          <section className="mf-report-palette-card">
            <div className="mf-report-page-heading compact"><TbHanger /><div><h2>穿搭方向 <small>· 已匹配穿搭库</small></h2></div></div>
            <div className="mf-report-palette-swatches">
              {recommendedPalette.map((color) => (
                <div key={color}><i style={{ backgroundColor: PALETTE_SWATCHES[color] || "#777" }} /><span>{color}</span></div>
              ))}
              {!recommendedPalette.length && <p>穿搭配色会在报告复核后显示。</p>}
            </div>
            {insights.outfitAdvice && <p className="mf-report-palette-personal">{insights.outfitAdvice}</p>}
            <p>颜色建议依据本次照片中可见的肤色与整体对比度；衣服版型适配需结合全身照。</p>
          </section>
        </section>
      )}

      {activeSection === "outfit-plan" && (
        <section ref={reportPageRef} className="mf-report-page mf-report-outfit" aria-labelledby="mf-outfit-title">
          <div className="mf-report-page-heading">
            <TbHanger />
            <div><h1 id="mf-outfit-title">穿搭方案 <small><FiAlertCircle />穿搭试穿必须上传并选择全身照</small></h1></div>
          </div>
          <div className="mf-report-fullbody-note"><FiAlertCircle /><span>正面照不用于推断身高、体型；试穿前请上传并选择全身照。</span></div>
          <div className="mf-report-outfit-grid">
            {outfitItems.slice(0, 2).map((item, index) => (
              <article className="mf-report-outfit-card" key={`${item.id || item.name}-${index}`}>
                <div className="mf-report-outfit-image">
                  {(isDemo && item.demoImage) || item.image ? <img src={isDemo && item.demoImage ? item.demoImage : item.image} alt={`${item.name} 穿搭库效果参考`} /> : <div className="mf-report-style-placeholder"><TbHanger /><span>暂未匹配穿搭图</span></div>}
                </div>
                <div className="mf-report-outfit-copy">
                  <h2><span>0{index + 1}</span>{item.name}</h2><p>{cleanText(item.why)}</p>
                  <small className="mf-report-outfit-meta">{cleanText(item.items, "搭配细节以穿搭库方案为准")}<span>适用：{cleanText(item.scene, "日常场景")}</span></small>
                  <button type="button" className="mf-report-gold-button" disabled={!item.image && !(isDemo && item.demoImage)} onClick={() => onTryOutfit?.(item)}>选这套去试穿 <FiChevronRight /></button>
                </div>
              </article>
            ))}
          </div>

          <section className="mf-report-display-advice">
            <div className="mf-report-page-heading compact"><FiCamera /><div><h2>展示面拍摄建议</h2><p>好的照片能放大你的优势</p></div></div>
            <div className="mf-report-display-content">
              <ol>
                {(actionPlan.length ? actionPlan : [cameraReason?.opportunity, firstStyle?.reason]).filter(Boolean).slice(0, 3).map((item, index) => {
                  const { title, detail } = adviceParts(item);
                  return <li key={`${index}-${item}`}><b>0{index + 1}</b><span>{title && <strong>{title}</strong>}<small>{detail}</small></span></li>;
                })}
              </ol>
              {photo && <figure><img src={photo} alt="本次诊断照片参考" /><figcaption>{isDemo ? "参考示例" : "本次照片"}</figcaption></figure>}
            </div>
            <button type="button" className="mf-report-gold-button mf-report-display-button" onClick={onDisplay}>用这套方案生成展示面 <FiChevronRight /></button>
          </section>

          <section className="mf-report-share-card">
            <div className="mf-report-page-heading compact"><FiShare2 /><div><h2>把改变分享给兄弟</h2><p>好的风格，值得被看见</p></div></div>
            <div className="mf-report-share-preview">
              <div className="mf-report-share-mini-poster">
                {photo && shareImageAndScores ? <img src={photo} alt="报告海报照片预览" /> : <span className="mf-report-private-preview">我的<br />专属风格</span>}
                <small>型男制造机<br />我的形象报告</small>
                <b>{styleKeywords.length ? styleKeywords.slice(0, 3).join(" · ") : cleanText(firstStyle?.name, "个人形象报告")}</b>
              </div>
              <div className="mf-report-share-qr">{qrPreviewUrl ? <img src={qrPreviewUrl} alt="型男制造机体验入口二维码" /> : <span>正在生成</span>}</div>
              <p className="mf-report-share-qr-caption">好友扫码开始<br />自己的诊断</p>
              <button
                type="button"
                className={`mf-report-share-option${shareImageAndScores ? " selected" : ""}`}
                aria-pressed={shareImageAndScores}
                onClick={() => { setShareImageAndScores((value) => !value); setPosterUrl(""); }}
              >
                <span className="mf-report-share-option-mark">{shareImageAndScores && <FiCheck />}</span>
                <span><b>分享前预览</b><small>可选择是否展示照片与评分</small></span>
              </button>
            </div>
            <button id="mf-report-share-button" type="button" className="mf-report-gold-button" onClick={() => { setShareOpen(true); if (!posterUrl) generatePoster(); }}>
              生成分享海报 · 邀请朋友来测 <FiChevronRight />
            </button>
            <p className="mf-report-footer"><span>一起变帅 · 遇见更好的自己</span></p>
          </section>
        </section>
      )}

      <nav className="mf-report-bottom-nav" role="tablist" aria-label="形象报告页面">
        {REPORT_SECTIONS.map(({ id, label }, index) => (
          <button key={id} type="button" role="tab" aria-selected={activeSection === id} className={activeSection === id ? "active" : ""} onClick={() => jumpToSection(id)}>
            <span>0{index + 1}</span>{label}
          </button>
        ))}
      </nav>

      {shareOpen && (
        <div className="mf-report-share-layer" role="dialog" aria-modal="true" aria-label="分享个人形象报告">
          <button className="mf-report-share-scrim" onClick={() => setShareOpen(false)} aria-label="关闭分享海报" />
          <section className="mf-report-share-sheet">
            <button className="mf-report-share-close" onClick={() => setShareOpen(false)} aria-label="关闭">×</button>
            <span className="mf-report-kicker">SHARE YOUR REPORT</span>
            <h2>分享你的形象报告</h2>
            {posterBusy ? <div className="mf-report-poster-loading"><i className="mf-loading-spinner" />正在制作报告海报…</div> : null}
            {posterUrl && <img className="mf-report-poster-preview" src={posterUrl} alt="个人形象报告分享海报" />}
            {!posterBusy && !posterUrl && <p className="mf-report-poster-error">海报暂时没有生成，请关闭后重试。</p>}
            <div className="mf-report-share-actions">
              <button className="mf-report-gold-button" disabled={!posterUrl || shareBusy} onClick={sharePoster}><FaShareAlt /> {shareBusy ? "正在分享…" : "分享给朋友"}</button>
              <button className="mf-report-outline-button" disabled={!posterUrl} onClick={downloadPoster}><FaDownload /> 保存海报</button>
            </div>
            {onStartBattle && <button type="button" className="mf-report-battle-link" onClick={() => { setShareOpen(false); onStartBattle(); }}>再发起一次比帅挑战</button>}
            {shareLink && <small className="mf-report-share-link">{inviteReady ? "海报二维码已带入你的专属邀请入口" : isLoggedIn ? "专属邀请链接暂不可用，二维码仍可打开体验入口" : "当前附体验入口；登录后可使用专属邀请链接"}</small>}
          </section>
        </div>
      )}
    </div>
  );
}
