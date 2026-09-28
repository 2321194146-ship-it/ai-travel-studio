"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import {
  FaUpload,
  FaSpinner,
  FaDownload,
  FaTrashAlt,
  FaTimes,
  FaCut,
  FaTshirt,
  FaMagic,
  FaCheckCircle,
  FaExclamationCircle,
} from "react-icons/fa";
import CompareSlider from "@/components/CompareSlider";
import CustomSelect from "@/components/CustomSelect";

// ── AI 改造类型模板 ─────────────────────────────────────────────
const MAKEOVER_TYPES = [
  {
    id: "hair",
    label: "换发型",
    icon: FaCut,
    description: "根据脸型推荐适合的发型，一键换新造型。",
    prompt: "保持人物身份、五官与服装不变，为这位男性重新设计一款时尚有型的发型：{style}。发质自然有光泽，造型干净利落，专业发型摄影，高质量，8k",
  },
  {
    id: "outfit",
    label: "换穿搭",
    icon: FaTshirt,
    description: "按参考图或风格词重新搭配整套穿搭。",
    prompt: "保持人物身份、五官与发型不变，为这位男性换上全新穿搭：{style}。衣服版型合身、面料质感高级，整体造型协调，时尚街拍，高质量，8k",
  },
  {
    id: "total",
    label: "整体改造",
    icon: FaMagic,
    description: "发型 + 穿搭 + 氛围一次到位。",
    prompt: "为这位男性做一次整体形象改造：发型改为{style}，穿搭升级为{style}。气质提升明显，明星般的展示面效果，电影感调色，高质量，8k",
  },
];

const HAIR_STYLES = ["纹理烫", "渐层undercut", "韩系逗号刘海", "大背头", "碎盖短发", "摩根烫", "羊毛卷"];
const OUTFIT_STYLES = ["clean fit 简约", "city boy 日系", "old money 老钱风", "gorpcore 户外机能", "dark academia 暗黑学院", "minimal tech 极简机能"];

// 生成档位（前端只传档位，由后端按档位自动路由模型）
const TIER_OPTIONS = [
  { value: "standard", label: "小帅档" },
  { value: "high", label: "大帅档" },
  { value: "flagship", label: "顶帅档" },
];
const TIER_COST = {
  standard: { "1k": 2, "2k": 3, "4k": 4 },
  high: { "1k": 4, "2k": 6, "4k": 8 },
  flagship: { "1k": 6, "2k": 9, "4k": 12 },
};

// 上传区组件
function UploadSlot({ preview, url, uploading, onFile, onRemove, label, hint }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400">
        {label}
      </span>
      {preview ? (
        <div className="relative aspect-square rounded overflow-hidden border border-zinc-800 bg-zinc-950 group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt={label} className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={onRemove}
            className="absolute top-1.5 right-1.5 p-1 bg-black/70 hover:bg-red-600 text-white rounded-full opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all cursor-pointer shadow border border-zinc-800"
            title="移除"
          >
            <FaTimes className="text-[8px]" />
          </button>
          {uploading && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <FaSpinner className="animate-spin text-lg text-teal-400" />
            </div>
          )}
        </div>
      ) : (
        <label className="aspect-square border border-dashed border-zinc-800 hover:border-teal-500/50 rounded flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer transition-all bg-zinc-950/30 group">
          <input
            type="file"
            accept="image/*"
            className="absolute inset-0 opacity-0 cursor-pointer"
            disabled={uploading}
            onChange={onFile}
          />
          <FaUpload className="text-xs text-teal-400 group-hover:scale-105 transition-transform" />
          <span className="text-[9px] font-bold text-zinc-300">{hint}</span>
        </label>
      )}
    </div>
  );
}

export default function MakeoverPage() {
  const { data: session, update: updateSession } = useSession();

  // 多图上传：自拍 1~4 张 + 衣服参考图 0~1 张
  const [selfieImages, setSelfieImages] = useState([]); // {url, preview}
  const [outfitImage, setOutfitImage] = useState(null); // {url, preview}
  const [uploadingSlot, setUploadingSlot] = useState(null);

  const [selectedType, setSelectedType] = useState("hair");
  const [styleKey, setStyleKey] = useState(HAIR_STYLES[0]);
  const [customPrompt, setCustomPrompt] = useState(MAKEOVER_TYPES[0].prompt.replace("{style}", HAIR_STYLES[0]));
  const [resolution, setResolution] = useState("1k");
  const [modelTier, setModelTier] = useState("flagship");

  const [generatingStatus, setGeneratingStatus] = useState("idle");
  const [generatingError, setGeneratingError] = useState("");
  const [resultImage, setResultImage] = useState("");
  const [creationId, setCreationId] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef(null);

  // 切换改造类型时自动拼装提示词
  const handleSelectType = (typeId) => {
    setSelectedType(typeId);
    const tpl = MAKEOVER_TYPES.find((t) => t.id === typeId) || MAKEOVER_TYPES[0];
    const isOutfit = typeId === "outfit" || typeId === "total";
    const newStyle = isOutfit ? OUTFIT_STYLES[0] : HAIR_STYLES[0];
    setStyleKey(newStyle);
    const newPrompt = tpl.prompt.replace("{style}", typeId === "total" ? HAIR_STYLES[0] : newStyle);
    setCustomPrompt(newPrompt);
  };

  const handleStyleChange = (nextStyle) => {
    const previousStyle = styleKey;
    setStyleKey(nextStyle);
    setCustomPrompt((current) => previousStyle && current.includes(previousStyle)
      ? current.replace(previousStyle, nextStyle)
      : current);
  };

  // 计时器
  useEffect(() => {
    if (generatingStatus === "generating") {
      timerRef.current = setInterval(() => setElapsedSeconds((p) => p + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [generatingStatus]);

  // 轮询生成状态
  useEffect(() => {
    if (generatingStatus !== "generating" || !creationId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/creations?id=${creationId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === "completed" && data.outputImages?.[0]) {
            setResultImage(data.outputImages?.[0]);
            setGeneratingStatus("success");
            updateSession();
          } else if (data.status === "failed") {
            setGeneratingError("生成失败，请重试。");
            setGeneratingStatus("error");
          }
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [generatingStatus, creationId, updateSession]);

  const handleSlotFile = async (e, slot) => {
    if (!session?.user) {
      window.location.assign(`/login?callbackUrl=${encodeURIComponent("/makeover")}`);
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingSlot(slot);
    setGeneratingError("");
    const preview = URL.createObjectURL(file);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      const item = { url: data.url, preview };
      if (slot === "selfie") {
        setSelfieImages((prev) => (prev.length >= 4 ? [...prev.slice(1), item] : [...prev, item]));
      } else if (slot === "outfit") {
        setOutfitImage(item);
      }
      setResultImage("");
      setGeneratingStatus("idle");
    } catch (err) {
      setGeneratingError("图片上传失败，请重试。");
      setGeneratingStatus("error");
    } finally {
      setUploadingSlot(null);
      try { e.target.value = ""; } catch {}
    }
  };

  const removeSelfie = (idx) => {
    setSelfieImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleGenerate = async () => {
    if (!session?.user) {
      window.location.assign(`/login?callbackUrl=${encodeURIComponent("/makeover")}`);
      return;
    }
    if (selfieImages.length === 0) {
      setGeneratingError("请先上传至少一张正脸自拍。");
      setGeneratingStatus("error");
      return;
    }

    const tpl = MAKEOVER_TYPES.find((t) => t.id === selectedType) || MAKEOVER_TYPES[0];
    // 用户可编辑提示词；未编辑时用当前风格词拼装
    const prompt = customPrompt.includes("{style}")
      ? customPrompt.replace("{style}", styleKey)
      : customPrompt;

    setElapsedSeconds(0);
    setGeneratingStatus("generating");
    setGeneratingError("");
    setResultImage("");

    // 自拍 + 衣服参考图全部作为输入图
    const imageUrls = selfieImages.map((i) => i.url);
    if (outfitImage) imageUrls.push(outfitImage.url);

    try {
      const res = await fetch("/api/generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrls,
          prompt,
          destination: `AI改造-${tpl.label}`,
          modelTier,
          resolution,
          aspectRatio: "1:1 方形",
          outputFormat: "jpg",
        }),
      });

      if (res.status === 402) {
        setGeneratingError("生成次数不足，请先购买套餐。");
        setGeneratingStatus("error");
        return;
      }
      if (res.status === 429) {
        setGeneratingError("操作过于频繁，请稍后再试。");
        setGeneratingStatus("error");
        return;
      }
      if (!res.ok) throw new Error("Generation failed");

      const data = await res.json();
      setCreationId(data.id);
      updateSession();

      if (data.status === "completed" && data.outputImages?.[0]) {
        setResultImage(data.outputImages?.[0]);
        setGeneratingStatus("success");
      }
    } catch {
      setGeneratingError("AI处理过程中出现错误，请重试。");
      setGeneratingStatus("error");
    }
  };

  const handleDownload = () => {
    if (!resultImage || !creationId) return;
    const a = document.createElement("a");
    a.href = `/api/download?id=${creationId}`;
    a.download = `型男制造机-改造-${creationId}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleReset = () => {
    setResultImage("");
    setCreationId("");
    setGeneratingStatus("idle");
    setGeneratingError("");
  };

  const activeType = MAKEOVER_TYPES.find((t) => t.id === selectedType) || MAKEOVER_TYPES[0];
  const isOutfitType = selectedType === "outfit" || selectedType === "total";

  return (
    <div className="flex-1 overflow-y-auto bg-bg-page font-sans py-8 px-4 sm:px-6 relative">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        {/* 头部 */}
        <div className="text-center max-w-2xl mx-auto flex flex-col gap-2 mb-2">
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mt-2 bg-clip-text text-transparent bg-gradient-to-r from-white via-zinc-200 to-teal-400">
            AI 形象改造
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
            上传正脸自拍，让 AI 为你换发型、换穿搭，一次搞定全新形象。
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* 左列：输入 */}
          <div className="lg:col-span-5 flex flex-col gap-5 bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded p-5 sm:p-6 shadow-2xl">
            {/* 第一步：上传自拍 */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-wider text-teal-400 bg-teal-950/40 px-2 py-0.5 rounded border border-teal-900/40">
                  第一步
                </span>
                <span className="text-[10px] text-zinc-400 font-bold">
                  上传正脸自拍（1~4张）
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 4 }).map((_, idx) => {
                  const item = selfieImages[idx];
                  return (
                    <UploadSlot
                      key={idx}
                      preview={item?.preview}
                      url={item?.url}
                      uploading={uploadingSlot === "selfie" && idx === selfieImages.length}
                      onFile={(e) => handleSlotFile(e, "selfie")}
                      onRemove={() => removeSelfie(idx)}
                      label={`角度 ${idx + 1}`}
                      hint={item ? "" : "自拍"}
                    />
                  );
                })}
              </div>
              <p className="text-[8px] text-zinc-500">
                建议多角度拍摄（正面 / 侧面 / 半侧），AI 识别更精准。
              </p>
            </div>

            {/* 衣服参考图（可选） */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400">
                  可选
                </span>
                <span className="text-[10px] text-zinc-400 font-bold">
                  衣服参考图（选1张）
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 1 }).map((_, idx) => (
                  <UploadSlot
                    key={idx}
                    preview={outfitImage?.preview}
                    url={outfitImage?.url}
                    uploading={uploadingSlot === "outfit"}
                    onFile={(e) => handleSlotFile(e, "outfit")}
                    onRemove={() => setOutfitImage(null)}
                    label="参考"
                    hint="衣服"
                  />
                ))}
              </div>
            </div>

            {/* 第二步：选改造类型 */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-wider text-teal-400 bg-teal-950/40 px-2 py-0.5 rounded border border-teal-900/40">
                  第二步
                </span>
                <span className="text-[10px] text-zinc-400 font-bold">
                  选择改造类型
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {MAKEOVER_TYPES.map((t) => {
                  const Icon = t.icon;
                  const active = selectedType === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleSelectType(t.id)}
                      className={`flex flex-col items-center gap-1.5 rounded border p-3 text-center transition-all cursor-pointer ${
                        active
                          ? "border-teal-500 ring-2 ring-teal-500/20 bg-teal-500/10"
                          : "border-zinc-800 bg-zinc-950/30 hover:border-zinc-700"
                      }`}
                    >
                      <Icon className={`text-base ${active ? "text-teal-400" : "text-zinc-500"}`} />
                      <span className="text-[10px] font-black text-zinc-200">{t.label}</span>
                      <span className="text-[8px] text-zinc-500 leading-tight">{t.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 第三步：风格选择 + 提示词 */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-wider text-teal-400 bg-teal-950/40 px-2 py-0.5 rounded border border-teal-900/40">
                  第三步
                </span>
                <span className="text-[10px] text-zinc-400 font-bold">
                  生成提示词（可编辑）
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <CustomSelect
                  label={isOutfitType ? "穿搭风格" : "发型风格"}
                  value={styleKey}
                  onChange={handleStyleChange}
                  options={isOutfitType ? OUTFIT_STYLES : HAIR_STYLES}
                />
                <CustomSelect
                  label="生成档位"
                  value={modelTier}
                  onChange={setModelTier}
                  options={TIER_OPTIONS}
                />
                <CustomSelect
                  label="分辨率"
                  value={resolution}
                  onChange={setResolution}
                  options={["1k", "2k", "4k"]}
                />
              </div>

              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                rows={4}
                placeholder="修改生成提示词，如发型细节、服装质感、场景氛围等"
                className="w-full text-[11px] text-zinc-200 bg-zinc-950/80 border border-zinc-800 focus:border-teal-500/50 rounded p-3 outline-none resize-none transition-all leading-relaxed shadow-inner"
              />
              <p className="text-[10px] text-zinc-500 -mt-1">切换风格会同步更新提示词；你也可以在这里继续细调。</p>

              <div className="flex flex-col gap-3 mt-2">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generatingStatus === "generating" || selfieImages.length === 0}
                  className="w-full flex items-center justify-center gap-2 py-3.5 text-xs font-black text-zinc-950 bg-gradient-to-r from-teal-400 to-emerald-500 hover:from-teal-500 hover:to-emerald-600 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed rounded shadow-lg shadow-teal-500/25 transition-all cursor-pointer"
                >
                  {generatingStatus === "generating" ? (
                    <>
                      <FaSpinner className="animate-spin text-xs" />
                      <span>生成中（{elapsedSeconds}秒）...</span>
                    </>
                  ) : (
                    <>
                      <FaMagic className="text-[10px]" />
                      <span>
                        AI 改造生成（{(TIER_COST[modelTier] || TIER_COST.flagship)[resolution] || 6} 次生成额度）
                      </span>
                    </>
                  )}
                </button>

                {generatingError && (
                  <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/35 rounded p-3">
                    <FaExclamationCircle className="text-red-400 flex-shrink-0 mt-0.5 text-xs" />
                    <p className="text-[10px] text-red-300 font-bold leading-normal">{generatingError}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 右列：结果 */}
          <div className="lg:col-span-7 flex flex-col bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md rounded p-5 sm:p-6 shadow-2xl min-h-[440px] lg:min-h-0">
            <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3 flex-shrink-0 mb-4">
              <div>
                <h3 className="text-xs font-black text-zinc-100 uppercase tracking-wider">
                  改造效果
                </h3>
                <p className="text-[8px] text-zinc-500 font-bold mt-0.5">
                  拖动滑块对比改造前后
                </p>
              </div>
              {generatingStatus === "generating" && (
                <span className="text-[8px] font-black text-teal-400 bg-teal-400/10 border border-teal-400/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="h-1 w-1 rounded-full bg-teal-400 animate-ping" />
                  生成中
                </span>
              )}
              {generatingStatus === "success" && (
                <span className="text-[8px] font-black text-teal-400 bg-teal-400/10 border border-teal-400/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <FaCheckCircle className="text-[9px]" />
                  完成
                </span>
              )}
            </div>

            <div className="flex-1 min-h-[300px] flex items-center justify-center relative rounded border border-zinc-800 bg-zinc-950/60 p-2 overflow-hidden shadow-inner">
              {resultImage && selfieImages[0]?.preview ? (
                <CompareSlider original={selfieImages[0].preview} result={resultImage} />
              ) : resultImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={resultImage} alt="改造结果" className="max-w-full max-h-full object-contain rounded" />
              ) : generatingStatus === "generating" ? (
                <div className="text-center max-w-xs px-4">
                  <div className="relative mx-auto w-12 h-12 mb-3">
                    <div className="absolute inset-0 rounded bg-teal-500/15 border border-teal-500/30 flex items-center justify-center">
                      <FaSpinner className="animate-spin text-xl text-teal-400" />
                    </div>
                  </div>
                  <h4 className="text-[10px] font-black text-zinc-200 uppercase tracking-wider">
                    改造生成中...
                  </h4>
                  <p className="text-[8px] text-zinc-500 mt-1 leading-normal">
                    {activeType.label}效果即将呈现
                  </p>
                  <div className="mt-3 inline-flex items-center gap-1 bg-teal-500/10 border border-teal-500/20 rounded-full px-2.5 py-0.5">
                    <FaSpinner className="animate-spin text-[6px] text-teal-400" />
                    <span className="text-[8px] font-black text-teal-300">{elapsedSeconds}秒已用时</span>
                  </div>
                </div>
              ) : (
                <div className="text-center max-w-xs px-4 py-8">
                  <div className="h-12 w-12 rounded bg-zinc-900/80 border border-zinc-800/80 flex items-center justify-center mx-auto mb-3 shadow">
                    <FaMagic className="text-lg text-zinc-700 animate-pulse" />
                  </div>
                  <h4 className="text-[10px] font-bold text-zinc-300">等待开始改造</h4>
                  <p className="text-[9px] text-zinc-500 mt-1 leading-relaxed">
                    上传自拍并选择改造类型，AI 将为你生成全新形象。
                  </p>
                </div>
              )}
            </div>

            {resultImage && (
              <div className="flex gap-2.5 mt-4 border-t border-zinc-800/60 pt-3.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-gradient-to-r from-teal-400 to-emerald-500 hover:from-teal-500 hover:to-emerald-600 text-zinc-950 rounded text-xs font-black shadow-lg shadow-teal-500/20 cursor-pointer transition-all hover:scale-[1.01]"
                >
                  <FaDownload className="text-[10px]" />
                  <span>下载图片</span>
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-3.5 py-2.5 bg-zinc-950 hover:bg-red-950/40 hover:text-red-400 border border-zinc-800 hover:border-red-500/20 text-zinc-500 rounded text-xs font-bold transition-all cursor-pointer"
                  title="重新生成"
                >
                  <FaTrashAlt className="text-[10px]" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
