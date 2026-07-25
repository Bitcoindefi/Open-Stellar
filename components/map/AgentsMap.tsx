'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import type { Agent, Task, Building } from '@/lib/map-types'
import { sampleBuildings, defaultSpawnPoint } from '@/lib/map-data'
import TaskPanel from './TaskPanel'
import { clusterPositions } from '@/lib/agents/position-cluster'

// Leaflet must be loaded client-side only (no SSR)
const LeafletMap = dynamic(() => import('./LeafletMap'), { ssr: false })

let nextAgentId = 1
let nextTaskId = 1

export default function AgentsMap() {
  const searchParams = useSearchParams()
  const isCluster = searchParams.get('cluster') === 'true'
  const [agents, setAgents] = useState<Agent[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const buildings: Building[] = sampleBuildings

  const handleCreateAgent = useCallback((name: string) => {
    setAgents(prev => [...prev, {
      id: `agent-${nextAgentId++}`,
      name,
      position: { ...defaultSpawnPoint },
      status: 'idle',
    }])
  }, [])

  const handleTaskSelect = useCallback((buildingId: string, taskName: string) => {
    const building = buildings.find(b => b.id === buildingId)
    if (!building) return
    setTasks(prev => [...prev, {
      id: `task-${nextTaskId++}`,
      buildingId,
      buildingName: building.name,
      description: taskName,
      status: 'pending',
    }])
  }, [buildings])

  const handleAssignTask = useCallback((agentId: string, taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    const building = buildings.find(b => b.id === task?.buildingId)
    if (!task || !building) return

    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'assigned', assignedAgentId: agentId } : t))
    setAgents(prev => prev.map(a => a.id === agentId
      ? { ...a, status: 'moving', assignedTask: { ...task, status: 'in-progress' }, targetBuilding: building }
      : a
    ))
  }, [tasks, buildings])

  const handleClearTasks = useCallback(() => {
    setTasks([])
    setAgents(prev => prev.map(a => ({ ...a, status: 'idle', assignedTask: undefined, targetBuilding: undefined })))
  }, [])

  // Movement + completion simulation
  useEffect(() => {
    const completionTimers = new Map<string, ReturnType<typeof setTimeout>>()

    const interval = setInterval(() => {
      setAgents(prev => prev.map(agent => {
        if (agent.status === 'moving' && agent.targetBuilding) {
          const { lat: tLat, lng: tLng } = agent.targetBuilding.coordinates
          const { lat: cLat, lng: cLng } = agent.position
          const dist = Math.sqrt((tLat - cLat) ** 2 + (tLng - cLng) ** 2)
          if (dist < 0.001) return { ...agent, position: agent.targetBuilding.coordinates, status: 'working' }
          const speed = 0.0002 / dist
          return { ...agent, position: { lat: cLat + (tLat - cLat) * speed, lng: cLng + (tLng - cLng) * speed } }
        }

        if (agent.status === 'working' && agent.assignedTask && !completionTimers.has(agent.id)) {
          const timer = setTimeout(() => {
            setTasks(prev => prev.map(t => t.id === agent.assignedTask?.id ? { ...t, status: 'completed' } : t))
            setAgents(prev => prev.map(a => a.id === agent.id
              ? { ...a, status: 'idle', assignedTask: undefined, targetBuilding: undefined }
              : a
            ))
            completionTimers.delete(agent.id)
          }, 5000)
          completionTimers.set(agent.id, timer)
        }

        return agent
      }))
    }, 100)

    return () => {
      clearInterval(interval)
      completionTimers.forEach(t => clearTimeout(t))
    }
  }, [])

  const clusteredPositions = useMemo(() => {
    if (!isCluster) return []
    return clusterPositions(agents.map(a => ({
      agentId: a.id,
      lat: a.position.lat,
      lng: a.position.lng
    })), 5)
  }, [agents, isCluster])

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <div className="flex-1 min-w-0">
        <LeafletMap 
          buildings={buildings} 
          agents={agents} 
          onTaskSelect={handleTaskSelect}
          cluster={isCluster}
          clusteredPositions={clusteredPositions}
        />
      </div>
      <TaskPanel
        agents={agents}
        tasks={tasks}
        onCreateAgent={handleCreateAgent}
        onAssignTask={handleAssignTask}
        onClearTasks={handleClearTasks}
      />
    </div>
  )
}
