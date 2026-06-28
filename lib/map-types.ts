export interface Coordinates {
  lat: number
  lng: number
}

export interface Building {
  id: string
  name: string
  coordinates: Coordinates
  description: string
  availableTasks: string[]
}

export interface Task {
  id: string
  buildingId: string
  buildingName: string
  description: string
  status: 'pending' | 'assigned' | 'in-progress' | 'completed'
  assignedAgentId?: string
}

export interface Agent {
  id: string
  name: string
  position: Coordinates
  status: 'idle' | 'moving' | 'working'
  assignedTask?: Task
  targetBuilding?: Building
  tags?: string[]
}
