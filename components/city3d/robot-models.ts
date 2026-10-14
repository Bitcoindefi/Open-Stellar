import {
  AnimationClip,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  SkinnedMesh,
  type BufferAttribute,
  type InterleavedBufferAttribute,
  type Material,
  type Matrix4,
  type Object3D,
} from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js"
import { IDLE_CLIP, WALK_CLIP } from "@/lib/city3d/robot-animation"
import { OFFLINE_BODY_TINT, ROBOT_GLOW_INTENSITY, ROBOT_SURFACE, isGlowMaterialName } from "@/lib/city3d/robot-models"

/**
 * Loader and cache for the low-poly robot models. Only the lazily loaded 3D
 * view imports this, so neither the glTF loader nor the meshopt decoder ships
 * with the 2D map.
 *
 * Rigged models (a skinned mesh with Walk and Idle clips) are kept as a
 * template that each robot clones with its own skeleton; the geometry and the
 * lit and offline materials stay shared.
 *
 * Unrigged models are fetched once and merged into a single geometry: the glow
 * primitives (eyes, visors, trims) keep their color in the vertex colors and
 * are flagged by a `glow` vertex attribute that the robot material turns into
 * emission. One robot is then one draw call, and every robot of a district
 * shares the geometry and the lit and offline materials.
 */

interface RobotModelBase {
  url: string
  /** Material of a powered robot. */
  lit: RobotMaterial
  /** Material of an offline robot: grayed, glow switched off. */
  dim: RobotMaterial
}

/** Unrigged model: every primitive merged into one geometry, one draw call per robot. */
export interface StaticRobotModel extends RobotModelBase {
  kind: "static"
  geometry: BufferGeometry
}

/**
 * Rigged model: a skinned template scene (one SkinnedMesh per primitive, one
 * skeleton) and its Walk and Idle clips. Robots draw SkeletonUtils clones of the
 * template, which share its geometry and materials but own their bones.
 */
export interface RiggedRobotModel extends RobotModelBase {
  kind: "rigged"
  scene: Object3D
  walk: AnimationClip
  idle: AnimationClip
}

export type RobotModel = StaticRobotModel | RiggedRobotModel

/** One robot drawn from a rigged model: its own bones, and the meshes whose material follows the robot's status. */
export interface RobotInstance {
  root: Object3D
  meshes: Mesh[]
}

/** A skinned copy of a rigged model with its own skeleton (a plain clone would share the bones). */
export function createRobotInstance(model: RiggedRobotModel): RobotInstance {
  const root = cloneSkinned(model.scene)
  const meshes: Mesh[] = []
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    // Bounds come from the bind pose; never let a limb swinging past them pop out at the screen edge.
    object.frustumCulled = false
    meshes.push(object)
  })
  return { root, meshes }
}

/** MeshStandardMaterial whose `glow` flagged vertices emit their own vertex color. */
export type RobotMaterial = MeshStandardMaterial & { userData: { glow: { value: number } } }

/** Faceted, vertex-colored robot material; `glow` is the emission strength of the glow vertices. */
export function createRobotMaterial(glow: number): RobotMaterial {
  const material = new MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: ROBOT_SURFACE.roughness,
    metalness: ROBOT_SURFACE.metalness,
  }) as RobotMaterial
  material.userData.glow = { value: glow }
  installGlowShader(material)
  // Clones (the per-robot error flash) get their own glow uniform and the same shader program.
  const clone = material.clone.bind(material)
  material.clone = () => {
    const copy = clone() as RobotMaterial
    copy.userData = { glow: { value: material.userData.glow.value } }
    installGlowShader(copy)
    return copy
  }
  return material
}

/** Injects the glow attribute into the standard shader, bound to the target material's own uniform. */
function installGlowShader(target: RobotMaterial): void {
  target.onBeforeCompile = (shader) => {
    shader.uniforms.robotGlow = target.userData.glow
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float glow;\nvarying float vRobotGlow;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRobotGlow = glow;")
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float robotGlow;\nvarying float vRobotGlow;")
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vRobotGlow * robotGlow;",
      )
  }
  target.customProgramCacheKey = () => "agentic-city-robot"
}

let loader: GLTFLoader | null = null
const models = new Map<string, Promise<RobotModel>>()

function getLoader(): GLTFLoader {
  loader ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  return loader
}

type AnyAttribute = BufferAttribute | InterleavedBufferAttribute

/** Plain float copy of a (possibly quantized, interleaved or indexed) attribute, expanded to unindexed triangles. */
function floatAttribute(attribute: AnyAttribute, index: BufferAttribute | null, size: number): Float32BufferAttribute {
  const count = index ? index.count : attribute.count
  const out = new Float32Array(count * size)
  for (let i = 0; i < count; i++) {
    const v = index ? index.getX(i) : i
    out[i * size] = attribute.getX(v)
    if (size > 1) out[i * size + 1] = attribute.getY(v)
    if (size > 2) out[i * size + 2] = attribute.getZ(v)
  }
  return new Float32BufferAttribute(out, size)
}

/** One primitive as unindexed float position, normal, color and glow, in model space. */
function flattenPart(source: BufferGeometry, matrix: Matrix4, glow: boolean, fallbackColor: Color): BufferGeometry {
  const index = source.getIndex()
  const geometry = new BufferGeometry()
  const position = source.getAttribute("position")
  geometry.setAttribute("position", floatAttribute(position, index, 3))
  const normal = source.getAttribute("normal")
  if (normal) geometry.setAttribute("normal", floatAttribute(normal, index, 3))
  const count = geometry.getAttribute("position").count
  const color = source.getAttribute("color")
  if (color) {
    geometry.setAttribute("color", floatAttribute(color, index, 3))
  } else {
    const fill = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) fallbackColor.toArray(fill, i * 3)
    geometry.setAttribute("color", new Float32BufferAttribute(fill, 3))
  }
  geometry.setAttribute("glow", new Float32BufferAttribute(new Float32Array(count).fill(glow ? 1 : 0), 1))
  geometry.applyMatrix4(matrix)
  if (!normal) geometry.computeVertexNormals()
  return geometry
}

function disposeModel(model: RobotModel): void {
  if (model.kind === "static") {
    model.geometry.dispose()
  } else {
    model.scene.traverse((object) => {
      if (object instanceof Mesh) (object.geometry as BufferGeometry).dispose()
      if (object instanceof SkinnedMesh) object.skeleton.dispose()
    })
  }
  model.lit.dispose()
  model.dim.dispose()
}

function createMaterials(): Pick<RobotModelBase, "lit" | "dim"> {
  const dim = createRobotMaterial(0)
  dim.color.set(OFFLINE_BODY_TINT)
  return { lit: createRobotMaterial(ROBOT_GLOW_INTENSITY), dim }
}

/**
 * Keeps the skinned template as loaded, and only swaps its materials: every
 * primitive gets the shared robot material plus a `glow` attribute (1 on the
 * glow primitives), so the lit, dim and alert looks work as on static models.
 */
function readRiggedModel(url: string, scene: Object3D, walk: AnimationClip, idle: AnimationClip): RiggedRobotModel {
  const materials = createMaterials()
  const stale = new Set<{ dispose(): void }>()
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const source = (Array.isArray(object.material) ? object.material[0] : object.material) as Material | undefined
    const glow = isGlowMaterialName(source?.name)
    const geometry = object.geometry as BufferGeometry
    const count = geometry.getAttribute("position").count
    if (!geometry.getAttribute("color")) {
      const fill = new Float32Array(count * 3)
      const color = source instanceof MeshStandardMaterial ? (glow ? source.emissive : source.color) : new Color("#cbd5e1")
      for (let i = 0; i < count; i++) color.toArray(fill, i * 3)
      geometry.setAttribute("color", new Float32BufferAttribute(fill, 3))
    }
    geometry.setAttribute("glow", new Float32BufferAttribute(new Float32Array(count).fill(glow ? 1 : 0), 1))
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals()
    object.material = materials.lit
    if (source) stale.add(source)
  })
  for (const resource of stale) resource.dispose()
  mergeSkinnedPrimitives(scene, materials.lit)
  return { kind: "rigged", url, scene, walk, idle, ...materials }
}

/**
 * glTF gives one SkinnedMesh per primitive (body, glow-0, glow-1), and each
 * SkeletonUtils clone would then carry one skeleton, one bone texture upload
 * and one draw call per primitive. The primitives share one skin, so they are
 * merged into a single SkinnedMesh: one draw and one skeleton per robot.
 */
export function mergeSkinnedPrimitives(scene: Object3D, material: RobotMaterial): void {
  const parts: SkinnedMesh[] = []
  scene.traverse((object) => {
    if (object instanceof SkinnedMesh) parts.push(object)
  })
  if (parts.length < 2) return
  const [first] = parts
  const sameSkin = parts.every((part) => part.skeleton === first.skeleton && part.parent === first.parent && part.bindMatrix.equals(first.bindMatrix))
  if (!sameSkin || !first.parent) return
  const geometry = mergeGeometries(parts.map((part) => part.geometry as BufferGeometry), false)
  if (!geometry) return
  const merged = new SkinnedMesh(geometry, material)
  merged.name = first.name
  merged.position.copy(first.position)
  merged.quaternion.copy(first.quaternion)
  merged.scale.copy(first.scale)
  first.parent.add(merged)
  merged.bind(first.skeleton, first.bindMatrix)
  for (const part of parts) {
    part.removeFromParent()
    ;(part.geometry as BufferGeometry).dispose()
  }
}

async function readModel(url: string): Promise<RobotModel> {
  const gltf = await getLoader().loadAsync(url)
  let skinned = false
  gltf.scene.traverse((object) => {
    if (object instanceof SkinnedMesh) skinned = true
  })
  const walk = AnimationClip.findByName(gltf.animations, WALK_CLIP)
  const idle = AnimationClip.findByName(gltf.animations, IDLE_CLIP)
  if (skinned && walk && idle) return readRiggedModel(url, gltf.scene, walk, idle)
  // Unrigged (or incomplete) models keep the merged, procedurally animated path.
  gltf.scene.updateMatrixWorld(true)
  const parts: BufferGeometry[] = []
  const stale: { dispose(): void }[] = []
  gltf.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const source = (Array.isArray(object.material) ? object.material[0] : object.material) as Material | undefined
    const glow = isGlowMaterialName(source?.name)
    let fallback = new Color("#cbd5e1")
    if (source instanceof MeshStandardMaterial) {
      fallback = glow && !source.emissive.equals(new Color(0, 0, 0)) ? source.emissive.clone() : source.color.clone()
    }
    parts.push(flattenPart(object.geometry as BufferGeometry, object.matrixWorld, glow, fallback))
    stale.push(object.geometry as BufferGeometry)
    if (source) stale.push(source)
  })
  for (const resource of stale) resource.dispose()
  if (parts.length === 0) throw new Error(`[city-3d] ${url} has no meshes`)
  const geometry = mergeGeometries(parts, false)
  for (const part of parts) part.dispose()
  if (!geometry) throw new Error(`[city-3d] ${url} could not be merged`)
  geometry.computeBoundingSphere()
  return { kind: "static", url, geometry, ...createMaterials() }
}

/** The robot model at `url`, fetched and parsed once. A failed load can be retried by the next caller. */
export function loadRobotModel(url: string): Promise<RobotModel> {
  let pending = models.get(url)
  if (!pending) {
    pending = readModel(url)
    models.set(url, pending)
    pending.catch(() => {
      if (models.get(url) === pending) models.delete(url)
    })
  }
  return pending
}

/** Frees every loaded robot model (when the 3D view unmounts). */
export function disposeRobotModels(): void {
  // Models still loading are freed as soon as they arrive.
  for (const pending of models.values()) pending.then(disposeModel, () => {})
  models.clear()
}
