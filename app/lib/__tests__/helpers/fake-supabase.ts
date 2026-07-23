// A deliberately minimal stand-in for a Supabase client, for unit tests of
// business logic that happens to take a SupabaseClient as a parameter.
// It does NOT model real query filtering — .eq()/.in()/.order() etc are
// no-ops that just return the builder unchanged. Each test supplies the
// exact rows a given table lookup should resolve to (as if its real-world
// filters had already been applied), keyed by table name. Good enough for
// testing deterministic logic; not a substitute for testing against a real
// database.

type TableRows = Record<string, any[] | any | null>

function toArray(rows: any[] | any | null): any[] {
  if (Array.isArray(rows)) return rows
  if (rows == null) return []
  return [rows]
}

function makeSingleResult(row: any) {
  return {
    then(resolve: (v: { data: any; error: null }) => void) {
      resolve({ data: row, error: null })
      return Promise.resolve()
    },
  }
}

function makeQueryBuilder(rows: any[]) {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    neq: () => builder,
    in: () => builder,
    order: () => builder,
    limit: () => builder,
    single: () => makeSingleResult(rows[0] ?? null),
    then(resolve: (v: { data: any[]; error: null }) => void) {
      resolve({ data: rows, error: null })
      return Promise.resolve()
    },
  }
  return builder
}

export function createFakeSupabase(tables: TableRows, opts?: { user?: { id: string } | null }) {
  return {
    from(table: string) {
      return makeQueryBuilder(toArray(tables[table]))
    },
    auth: {
      async getUser() {
        return { data: { user: opts?.user ?? null } }
      },
    },
  } as any
}
