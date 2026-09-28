import crypto from "node:crypto";

const SCRYPT_PREFIX = "scrypt";

export function normalizePhone(value) {
  const phone = String(value || "").trim().replace(/[\s-]/g, "");
  return /^1[3-9]\d{9}$/.test(phone) ? phone : null;
}

export function hashPassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("密码至少需要8位");
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${SCRYPT_PREFIX}$${salt}$${derived}`;
}

export function verifyPassword(password, storedHash) {
  if (typeof password !== "string" || typeof storedHash !== "string") return false;
  const [prefix, salt, expected] = storedHash.split("$");
  if (prefix !== SCRYPT_PREFIX || !salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(actual, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
