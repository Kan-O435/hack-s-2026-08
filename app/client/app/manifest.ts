import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "冷笑、何それ",
    short_name: "冷笑図鑑",
    description: "会話中の「冷笑」をリアルタイムに検出し、スコア化して冷笑する会話ゲーム",
    start_url: "/home",
    display: "standalone",
    background_color: "#171c23",
    theme_color: "#171c23",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
