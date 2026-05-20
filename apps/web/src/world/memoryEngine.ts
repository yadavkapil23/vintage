export type EmotionKey =
  | "nostalgia"
  | "loneliness"
  | "comfort"
  | "ambition"
  | "joy"
  | "fear"
  | "burnout"
  | "dream";

export type MemoryEcho = {
  id: string;
  text: string;
  emotions: Record<EmotionKey, number>;
  semanticTags: string[];
  district: string;
  atmosphere: string;
  worldX: number;
  worldY: number;
  decayLevel: number;
  mutated: boolean;
  lastVisitedAt: number;
  createdAt: number;
};

const emotionLexicon: Record<EmotionKey, string[]> = {
  nostalgia: ["childhood", "old", "school", "retro", "remember", "past"],
  loneliness: ["alone", "lonely", "night", "silent", "empty", "isolated"],
  comfort: ["home", "warm", "tea", "maggie", "maggi", "rain", "cozy"],
  ambition: ["exam", "study", "coding", "goal", "work", "career"],
  joy: ["laugh", "happy", "festival", "friend", "celebrate", "smile"],
  fear: ["afraid", "dark", "panic", "anxious", "terror", "worry"],
  burnout: ["burnout", "tired", "deadline", "overwork", "exhausted", "stress"],
  dream: ["dream", "floating", "surreal", "weird", "impossible", "sleep"],
};

const semanticGroups: Record<string, string[]> = {
  weather: ["rain", "monsoon", "storm", "sunset", "fog"],
  time: ["3am", "late", "night", "morning", "dawn"],
  study: ["exam", "book", "study", "library", "college"],
  food: ["maggi", "maggie", "coffee", "tea", "noodles"],
  social: ["friend", "family", "class", "roommate", "hostel"],
  internet: ["forum", "meme", "chat", "discord", "reddit"],
};

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickDistrict(emotions: Record<EmotionKey, number>): string {
  if (emotions.dream > 0.55) return "Dream Zone";
  if (emotions.burnout + emotions.loneliness > 1.05) return "Burnout Sector";
  if (emotions.nostalgia + emotions.comfort > 0.95) return "Nostalgia District";
  if (emotions.fear > 0.55) return "Shiver Corridor";
  return "Resonance Commons";
}

function pickAtmosphere(emotions: Record<EmotionKey, number>): string {
  if (emotions.dream > 0.55) return "unstable geometry, soft neon fog";
  if (emotions.burnout > 0.6) return "rainy cyberpunk apartments, cold fluorescent glow";
  if (emotions.nostalgia > 0.6) return "vhs grain, sunset haze, retro artifacts";
  if (emotions.comfort > 0.55) return "warm windows, lo-fi cafes, low rainfall";
  return "mixed digital weather, adaptive ambient lights";
}

function extractSemanticTags(text: string): string[] {
  const lower = text.toLowerCase();
  const tags = Object.entries(semanticGroups)
    .filter(([, words]) => words.some((w) => lower.includes(w)))
    .map(([group]) => group);
  return tags.length ? tags : ["personal", "ambient"];
}

export function synthesizeMemoryEcho(text: string): MemoryEcho {
  const lower = text.toLowerCase();
  const emotions = {} as Record<EmotionKey, number>;

  (Object.keys(emotionLexicon) as EmotionKey[]).forEach((emotion) => {
    const terms = emotionLexicon[emotion];
    const hits = terms.reduce((n, term) => n + (lower.includes(term) ? 1 : 0), 0);
    emotions[emotion] = Math.min(1, 0.16 + hits * 0.23);
  });

  const seed = hashString(text);
  const worldX = ((seed % 2800) - 1400) / 10;
  const worldY = ((((seed / 2800) | 0) % 2800) - 1400) / 10;
  const semanticTags = extractSemanticTags(text);

  return {
    id: `echo-${seed.toString(16)}`,
    text,
    emotions,
    semanticTags,
    district: pickDistrict(emotions),
    atmosphere: pickAtmosphere(emotions),
    worldX,
    worldY,
    decayLevel: 0,
    mutated: false,
    lastVisitedAt: Date.now(),
    createdAt: Date.now(),
  };
}

const mutationDistricts = [
  "Static Cathedral",
  "Mirror Cache",
  "Glitch Garden",
  "Echo Ruins",
  "Phantom Exchange",
];

const mutationAtmospheres = [
  "broken neon rain, recursive ad jingles, torn skybox",
  "floating UI shards, delayed voices, phantom train hum",
  "inverted gravity alleys, CRT ghosts, wet concrete haze",
  "memory fragments looping at low bitrate",
];

export function mutateMemory(memory: MemoryEcho): MemoryEcho {
  const seed = hashString(memory.id + memory.text);
  const district = mutationDistricts[seed % mutationDistricts.length];
  const atmosphere = mutationAtmospheres[(seed >>> 3) % mutationAtmospheres.length];
  const mutatedTags = Array.from(new Set([...memory.semanticTags, "corrupted", "myth", "anomaly"])).slice(0, 6);
  return {
    ...memory,
    mutated: true,
    district,
    atmosphere,
    semanticTags: mutatedTags,
  };
}
