import { FormEvent, useEffect, useMemo, useState } from "react";
import { MapCanvas } from "./components/MapCanvas";
import { useCameraStore } from "./store/cameraStore";
import { mutateMemory, synthesizeMemoryEcho } from "./world/memoryEngine";
import type { MemoryEcho } from "./world/memoryEngine";
import { createArchivists } from "./world/agents";
import type { EchoAgent } from "./world/agents";

type AgentEvent = {
  id: string;
  at: number;
  text: string;
};

const traitVoice: Record<EchoAgent["trait"], string[]> = {
  gentle: ["stabilized", "softly preserved", "kept warm"],
  obsessive: ["indexed", "cross-referenced", "locked into archive"],
  poetic: ["listened to", "carried forward", "translated into echoes"],
  stoic: ["secured", "fortified", "recovered"],
};

export function App() {
  const { x, y, zoom } = useCameraStore();
  const [memoryText, setMemoryText] = useState("");
  const [memories, setMemories] = useState<MemoryEcho[]>([]);
  const [agents, setAgents] = useState<EchoAgent[]>(() => createArchivists(7));
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([]);

  const latest = useMemo(() => memories[memories.length - 1], [memories]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const value = memoryText.trim();
    if (!value) return;
    const echo = synthesizeMemoryEcho(value);
    setMemories((prev) => [echo, ...prev].slice(0, 120));
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
          const isPreservedByAgent = nextAgents.some((agent) => {
            const adx = memory.worldX - agent.x;
            const ady = memory.worldY - agent.y;
            return Math.hypot(adx, ady) < 18;
          });
          const nextDecay = isRevisited
            ? Math.max(0, memory.decayLevel - 0.045)
            : isPreservedByAgent
              ? Math.max(0, memory.decayLevel - 0.03)
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
            const tx = risky.worldX;
            const ty = risky.worldY;
            const vx = tx - agent.x;
            const vy = ty - agent.y;
            const d = Math.hypot(vx, vy) || 1;
            const step = Math.min(2.2, d);
            const nx = agent.x + (vx / d) * step;
            const ny = agent.y + (vy / d) * step;
            const nextState: EchoAgent["state"] = d < 10 ? "preserving" : "patrolling";
            if (agent.state !== "preserving" && nextState === "preserving") {
              const verbs = traitVoice[agent.trait];
              const verb = verbs[(Math.floor(now / 1000) + index) % verbs.length];
              setAgentEvents((events) =>
                [
                  {
                    id: `${agent.id}-${risky.id}-${now}`,
                    at: now,
                    text: `${agent.name} (${agent.trait}) ${verb} ${risky.district}.`,
                  },
                  ...events,
                ].slice(0, 14)
              );
            }
            return {
              ...agent,
              x: nx,
              y: ny,
              targetMemoryId: risky.id,
              state: nextState,
            };
          })
        );

        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [x, y, zoom, agents]);

  const activeMemories = memories.filter((m) => m.decayLevel < 0.8).length;
  const forgottenMemories = memories.length - activeMemories;
  const mutatedMemories = memories.filter((m) => m.mutated).length;
  const preservingAgents = agents.filter((a) => a.state === "preserving").length;

  return (
    <main className="shell">
      <header className="titlebar">
        <span>EchoNet - A Living Internet Built From Human Memory</span>
      </header>
      <section className="viewport">
        <MapCanvas memories={memories} agents={agents} />
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
          <p>Archivists preserving: {preservingAgents}/{agents.length}</p>
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
            <p className="agent-log-title">Archivist Wire</p>
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
        </aside>
      </section>
    </main>
  );
}
