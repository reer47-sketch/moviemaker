import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Include public/fonts and public/music in serverless function bundles
  outputFileTracingIncludes: {
    "/api/generate/subtitles": ["./public/fonts/**"],
    "/api/generate/render": ["./public/fonts/**", "./public/music/**"],
  },

  // Exclude heavy files that are not needed at runtime on Vercel (Linux x64)
  outputFileTracingExcludes: {
    "*": [
      // Non-Linux FFmpeg binaries (only linux-x64 is needed on Vercel)
      "node_modules/@ffmpeg-installer/win32-x64/**",
      "node_modules/@ffmpeg-installer/darwin-x64/**",
      "node_modules/@ffmpeg-installer/darwin-arm64/**",
      "node_modules/@ffmpeg-installer/linux-ia32/**",
      // Non-Linux Sharp binaries
      "node_modules/@img/sharp-win32-x64/**",
      "node_modules/@img/sharp-darwin-x64/**",
      "node_modules/@img/sharp-darwin-arm64/**",
      "node_modules/@img/sharp-linux-arm/**",
      "node_modules/@img/sharp-linux-arm64/**",
      // Removed packages (cleanup any lingering traces)
      "node_modules/@remotion/**",
      "node_modules/remotion/**",
      "node_modules/@ffprobe-installer/**",
      "node_modules/fluent-ffmpeg/**",
      // Dev/build tools not needed at runtime
      "node_modules/typescript/**",
      "node_modules/@babel/**",
      "node_modules/webpack/**",
      "node_modules/@ts-morph/**",
      "node_modules/@rspack/**",
      "node_modules/@esbuild/**",
      "node_modules/lightningcss-win32-x64-msvc/**",
      // Test/doc files in all packages
      "node_modules/**/test/**",
      "node_modules/**/tests/**",
      "node_modules/**/__tests__/**",
      "node_modules/**/docs/**",
      "node_modules/**/*.md",
      "node_modules/**/*.map",
    ],
  },

  serverExternalPackages: [
    "@ffmpeg-installer/ffmpeg",
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
