type SqlClient = <T extends Record<string, unknown> = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<{ rows: T[] }>

function isTestRuntime(): boolean {
  return Boolean(process.env.VITEST || process.env.NODE_ENV === 'test')
}

export function isPostgresConfigured(): boolean {
  return !isTestRuntime() && Boolean(process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL)
}

async function loadSql(): Promise<SqlClient> {
  const moduleName = '@vercel/' + 'postgres'
  const importer = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<{ sql: SqlClient }>
  const mod = await importer(moduleName)
  return mod.sql
}

export async function sql<T extends Record<string, unknown> = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<{ rows: T[] }> {
  return (await loadSql())<T>(strings, ...values)
}
