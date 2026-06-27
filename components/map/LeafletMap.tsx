'use client'

import { MapContainer, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { Agent, Building } from '@/lib/map-types'
import BuildingMarker from './BuildingMarker'
import AgentMarker from './AgentMarker'

interface LeafletMapProps {
  buildings: Building[]
  agents: Agent[]
  onTaskSelect: (buildingId: string, taskName: string) => void
}

export default function LeafletMap({ buildings, agents, onTaskSelect }: LeafletMapProps) {
  return (
    <MapContainer
      center={[40.7300, -73.9950]}
      zoom={13}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {buildings.map(b => (
        <BuildingMarker key={b.id} building={b} onTaskSelect={onTaskSelect} />
      ))}
      {agents.map(a => (
        <AgentMarker key={a.id} agent={a} />
      ))}
    </MapContainer>
  )
}
