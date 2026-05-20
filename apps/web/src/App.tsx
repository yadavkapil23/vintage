import { FormEvent, useMemo, useState } from "react";
import { MapCanvas } from "./components/MapCanvas";
import { useCameraStore } from "./store/cameraStore";
import { synthesizeMemoryEcho } from "./world/memoryEngine";
import type { MemoryEcho } from "./world/memoryEngine";

export function App() {
  const { x, y, zoom } = useCameraStore();
  const [memoryText, setMemoryText] = useState("");
  const [memories, setMemories] = useState<MemoryEcho[]>([]);

  const latest = useMemo(() => memories[memories.length - 1], [memories]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const value = memoryText.trim();
    if (!value) return;
    const echo = synthesizeMemoryEcho(value);
    setMemories((prev) => [echo, ...prev].slice(0, 120));
    setMemoryText("");
  };

  return (
    <main className="shell">
      <header className="titlebar">
        <span>EchoNet - A Living Internet Built From Human Memory</span>
      </header>
      <section className="viewport">
        <MapCanvas memories={memories} />
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
          <p>
            camera: ({x.toFixed(1)}, {y.toFixed(1)})
          </p>
          <p>zoom: {zoom.toFixed(2)}x</p>
          {latest ? (
            <>
              <p>Latest district: {latest.district}</p>
              <p>Atmosphere: {latest.atmosphere}</p>
            </>
          ) : (
            <p>No memory districts yet.</p>
          )}
        </aside>
      </section>
    </main>
  );
}
