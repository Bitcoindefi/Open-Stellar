"use client"

import { memo, useEffect, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
import { BufferGeometry, Float32BufferAttribute, MeshStandardMaterial, PlaneGeometry } from "three"
import type { IslandLayout } from "@/lib/city3d/layout"
import { PLATE_SIDE, PLATE_TONES, SHORE_TONES, WATER_COLOR, WATER_GLOW } from "@/lib/city3d/palette"
import {
  PLATE_CELL,
  PLATE_THICKNESS,
  PLATE_TOP,
  WATER_Y,
  WAVE_GLSL,
  buildGridFacets,
  buildShoreFacets,
  buildStreets,
  getGroundLayout,
  getHarborLayout,
  type FacetMesh,
} from "@/lib/city3d/terrain"
import { InstancedParts } from "./instanced-parts"

function facetGeometry(mesh: FacetMesh): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute("position", new Float32BufferAttribute(mesh.positions, 3))
  geometry.setAttribute("color", new Float32BufferAttribute(mesh.colors, 3))
  geometry.computeVertexNormals()
  return geometry
}

/** Faceted surface colored per facet (vertex colors), flat shaded. */
function createFacetMaterial(roughness: number): MeshStandardMaterial {
  return new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness, metalness: 0.05 })
}

/**
 * Low-poly water: a subdivided plane whose vertices ride a gentle wave in the
 * vertex shader. Flat shading takes its normals from screen-space derivatives,
 * so the moving facets catch the light without any normal math. Static under
 * reduced motion.
 */
class WaterMaterial extends MeshStandardMaterial {
  private readonly time = { value: 0 }

  constructor() {
    super({ color: WATER_COLOR, emissive: WATER_GLOW, flatShading: true, roughness: 0.32, metalness: 0.25 })
    this.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.time
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>\n{ vec2 pos = position.xy; transformed.z += ${WAVE_GLSL}; }`)
    }
  }

  setTime(seconds: number): void {
    this.time.value = seconds
  }
}

function useWaterMaterial(reduceMotion: boolean): WaterMaterial {
  const material = useMemo(() => new WaterMaterial(), [])
  useEffect(() => () => material.dispose(), [material])
  useFrame(({ clock }) => {
    if (!reduceMotion) material.setTime(clock.elapsedTime)
  })
  return material
}

interface CityGroundProps {
  islands: readonly IslandLayout[]
  reduceMotion: boolean
}

/**
 * Terrain under the floating districts: a faceted street plate with road rings,
 * dashed lanes and a neon edge, set in low-poly harbor water, ringed by faceted
 * shore land that rolls away under the haze. About ten draw calls.
 */
export const CityGround = memo(function CityGround({ islands, reduceMotion }: CityGroundProps) {
  const ground = useMemo(() => getGroundLayout(islands), [islands])
  const harbor = useMemo(() => getHarborLayout(ground), [ground])
  const streets = useMemo(() => buildStreets(islands, ground), [islands, ground])
  const plateGeometry = useMemo(() => facetGeometry(buildGridFacets(ground.plate, PLATE_CELL, PLATE_TOP, PLATE_TONES)), [ground])
  const shoreGeometry = useMemo(() => facetGeometry(buildShoreFacets(harbor, SHORE_TONES)), [harbor])
  const waterGeometry = useMemo(() => {
    const width = harbor.rx * 2 + 6
    const depth = harbor.rz * 2 + 6
    return new PlaneGeometry(width, depth, Math.round(width / 1.1), Math.round(depth / 1.1))
  }, [harbor])
  const plateMaterial = useMemo(() => createFacetMaterial(0.9), [])
  const shoreMaterial = useMemo(() => createFacetMaterial(0.95), [])
  const sideMaterial = useMemo(() => new MeshStandardMaterial({ color: PLATE_SIDE, flatShading: true, roughness: 0.8 }), [])
  const waterMaterial = useWaterMaterial(reduceMotion)

  useEffect(() => () => plateGeometry.dispose(), [plateGeometry])
  useEffect(() => () => shoreGeometry.dispose(), [shoreGeometry])
  useEffect(() => () => waterGeometry.dispose(), [waterGeometry])
  useEffect(
    () => () => {
      plateMaterial.dispose()
      shoreMaterial.dispose()
      sideMaterial.dispose()
    },
    [plateMaterial, shoreMaterial, sideMaterial],
  )

  const plateWidth = ground.plate.maxX - ground.plate.minX
  const plateDepth = ground.plate.maxZ - ground.plate.minZ
  const lit = useMemo(() => streets.roads, [streets])
  const glow = useMemo(() => [...streets.lanes, ...streets.edges], [streets])

  return (
    <group>
      <mesh geometry={waterGeometry} material={waterMaterial} rotation-x={-Math.PI / 2} position={[harbor.center.x, WATER_Y, harbor.center.z]} />
      <mesh geometry={shoreGeometry} material={shoreMaterial} />
      <mesh material={sideMaterial} position={[ground.center.x, PLATE_TOP - 0.01 - PLATE_THICKNESS / 2, ground.center.z]}>
        <boxGeometry args={[plateWidth, PLATE_THICKNESS, plateDepth]} />
      </mesh>
      <mesh geometry={plateGeometry} material={plateMaterial} />
      <InstancedParts parts={lit} kind="lit" />
      <InstancedParts parts={glow} kind="glow" />
    </group>
  )
})
