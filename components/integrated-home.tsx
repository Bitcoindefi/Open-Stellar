import { OpenStellarHub } from "@/components/open-stellar/open-stellar-hub"
import type { ActiveDistrictEvent } from "@/lib/gamification/events"

export function IntegratedHome({ initialDistrictEvent }: { initialDistrictEvent: ActiveDistrictEvent }) {
  return (
    <div className="relative min-h-screen">
      <OpenStellarHub initialDistrictEvent={initialDistrictEvent} />
    </div>
  )
}
