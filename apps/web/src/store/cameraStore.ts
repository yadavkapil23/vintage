import { create } from "zustand";

type CameraState = {
  x: number;
  y: number;
  zoom: number;
  setCamera: (camera: Partial<Pick<CameraState, "x" | "y" | "zoom">>) => void;
};

export const useCameraStore = create<CameraState>((set) => ({
  x: 0,
  y: 0,
  zoom: 0.45,
  setCamera: (camera) => set((state) => ({ ...state, ...camera })),
}));
