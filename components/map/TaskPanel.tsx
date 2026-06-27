'use client'

import { useState } from 'react'
import type { Agent, Task } from '@/lib/map-types'

interface TaskPanelProps {
  agents: Agent[]
  tasks: Task[]
  onCreateAgent: (name: string) => void
  onAssignTask: (agentId: string, taskId: string) => void
  onClearTasks: () => void
}

export default function TaskPanel({ agents, tasks, onCreateAgent, onAssignTask, onClearTasks }: TaskPanelProps) {
  const [name, setName] = useState('')
  const [selectedAgent, setSelectedAgent] = useState('')
  const [selectedTask, setSelectedTask] = useState('')

  const idleAgents = agents.filter(a => a.status === 'idle')
  const pendingTasks = tasks.filter(t => t.status === 'pending')

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) { onCreateAgent(name.trim()); setName('') }
  }

  const handleAssign = () => {
    if (selectedAgent && selectedTask) {
      onAssignTask(selectedAgent, selectedTask)
      setSelectedAgent(''); setSelectedTask('')
    }
  }

  const handleClear = () => {
    if (confirm('Clear all tasks and reset agents?')) onClearTasks()
  }

  const stat = (label: string, val: number, color?: string) => (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-lg font-semibold ${color ?? ''}`}>{val}</span>
    </div>
  )

  return (
    <aside className="w-80 border-l bg-card flex flex-col gap-6 p-5 overflow-y-auto">
      <h2 className="text-xl font-semibold">Control Panel</h2>

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Create Agent</h3>
        <form onSubmit={handleCreate} className="flex flex-col gap-2">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Agent name"
            className="rounded border px-3 py-2 text-sm bg-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          />
          <button type="submit" className="rounded bg-blue-600 text-white px-3 py-2 text-sm font-medium hover:bg-blue-700">
            Create Agent
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-3 border-t pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assign Task</h3>
        {idleAgents.length === 0 || pendingTasks.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">
            {idleAgents.length === 0 ? 'No idle agents' : 'No pending tasks'}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <select value={selectedAgent} onChange={e => setSelectedAgent(e.target.value)}
              className="rounded border px-3 py-2 text-sm bg-background">
              <option value="">Select Agent</option>
              {idleAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select value={selectedTask} onChange={e => setSelectedTask(e.target.value)}
              className="rounded border px-3 py-2 text-sm bg-background">
              <option value="">Select Task</option>
              {pendingTasks.map(t => <option key={t.id} value={t.id}>{t.description} @ {t.buildingName}</option>)}
            </select>
            <button onClick={handleAssign} disabled={!selectedAgent || !selectedTask}
              className="rounded bg-emerald-600 text-white px-3 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-40">
              Assign Task
            </button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</h3>
        <div className="grid grid-cols-2 gap-3">
          {stat('Total Agents', agents.length)}
          {stat('Idle', agents.filter(a => a.status === 'idle').length, 'text-emerald-600')}
          {stat('Moving', agents.filter(a => a.status === 'moving').length, 'text-amber-500')}
          {stat('Working', agents.filter(a => a.status === 'working').length, 'text-rose-500')}
          {stat('Pending Tasks', pendingTasks.length)}
          {stat('Completed', tasks.filter(t => t.status === 'completed').length, 'text-blue-500')}
        </div>
      </section>

      <section className="border-t pt-4">
        <button onClick={handleClear}
          className="w-full rounded border border-rose-300 text-rose-600 px-3 py-2 text-sm font-medium hover:bg-rose-50">
          Clear All Tasks
        </button>
      </section>
    </aside>
  )
}
