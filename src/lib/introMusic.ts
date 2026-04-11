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
  targetWords: number;
  minScenes: number;
  maxScenes: number;
};

export const DURATION_OPTIONS: DurationOption[] = [
  { id: "short", label: "숏폼",  sub: "1분 이내",  targetWords: 200,  minScenes: 3,  maxScenes: 5  },
  { id: "2min",  label: "2분",   sub: "롱폼",      targetWords: 350,  minScenes: 6,  maxScenes: 8  },
  { id: "3min",  label: "3분",   sub: "롱폼",      targetWords: 550,  minScenes: 10, maxScenes: 13 },
  { id: "5min",  label: "5분",   sub: "롱폼",      targetWords: 900,  minScenes: 18, maxScenes: 22 },
  { id: "10min", label: "10분",  sub: "롱폼",      targetWords: 1700, minScenes: 35, maxScenes: 42 },
];
