import { Suspense } from 'react'
import AgentsMap from '@/components/map/AgentsMap'

export const metadata = { title: 'Agent Map | Agent City' }

export default function MapPage() {
  return (
    <Suspense fallback={<div>Loading map...</div>}>
      <AgentsMap />
    </Suspense>
  )
}
