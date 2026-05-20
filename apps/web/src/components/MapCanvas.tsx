import { Application, Container, Graphics, Text } from "pixi.js";
import { useEffect, useRef } from "react";
import { CHUNK_SIZE, TILE_SIZE } from "@living/world-core";
import { useCameraStore } from "../store/cameraStore";
import { getVisibleChunks } from "../world/chunks";
import type { MemoryEcho } from "../world/memoryEngine";
import type { EchoAgent } from "../world/agents";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

type MapCanvasProps = {
  memories: MemoryEcho[];
  agents: EchoAgent[];
  territoryByMemory: Record<string, "archivist" | "collector" | "troll">;
  selectedMemoryId: string | null;
  onSelectMemory: (memoryId: string | null) => void;
};

export function MapCanvas({ memories, agents, territoryByMemory, selectedMemoryId, onSelectMemory }: MapCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef(useCameraStore.getState());
  const errorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => useCameraStore.subscribe((next) => (cameraRef.current = next)), []);

  useEffect(() => {
    if (!hostRef.current) return;

    const app = new Application();
    let world = new Container();
    let raf = 0;
    const host = hostRef.current;

    void app
      .init({
      resizeTo: host,
      background: "#11131a",
      antialias: false,
      })
      .then(() => {
      host.appendChild(app.canvas);
      world = new Container();
      app.stage.addChild(world);

      const frame = new Graphics();
      world.addChild(frame);

      let dragging = false;
      let moved = false;
      let lastX = 0;
      let lastY = 0;

      const onDown = (e: MouseEvent) => {
        dragging = true;
        moved = false;
        lastX = e.clientX;
        lastY = e.clientY;
      };
      const onUp = () => (dragging = false);
      const onMove = (e: MouseEvent) => {
        if (!dragging) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        lastX = e.clientX;
        lastY = e.clientY;

        const { x, y, zoom } = cameraRef.current;
        useCameraStore.getState().setCamera({
          x: x - dx / (zoom * TILE_SIZE),
          y: y - dy / (zoom * TILE_SIZE),
        });
      };

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const { zoom } = cameraRef.current;
        const nextZoom = clamp(zoom * (e.deltaY > 0 ? 0.92 : 1.08), 0.2, 2.6);
        useCameraStore.getState().setCamera({ zoom: nextZoom });
      };

      const onClick = (e: MouseEvent) => {
        if (moved) return;
        const rect = host.getBoundingClientRect();
        const cam = cameraRef.current;
        const worldX = (e.clientX - rect.left - app.renderer.width / 2) / (TILE_SIZE * cam.zoom) + cam.x;
        const worldY = (e.clientY - rect.top - app.renderer.height / 2) / (TILE_SIZE * cam.zoom) + cam.y;
        let nearest: MemoryEcho | null = null;
        let nearestD = Infinity;
        for (const memory of memories) {
          const d = Math.hypot(memory.worldX - worldX, memory.worldY - worldY);
          if (d < nearestD) {
            nearestD = d;
            nearest = memory;
          }
        }
        if (nearest && nearestD < 0.45 / cam.zoom + 0.5) {
          onSelectMemory(nearest.id);
        } else {
          onSelectMemory(null);
        }
      };

      host.addEventListener("mousedown", onDown);
      window.addEventListener("mouseup", onUp);
      window.addEventListener("mousemove", onMove);
      host.addEventListener("wheel", onWheel, { passive: false });
      host.addEventListener("click", onClick);

      const draw = () => {
        const cam = cameraRef.current;
        world.removeChildren();

        const visible = getVisibleChunks(cam, {
          width: app.renderer.width,
          height: app.renderer.height,
        });

        const now = performance.now() / 1000;

        for (const c of visible) {
          const g = new Graphics();
          const ox = c.cx * CHUNK_SIZE * TILE_SIZE;
          const oy = c.cy * CHUNK_SIZE * TILE_SIZE;
          const size = CHUNK_SIZE * TILE_SIZE;
          g.rect(ox, oy, size, size).fill(c.color);
          g.stroke({ width: 2, color: 0x2b2d38, alpha: 0.8 });
          world.addChild(g);

          const label = new Text({
            text: c.id,
            style: { fill: 0xd9e5ff, fontSize: 18, fontFamily: "monospace" },
          });
          label.x = ox + 14;
          label.y = oy + 10;
          world.addChild(label);

          const links = new Graphics();
          for (const link of c.links) {
            const a = c.nodes[link.a];
            const b = c.nodes[link.b];
            links.moveTo(a.x, a.y);
            links.lineTo(b.x, b.y);
          }
          links.stroke({ width: 2, color: 0x60728f, alpha: 0.65 });
          world.addChild(links);

          for (const node of c.nodes) {
            const radius = node.tier === "core" ? 9 : node.tier === "relay" ? 7 : 5;
            const dot = new Graphics();
            dot.circle(node.x, node.y, radius);
            dot.fill(node.color);
            dot.stroke({ width: 2, color: 0x0f1119, alpha: 0.85 });
            world.addChild(dot);

            const pulse = new Graphics();
            const phase = (Math.sin(now * 2.8 + node.x * 0.015 + node.y * 0.01) + 1) * 0.5;
            const pulseRadius = radius + 2 + phase * 5;
            pulse.circle(node.x, node.y, pulseRadius);
            pulse.stroke({ width: 1.5, color: node.color, alpha: 0.18 + phase * 0.24 });
            world.addChild(pulse);
          }

          const packets = new Graphics();
          for (let i = 0; i < c.links.length; i++) {
            const link = c.links[i];
            const a = c.nodes[link.a];
            const b = c.nodes[link.b];
            const speed = 0.35 + ((a.x + b.y + i * 13) % 9) * 0.08;
            const t = (now * speed + (a.y + b.x) * 0.0009) % 1;
            const px = a.x + (b.x - a.x) * t;
            const py = a.y + (b.y - a.y) * t;
            packets.circle(px, py, 2.5);
            packets.fill(0xc8edff);
          }
          world.addChild(packets);
        }

        for (const memory of memories) {
          const decay = memory.decayLevel;
          const isForgotten = decay >= 0.8;
          const isMutated = memory.mutated;
          const beaconColor = isMutated ? 0xb38cff : isForgotten ? 0x786d88 : 0xffc488;
          const beacon = new Graphics();
          beacon.circle(memory.worldX * TILE_SIZE, memory.worldY * TILE_SIZE, 11);
          beacon.fill(beaconColor);
          beacon.stroke({ width: 2, color: 0x2b1c0e, alpha: 0.9 });
          beacon.alpha = 1 - decay * 0.55;
          world.addChild(beacon);

          const ring = new Graphics();
          const wave = (Math.sin(now * 1.8 + memory.worldX * 0.04) + 1) * 0.5;
          ring.circle(memory.worldX * TILE_SIZE, memory.worldY * TILE_SIZE, 16 + wave * 10);
          ring.stroke({
            width: 2,
            color: isMutated ? 0xd0b0ff : isForgotten ? 0x8878aa : 0xffa760,
            alpha: (0.25 + wave * 0.25) * (1 - decay * 0.6),
          });
          world.addChild(ring);

          const label = new Text({
            text: `${isMutated ? "Mutated Region" : isForgotten ? "Forgotten Region" : memory.district} [${memory.semanticTags.join(", ")}]`,
            style: { fill: isMutated ? 0xe6d8ff : isForgotten ? 0xb9aad1 : 0xffd7b1, fontSize: 13, fontFamily: "monospace" },
          });
          label.x = memory.worldX * TILE_SIZE + 15;
          label.y = memory.worldY * TILE_SIZE - 8;
          label.alpha = 1 - decay * 0.45;
          world.addChild(label);

          const faction = territoryByMemory[memory.id] ?? "archivist";
          const factionColor = faction === "troll" ? 0xff4e97 : faction === "collector" ? 0xffb462 : 0x79e3b5;
          const control = new Graphics();
          control.circle(memory.worldX * TILE_SIZE, memory.worldY * TILE_SIZE, 24);
          control.stroke({ width: 1.8, color: factionColor, alpha: 0.42 });
          world.addChild(control);

          if (memory.id === selectedMemoryId) {
            const selected = new Graphics();
            selected.circle(memory.worldX * TILE_SIZE, memory.worldY * TILE_SIZE, 30);
            selected.stroke({ width: 2.5, color: 0xffffff, alpha: 0.8 });
            world.addChild(selected);
          }
        }

        for (const agent of agents) {
          const isCollector = agent.kind === "collector";
          const isTroll = agent.kind === "troll";
          const body = new Graphics();
          body.circle(agent.x * TILE_SIZE, agent.y * TILE_SIZE, 6);
          body.fill(
            agent.state === "preserving"
              ? isTroll
                ? 0xff7aa8
                : isCollector
                  ? 0xffd79b
                  : 0x8fffcf
              : isTroll
                ? 0xff5a90
                : isCollector
                  ? 0xffbd77
                  : 0x9fc5ff
          );
          body.stroke({ width: 2, color: 0x162032, alpha: 0.9 });
          world.addChild(body);

          const aura = new Graphics();
          const pulse = (Math.sin(now * 4 + agent.x * 0.03) + 1) * 0.5;
          aura.circle(agent.x * TILE_SIZE, agent.y * TILE_SIZE, 9 + pulse * 4);
          aura.stroke({
            width: 1.5,
            color: agent.state === "preserving" ? (isTroll ? 0xff79c9 : isCollector ? 0xffc98a : 0x7df7b8) : isTroll ? 0xff4d96 : isCollector ? 0xffad5f : 0x8fb5ff,
            alpha: 0.25 + pulse * 0.2,
          });
          world.addChild(aura);

          const label = new Text({
            text: `${agent.name} ${isTroll ? "[T]" : isCollector ? "[C]" : "[A]"}`,
            style: { fill: isTroll ? 0xffb7d6 : isCollector ? 0xffd7af : 0xd6e8ff, fontSize: 11, fontFamily: "monospace" },
          });
          label.x = agent.x * TILE_SIZE + 9;
          label.y = agent.y * TILE_SIZE - 14;
          world.addChild(label);
        }

        world.scale.set(cam.zoom);
        world.position.set(
          app.renderer.width / 2 - cam.x * TILE_SIZE * cam.zoom,
          app.renderer.height / 2 - cam.y * TILE_SIZE * cam.zoom
        );

        raf = requestAnimationFrame(draw);
      };

      draw();
      })
      .catch((err) => {
        if (errorRef.current) {
          errorRef.current.textContent = `Renderer failed: ${String(err)}`;
        }
      });

    return () => {
      cancelAnimationFrame(raf);
      app.destroy(true, { children: true });
    };
  }, [memories, agents, territoryByMemory, selectedMemoryId, onSelectMemory]);

  return (
    <div className="map-wrap">
      <div ref={hostRef} className="map-canvas" />
      <div ref={errorRef} className="map-error" />
    </div>
  );
}
