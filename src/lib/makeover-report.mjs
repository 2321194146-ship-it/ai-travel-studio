// Keep report copy grounded in fields returned by the reviewed photo diagnosis.
// Missing fields stay empty so the UI can state that the photo cannot confirm them.
export function buildReportInsights(report = {}) {
  return {
    focus: typeof report.focus === "string" ? report.focus.trim() : "",
    goal: typeof report.goal === "string" ? report.goal.trim() : "",
    hairReason: typeof report.hairReason === "string" ? report.hairReason.trim() : "",
    faceBalance: typeof report.faceBalance === "string" ? report.faceBalance.trim() : "",
    jawline: typeof report.jawline === "string" ? report.jawline.trim() : "",
    outfitAdvice: typeof report.outfitAdvice === "string" ? report.outfitAdvice.trim() : "",
    avoid: typeof report.avoid === "string" ? report.avoid.trim() : "",
    actionPlan: Array.isArray(report.actionPlan)
      ? report.actionPlan.filter((item) => typeof item === "string" && item.trim())
      : [],
  };
}
