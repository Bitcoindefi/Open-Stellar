import type { Building } from './map-types'

export const sampleBuildings: Building[] = [
  {
    id: 'b1',
    name: 'Research Lab',
    coordinates: { lat: 40.7128, lng: -74.0060 },
    description: 'Advanced research and development facility',
    availableTasks: ['Collect Data', 'Run Analysis', 'Compile Report'],
  },
  {
    id: 'b2',
    name: 'Command Center',
    coordinates: { lat: 40.7580, lng: -73.9855 },
    description: 'Central coordination and communication hub',
    availableTasks: ['Receive Orders', 'Send Report', 'Update Status'],
  },
  {
    id: 'b3',
    name: 'Manufacturing Plant',
    coordinates: { lat: 40.7489, lng: -73.9680 },
    description: 'Production and assembly facility',
    availableTasks: ['Inspect Equipment', 'Deliver Materials', 'Quality Check'],
  },
  {
    id: 'b4',
    name: 'Supply Depot',
    coordinates: { lat: 40.6782, lng: -73.9442 },
    description: 'Logistics and resource distribution center',
    availableTasks: ['Pick Up Supplies', 'Inventory Count', 'Load Transport'],
  },
  {
    id: 'b5',
    name: 'Energy Station',
    coordinates: { lat: 40.7614, lng: -73.9776 },
    description: 'Power generation and distribution facility',
    availableTasks: ['Monitor Systems', 'Maintenance Check', 'Fuel Refill'],
  },
  {
    id: 'b6',
    name: 'Medical Bay',
    coordinates: { lat: 40.7306, lng: -73.9352 },
    description: 'Healthcare and emergency response center',
    availableTasks: ['Medical Checkup', 'Deliver Supplies', 'Emergency Response'],
  },
]

export const defaultSpawnPoint: { lat: number; lng: number } = { lat: 40.7300, lng: -73.9950 }
