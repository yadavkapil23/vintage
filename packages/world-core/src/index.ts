export const TILE_SIZE = 64;
export const CHUNK_SIZE = 32;

export type WorldCoord = { x: number; y: number };
export type ChunkCoord = { cx: number; cy: number };
export type TileCoord = { tx: number; ty: number };

export type ChunkId = `${number}:${number}`;

export function toChunkCoord({ x, y }: WorldCoord): ChunkCoord {
  return {
    cx: Math.floor(x / CHUNK_SIZE),
    cy: Math.floor(y / CHUNK_SIZE),
  };
}

export function toLocalTile({ x, y }: WorldCoord): TileCoord {
  const tx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const ty = ((y % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  return { tx, ty };
}

export function chunkId({ cx, cy }: ChunkCoord): ChunkId {
  return `${cx}:${cy}`;
}

export function chunkOrigin({ cx, cy }: ChunkCoord): WorldCoord {
  return { x: cx * CHUNK_SIZE, y: cy * CHUNK_SIZE };
}

export function worldToPixels(world: WorldCoord): { px: number; py: number } {
  return { px: world.x * TILE_SIZE, py: world.y * TILE_SIZE };
}

export type CameraState = {
  x: number;
  y: number;
  zoom: number;
};
