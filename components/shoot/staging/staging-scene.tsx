"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  OrbitControls,
  Grid,
  TransformControls,
  PerspectiveCamera,
  OrthographicCamera,
  Line,
} from "@react-three/drei";
import * as THREE from "three";
import {
  centroidOfModels,
  type StageObject,
  type StageState,
} from "./types";

const COLORS = {
  model: "#8b5cf6",
  modelSel: "#c4b5fd",
  camera: "#22d3ee",
  light: "#fbbf24",
};

function ObjectGroup({
  obj,
  selected,
  centroid,
  onSelect,
  refCb,
}: {
  obj: StageObject;
  selected: boolean;
  centroid: { x: number; z: number };
  onSelect: () => void;
  refCb: (o: THREE.Object3D | null) => void;
}) {
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect();
  };

  return (
    <group
      ref={refCb}
      position={[obj.x, obj.y, obj.z]}
      onClick={handleClick}
      onPointerDown={handleClick}
    >
      {obj.type === "model" && (
        <mesh position={[0, 0.9, 0]} castShadow>
          <capsuleGeometry args={[0.3, 1.1, 6, 12]} />
          <meshStandardMaterial color={selected ? COLORS.modelSel : COLORS.model} />
        </mesh>
      )}
      {obj.type === "camera" && (
        <>
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[0.4, 0.3, 0.5]} />
            <meshStandardMaterial
              color={COLORS.camera}
              emissive={COLORS.camera}
              emissiveIntensity={selected ? 0.6 : 0.2}
            />
          </mesh>
          <Line
            points={[
              [0, 0, 0],
              [centroid.x - obj.x, -obj.y + 0.9, centroid.z - obj.z],
            ]}
            color={COLORS.camera}
            lineWidth={1}
            dashed
          />
        </>
      )}
      {obj.type === "light" && (
        <mesh>
          <sphereGeometry args={[0.25, 16, 16]} />
          <meshStandardMaterial
            color={COLORS.light}
            emissive={COLORS.light}
            emissiveIntensity={selected ? 1 : 0.5}
          />
          <pointLight intensity={obj.intensity ?? 8} distance={20} color="#fff7e6" />
        </mesh>
      )}
    </group>
  );
}

function LookAtCentroid({ target }: { target: THREE.Vector3 }) {
  const { camera } = useThree();
  useFrame(() => camera.lookAt(target));
  return null;
}

export function StagingScene({
  stage,
  view,
  selectedId,
  onSelectId,
  onMove,
}: {
  stage: StageState;
  view: "top" | "camera";
  selectedId?: string;
  onSelectId: (id: string | undefined) => void;
  onMove: (id: string, p: { x: number; y: number; z: number }) => void;
}) {
  const refs = useRef<Record<string, THREE.Object3D | null>>({});
  const [attach, setAttach] = useState<THREE.Object3D | null>(null);

  useEffect(() => {
    setAttach(selectedId ? (refs.current[selectedId] ?? null) : null);
  }, [selectedId, stage.objects.length]);

  const centroid = centroidOfModels(stage.objects);
  const activeCam =
    stage.objects.find((o) => o.id === stage.activeCameraId && o.type === "camera") ??
    stage.objects.find((o) => o.type === "camera");
  const target = new THREE.Vector3(centroid.x, 0.9, centroid.z);
  const selectedObj = stage.objects.find((o) => o.id === selectedId);

  return (
    <Canvas shadows dpr={[1, 2]} className="bg-[#0d0d12]">
      {view === "top" ? (
        <>
          <OrthographicCamera makeDefault position={[0, 20, 0.001]} zoom={42} />
          <OrbitControls makeDefault enableDamping />
        </>
      ) : activeCam ? (
        <>
          <PerspectiveCamera
            makeDefault
            fov={activeCam.fov ?? 50}
            position={[activeCam.x, activeCam.y, activeCam.z]}
          />
          <LookAtCentroid target={target} />
        </>
      ) : (
        <PerspectiveCamera makeDefault position={[6, 6, 6]} />
      )}

      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 5]} intensity={1.1} castShadow />

      {/* Ground + grid */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.01, 0]}
        receiveShadow
        onClick={() => onSelectId(undefined)}
      >
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#16161d" />
      </mesh>
      <Grid
        args={[40, 40]}
        cellColor="#2a2a35"
        sectionColor="#3f3f52"
        fadeDistance={35}
        infiniteGrid
        position={[0, 0, 0]}
      />

      {stage.objects.map((obj) => (
        <ObjectGroup
          key={obj.id}
          obj={obj}
          selected={obj.id === selectedId}
          centroid={centroid}
          onSelect={() => onSelectId(obj.id)}
          refCb={(o) => (refs.current[obj.id] = o)}
        />
      ))}

      {view === "top" && attach && selectedObj && (
        <TransformControls
          object={attach}
          mode="translate"
          showY={selectedObj.type !== "model"}
          onMouseUp={() => {
            if (selectedId && attach)
              onMove(selectedId, {
                x: +attach.position.x.toFixed(2),
                y: +attach.position.y.toFixed(2),
                z: +attach.position.z.toFixed(2),
              });
          }}
        />
      )}
    </Canvas>
  );
}
