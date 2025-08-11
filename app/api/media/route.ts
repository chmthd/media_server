import { getMediaFiles } from "@/utils/mediaScanner";

export async function GET() {
  const mediaPath = process.env.MEDIA_PATH;

  if (!mediaPath) {
    return new Response(JSON.stringify({ error: "MEDIA_PATH not set" }), {
      status: 500,
    });
  }

  try {
    const files = await getMediaFiles(mediaPath);
    return new Response(JSON.stringify(files), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error scanning media:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
