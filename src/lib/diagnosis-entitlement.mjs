export const FREE_DIAGNOSIS_LIMIT = 3;

const MEMBERSHIP_TIERS = new Set(["STANDARD", "HIGH", "FLAGSHIP"]);

export function hasActiveDiagnosisMembership({ membership, membershipExpiresAt, now = new Date() } = {}) {
  if (!MEMBERSHIP_TIERS.has(String(membership || "").toUpperCase())) return false;
  if (!membershipExpiresAt) return false;
  return new Date(membershipExpiresAt).getTime() > new Date(now).getTime();
}

export function getDiagnosisQuota({ membership, membershipExpiresAt, totalCount = 0, todayCount = 0, now = new Date() } = {}) {
  const isMember = hasActiveDiagnosisMembership({ membership, membershipExpiresAt, now });
  const used = isMember ? Number(todayCount) || 0 : Number(totalCount) || 0;
  return {
    isMember,
    scope: isMember ? "daily" : "lifetime",
    limit: FREE_DIAGNOSIS_LIMIT,
    used,
    remaining: Math.max(FREE_DIAGNOSIS_LIMIT - used, 0),
  };
}
