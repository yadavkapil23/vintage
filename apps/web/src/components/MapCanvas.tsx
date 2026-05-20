import { Application, Container, Graphics, Text } from "pixi.js";
import { useEffect, useRef } from "react";
import { CHUNK_SIZE, TILE_SIZE } from "@living/world-core";
import { useCameraStore } from "../store/cameraStore";
import { getVisibleChunks } from "../world/chunks";
import type { MemoryEcho } from "../world/memoryEngine";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

type MapCanvasProps = {
  memories: MemoryEcho[];
};

export function MapCanvas({ memories }: MapCanvasProps) {
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
      let lastX = 0;
      let lastY = 0;

      const onDown = (e: MouseEvent) => {
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
      };
      const onUp = () => (dragging = false);
      const onMove = (e: MouseEvent) => {
        if (!dragging) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
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

      host.addEventListener("mousedown", onDown);
      window.addEventListener("mouseup", onUp);
      window.addEventListener("mousemove", onMove);
      host.addEventListener("wheel", onWheel, { passive: false });

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
          const beacon = new Graphics();
          beacon.circle(memory.worldX * TILE_SIZE, memory.worldY * TILE_SIZE, 11);
          beacon.fill(0xffc488);
          beacon.stroke({ width: 2, color: 0x2b1c0e, alpha: 0.9 });
          world.addChild(beacon);

          const ring = new Graphics();
          const wave = (Math.sin(now * 1.8 + memory.worldX * 0.04) + 1) * 0.5;
          ring.circle(memory.worldX * TILE_SIZE, memory.worldY * TILE_SIZE, 16 + wave * 10);
          ring.stroke({ width: 2, color: 0xffa760, alpha: 0.25 + wave * 0.25 });
          world.addChild(ring);

          const label = new Text({
            text: `${memory.district} [${memory.semanticTags.join(", ")}]`,
            style: { fill: 0xffd7b1, fontSize: 13, fontFamily: "monospace" },
          });
          label.x = memory.worldX * TILE_SIZE + 15;
          label.y = memory.worldY * TILE_SIZE - 8;
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
  }, [memories]);

  return (
    <div className="map-wrap">
      <div ref={hostRef} className="map-canvas" />
      <div ref={errorRef} className="map-error" />
    </div>
  );
}
