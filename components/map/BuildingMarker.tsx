'use client'

import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import type { Building } from '@/lib/map-types'

interface BuildingMarkerProps {
  building: Building
  onTaskSelect?: (buildingId: string, taskName: string) => void
}

const buildingIcon = new L.Icon({
  iconUrl:
    'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSIxNCIgZmlsbD0iIzRBOTBFMiIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIi8+CiAgPHJlY3QgeD0iOSIgeT0iOCIgd2lkdGg9IjE0IiBoZWlnaHQ9IjE2IiBmaWxsPSJ3aGl0ZSIvPgogIDxyZWN0IHg9IjExIiB5PSIxMCIgd2lkdGg9IjMiIGhlaWdodD0iMyIgZmlsbD0iIzRBOTBFMiIvPgogIDxyZWN0IHg9IjE4IiB5PSIxMCIgd2lkdGg9IjMiIGhlaWdodD0iMyIgZmlsbD0iIzRBOTBFMiIvPgogIDxyZWN0IHg9IjExIiB5PSIxNSIgd2lkdGg9IjMiIGhlaWdodD0iMyIgZmlsbD0iIzRBOTBFMiIvPgogIDxyZWN0IHg9IjE4IiB5PSIxNSIgd2lkdGg9IjMiIGhlaWdodD0iMyIgZmlsbD0iIzRBOTBFMiIvPgogIDxyZWN0IHg9IjE0IiB5PSIyMCIgd2lkdGg9IjQiIGhlaWdodD0iNCIgZmlsbD0iIzRBOTBFMiIvPgo8L3N2Zz4=',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
})

export default function BuildingMarker({ building, onTaskSelect }: BuildingMarkerProps) {
  return (
    <Marker position={[building.coordinates.lat, building.coordinates.lng]} icon={buildingIcon}>
      <Popup>
        <div className="min-w-[200px]">
          <h3 className="font-semibold text-base mb-1">{building.name}</h3>
          <p className="text-sm text-gray-600 mb-2">{building.description}</p>
          {building.availableTasks.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-200">
              <h4 className="text-sm font-medium mb-1">Available Tasks:</h4>
              <ul className="space-y-1">
                {building.availableTasks.map((task, idx) => (
                  <li key={idx} className="flex items-center justify-between gap-2 text-sm">
                    <span>{task}</span>
                    {onTaskSelect && (
                      <button
                        onClick={() => onTaskSelect(building.id, task)}
                        className="px-2 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                      >
                        Assign
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Popup>
    </Marker>
  )
}
