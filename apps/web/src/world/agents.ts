export type AgentKind = "archivist";

export type EchoAgent = {
  id: string;
  kind: AgentKind;
  name: string;
  trait: "gentle" | "obsessive" | "poetic" | "stoic";
  x: number;
  y: number;
  targetMemoryId: string | null;
  state: "idle" | "patrolling" | "preserving";
};

export function createArchivists(count = 6): EchoAgent[] {
  const names = [
    "Iris",
    "Rune",
    "Morrow",
    "Sable",
    "Kite",
    "Noor",
    "Veda",
    "Tao",
    "Lumen",
  ] as const;
  const traits: EchoAgent["trait"][] = ["gentle", "obsessive", "poetic", "stoic"];
  const out: EchoAgent[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / Math.max(1, count)) * Math.PI * 2;
    out.push({
      id: `archivist-${i + 1}`,
      kind: "archivist",
      name: names[i % names.length],
      trait: traits[i % traits.length],
      x: Math.cos(angle) * 120,
      y: Math.sin(angle) * 120,
      targetMemoryId: null,
      state: "patrolling",
    });
  }
  return out;
}
