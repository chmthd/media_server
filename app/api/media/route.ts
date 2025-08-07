import { getMediaFiles } from "@/utils/mediaScanner";

export async function GET() {
    const mediaPath = process.env.MEDIA_PATH;

    if (!mediaPath) {
        return new Response('MEDIA_PATH not set', {status: 500});
    }
    const files = getMediaFiles(mediaPath);
    return Response.json(files);
}