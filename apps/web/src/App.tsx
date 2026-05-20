import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { MapCanvas } from "./components/MapCanvas";
import { useCameraStore } from "./store/cameraStore";
import { mutateMemory, synthesizeMemoryEcho } from "./world/memoryEngine";
import type { MemoryEcho } from "./world/memoryEngine";
import { createCitizens } from "./world/agents";
import type { EchoAgent } from "./world/agents";

type AgentEvent = {
  id: string;
  at: number;
  text: string;
  memoryId?: string;
};

type Faction = "archivist" | "collector" | "troll";
type PairKey = `${Faction}:${Faction}`;

type Diplomacy = {
  alliance: PairKey | null;
  ceasefire: PairKey | null;
  expiresAtTick: number;
};

type SavedWorld = {
  memories: MemoryEcho[];
  agents: EchoAgent[];
  agentEvents: AgentEvent[];
  selectedMemoryId: string | null;
  territoryCaptureCounts: Record<Faction, number>;
  territoryStreakLeader: { faction: Faction; count: number };
  worldTick: number;
  diplomacy: Diplomacy;
};

const SAVE_KEY = "echonet-world-v1";

const traitVoice: Record<EchoAgent["trait"], string[]> = {
  gentle: ["stabilized", "softly preserved", "kept warm"],
  obsessive: ["indexed", "cross-referenced", "locked into archive"],
  poetic: ["listened to", "carried forward", "translated into echoes"],
  stoic: ["secured", "fortified", "recovered"],
};

const collectorVoice: Record<EchoAgent["trait"], string[]> = {
  gentle: ["rescued fragments from", "mended the edges of", "coaxed signal back into"],
  obsessive: ["recompiled ruins of", "catalogued anomalies in", "sealed corruption around"],
  poetic: ["sang static lullabies to", "stitched moonlight into", "reframed the myth of"],
  stoic: ["stabilized breach lines in", "contained distortion in", "recovered structural memory in"],
};

const trollVoice: Record<EchoAgent["trait"], string[]> = {
  gentle: ["nudged static into", "blurred edges around", "whispered noise into"],
  obsessive: ["seeded recursive spam in", "injected corruption loops into", "weaponized drift inside"],
  poetic: ["painted glitches across", "sang entropy into", "turned memory rain acidic in"],
  stoic: ["breached safeguards in", "destabilized archives in", "fractured continuity in"],
};

const factionLabel: Record<Faction, string> = {
  archivist: "Archivists",
  collector: "Collectors",
  troll: "Trolls",
};

function makePair(a: Faction, b: Faction): PairKey {
  return [a, b].sort().join(":") as PairKey;
}

function hasPair(pair: PairKey | null, a: Faction, b: Faction): boolean {
  if (!pair) return false;
  return pair === makePair(a, b);
}

function randomFaction(exclude?: Faction): Faction {
  const all: Faction[] = ["archivist", "collector", "troll"];
  const pool = exclude ? all.filter((f) => f !== exclude) : all;
  return pool[Math.floor(Math.random() * pool.length)];
}

function resetWorld() {
  return {
    memories: [] as MemoryEcho[],
    agents: createCitizens(5, 3),
    agentEvents: [] as AgentEvent[],
    selectedMemoryId: null as string | null,
    territoryCaptureCounts: { archivist: 0, collector: 0, troll: 0 } as Record<Faction, number>,
    territoryStreakLeader: { faction: "archivist" as Faction, count: 0 },
    worldTick: 0,
    diplomacy: { alliance: null, ceasefire: null, expiresAtTick: 0 } as Diplomacy,
  };
}

function tryLoadWorld(): SavedWorld | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedWorld;
    if (!Array.isArray(parsed.memories) || !Array.isArray(parsed.agents) || !Array.isArray(parsed.agentEvents)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function App() {
  const { x, y, zoom } = useCameraStore();
  const loaded = useMemo(() => tryLoadWorld(), []);
  const seed = loaded ?? resetWorld();

  const [memoryText, setMemoryText] = useState("");
  const [memories, setMemories] = useState<MemoryEcho[]>(seed.memories);
  const [agents, setAgents] = useState<EchoAgent[]>(seed.agents);
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>(seed.agentEvents);
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(seed.selectedMemoryId);
  const [decayHistoryByMemory, setDecayHistoryByMemory] = useState<Record<string, number[]>>({});
  const [ownerHistoryByMemory, setOwnerHistoryByMemory] = useState<Record<string, Faction[]>>({});
  const [territoryCaptureCounts, setTerritoryCaptureCounts] = useState<Record<Faction, number>>(seed.territoryCaptureCounts);
  const [territoryStreakLeader, setTerritoryStreakLeader] = useState<{ faction: Faction; count: number }>(seed.territoryStreakLeader);
  const [worldTick, setWorldTick] = useState<number>(seed.worldTick);
  const [diplomacy, setDiplomacy] = useState<Diplomacy>(seed.diplomacy);

  const latest = useMemo(() => memories[memories.length - 1], [memories]);

  const previousTerritoryRef = useRef<Record<string, Faction>>({});
  const factionStreakRef = useRef<{ faction: Faction; count: number }>({ faction: "archivist", count: 0 });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const value = memoryText.trim();
    if (!value) return;
    const echo = synthesizeMemoryEcho(value);
    setMemories((prev) => [echo, ...prev].slice(0, 180));
    setSelectedMemoryId(echo.id);
    setMemoryText("");
  };

  useEffect(() => {
    const payload: SavedWorld = {
      memories,
      agents,
      agentEvents,
      selectedMemoryId,
      territoryCaptureCounts,
      territoryStreakLeader,
      worldTick,
      diplomacy,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  }, [memories, agents, agentEvents, selectedMemoryId, territoryCaptureCounts, territoryStreakLeader, worldTick, diplomacy]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setWorldTick((tick) => tick + 1);

      setMemories((prev) => {
        const nextAgents = [...agents];
        const next = prev.map((memory) => {
          const dx = memory.worldX - x;
          const dy = memory.worldY - y;
          const dist = Math.hypot(dx, dy);
          const isRevisited = dist < 36 / Math.max(zoom, 0.25);

          const isPreservedByArchivist = nextAgents.some((agent) => {
            if (agent.kind !== "archivist") return false;
            const adx = memory.worldX - agent.x;
            const ady = memory.worldY - agent.y;
            return Math.hypot(adx, ady) < 18;
          });
          const isPreservedByCollector = nextAgents.some((agent) => {
            if (agent.kind !== "collector") return false;
            const adx = memory.worldX - agent.x;
            const ady = memory.worldY - agent.y;
            return Math.hypot(adx, ady) < 22;
          });
          const isCorruptedByTroll = nextAgents.some((agent) => {
            if (agent.kind !== "troll") return false;
            const adx = memory.worldX - agent.x;
            const ady = memory.worldY - agent.y;
            return Math.hypot(adx, ady) < 24;
          });

          const trollBlocked = diplomacy.ceasefire
            ? hasPair(diplomacy.ceasefire, "troll", "archivist") || hasPair(diplomacy.ceasefire, "troll", "collector")
            : false;
          const allianceBoost = diplomacy.alliance
            ? hasPair(diplomacy.alliance, "archivist", "collector")
              ? 0.006
              : 0
            : 0;

          const nextDecay = isRevisited
            ? Math.max(0, memory.decayLevel - 0.045)
            : isPreservedByCollector && (memory.mutated || memory.decayLevel > 0.75)
              ? Math.max(0, memory.decayLevel - (0.04 + allianceBoost))
              : isPreservedByArchivist
                ? Math.max(0, memory.decayLevel - (0.03 + allianceBoost))
                : isCorruptedByTroll && !trollBlocked
                  ? Math.min(1, memory.decayLevel + 0.04)
                  : Math.min(1, memory.decayLevel + 0.012);

          const base: MemoryEcho = {
            ...memory,
            decayLevel: nextDecay,
            lastVisitedAt: isRevisited ? now : memory.lastVisitedAt,
          };
          if (!base.mutated && nextDecay >= 0.92) {
            const mutated = mutateMemory(base);
            setAgentEvents((events) =>
              [
                {
                  id: `mutation-${base.id}-${now}`,
                  at: now,
                  text: `Region mutation detected: ${mutated.district} emerged from memory drift.`,
                  memoryId: base.id,
                },
                ...events,
              ].slice(0, 30)
            );
            return mutated;
          }
          return base;
        });

        setAgents((currAgents) =>
          currAgents.map((agent, index) => {
            if (next.length === 0) {
              const wander = now * 0.001 + index;
              return {
                ...agent,
                state: "idle",
                targetMemoryId: null,
                x: agent.x + Math.cos(wander) * 0.6,
                y: agent.y + Math.sin(wander * 0.8) * 0.6,
              };
            }

            const risky = [...next].sort((a, b) => b.decayLevel - a.decayLevel)[0];
            const stable = [...next].sort((a, b) => a.decayLevel - b.decayLevel)[0];
            const anomalyTarget = [...next]
              .filter((m) => m.mutated || m.decayLevel >= 0.8)
              .sort((a, b) => b.decayLevel - a.decayLevel)[0];
            const target =
              agent.kind === "collector"
                ? (anomalyTarget ?? risky)
                : agent.kind === "troll"
                  ? (stable ?? risky)
                  : risky;
            const tx = target.worldX;
            const ty = target.worldY;
            const vx = tx - agent.x;
            const vy = ty - agent.y;
            const d = Math.hypot(vx, vy) || 1;
            const step = Math.min(agent.kind === "collector" ? 2.7 : agent.kind === "troll" ? 3.1 : 2.2, d);
            const nx = agent.x + (vx / d) * step;
            const ny = agent.y + (vy / d) * step;
            const nextState: EchoAgent["state"] = d < 10 ? "preserving" : "patrolling";

            if (agent.state !== "preserving" && nextState === "preserving") {
              const verbs =
                agent.kind === "collector"
                  ? collectorVoice[agent.trait]
                  : agent.kind === "troll"
                    ? trollVoice[agent.trait]
                    : traitVoice[agent.trait];
              const verb = verbs[(Math.floor(now / 1000) + index) % verbs.length];
              setAgentEvents((events) =>
                [
                  {
                    id: `${agent.id}-${target.id}-${now}`,
                    at: now,
                    text: `${agent.name} (${agent.kind}/${agent.trait}) ${verb} ${target.district}.`,
                    memoryId: target.id,
                  },
                  ...events,
                ].slice(0, 30)
              );
            }

            return {
              ...agent,
              x: nx,
              y: ny,
              targetMemoryId: target.id,
              state: nextState,
            };
          })
        );

        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [x, y, zoom, agents, diplomacy]);

  useEffect(() => {
    if (worldTick === 0 || worldTick % 20 !== 0) return;
    if (diplomacy.expiresAtTick > worldTick) return;

    const actor = randomFaction();
    const other = randomFaction(actor);
    const action = Math.random();

    if (action < 0.42) {
      const pair = makePair(actor, other);
      setDiplomacy({ alliance: pair, ceasefire: null, expiresAtTick: worldTick + 30 });
      setAgentEvents((events) => [
        {
          id: `diplomacy-alliance-${worldTick}-${actor}-${other}`,
          at: Date.now(),
          text: `Diplomacy: ${factionLabel[actor]} formed an alliance with ${factionLabel[other]}.`,
        },
        ...events,
      ].slice(0, 30));
      return;
    }

    if (action < 0.78) {
      const pair = makePair(actor, other);
      setDiplomacy({ alliance: null, ceasefire: pair, expiresAtTick: worldTick + 26 });
      setAgentEvents((events) => [
        {
          id: `diplomacy-ceasefire-${worldTick}-${actor}-${other}`,
          at: Date.now(),
          text: `Ceasefire: ${factionLabel[actor]} and ${factionLabel[other]} paused hostilities.`,
        },
        ...events,
      ].slice(0, 30));
      return;
    }

    setDiplomacy({ alliance: null, ceasefire: null, expiresAtTick: worldTick + 18 });
    setAgentEvents((events) => [
      {
        id: `diplomacy-raid-${worldTick}-${actor}`,
        at: Date.now(),
        text: `Raid Order: ${factionLabel[actor]} launched a disruption wave.`,
      },
      ...events,
    ].slice(0, 30));
  }, [worldTick, diplomacy.expiresAtTick]);

  const territoryByMemory = useMemo(() => {
    const out: Record<string, Faction> = {};
    for (const memory of memories) {
      let bestFaction: Faction = "archivist";
      let bestScore = -Infinity;
      const influence: Record<Faction, number> = { archivist: 0, collector: 0, troll: 0 };
      for (const agent of agents) {
        const dx = memory.worldX - agent.x;
        const dy = memory.worldY - agent.y;
        const d = Math.hypot(dx, dy);
        let localInfluence = 1 / (1 + d * 0.1);
        if (diplomacy.alliance && hasPair(diplomacy.alliance, agent.kind as Faction, "archivist")) localInfluence *= 1.08;
        if (diplomacy.alliance && hasPair(diplomacy.alliance, agent.kind as Faction, "collector")) localInfluence *= 1.08;
        influence[agent.kind as Faction] += localInfluence;
      }
      (Object.keys(influence) as Faction[]).forEach((faction) => {
        if (influence[faction] > bestScore) {
          bestScore = influence[faction];
          bestFaction = faction;
        }
      });
      out[memory.id] = bestFaction;
    }
    return out;
  }, [memories, agents, diplomacy.alliance]);

  useEffect(() => {
    const prev = previousTerritoryRef.current;
    if (Object.keys(prev).length === 0) {
      previousTerritoryRef.current = territoryByMemory;
      return;
    }

    let changed = false;
    const captureDelta: Record<Faction, number> = { archivist: 0, collector: 0, troll: 0 };
    let nextStreak = factionStreakRef.current;
    const now = Date.now();

    for (const memory of memories) {
      const nextOwner = territoryByMemory[memory.id];
      const prevOwner = prev[memory.id];
      if (!nextOwner || !prevOwner || nextOwner === prevOwner) continue;
      changed = true;
      captureDelta[nextOwner] += 1;
      const action = memory.decayLevel > 0.65 || memory.mutated ? "recaptured" : "captured";
      setAgentEvents((events) =>
        [
          {
            id: `territory-${memory.id}-${now}-${nextOwner}`,
            at: now,
            text: `Territory shift: ${factionLabel[nextOwner]} ${action} ${memory.district}.`,
            memoryId: memory.id,
          },
          ...events,
        ].slice(0, 30)
      );

      if (nextStreak.faction === nextOwner) {
        nextStreak = { faction: nextOwner, count: nextStreak.count + 1 };
      } else {
        nextStreak = { faction: nextOwner, count: 1 };
      }
    }

    if (changed) {
      setTerritoryCaptureCounts((prevCounts) => ({
        archivist: prevCounts.archivist + captureDelta.archivist,
        collector: prevCounts.collector + captureDelta.collector,
        troll: prevCounts.troll + captureDelta.troll,
      }));
      factionStreakRef.current = nextStreak;
      setTerritoryStreakLeader(nextStreak);
    }

    previousTerritoryRef.current = territoryByMemory;
  }, [territoryByMemory, memories]);

  useEffect(() => {
    setDecayHistoryByMemory((prev) => {
      const next: Record<string, number[]> = { ...prev };
      for (const memory of memories) {
        const seq = next[memory.id] ? [...next[memory.id]] : [];
        const value = Math.round(memory.decayLevel * 100);
        if (seq.length === 0 || seq[seq.length - 1] !== value) {
          seq.push(value);
        }
        next[memory.id] = seq.slice(-20);
      }
      return next;
    });
    setOwnerHistoryByMemory((prev) => {
      const next: Record<string, Faction[]> = { ...prev };
      for (const memory of memories) {
        const owner = territoryByMemory[memory.id];
        if (!owner) continue;
        const seq = next[memory.id] ? [...next[memory.id]] : [];
        if (seq.length === 0 || seq[seq.length - 1] !== owner) {
          seq.push(owner);
        }
        next[memory.id] = seq.slice(-12);
      }
      return next;
    });
  }, [memories, territoryByMemory]);

  const selectedMemory = useMemo(
    () => memories.find((m) => m.id === selectedMemoryId) ?? latest ?? null,
    [memories, selectedMemoryId, latest]
  );
  const selectedOwner = selectedMemory ? territoryByMemory[selectedMemory.id] : null;
  const selectedDecayHistory = selectedMemory ? decayHistoryByMemory[selectedMemory.id] ?? [] : [];
  const selectedOwnerHistory = selectedMemory ? ownerHistoryByMemory[selectedMemory.id] ?? [] : [];
  const selectedEvents = selectedMemory
    ? agentEvents.filter((e) => e.memoryId === selectedMemory.id).slice(0, 6)
    : [];

  const activeMemories = memories.filter((m) => m.decayLevel < 0.8).length;
  const forgottenMemories = memories.length - activeMemories;
  const mutatedMemories = memories.filter((m) => m.mutated).length;
  const preservingAgents = agents.filter((a) => a.state === "preserving").length;
  const archivistCount = agents.filter((a) => a.kind === "archivist").length;
  const collectorCount = agents.filter((a) => a.kind === "collector").length;
  const trollCount = agents.filter((a) => a.kind === "troll").length;
  const territoryCounts = useMemo(() => {
    const counts: Record<Faction, number> = { archivist: 0, collector: 0, troll: 0 };
    Object.values(territoryByMemory).forEach((f) => (counts[f] += 1));
    return counts;
  }, [territoryByMemory]);

  const diplomacyLine =
    diplomacy.expiresAtTick <= worldTick
      ? "Neutral Flux"
      : diplomacy.alliance
        ? `Alliance: ${diplomacy.alliance} (T-${diplomacy.expiresAtTick - worldTick})`
        : diplomacy.ceasefire
          ? `Ceasefire: ${diplomacy.ceasefire} (T-${diplomacy.expiresAtTick - worldTick})`
          : `Raid Climate (T-${diplomacy.expiresAtTick - worldTick})`;

  return (
    <main className="shell">
      <header className="titlebar">
        <span>EchoNet - A Living Internet Built From Human Memory</span>
      </header>
      <section className="viewport">
        <MapCanvas
          memories={memories}
          agents={agents}
          territoryByMemory={territoryByMemory}
          selectedMemoryId={selectedMemory ? selectedMemory.id : null}
          onSelectMemory={setSelectedMemoryId}
        />
        <aside className="hud">
          <h2>Echo Engine</h2>
          <form onSubmit={onSubmit} className="memory-form">
            <label htmlFor="memory-input">Upload memory</label>
            <textarea
              id="memory-input"
              value={memoryText}
              onChange={(e) => setMemoryText(e.target.value)}
              placeholder="I used to eat Maggi at 3AM while preparing for exams during monsoon..."
              rows={4}
            />
            <button type="submit">Materialize Memory</button>
          </form>
          <p>World Tick: {worldTick}</p>
          <p>Diplomacy: {diplomacyLine}</p>
          <p>Memories: {memories.length} | Active: {activeMemories}</p>
          <p>Forgotten: {forgottenMemories} | Mutated: {mutatedMemories}</p>
          <p>Citizens A/C/T: {archivistCount}/{collectorCount}/{trollCount}</p>
          <p>Preserving: {preservingAgents}/{agents.length}</p>
          <p>Territory A/C/T: {territoryCounts.archivist}/{territoryCounts.collector}/{territoryCounts.troll}</p>
          <p>Captures A/C/T: {territoryCaptureCounts.archivist}/{territoryCaptureCounts.collector}/{territoryCaptureCounts.troll}</p>
          <p>Streak: {territoryStreakLeader.faction} x{territoryStreakLeader.count}</p>
          <p>camera: ({x.toFixed(1)}, {y.toFixed(1)})</p>
          <p>zoom: {zoom.toFixed(2)}x</p>
          <div className="memory-actions">
            <button
              type="button"
              onClick={() => {
                const fresh = resetWorld();
                setMemories(fresh.memories);
                setAgents(fresh.agents);
                setAgentEvents(fresh.agentEvents);
                setSelectedMemoryId(null);
                setDecayHistoryByMemory({});
                setOwnerHistoryByMemory({});
                setTerritoryCaptureCounts(fresh.territoryCaptureCounts);
                setTerritoryStreakLeader(fresh.territoryStreakLeader);
                setWorldTick(0);
                setDiplomacy(fresh.diplomacy);
                previousTerritoryRef.current = {};
                factionStreakRef.current = { faction: "archivist", count: 0 };
                localStorage.removeItem(SAVE_KEY);
              }}
            >
              Reset World
            </button>
          </div>

          <div className="agent-log">
            <p className="agent-log-title">Citizen Wire</p>
            {agentEvents.length === 0 ? (
              <p>Awaiting first civilization event...</p>
            ) : (
              agentEvents.slice(0, 14).map((event) => (
                <p key={event.id}>
                  [{new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}] {event.text}
                </p>
              ))
            )}
          </div>

          {selectedMemory ? (
            <div className="agent-log">
              <p className="agent-log-title">Region Inspector</p>
              <p>ID: {selectedMemory.id}</p>
              <p>District: {selectedMemory.district}</p>
              <p>Owner: {selectedOwner ?? "unknown"}</p>
              <p>Atmosphere: {selectedMemory.atmosphere}</p>
              <p>Decay Trend: {selectedDecayHistory.length ? selectedDecayHistory.join("% -> ") + "%" : "n/a"}</p>
              <p>Owner History: {selectedOwnerHistory.length ? selectedOwnerHistory.join(" -> ") : "n/a"}</p>
              <p>Recent Region Events:</p>
              {selectedEvents.length ? (
                selectedEvents.map((event) => (
                  <p key={`inspect-${event.id}`}>
                    [{new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}] {event.text}
                  </p>
                ))
              ) : (
                <p>No direct events yet.</p>
              )}
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
