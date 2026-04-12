export type IntroMusicOption = {
  id: string;
  label: string;
  desc: string;
  emoji: string;
  filename: string; // public/music/{filename}
};

export const INTRO_MUSIC_OPTIONS: IntroMusicOption[] = [
  { id: "upbeat",     label: "밝고 경쾌",     emoji: "🎵", desc: "활기차고 경쾌한 분위기",   filename: "upbeat.mp3" },
  { id: "calm",       label: "차분하고 감성적", emoji: "🎶", desc: "잔잔하고 감성적인 분위기", filename: "calm.mp3" },
  { id: "dramatic",   label: "드라마틱",       emoji: "🎸", desc: "긴장감 있는 드라마틱한 분위기", filename: "dramatic.mp3" },
  { id: "exciting",   label: "신나는 에너지",   emoji: "🥁", desc: "에너지 넘치는 신나는 분위기", filename: "exciting.mp3" },
  { id: "mysterious", label: "신비롭고 신선한", emoji: "🎹", desc: "신비롭고 독특한 분위기",   filename: "mysterious.mp3" },
];

export type DurationOption = {
  id: string;
  label: string;
  sub: string;
  targetCharsKo: number; // Korean characters (~320 chars/min for ElevenLabs TTS)
  targetWordsEn: number; // English words (~130 words/min)
  minScenes: number;
  maxScenes: number;
};

export const DURATION_OPTIONS: DurationOption[] = [
  { id: "short", label: "숏폼",  sub: "1분 이내",  targetCharsKo: 250,  targetWordsEn: 110,  minScenes: 3,  maxScenes: 4  },
  { id: "2min",  label: "2분",   sub: "롱폼",      targetCharsKo: 600,  targetWordsEn: 260,  minScenes: 5,  maxScenes: 7  },
  { id: "3min",  label: "3분",   sub: "롱폼",      targetCharsKo: 900,  targetWordsEn: 390,  minScenes: 8,  maxScenes: 11 },
  { id: "5min",  label: "5분",   sub: "롱폼",      targetCharsKo: 1500, targetWordsEn: 640,  minScenes: 14, maxScenes: 18 },
  { id: "10min", label: "10분",  sub: "롱폼",      targetCharsKo: 3000, targetWordsEn: 1280, minScenes: 28, maxScenes: 36 },
];
