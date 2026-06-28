export interface AgentPosition {
  agentId: string;
  lat: number;
  lng: number;
}

export interface ClusteredPosition {
  lat: number;
  lng: number;
  count: number;
  agentIds: string[];
}

export function clusterPositions(positions: AgentPosition[], gridSizeKm: number = 5): ClusteredPosition[] {
  // Rough geographic clustering by distance
  // For each position, find the first cluster it's within gridSizeKm of, or create a new cluster
  
  const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const clusters: ClusteredPosition[] = [];

  for (const pos of positions) {
    let added = false;
    for (const cluster of clusters) {
      if (getDistanceKm(pos.lat, pos.lng, cluster.lat, cluster.lng) <= gridSizeKm) {
        const newCount = cluster.count + 1;
        // Move centroid towards new point
        cluster.lat = ((cluster.lat * cluster.count) + pos.lat) / newCount;
        cluster.lng = ((cluster.lng * cluster.count) + pos.lng) / newCount;
        cluster.count = newCount;
        cluster.agentIds.push(pos.agentId);
        added = true;
        break;
      }
    }
    if (!added) {
      clusters.push({
        lat: pos.lat,
        lng: pos.lng,
        count: 1,
        agentIds: [pos.agentId],
      });
    }
  }

  return clusters;
}
