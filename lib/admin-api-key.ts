import { getAdminApiKey as getCoreAdminApiKey } from "./auth/api-keys";

export function getAdminApiKey(): string {
  return getCoreAdminApiKey();
}
