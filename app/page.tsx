import { IntegratedHome } from '@/components/integrated-home';
import { getActiveDistrictEvent } from '@/lib/gamification/events';

export const dynamic = 'force-dynamic';

export default function Home() {
  return <IntegratedHome initialDistrictEvent={getActiveDistrictEvent()} />;
}
