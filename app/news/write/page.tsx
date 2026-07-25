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
}

export default function WriteArticlePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState('')
  const [allowed, setAllowed] = useState<boolean | null>(null)

  const [dispatches, setDispatches] = useState<Dispatch[]>([])
  const [editing, setEditing] = useState<Dispatch | null>(null)
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const supabase = createClient()

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    setUser(authUser)
    if (!authUser) { router.push('/login'); return }

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, can_post_news, is_admin')
      .eq('id', authUser.id)
      .single()

    setDisplayName(profile?.display_name ?? '')
    const canWrite = !!(profile?.can_post_news || profile?.is_admin)
    setAllowed(canWrite)
    if (!canWrite) return

    loadDispatches(authUser.id)
  }

  async function loadDispatches(userId: string) {
    const { data } = await supabase
      .from('dispatches')
      .select('id, title, slug, excerpt, content, published, approved')
      .eq('author_id', userId)
      .order('created_at', { ascending: false })
    setDispatches(data ?? [])
  }

  function generateSlug(t: string) {
    return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  }

  function startNew() {
    setEditing(null)
    setTitle('')
    setSlug('')
    setExcerpt('')
    setContent('')
    setMessage('')
  }

  function startEdit(d: Dispatch) {
    setEditing(d)
    setTitle(d.title)
    setSlug(d.slug)
    setExcerpt(d.excerpt ?? '')
    setContent(d.content)
    setMessage('')
  }

  async function submit() {
    if (!title || !content) {
      setMessage('Title and content are required')
      return
    }
    setSaving(true)
    setMessage('')
    // Never sets published or approved to true from here — that's the
    // approver's call, made on the review page. Editing an already-approved
    // article sends it back for review rather than leaving stale-approved
    // content live for a change nobody's seen yet.
    const data = {
      title,
      slug: slug || generateSlug(title),
      excerpt,
      content,
      author_id: user.id,
      approved: false,
    }
    const { error } = editing
      ? await supabase.from('dispatches').update(data).eq('id', editing.id)
      : await supabase.from('dispatches').insert(data)

    if (error) {
      setMessage('Error: ' + error.message)
    } else {
      setMessage('Submitted for review')
      startNew()
      loadDispatches(user.id)
    }
    setSaving(false)
  }

  async function deleteDraft(id: string) {
    await supabase.from('dispatches').delete().eq('id', id)
    loadDispatches(user.id)
  }

  if (allowed === null) {
    return (
      <Shell active="MATCHDAY PROGRAMME">
        <p className="text-gray-500">Loading...</p>
      </Shell>
    )
  }

  if (!allowed) {
    return (
      <Shell active="MATCHDAY PROGRAMME" user={user} displayName={displayName}>
        <HeroPage>
          <div className="w-full text-[#F5ECD9] text-center">
            <h1 className="text-xl font-bold mb-2" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>Not Available</h1>
            <p className="text-sm text-[#F5ECD9]/60">You don&apos;t have permission to write articles. Ask an admin if you think this should change.</p>
          </div>
        </HeroPage>
      </Shell>
    )
  }

  return (
    <Shell active="MATCHDAY PROGRAMME" user={user} displayName={displayName}>
      <HeroPage wide>
        <div className="w-full text-[#F5ECD9]">
          <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>WRITE ARTICLE</h1>
          <p className="text-[#D9A441]/70 mb-6 text-sm">Submitted articles go to a super admin for review before they go live.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white/5 border border-white/10 rounded-lg p-5">
              <h2 className="font-bold mb-4 uppercase text-sm tracking-wider text-[#D9A441]">{editing ? 'Edit Draft' : 'New Article'}</h2>
              <div className="space-y-3">
                <input
                  type="text"
                  value={title}
                  onChange={e => { setTitle(e.target.value); if (!editing) setSlug(generateSlug(e.target.value)) }}
                  placeholder="Title"
                  className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-[#F5ECD9] placeholder:text-[#F5ECD9]/30"
                />
                <textarea
                  value={excerpt}
                  onChange={e => setExcerpt(e.target.value)}
                  rows={2}
                  placeholder="Short excerpt (shown in the list)"
                  className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-[#F5ECD9] placeholder:text-[#F5ECD9]/30"
                />
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  rows={12}
                  placeholder="Write the article. Separate paragraphs with a blank line."
                  className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-[#F5ECD9] placeholder:text-[#F5ECD9]/30"
                />
                {message && (
                  <p className={`text-sm ${message.startsWith('Error') ? 'text-red-300' : 'text-green-300'}`}>{message}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={submit}
                    disabled={saving}
                    className="rounded-lg py-2 px-4 text-sm font-bold uppercase tracking-wider disabled:opacity-60"
                    style={{ backgroundColor: '#D9A441', color: '#241a12' }}
                  >
                    {saving ? 'Submitting...' : editing ? 'Resubmit for Review' : 'Submit for Review'}
                  </button>
                  {editing && (
                    <button onClick={startNew} className="text-sm text-[#F5ECD9]/50 px-2">Cancel</button>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-lg p-5">
              <h2 className="font-bold mb-4 uppercase text-sm tracking-wider text-[#D9A441]">Your Articles</h2>
              {dispatches.length === 0 ? (
                <p className="text-sm text-[#F5ECD9]/40">Nothing submitted yet.</p>
              ) : (
                <div className="space-y-3">
                  {dispatches.map(d => (
                    <div key={d.id} className="border-b border-white/10 pb-3 last:border-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-bold text-sm">{d.title}</p>
                        <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${
                          d.published ? 'bg-green-500/20 text-green-300' :
                          d.approved ? 'bg-blue-500/20 text-blue-300' :
                          'bg-yellow-500/20 text-yellow-300'
                        }`}>
                          {d.published ? 'Live' : d.approved ? 'Approved' : 'Pending Review'}
                        </span>
                      </div>
                      <div className="flex gap-3 mt-1.5">
                        <button onClick={() => startEdit(d)} className="text-xs text-[#D9A441] hover:underline">Edit</button>
                        <button onClick={() => deleteDraft(d.id)} className="text-xs text-red-300 hover:underline">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </HeroPage>
    </Shell>
  )
}
