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

export function App() {
  const { x, y, zoom } = useCameraStore();
  const [memoryText, setMemoryText] = useState("");
  const [memories, setMemories] = useState<MemoryEcho[]>([]);
  const [agents, setAgents] = useState<EchoAgent[]>(() => createCitizens(5, 3));
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([]);
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
  const [decayHistoryByMemory, setDecayHistoryByMemory] = useState<Record<string, number[]>>({});
  const [ownerHistoryByMemory, setOwnerHistoryByMemory] = useState<Record<string, Faction[]>>({});
  const [territoryCaptureCounts, setTerritoryCaptureCounts] = useState<Record<Faction, number>>({
    archivist: 0,
    collector: 0,
    troll: 0,
  });
  const [territoryStreakLeader, setTerritoryStreakLeader] = useState<{ faction: Faction; count: number }>({
    faction: "archivist",
    count: 0,
  });
  const previousTerritoryRef = useRef<Record<string, Faction>>({});
  const factionStreakRef = useRef<{ faction: Faction; count: number }>({ faction: "archivist", count: 0 });

  const latest = useMemo(() => memories[memories.length - 1], [memories]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const value = memoryText.trim();
    if (!value) return;
    const echo = synthesizeMemoryEcho(value);
    setMemories((prev) => [echo, ...prev].slice(0, 120));
    setSelectedMemoryId(echo.id);
    setMemoryText("");
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
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
          const nextDecay = isRevisited
            ? Math.max(0, memory.decayLevel - 0.045)
            : isPreservedByCollector && (memory.mutated || memory.decayLevel > 0.75)
              ? Math.max(0, memory.decayLevel - 0.04)
              : isPreservedByArchivist
                ? Math.max(0, memory.decayLevel - 0.03)
                : isCorruptedByTroll
                  ? Math.min(1, memory.decayLevel + 0.04)
                  : Math.min(1, memory.decayLevel + 0.012);
          const base = {
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
              ].slice(0, 14)
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
                ].slice(0, 14)
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
  }, [x, y, zoom, agents]);

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
        const localInfluence = 1 / (1 + d * 0.1);
        if (agent.kind === "archivist" || agent.kind === "collector" || agent.kind === "troll") {
          influence[agent.kind] += localInfluence;
        }
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
  }, [memories, agents]);

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
            text: `Territory shift: ${nextOwner.toUpperCase()} ${action} ${memory.district}.`,
            memoryId: memory.id,
          },
          ...events,
        ].slice(0, 14)
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
        next[memory.id] = seq.slice(-18);
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
        next[memory.id] = seq.slice(-10);
      }
      return next;
    });
  }, [memories, territoryByMemory]);

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
  const selectedMemory = useMemo(
    () => memories.find((m) => m.id === selectedMemoryId) ?? latest ?? null,
    [memories, selectedMemoryId, latest]
  );
  const selectedOwner = selectedMemory ? territoryByMemory[selectedMemory.id] : null;
  const selectedDecayHistory = selectedMemory ? decayHistoryByMemory[selectedMemory.id] ?? [] : [];
  const selectedOwnerHistory = selectedMemory ? ownerHistoryByMemory[selectedMemory.id] ?? [] : [];
  const selectedEvents = selectedMemory
    ? agentEvents.filter((e) => e.memoryId === selectedMemory.id).slice(0, 4)
    : [];

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
          <p>Drag to pan</p>
          <p>Scroll to zoom</p>
          <p>Memories ingested: {memories.length}</p>
          <p>Active memories: {activeMemories}</p>
          <p>Forgotten memories: {forgottenMemories}</p>
          <p>Mutated memories: {mutatedMemories}</p>
          <p>Archivists: {archivistCount}</p>
          <p>Collectors: {collectorCount}</p>
          <p>Trolls: {trollCount}</p>
          <p>Citizens preserving: {preservingAgents}/{agents.length}</p>
          <p>Territory A/C/T: {territoryCounts.archivist}/{territoryCounts.collector}/{territoryCounts.troll}</p>
          <p>Captures A/C/T: {territoryCaptureCounts.archivist}/{territoryCaptureCounts.collector}/{territoryCaptureCounts.troll}</p>
          <p>Streak: {territoryStreakLeader.faction} x{territoryStreakLeader.count}</p>
          <p>
            camera: ({x.toFixed(1)}, {y.toFixed(1)})
          </p>
          <p>zoom: {zoom.toFixed(2)}x</p>
          {latest ? (
            <>
              <p>Latest district: {latest.district}</p>
              <p>Atmosphere: {latest.atmosphere}</p>
              <p>Decay: {(latest.decayLevel * 100).toFixed(0)}%</p>
            </>
          ) : (
            <p>No memory districts yet.</p>
          )}
          <div className="agent-log">
            <p className="agent-log-title">Citizen Wire</p>
            {agentEvents.length === 0 ? (
              <p>Awaiting first preservation event...</p>
            ) : (
              agentEvents.map((event) => (
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
