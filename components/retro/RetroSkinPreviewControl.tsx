'use client'

import type { Skin } from '../../app/lib/useSkin'
import RetroWindow from './RetroWindow'
import RetroButton from './RetroButton'

type Props = {
  globalSkin: Skin
  preview: Skin | null
  setPreview: (skin: Skin | null) => void
}

// Admin-only. Lets an admin look at either skin for themselves without
// writing anything to the DB — the global site_skin row, set from
// /admin, stays exactly what it was for every other player regardless of
// what's picked here. Only rendered at all when useSkin's isAdmin is true.
export default function RetroSkinPreviewControl({ globalSkin, preview, setPreview }: Props) {
  return (
    <RetroWindow title="Admin Preview" variant="blue">
      <p style={{ fontFamily: 'var(--font-retro-body)', fontSize: 14, marginBottom: 'calc(var(--retro-px) * 3)' }}>
        Global skin for everyone: <strong>{globalSkin === 'retro' ? 'Retro' : 'Pop Art'}</strong>. This only changes
        what you see, on this browser.
      </p>
      <div style={{ display: 'flex', gap: 'calc(var(--retro-px) * 3)', flexWrap: 'wrap' }}>
        <RetroButton variant="b" active={preview === 'pop-art'} onClick={() => setPreview('pop-art')}>
          Preview Pop Art
        </RetroButton>
        <RetroButton variant="b" active={preview === 'retro'} onClick={() => setPreview('retro')}>
          Preview Retro
        </RetroButton>
        {preview && (
          <RetroButton variant="select" onClick={() => setPreview(null)}>
            Clear override
          </RetroButton>
        )}
      </div>
    </RetroWindow>
  )
}
