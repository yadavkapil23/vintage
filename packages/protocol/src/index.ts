import type { ChunkId, WorldCoord } from "@living/world-core";

export type Envelope<TType extends string, TPayload> = {
  id: string;
  ts: number;
  type: TType;
  payload: TPayload;
};

export type ClientViewportInterest = {
  center: WorldCoord;
  radiusChunks: number;
  zoom: number;
};

export type ChunkTile = {
  x: number;
  y: number;
  glyph: string;
  color: number;
  bg: number;
};

export type ChunkSnapshot = {
  id: ChunkId;
  cx: number;
  cy: number;
  revision: number;
  tiles: ChunkTile[];
};

export type MsgClientHello = Envelope<
  "client.hello",
  { userId: string; sessionId: string; interest: ClientViewportInterest }
>;

export type MsgClientInterest = Envelope<
  "client.interest",
  { interest: ClientViewportInterest }
>;

export type MsgServerSnapshot = Envelope<
  "server.snapshot",
  { chunks: ChunkSnapshot[] }
>;

export type WorldEvent =
  | MsgClientHello
  | MsgClientInterest
  | MsgServerSnapshot;
