export default function CookiePolicyPage() {
  return (
    <div className="pop-art-theme min-h-screen" style={{ background: 'var(--pop-black)' }}>
      <div className="max-w-3xl mx-auto px-4 py-12">
        <a href="/" className="text-xs uppercase tracking-widest" style={{ color: 'var(--pop-blue)' }}>&larr; Back</a>
        <h1 className="pop-hero pop-hero--green text-3xl sm:text-4xl mt-4 mb-2">Cookie Policy</h1>
        <p className="text-xs uppercase tracking-widest mb-8" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Last updated 4 October 2026 &middot; first draft, not yet reviewed by a solicitor
        </p>

        <div className="pop-panel p-6 sm:p-8 space-y-7 text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.85)' }}>
          <section>
            <p>
              This is a short policy because the site uses very little. A cookie is a small file a website
              stores in your browser, usually to remember who you are between visits.
            </p>
          </section>

          <section>
            <h2 className="pop-headline text-base mb-2" style={{ color: 'var(--pop-green)' }}>Strictly necessary</h2>
            <p>
              We use one essential cookie, set by our login system (Supabase), to keep you signed in. Without
              it the site can&apos;t tell you&apos;re logged in, so it can&apos;t be switched off and doesn&apos;t need your
              consent &mdash; it&apos;s there purely to make the site work.
            </p>
          </section>

          <section>
            <h2 className="pop-headline text-base mb-2" style={{ color: 'var(--pop-green)' }}>Analytics</h2>
            <p>
              We use Vercel Web Analytics to see roughly how many people visit and which pages are popular. It
              doesn&apos;t use cookies at all &mdash; visitors are counted using an anonymous, one-day-only code that
              can&apos;t identify you or follow you between visits or other websites.
            </p>
          </section>

          <section>
            <h2 className="pop-headline text-base mb-2" style={{ color: 'var(--pop-green)' }}>Advertising</h2>
            <p>We don&apos;t currently use any advertising or marketing cookies.</p>
          </section>

          <section>
            <h2 className="pop-headline text-base mb-2" style={{ color: 'var(--pop-green)' }}>Controlling cookies</h2>
            <p>
              Since the only cookie we set is the one that keeps you logged in, the main control you have is
              your browser&apos;s own cookie settings &mdash; blocking it will simply log you out. Most browsers let you
              see and clear cookies in their privacy settings.
            </p>
          </section>

          <section>
            <h2 className="pop-headline text-base mb-2" style={{ color: 'var(--pop-green)' }}>If this changes</h2>
            <p>
              If we ever add anything that does use cookies &mdash; advertising, for example &mdash; we&apos;ll update this
              page and ask for your consent first, with a proper option to accept or decline.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
