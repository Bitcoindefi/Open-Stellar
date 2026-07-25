'use client'

import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { useEffect, useRef } from 'react'
import type { Agent } from '@/lib/map-types'

const STATUS_COLORS: Record<Agent['status'], string> = {
  idle: '#10B981',
  moving: '#F59E0B',
  working: '#EF4444',
}

const STATUS_LABELS: Record<Agent['status'], string> = {
  idle: 'Idle',
  moving: 'Moving to destination',
  working: 'Working on task',
}

function getAgentIcon(status: Agent['status']) {
  const color = STATUS_COLORS[status]
  return new L.Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(
      `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="2"/>
        <circle cx="12" cy="9" r="3" fill="white"/>
        <path d="M7 18C7 15.7909 9.23858 14 12 14C14.7614 14 17 15.7909 17 18" stroke="white" stroke-width="2" stroke-linecap="round"/>
      </svg>`
    )}`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24],
  })
}

export default function AgentMarker({ agent }: { agent: Agent }) {
  const markerRef = useRef<L.Marker>(null)

  useEffect(() => {
    if (markerRef.current && agent.status === 'moving' && agent.targetBuilding) {
      const marker = markerRef.current
      const target = agent.targetBuilding.coordinates
      const start = marker.getLatLng()
      const steps = 50
      let step = 0
      const animate = () => {
        if (step < steps) {
          step++
          const p = step / steps
          marker.setLatLng([start.lat + (target.lat - start.lat) * p, start.lng + (target.lng - start.lng) * p])
          requestAnimationFrame(animate)
        }
      }
      animate()
    }
  }, [agent.status, agent.targetBuilding])

  return (
    <Marker
      ref={markerRef}
      position={[agent.position.lat, agent.position.lng]}
      icon={getAgentIcon(agent.status)}
    >
      <Popup>
        <div className="min-w-[180px]">
          <h3 className="font-semibold text-base mb-1">{agent.name}</h3>
          <p className="text-sm font-medium" style={{ color: STATUS_COLORS[agent.status] }}>
            {STATUS_LABELS[agent.status]}
          </p>
          {agent.assignedTask && (
            <div className="mt-2 pt-2 border-t border-gray-200 text-sm">
              <p><strong>Task:</strong> {agent.assignedTask.description}</p>
              <p><strong>Building:</strong> {agent.assignedTask.buildingName}</p>
            </div>
          )}
        </div>
      </Popup>
    </Marker>
  )
}
