import { storedImageResponse } from "@/lib/stored-image.mjs";
import { canReadStoredImage } from "@/lib/upload-access";

export const dynamic = "force-dynamic";
export async function GET(request, { params }) {
  const segments = (await params)?.path;
  if (!(await canReadStoredImage(request, "outputs", segments))) return new Response(null, { status: 404 });
  return storedImageResponse("outputs", Promise.resolve({ path: segments }), "private, no-store");
}
