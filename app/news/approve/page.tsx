'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase'
import Shell from '../../components/ceefax-shell'
import HeroPage from '../../../components/HeroPage'

type Dispatch = {
  id: string
  title: string
  slug: string
  excerpt: string
  content: string
  published: boolean
  approved: boolean
  author_id: string | null
}

export default function ApproveArticlesPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState('')
  const [allowed, setAllowed] = useState<boolean | null>(null)

  const [pending, setPending] = useState<Dispatch[]>([])
  const [live, setLive] = useState<Dispatch[]>([])
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  const supabase = createClient()

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    setUser(authUser)
    if (!authUser) { router.push('/login'); return }

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, is_super_admin')
      .eq('id', authUser.id)
      .single()

    setDisplayName(profile?.display_name ?? '')
    // Deliberately super-admin-only — see the same note on the News page.
    const canApprove = !!profile?.is_super_admin
    setAllowed(canApprove)
    if (!canApprove) return

    load()
  }

  async function load() {
    const [{ data: pendingData }, { data: liveData }, { data: profiles }] = await Promise.all([
      supabase.from('dispatches').select('id, title, slug, excerpt, content, published, approved, author_id')
        .eq('approved', false).not('author_id', 'is', null).order('created_at', { ascending: false }),
      supabase.from('dispatches').select('id, title, slug, excerpt, content, published, approved, author_id')
        .eq('approved', true).not('author_id', 'is', null).order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, display_name'),
    ])
    setPending(pendingData ?? [])
    setLive(liveData ?? [])
    const names: Record<string, string> = {}
    profiles?.forEach(p => { names[p.id] = p.display_name ?? 'Unknown' })
    setAuthorNames(names)
  }

  async function approveAndPublish(d: Dispatch) {
    setMessage('')
    const { error } = await supabase
      .from('dispatches')
      .update({ approved: true, published: true, published_at: new Date().toISOString(), approved_by: user.id })
      .eq('id', d.id)
    if (error) setMessage('Error: ' + error.message)
    load()
  }

  async function unpublish(d: Dispatch) {
    await supabase.from('dispatches').update({ published: false }).eq('id', d.id)
    load()
  }

  async function sendBack(d: Dispatch) {
    // Deliberately doesn't touch approved/published — it's already false
    // for anything pending. This just gives the author a clear nudge; the
    // actual editing happens on their own Write Article page.
    setMessage(`Sent back — ${authorNames[d.author_id ?? ''] ?? 'the author'} can revise it from their Write Article page.`)
  }

  async function deleteArticle(id: string) {
    await supabase.from('dispatches').delete().eq('id', id)
    load()
  }

  if (allowed === null) {
    return (
      <Shell active="NEWS">
        <p className="text-gray-500">Loading...</p>
      </Shell>
    )
  }

  if (!allowed) {
    return (
      <Shell active="NEWS" user={user} displayName={displayName}>
        <HeroPage>
          <div className="w-full text-[#F5ECD9] text-center">
            <h1 className="text-xl font-bold mb-2" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>Not Available</h1>
            <p className="text-sm text-[#F5ECD9]/60">You&apos;re not a super admin, so this page isn&apos;t available to you.</p>
          </div>
        </HeroPage>
      </Shell>
    )
  }

  return (
    <Shell active="NEWS" user={user} displayName={displayName}>
      <HeroPage wide>
        <div className="w-full text-[#F5ECD9]">
          <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>REVIEW SUBMISSIONS</h1>
          <p className="text-[#D9A441]/70 mb-6 text-sm">Articles submitted by news authors, awaiting approval.</p>

          {message && <p className="text-sm text-green-300 mb-4">{message}</p>}

          <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden mb-6">
            <div className="px-4 py-2 border-b border-white/10 text-[10px] uppercase tracking-wider text-[#F5ECD9]/50 font-bold">
              Pending ({pending.length})
            </div>
            {pending.length === 0 ? (
              <p className="text-sm text-[#F5ECD9]/40 p-4">Nothing waiting for review.</p>
            ) : (
              <div className="divide-y divide-white/5">
                {pending.map(d => (
                  <div key={d.id} className="p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="font-bold uppercase text-sm">{d.title}</p>
                        <p className="text-xs text-[#F5ECD9]/40">By {authorNames[d.author_id ?? ''] ?? 'Unknown'}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => setExpanded(expanded === d.id ? null : d.id)} className="text-xs border border-white/20 rounded px-2 py-1">
                          {expanded === d.id ? 'Hide' : 'Preview'}
                        </button>
                        <button onClick={() => approveAndPublish(d)} className="text-xs bg-green-600 text-white rounded px-2 py-1">
                          ✓ Approve &amp; Publish
                        </button>
                        <button onClick={() => sendBack(d)} className="text-xs border border-white/20 rounded px-2 py-1">
                          Send Back
                        </button>
                        <button onClick={() => deleteArticle(d.id)} className="text-xs text-red-300 border border-red-400/30 rounded px-2 py-1">
                          Delete
                        </button>
                      </div>
                    </div>
                    {expanded === d.id && (
                      <div className="mt-3 bg-black/20 rounded-lg p-3 text-sm text-[#F5ECD9]/80 whitespace-pre-wrap">
                        {d.content}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
            <div className="px-4 py-2 border-b border-white/10 text-[10px] uppercase tracking-wider text-[#F5ECD9]/50 font-bold">
              Approved articles ({live.length})
            </div>
            {live.length === 0 ? (
              <p className="text-sm text-[#F5ECD9]/40 p-4">No author-submitted articles approved yet.</p>
            ) : (
              <div className="divide-y divide-white/5">
                {live.map(d => (
                  <div key={d.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-bold uppercase text-sm">{d.title}</p>
                      <p className="text-xs text-[#F5ECD9]/40">By {authorNames[d.author_id ?? ''] ?? 'Unknown'} · {d.published ? 'Live' : 'Unpublished'}</p>
                    </div>
                    {d.published && (
                      <button onClick={() => unpublish(d)} className="text-xs border border-white/20 rounded px-2 py-1">
                        Unpublish
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </HeroPage>
    </Shell>
  )
}
