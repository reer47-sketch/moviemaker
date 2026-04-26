import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Include public/fonts and public/music in serverless function bundles
  // so FFmpeg drawtext can access font files on Vercel
  outputFileTracingIncludes: {
    "/api/generate/subtitles": ["./public/fonts/**"],
    "/api/generate/render": ["./public/fonts/**", "./public/music/**"],
  },
  serverExternalPackages: [
    "@ffmpeg-installer/ffmpeg",
    "@ffprobe-installer/ffprobe",
    "fluent-ffmpeg",
    "sharp",
    "replicate",
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
