import { describe, it, expect } from 'vitest'
import { requireAdmin, requireUser } from '../require-admin'
import { createFakeSupabase } from './helpers/fake-supabase'

describe('requireAdmin', () => {
  it('returns null when nobody is logged in', async () => {
    const supabase = createFakeSupabase({}, { user: null })
    expect(await requireAdmin(supabase)).toBeNull()
  })

  it('returns null when the logged-in user is not an admin', async () => {
    const supabase = createFakeSupabase(
      { profiles: { is_admin: false } },
      { user: { id: 'user-1' } }
    )
    expect(await requireAdmin(supabase)).toBeNull()
  })

  it('returns null when the profile has no is_admin value at all', async () => {
    const supabase = createFakeSupabase(
      { profiles: {} },
      { user: { id: 'user-1' } }
    )
    expect(await requireAdmin(supabase)).toBeNull()
  })

  it('returns the user when they are logged in and is_admin is true', async () => {
    const user = { id: 'admin-1' }
    const supabase = createFakeSupabase(
      { profiles: { is_admin: true } },
      { user }
    )
    expect(await requireAdmin(supabase)).toEqual(user)
  })
})

describe('requireUser', () => {
  it('returns null when nobody is logged in', async () => {
    const supabase = createFakeSupabase({}, { user: null })
    expect(await requireUser(supabase)).toBeNull()
  })

  it('returns the user for any logged-in session, admin or not', async () => {
    const user = { id: 'user-2' }
    const supabase = createFakeSupabase({}, { user })
    expect(await requireUser(supabase)).toEqual(user)
  })
})
