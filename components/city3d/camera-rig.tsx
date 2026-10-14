"use client"

import { useCallback, useEffect, useMemo, useRef, type ComponentRef, type MutableRefObject } from "react"
import { useThree } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import {
  CAMERA_DISTANCE_LIMITS,
  CAMERA_POLAR_LIMITS,
  FIT_TARGET_MARGIN,
  clampTarget,
  fitCameraView,
  scaleCameraDistance,
  type CityFrame,
  type FitPoint,
  type ViewportInsets,
} from "@/lib/city3d/layout"
import { FOG_COLOR } from "@/lib/city3d/palette"

export interface CameraApi {
  /** Multiplies the camera distance (below 1 zooms in). */
  zoom: (factor: number) => void
  /** Back to the default framing for the current viewport. */
  recenter: () => void
}

interface CameraRigProps {
  frame: CityFrame
  /** What the default framing keeps on screen: island corners, tower tops and name plates. */
  fitPoints: readonly FitPoint[]
  /** Canvas pixels hidden by overlays; null while they are still being measured. */
  insets: ViewportInsets | null
  reduceMotion: boolean
  apiRef: MutableRefObject<CameraApi | null>
}

type OrbitControlsHandle = ComponentRef<typeof OrbitControls>

/** Dusk haze, the sky's horizon tone, so far water, shore and towers melt into it. */
const HAZE = FOG_COLOR

/**
 * Orbit camera over the city: limited tilt so it never goes flat or under the
 * ground, distance limits, a target that cannot be panned off the map, and damping
 * unless the user prefers reduced motion. Touch works out of the box (one finger
 * orbits, two fingers zoom and pan).
 *
 * The default framing fits every district and its name plate into the part of
 * the canvas that overlays leave free, so a phone shows the whole city between
 * the top controls and the bottom nav.
 */
export function CameraRig({ frame, fitPoints, insets, reduceMotion, apiRef }: CameraRigProps) {
  const controlsRef = useRef<OrbitControlsHandle>(null)
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)
  const width = useThree((state) => state.size.width)
  const height = useThree((state) => state.size.height)
  const view = useMemo(
    () => fitCameraView(fitPoints, { viewport: { width, height }, insets: insets ?? undefined, frame }),
    [fitPoints, width, height, insets, frame],
  )
  const viewRef = useRef(view)
  viewRef.current = view
  // Once the user orbits, pans or zooms, layout changes no longer move their camera.
  const userMovedRef = useRef(false)

  const recenter = useCallback(() => {
    const { position, target } = viewRef.current
    camera.position.set(position.x, position.y, position.z)
    const controls = controlsRef.current
    if (controls) {
      controls.target.set(target.x, target.y, target.z)
      controls.update()
    } else {
      camera.lookAt(target.x, target.y, target.z)
    }
    userMovedRef.current = false
    invalidate()
  }, [camera, invalidate])

  // Frame the city once the canvas has a size and the overlays are measured, and
  // again when the layout changes (rotation, overlays) until the user takes over.
  useEffect(() => {
    if (width === 0 || height === 0 || insets === null || userMovedRef.current) return
    recenter()
  }, [width, height, insets, view, recenter])

  useEffect(() => {
    apiRef.current = {
      zoom: (factor: number) => {
        const controls = controlsRef.current
        if (!controls) return
        const next = scaleCameraDistance(camera.position, controls.target, factor, controls.minDistance, controls.maxDistance)
        camera.position.set(next.x, next.y, next.z)
        controls.update()
        userMovedRef.current = true
        invalidate()
      },
      recenter,
    }
    return () => {
      apiRef.current = null
    }
  }, [apiRef, camera, recenter, invalidate])

  const handleStart = useCallback(() => {
    userMovedRef.current = true
  }, [])

  // Keep the orbit target over the city: shift camera and target together so panning stops at the edge.
  const handleChange = useCallback(() => {
    const controls = controlsRef.current
    if (!controls) return
    const { target } = controls
    const clamped = clampTarget(target, frame, FIT_TARGET_MARGIN)
    const dx = clamped.x - target.x
    const dy = clamped.y - target.y
    const dz = clamped.z - target.z
    if (dx === 0 && dy === 0 && dz === 0) return
    target.set(clamped.x, clamped.y, clamped.z)
    camera.position.set(camera.position.x + dx, camera.position.y + dy, camera.position.z + dz)
  }, [camera, frame])

  return (
    <>
      {/* Light haze that scales with the framing: the far shore and skyline ring fade, never a district. */}
      <fog attach="fog" args={[HAZE, view.distance * 1.15, view.distance * 2.9]} />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping={!reduceMotion}
        dampingFactor={0.08}
        rotateSpeed={0.55}
        zoomSpeed={0.8}
        panSpeed={0.7}
        screenSpacePanning={false}
        minPolarAngle={CAMERA_POLAR_LIMITS.min}
        maxPolarAngle={CAMERA_POLAR_LIMITS.max}
        minDistance={CAMERA_DISTANCE_LIMITS.min}
        maxDistance={CAMERA_DISTANCE_LIMITS.max}
        onStart={handleStart}
        onChange={handleChange}
      />
    </>
  )
}
