export interface AgentPositionLike {
  agentId?: string
  id?: string
  lat?: number
  lng?: number
  pixelX?: number
  pixelY?: number
}

export interface ClusteredPosition {
  lat: number
  lng: number
  count: number
  agentIds: string[]
}

export function clusterPositions(positions: AgentPositionLike[], gridSizeKm: number = 5): ClusteredPosition[] {
  const clusters: ClusteredPosition[] = []
  
  for (const pos of positions) {
    const lat = pos.lat ?? pos.pixelY ?? 0
    const lng = pos.lng ?? pos.pixelX ?? 0
    const id = pos.agentId ?? pos.id ?? "unknown"
    
    let found = false
    for (const cluster of clusters) {
      if (getDistanceFromLatLonInKm(cluster.lat, cluster.lng, lat, lng) <= gridSizeKm) {
        cluster.agentIds.push(id)
        cluster.count += 1
        found = true
        break
      }
    }
    
    if (!found) {
      clusters.push({
        lat,
        lng,
        count: 1,
        agentIds: [id],
      })
    }
  }
  
  return clusters
}

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1)
  const dLon = deg2rad(lon2 - lon1)
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180)
}
