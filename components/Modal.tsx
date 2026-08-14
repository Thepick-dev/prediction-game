'use client'

interface ModalProps {
  onClose: () => void
  title: string
  popArt?: boolean
  children: React.ReactNode
}

// A small, generic overlay — click the backdrop or the close button to
// dismiss. Deliberately not built from RulesModal (that one's permanently
// pop-art and tightly coupled to the rules content); this one supports both
// themes since it's meant to be reused anywhere a page needs a lightweight
// popup rather than a full custom modal.
export default function Modal({ onClose, title, popArt = false, children }: ModalProps) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto"
        style={popArt
          ? { background: 'var(--pop-surface)', border: '2px solid rgba(255,255,255,0.12)', boxShadow: '0 4px 18px rgba(0,0,0,0.5)' }
          : { background: '#2A1F17', border: '2px solid #D9A441', boxShadow: '0 4px 18px rgba(0,0,0,0.5)' }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="sticky top-0 px-5 py-3 flex items-center justify-between"
          style={popArt
            ? { background: 'var(--pop-surface)', borderBottom: '1px solid rgba(255,255,255,0.12)' }
            : { background: '#2A1F17', borderBottom: '1px solid #D9A441' }}
        >
          {popArt ? (
            <h2 className="pop-headline text-sm" style={{ color: 'var(--pop-pink)' }}>{title}</h2>
          ) : (
            <h2 className="text-xs font-bold uppercase tracking-wide text-[#D9A441]">{title}</h2>
          )}
          <button onClick={onClose} className="text-2xl leading-none" style={{ color: popArt ? 'rgba(255,255,255,0.6)' : '#F5ECD9AA' }}>&times;</button>
        </div>
        <div className="p-5">
          {children}
        </div>
      </div>
    </div>
  )
}
