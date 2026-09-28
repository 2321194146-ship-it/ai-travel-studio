import { cookies } from "next/headers";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

export async function getGuestIdentity() {
  const store = await cookies();
  const existing = store.get("mf_guest_id")?.value;
  const token = existing || crypto.randomBytes(8).toString("hex");
  const email = `guest_${token}@guest.local`;
  const user = await prisma.user.upsert({
    where: { email }, update: {},
    create: { email, name: `型男用户${token.slice(0, 4).toUpperCase()}` },
  });
  return { user, token, isNew: !existing };
}

export function setGuestCookie(response, token) {
  response.cookies.set("mf_guest_id", token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 48, path: "/",
  });
}
