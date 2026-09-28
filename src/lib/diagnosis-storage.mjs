// Persist only report fields, never raw provider responses or credentials.
const DETAIL_FIELDS = [
  "focus", "goal", "hairReason", "faceBalance", "jawline", "outfitAdvice",
  "avoid", "actionPlan", "aura", "auraScore", "camera", "cameraScore",
  "confidence", "scoreReasons", "inputQuality", "review", "provider", "model",
  "analysisSource", "analysisNote",
];

export function diagnosisDetails(report = {}) {
  return JSON.parse(JSON.stringify(Object.fromEntries(
    DETAIL_FIELDS.filter((key) => report[key] !== undefined)
      .map((key) => [key, report[key]]),
  )));
}

export function restoreDiagnosis(record) {
  if (!record) return record;
  const { reportData, ...base } = record;
  const details = reportData && typeof reportData === "object" && !Array.isArray(reportData)
    ? diagnosisDetails(reportData)
    : {};
  return { ...details, ...base };
}
