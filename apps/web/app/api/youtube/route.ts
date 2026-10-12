import { NextRequest, NextResponse } from "next/server";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");

  if (!query) {
    return NextResponse.json({ videos: [] });
  }

  try {
    // If we have a YouTube API key, use it
    if (YOUTUBE_API_KEY) {
      const url = new URL("https://www.googleapis.com/youtube/v3/search");
      url.searchParams.set("part", "snippet");
      url.searchParams.set("q", query);
      url.searchParams.set("type", "video");
      url.searchParams.set("maxResults", "8");
      url.searchParams.set("key", YOUTUBE_API_KEY);
      url.searchParams.set("relevanceLanguage", "en");
      url.searchParams.set("safeSearch", "none");

      const res = await fetch(url.toString());
      const data = await res.json();

      if (data.items) {
        const videos = data.items.map((item: any) => ({
          id: item.id.videoId,
          title: item.snippet.title,
          thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url,
          channel: item.snippet.channelTitle,
        }));
        return NextResponse.json({ videos });
      }
    }

    // Fallback: Use Invidious API (public YouTube frontend)
    const invidiousInstances = [
      "https://vid.puffyan.us",
      "https://invidious.snopyta.org",
      "https://yewtu.be",
    ];

    for (const instance of invidiousInstances) {
      try {
        const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video`;
        const res = await fetch(url, { 
          headers: { "Accept": "application/json" },
          signal: AbortSignal.timeout(5000)
        });
        
        if (res.ok) {
          const data = await res.json();
          const videos = data.slice(0, 8).map((item: any) => ({
            id: item.videoId,
            title: item.title,
            thumbnail: item.videoThumbnails?.find((t: any) => t.quality === "medium")?.url 
              || `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`,
            channel: item.author,
          }));
          return NextResponse.json({ videos });
        }
      } catch {
        continue;
      }
    }

    // Final fallback: Return thumbnail URLs directly from YouTube
    // This doesn't give us real results, but at least the page won't break
    return NextResponse.json({ videos: [] });

  } catch (error) {
    console.error("YouTube search error:", error);
    return NextResponse.json({ videos: [] });
  }
}
