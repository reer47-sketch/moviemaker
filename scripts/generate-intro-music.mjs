/**
 * One-time script: generate intro music files using ElevenLabs Sound Effects API
 * Run: node scripts/generate-intro-music.mjs
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read ELEVENLABS_API_KEY from .env.local
const envFile = await fs.readFile(path.join(__dirname, "../.env.local"), "utf-8").catch(() => "");
const apiKeyMatch = envFile.match(/ELEVENLABS_API_KEY=(.+)/);
const API_KEY = apiKeyMatch?.[1]?.trim();

if (!API_KEY) {
  console.error("❌ ELEVENLABS_API_KEY not found in .env.local");
  process.exit(1);
}

const OUTPUT_DIR = path.join(__dirname, "../public/music");

const TRACKS = [
  {
    id: "upbeat",
    filename: "upbeat.mp3",
    prompt: "upbeat cheerful intro music sting, bright acoustic guitar and light percussion, energetic and positive, short intro jingle 6 seconds",
  },
  {
    id: "calm",
    filename: "calm.mp3",
    prompt: "calm emotional piano intro, gentle ambient pads, soft and sentimental, relaxing short intro 6 seconds",
  },
  {
    id: "dramatic",
    filename: "dramatic.mp3",
    prompt: "dramatic cinematic orchestral sting, powerful strings and brass, intense and epic, short intro stinger 6 seconds",
  },
  {
    id: "exciting",
    filename: "exciting.mp3",
    prompt: "exciting high energy electronic music intro, punchy drums and synth, dynamic and powerful, short intro 6 seconds",
  },
  {
    id: "mysterious",
    filename: "mysterious.mp3",
    prompt: "mysterious ethereal synthesizer intro, atmospheric and unique, dark ambient with subtle melody, short intro 6 seconds",
  },
];

async function generateTrack(track) {
  console.log(`🎵 Generating: ${track.id} ...`);
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: {
      "xi-api-key": API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: track.prompt,
      duration_seconds: 6,
      prompt_influence: 0.5,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs SFX error ${res.status}: ${err}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const outPath = path.join(OUTPUT_DIR, track.filename);
  await fs.writeFile(outPath, buffer);
  console.log(`  ✅ Saved → public/music/${track.filename} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

console.log("🚀 Generating intro music tracks via ElevenLabs SFX...\n");

for (const track of TRACKS) {
  try {
    await generateTrack(track);
    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 800));
  } catch (e) {
    console.error(`  ❌ Failed: ${track.id} —`, e.message);
  }
}

console.log("\n✨ Done!");
