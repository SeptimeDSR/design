"use client";

import { Canvas } from "@react-three/fiber";
import { Float, MeshDistortMaterial } from "@react-three/drei";

// FREE — 100% code (three.js + react-three-fiber). No account, no asset, no credit.
export default function OrbScene() {
  return (
    <Canvas camera={{ position: [0, 0, 4.2], fov: 42 }} dpr={[1, 2]}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 5]} intensity={3} color="#ffd9c7" />
      <directionalLight position={[-5, 2, 3]} intensity={0.8} color="#ece7dc" />
      <pointLight position={[-4, -2, -2]} intensity={40} color="#ff4d1a" />
      <Float speed={1.4} rotationIntensity={0.6} floatIntensity={1.1}>
        <mesh>
          <icosahedronGeometry args={[1.25, 64]} />
          <MeshDistortMaterial color="#3b322b" roughness={0.32} metalness={0.25} distort={0.38} speed={1.6} />
        </mesh>
      </Float>
    </Canvas>
  );
}
