import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { restoreDiagnosis } from "@/lib/diagnosis-storage.mjs";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });
  const userId = session.user.id;
  const [user, photos, diagnoses, generations, orders, ledger] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, phone: true, email: true, image: true, membership: true, membershipExpiresAt: true, credits: true } }).catch(() => null),
    prisma.userPhoto.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, select: { id: true, url: true, thumbUrl: true, label: true, createdAt: true } }),
    prisma.diagnose.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, inputImage: true, faceShape: true, skinTone: true, hairstyles: true, outfits: true, styles: true, score: true, suggestion: true, reportData: true, createdAt: true } }),
    prisma.generation.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, inputImages: true, outputImages: true, templateName: true, category: true, modelName: true, provider: true, actualModel: true, status: true, creditCost: true, failureReason: true, createdAt: true } }),
    prisma.manualOrder.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, planId: true, planName: true, amount: true, status: true, channel: true, createdAt: true, paidAt: true } }),
    prisma.creditLedger.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, amount: true, balance: true, reason: true, sourceType: true, createdAt: true } }),
  ]);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ exportedAt: new Date().toISOString(), user, photos, diagnoses: diagnoses.map(restoreDiagnosis), generations, orders, ledger });
}
