import { CHUNK_SIZE, TILE_SIZE, chunkId } from "@living/world-core";

export type RenderChunk = {
  id: string;
  cx: number;
  cy: number;
  color: number;
  nodes: RenderNode[];
  links: RenderLink[];
};

export type RenderNode = {
  id: string;
  x: number;
  y: number;
  tier: "edge" | "relay" | "core";
  color: number;
};

export type RenderLink = {
  a: number;
  b: number;
  color: number;
};

function hash2d(x: number, y: number): number {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return (h ^ (h >> 16)) >>> 0;
}

export function getVisibleChunks(
  camera: { x: number; y: number; zoom: number },
  viewport: { width: number; height: number },
  pad = 1
): RenderChunk[] {
  const worldWidth = viewport.width / (camera.zoom * TILE_SIZE);
  const worldHeight = viewport.height / (camera.zoom * TILE_SIZE);

  const minX = Math.floor((camera.x - worldWidth / 2) / CHUNK_SIZE) - pad;
  const maxX = Math.floor((camera.x + worldWidth / 2) / CHUNK_SIZE) + pad;
  const minY = Math.floor((camera.y - worldHeight / 2) / CHUNK_SIZE) - pad;
  const maxY = Math.floor((camera.y + worldHeight / 2) / CHUNK_SIZE) + pad;

  const out: RenderChunk[] = [];
  for (let cy = minY; cy <= maxY; cy++) {
    for (let cx = minX; cx <= maxX; cx++) {
      const h = hash2d(cx, cy);
      const hue = h % 360;
      const color = hslToHex(hue / 360, 0.48, 0.16);
      const network = buildChunkNetwork(cx, cy, h);
      out.push({ id: chunkId({ cx, cy }), cx, cy, color, ...network });
    }
  }
  return out;
}

function buildChunkNetwork(cx: number, cy: number, seed: number): { nodes: RenderNode[]; links: RenderLink[] } {
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const nodeCount = 4 + Math.floor(rand() * 5);
  const nodes: RenderNode[] = [];

  for (let i = 0; i < nodeCount; i++) {
    const tierRoll = rand();
    const tier = tierRoll > 0.86 ? "core" : tierRoll > 0.55 ? "relay" : "edge";
    const hue = (hash2d(cx * 31 + i, cy * 31 - i) % 360) / 360;
    nodes.push({
      id: `${cx}:${cy}:${i}`,
      x: cx * CHUNK_SIZE * TILE_SIZE + 28 + rand() * (CHUNK_SIZE * TILE_SIZE - 56),
      y: cy * CHUNK_SIZE * TILE_SIZE + 28 + rand() * (CHUNK_SIZE * TILE_SIZE - 56),
      tier,
      color: hslToHex(hue, tier === "core" ? 0.7 : 0.55, tier === "core" ? 0.64 : 0.55),
    });
  }

  const links: RenderLink[] = [];
  const seen = new Set<string>();
  const addLink = (a: number, b: number) => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = `${lo}-${hi}`;
    if (lo === hi || seen.has(key)) return;
    seen.add(key);
    links.push({ a: lo, b: hi, color: 0x8aa0bf });
  };

  for (let i = 0; i < nodes.length; i++) {
    addLink(i, (i + 1) % nodes.length);
  }
  for (let i = 0; i < nodes.length; i++) {
    if (rand() > 0.6) addLink(i, Math.floor(rand() * nodes.length));
  }

  return { nodes, links };
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hslToHex(h: number, s: number, l: number): number {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c);
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}
