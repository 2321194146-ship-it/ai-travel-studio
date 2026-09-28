import test from "node:test";
import assert from "node:assert/strict";
import { buildReportInsights } from "../src/lib/makeover-report.mjs";
import { diagnosisDetails, restoreDiagnosis } from "../src/lib/diagnosis-storage.mjs";

test("missing photo evidence never becomes a face-shape template", () => {
  const result = buildReportInsights({ faceShape: "圆形脸", aura: "沉稳务实" });
  for (const key of ["focus", "goal", "hairReason", "avoid"]) assert.equal(result[key], "");
  assert.deepEqual(result.actionPlan, []);
});

test("reviewed personal suggestions are preserved verbatim", () => {
  const report = {
    focus: "照片中下颌线被顶光和低机位削弱", goal: "用柔和侧光和微侧身恢复轮廓",
    hairReason: "顶部保留高度，避免两侧堆量", outfitAdvice: "用低饱和蓝灰叠穿，保持肩线利落",
    avoid: "避免正顶光和贴脸刘海", actionPlan: ["先调整光线", "再试发型", "最后拍展示面"],
  };
  const result = buildReportInsights(report);
  for (const key of Object.keys(report)) assert.deepEqual(result[key], report[key]);
});

test("database JSON round trip restores the full report without browser storage", () => {
  const details = {
    focus: "顶部头发贴头，建议增加自然纹理", goal: "自然清爽", hairReason: "两侧保留过渡",
    outfitAdvice: "肩线清楚", avoid: "避免顶光", actionPlan: ["换光线", "试发型", "拍照片"],
    auraScore: 62, cameraScore: 58, confidence: 85,
    scoreReasons: { camera: { basis: "光线不均", strength: "照片清晰", opportunity: "改用柔光" } },
    review: { status: "corrected", confidence: 85 }, inputQuality: "清晰正面照",
  };
  const stored = JSON.parse(JSON.stringify({ id: "record-1", score: 68, reportData: diagnosisDetails(details) }));
  const restored = restoreDiagnosis(stored);
  for (const [key, value] of Object.entries(details)) assert.deepEqual(restored[key], value);
  assert.equal(restored.id, "record-1");
  assert.equal(restored.score, 68);
  assert.equal("reportData" in restored, false);
});

test("legacy records remain honest and provider credentials are never persisted", () => {
  assert.deepEqual(restoreDiagnosis({ id: "old", score: 68, reportData: null }), { id: "old", score: 68 });
  assert.equal(buildReportInsights(restoreDiagnosis({ id: "old" })).focus, "");
  assert.deepEqual(diagnosisDetails({ focus: "照片依据", apiKey: "fixture-secret", rawResponse: { token: "fixture-token" } }), { focus: "照片依据" });
  assert.equal(restoreDiagnosis({ id: "real", reportData: { id: "wrong", score: 100, focus: "依据" } }).id, "real");
});
