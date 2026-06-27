type KvClient = {
  get<T>(key: string): Promise<T | null>
  set(key: string, value: unknown): Promise<unknown>
  sadd(key: string, ...members: string[]): Promise<unknown>
  smembers<T>(key: string): Promise<T>
}

function isTestRuntime(): boolean {
  return Boolean(process.env.VITEST || process.env.NODE_ENV === 'test')
}

export function isKvConfigured(): boolean {
  return !isTestRuntime() && Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}

async function loadKv(): Promise<KvClient> {
  const moduleName = '@vercel/' + 'kv'
  const importer = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<{ kv: KvClient }>
  const mod = await importer(moduleName)
  return mod.kv
}

export const kv: KvClient = {
  async get<T>(key: string) { return (await loadKv()).get<T>(key) },
  async set(key: string, value: unknown) { return (await loadKv()).set(key, value) },
  async sadd(key: string, ...members: string[]) { return (await loadKv()).sadd(key, ...members) },
  async smembers<T>(key: string) { return (await loadKv()).smembers<T>(key) },
}
