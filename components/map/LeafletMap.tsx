'use client'

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Agent, Building } from '@/lib/map-types'
import type { ClusteredPosition } from '@/lib/agents/position-cluster'
import BuildingMarker from './BuildingMarker'
import AgentMarker from './AgentMarker'

interface LeafletMapProps {
  buildings: Building[]
  agents: Agent[]
  clusteredPositions?: ClusteredPosition[]
  cluster?: boolean
  onTaskSelect: (buildingId: string, taskName: string) => void
}

function getClusterIcon(count: number) {
  return L.divIcon({
    html: `<div style="background: #3B82F6; color: white; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); font-size: 14px;">${count}</div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  })
}

export default function LeafletMap({ buildings, agents, clusteredPositions = [], cluster = false, onTaskSelect }: LeafletMapProps) {
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
      
      {cluster ? (
        clusteredPositions.map((cp, idx) => (
          <Marker key={`cluster-${idx}`} position={[cp.lat, cp.lng]} icon={getClusterIcon(cp.count)}>
            <Popup>
              <div className="text-center font-medium">Cluster of {cp.count} agents</div>
            </Popup>
          </Marker>
        ))
      ) : (
        agents.map(a => (
          <AgentMarker key={a.id} agent={a} />
        ))
      )}
    </MapContainer>
  )
}
