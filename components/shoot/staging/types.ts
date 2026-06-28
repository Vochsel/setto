export type StageObjectType = "model" | "camera" | "light";

export interface StageObject {
  id: string;
  type: StageObjectType;
  name?: string;
  modelId?: string;
  x: number;
  y: number;
  z: number;
  rotation?: number; // y-rotation in radians (models)
  fov?: number; // cameras
  intensity?: number; // lights
}

export interface StageState {
  objects: StageObject[];
  activeCameraId?: string;
  backdrop?: { url?: string };
}

export interface CameraFraming {
  shotType: string;
  angleLabel: string;
  distanceM: number;
  heightM: number;
  fov: number;
  lensMm: number;
}

export function emptyStage(): StageState {
  return { objects: [] };
}

/** Derive prompt-ready framing from a camera looking at the scene centroid. */
export function framingFromCamera(
  cam: StageObject,
  target: { x: number; z: number },
): CameraFraming {
  const dist = Math.hypot(cam.x - target.x, cam.z - target.z);
  const shotType = dist < 2.4 ? "close-up" : dist < 5 ? "medium" : "wide";
  const angleLabel =
    cam.y > 2.2 ? "high angle" : cam.y < 1.0 ? "low angle" : "eye-level";
  const fov = cam.fov ?? 50;
  const lensMm = Math.max(14, Math.round((36 / (2 * Math.tan((fov * Math.PI) / 360)))));
  return {
    shotType,
    angleLabel,
    distanceM: Math.round(dist * 10) / 10,
    heightM: Math.round(cam.y * 10) / 10,
    fov,
    lensMm,
  };
}

export function centroidOfModels(objects: StageObject[]): { x: number; z: number } {
  const models = objects.filter((o) => o.type === "model");
  if (!models.length) return { x: 0, z: 0 };
  const sum = models.reduce((a, m) => ({ x: a.x + m.x, z: a.z + m.z }), {
    x: 0,
    z: 0,
  });
  return { x: sum.x / models.length, z: sum.z / models.length };
}
