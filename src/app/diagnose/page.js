"use client";

import { useState, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  FaUpload,
  FaSpinner,
  FaStar,
  FaHandScissors,
  FaTshirt,
  FaPalette,
  FaLightbulb,
  FaArrowRight,
  FaCamera,
} from "react-icons/fa";

function textValue(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function hairstyleCopy(item) {
  if (typeof item === "string") return { name: item, description: "" };
  return {
    name: textValue(item?.name, "推荐发型"),
    description: textValue(item?.desc || item?.why || item?.description || item?.execution),
    suitable: Number.isFinite(Number(item?.suitable)) ? Number(item.suitable) : null,
  };
}

function outfitCopy(item) {
  if (typeof item === "string") return { name: item, description: "" };
  const details = Array.isArray(item?.items) ? item.items.filter(Boolean).join(" · ") : "";
  return {
    name: textValue(item?.name, "穿搭建议"),
    description: textValue(item?.desc || item?.why || item?.description, details),
  };
}

function styleCopy(item) {
  if (typeof item === "string") return { name: item, description: "", tags: [] };
  const tags = Array.isArray(item?.tags)
    ? item.tags
    : Array.isArray(item?.keywords)
      ? item.keywords
      : [];
  return {
    name: textValue(item?.style || item?.name, "风格建议"),
    description: textValue(item?.desc || item?.reason || item?.description),
    tags: tags.filter(Boolean),
  };
}

export default function DiagnosePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 上传图片
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.url) {
        setImageUrl(data.url);
        setResult(null);
      }
    } catch (err) {
      setError("图片上传失败，请重试");
    }
  };

  const handleDiagnose = async () => {
    if (!imageUrl) {
      setError("请先上传一张正面照片");
      return;
    }
    if (!session?.user) {
      signIn();
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.data);
      } else {
        setError("诊断失败，请重试");
      }
    } catch (err) {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-white py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* 标题 */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
            AI形象诊断
          </h1>
          <p className="text-zinc-400 text-sm">上传正面照，AI分析你的脸型，推荐最适合的发型和穿搭</p>
        </div>

        {/* 上传区域 */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 mb-6">
          <div
            className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center cursor-pointer hover:border-amber-500/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            {imageUrl ? (
              <img src={imageUrl} alt="上传照片" className="max-h-64 mx-auto rounded-lg object-contain" />
            ) : (
              <div className="py-8">
                <FaCamera className="text-4xl text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-400 text-sm">点击上传正面照片</p>
                <p className="text-zinc-600 text-xs mt-1">建议光线充足、五官清晰</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <button
            onClick={handleDiagnose}
            disabled={loading || !imageUrl}
            className="w-full mt-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <><FaSpinner className="animate-spin" /> AI分析中...</>
            ) : (
              <><FaLightbulb /> 开始AI诊断</>
            )}
          </button>

          {error && <p className="text-red-400 text-sm mt-3 text-center">{error}</p>}
        </div>

        {/* 诊断结果 */}
        {result && (
          <div className="space-y-4 animate-fadeIn">
            {/* 评分和脸型 */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-zinc-400 text-xs mb-1">你的脸型</p>
                  <p className="text-2xl font-bold text-amber-400">{result.faceShape}</p>
                </div>
                <div className="text-right">
                  <p className="text-zinc-400 text-xs mb-1">形象评分</p>
                  <div className="flex items-center gap-1">
                    <FaStar className="text-amber-400" />
                    <span className="text-3xl font-bold">{result.score}</span>
                    <span className="text-zinc-500 text-sm">/100</span>
                  </div>
                </div>
              </div>
              <p className="text-zinc-300 text-sm leading-relaxed">{result.suggestion}</p>
            </div>

            {/* 推荐发型 */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
              <h3 className="flex items-center gap-2 text-lg font-bold mb-4">
                <FaHandScissors className="text-amber-400" /> 推荐发型
              </h3>
              <div className="space-y-3">
                {result.hairstyles.map((item, i) => {
                  const h = hairstyleCopy(item);
                  return (
                  <div key={i} className="flex items-center justify-between bg-zinc-800/50 rounded-lg p-3">
                    <div>
                      <p className="font-medium text-sm">{h.name}</p>
                      {h.description && <p className="text-zinc-400 text-xs">{h.description}</p>}
                    </div>
                    {h.suitable !== null && <span className="text-amber-400 text-xs font-bold">匹配度 {h.suitable}%</span>}
                  </div>
                  );
                })}
              </div>
            </div>

            {/* 推荐穿搭 */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
              <h3 className="flex items-center gap-2 text-lg font-bold mb-4">
                <FaTshirt className="text-amber-400" /> 穿搭建议
              </h3>
              <div className="space-y-2">
                {result.outfits.map((item, i) => {
                  const o = outfitCopy(item);
                  return (
                  <div key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                    <span className="text-amber-400 mt-0.5">{i + 1}.</span>
                    <span><b className="text-zinc-100">{o.name}</b>{o.description && `：${o.description}`}</span>
                  </div>
                  );
                })}
              </div>
            </div>

            {/* 推荐风格 */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
              <h3 className="flex items-center gap-2 text-lg font-bold mb-4">
                <FaPalette className="text-amber-400" /> 风格定位
              </h3>
              <div className="grid grid-cols-1 gap-3">
                {result.styles.map((item, i) => {
                  const s = styleCopy(item);
                  return (
                  <div key={i} className="bg-zinc-800/50 rounded-lg p-3">
                    <p className="font-medium text-sm text-amber-400">{s.name}</p>
                    {s.description && <p className="text-zinc-400 text-xs mt-1">{s.description}</p>}
                    <div className="flex gap-1 mt-2">
                      {s.tags.map((t, j) => (
                        <span key={j} className="text-xs bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>

            {/* 引导转化 */}
            <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-2xl p-6 text-center">
              <p className="text-lg font-bold mb-2">诊断完了，想看看自己变帅后的样子吗？</p>
              <p className="text-zinc-400 text-sm mb-4">AI一键生成你的高质感展示面，18种场景任选</p>
              <button
                onClick={() => router.push("/")}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all"
              >
                去生成展示面 <FaArrowRight />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
