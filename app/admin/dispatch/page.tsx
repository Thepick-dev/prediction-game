'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'

type Dispatch = {
  id: string
  title: string
  slug: string
  excerpt: string
  content: string
  author: string
  published: boolean
  published_at: string | null
}

export default function DispatchAdminPage() {
  const [dispatches, setDispatches] = useState<Dispatch[]>([])
  const [editing, setEditing] = useState<Dispatch | null>(null)
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [content, setContent] = useState('')
  const [author, setAuthor] = useState('Stanno')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const supabase = createClient()

  useEffect(() => {
    loadDispatches()
  }, [])

  async function loadDispatches() {
    const { data } = await supabase
      .from('dispatches')
      .select('*')
      .order('created_at', { ascending: false })
    setDispatches(data ?? [])
  }

  function generateSlug(title: string) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  }

  function startNew() {
    setEditing(null)
    setTitle('')
    setSlug('')
    setExcerpt('')
    setContent('')
    setAuthor('Stanno')
    setMessage('')
  }

  function startEdit(dispatch: Dispatch) {
    setEditing(dispatch)
    setTitle(dispatch.title)
    setSlug(dispatch.slug)
    setExcerpt(dispatch.excerpt ?? '')
    setContent(dispatch.content)
    setAuthor(dispatch.author ?? 'Stanno')
    setMessage('')
  }

  async function save(publish: boolean) {
    if (!title || !content) {
      setMessage('Title and content are required')
      return
    }

    setSaving(true)
    setMessage('')

    const data = {
      title,
      slug: slug || generateSlug(title),
      excerpt,
      content,
      author,
      published: publish,
      published_at: publish ? new Date().toISOString() : null
    }

    if (editing) {
      await supabase.from('dispatches').update(data).eq('id', editing.id)
    } else {
      await supabase.from('dispatches').insert(data)
    }

    setMessage(publish ? 'Published' : 'Saved as draft')
    setSaving(false)
    loadDispatches()
    startNew()
  }

  async function togglePublish(dispatch: Dispatch) {
    await supabase
      .from('dispatches')
      .update({
        published: !dispatch.published,
        published_at: !dispatch.published ? new Date().toISOString() : null
      })
      .eq('id', dispatch.id)
    loadDispatches()
  }

  async function deleteDispatch(id: string) {
    await supabase.from('dispatches').delete().eq('id', id)
    loadDispatches()
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Dispatch</h1>
      <p className="text-gray-500 text-sm mb-6">Write and publish Stanno's weekly dispatches.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-4">{editing ? 'Edit Dispatch' : 'New Dispatch'}</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Headline</label>
              <input
                type="text"
                value={title}
                onChange={e => {
                  setTitle(e.target.value)
                  if (!editing) setSlug(generateSlug(e.target.value))
                }}
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="e.g. Gameweek 3: The Banker That Wasn't"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Slug (URL)</label>
              <input
                type="text"
                value={slug}
                onChange={e => setSlug(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm font-mono"
                placeholder="auto-generated from headline"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Byline</label>
              <input
                type="text"
                value={author}
                onChange={e => setAuthor(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Excerpt (shown on homepage)</label>
              <textarea
                value={excerpt}
                onChange={e => setExcerpt(e.target.value)}
                rows={2}
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="One or two sentences that appear as a teaser"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Content</label>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={12}
                className="w-full border rounded px-3 py-2 text-sm font-mono"
                placeholder="Write the dispatch here. Separate paragraphs with a blank line."
              />
            </div>

            {message && (
              <p className="text-sm text-green-600">{message}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => save(false)}
                disabled={saving}
                className="border rounded px-4 py-2 text-sm hover:border-black disabled:opacity-50"
              >
                Save Draft
              </button>
              <button
                onClick={() => save(true)}
                disabled={saving}
                className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50"
              >
                Publish
              </button>
              {editing && (
                <button
                  onClick={startNew}
                  className="text-sm text-gray-500 hover:text-gray-700 px-2"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-4">All Dispatches</h2>
          {dispatches.length === 0 ? (
            <p className="text-sm text-gray-400">No dispatches yet.</p>
          ) : (
            <div className="space-y-3">
              {dispatches.map(d => (
                <div key={d.id} className="border-b pb-3 last:border-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">{d.title}</p>
                      <p className="text-xs text-gray-400 font-mono">{d.slug}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${d.published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {d.published ? 'Live' : 'Draft'}
                    </span>
                  </div>
                  <div className="flex gap-3 mt-2">
                    <button onClick={() => startEdit(d)} className="text-xs text-blue-600 hover:underline">Edit</button>
                    <button onClick={() => togglePublish(d)} className="text-xs text-gray-600 hover:underline">
                      {d.published ? 'Unpublish' : 'Publish'}
                    </button>
                    <button onClick={() => deleteDispatch(d.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}