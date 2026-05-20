export type AgentKind = "archivist" | "collector";

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

function createAgentGroup(kind: AgentKind, count: number, radius: number, startAngle: number): EchoAgent[] {
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
    const angle = startAngle + (i / Math.max(1, count)) * Math.PI * 2;
    out.push({
      id: `${kind}-${i + 1}`,
      kind,
      name: names[i % names.length],
      trait: traits[i % traits.length],
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      targetMemoryId: null,
      state: "patrolling",
    });
  }
  return out;
}

export function createCitizens(archivists = 5, collectors = 3): EchoAgent[] {
  return [
    ...createAgentGroup("archivist", archivists, 120, 0),
    ...createAgentGroup("collector", collectors, 170, Math.PI / 5),
  ];
}
