export default function PrivacyPolicyPage() {
  return (
    <div className="pop-art-theme min-h-screen" style={{ background: 'var(--pop-black)' }}>
      <div className="max-w-3xl mx-auto px-4 py-12">
        <a href="/" className="text-xs uppercase tracking-widest" style={{ color: 'var(--pop-blue)' }}>&larr; Back</a>
        <h1 className="pop-hero pop-hero--pink text-3xl sm:text-4xl mt-4 mb-2">Privacy Policy</h1>
        <p className="text-xs uppercase tracking-widest mb-8" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Last updated 4 October 2026 &middot; first draft, not yet reviewed by a solicitor
        </p>

        <div className="pop-panel p-6 sm:p-8 space-y-7 text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.85)' }}>
          <section>
            <p>
              This policy explains what personal data LMS All-Stars (&ldquo;we&rdquo;, &ldquo;us&rdquo;) collects when you use this
              site, why, and what rights you have over it. We are a UK sole trader; our data protection
              contact is <span style={{ color: 'var(--pop-white)' }}>[contact email]</span>.
            </p>
          </section>

          <section>
            <h2 className="pop-headline text-base mb-2" style={{ color: 'var(--pop-blue)' }}>What we collect</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><span style={{ color: 'var(--pop-white)' }}>Account details</span> &mdash; your username, email address, and a securely hashed password (we never store your actual password).</li>
              <li><span style={{ color: 'var(--pop-white)' }}>Game activity</span> &mdash; your weekly picks, points, and history, so the game and leaderboard can work.</li>
              <li><span style={{ color: 'var(--pop-white)' }}>The Wall</span> &mdash; any comments, ratings, or replies you post. These are reviewed before they&apos;re shown publicly.</li>
              <li><span style={{ color: 'var(--pop-white)' }}>Customisation</span> &mdash; kit colours, badges, and similar preferences you choose.</li>
              <li><span style={{ color: 'var(--pop-white)' }}>Technical data</span> &mdash; your IP address, used only to rate-limit login attempts and protect accounts from abuse.</li>
              <li><span style={{ color: 'var(--pop-white)' }}>Marketing consent</span> &mdash; if you tick the box at sign-up, a timestamped record that you agreed to be contacted, and nothing more unless you tell us more.</li>
              <li><span style={{ color: 'var(--pop-white)' }}>Basic site analytics</span> &mdash; via Vercel Web Analytics, which is cookie-free and anonymised: it can&apos;t identify you personally. See our <a href="/cookies" className="underline" style={{ color: 'var(--pop-blue)' }}>Cookie Policy</a>.</li>
            </ul>
          </section>

          <section>
            <h2 className="pop-headline text-base mb-2" style={{ color: 'var(--pop-blue)' }}>Why we use it</h2>
            <p>
              Mainly to run the game: creating your account, scoring your picks, showing the leaderboard, and
              keeping the site secure. Where we rely on your consent &mdash; marketing emails, for instance &mdash; you can
              withdraw it at any time with no effect on your ability to play.
            </p>
          </section>

          <section>
            <h2 className="pop-headline text-base mb-2" style={{ color: 'var(--pop-blue)' }}>Who we share it with</h2>
            <p>
              We use trusted providers to run the site &mdash; Supabase (database and login) and Vercel (hosting and
              analytics) &mdash; who process data on our behalf under their own data protection agreements. We don&apos;t
              sell your data, and we don&apos;t share it with anyone for their own marketing purposes.
            </p>
          </section>

          <section>
            <h2 className="pop-headline text-base mb-2" style={{ color: 'var(--pop-blue)' }}>How long we keep it</h2>
            <p>
              For as long as your account is active. If you ask us to close your account, we&apos;ll delete or
              anonymise your personal data within a reasonable time, except where we need to keep limited
              records for legal or security reasons.
            </p>
          </section>

          <section>
            <h2 className="pop-headline text-base mb-2" style={{ color: 'var(--pop-blue)' }}>Your rights</h2>
            <p>
              Under UK GDPR you can ask to see the data we hold on you, have it corrected or deleted, ask us to
              restrict or stop processing it, or get a copy to take elsewhere. Contact us at the address above
              to use any of these. If you&apos;re not satisfied with our response, you can complain to the{' '}
              <a href="https://ico.org.uk/make-a-complaint/" className="underline" style={{ color: 'var(--pop-blue)' }} target="_blank" rel="noopener noreferrer">
                UK Information Commissioner&apos;s Office
              </a>.
            </p>
          </section>

          <section>
            <h2 className="pop-headline text-base mb-2" style={{ color: 'var(--pop-blue)' }}>Who this is for</h2>
            <p>LMS All-Stars is intended for people aged 18 and over.</p>
          </section>

          <section>
            <h2 className="pop-headline text-base mb-2" style={{ color: 'var(--pop-blue)' }}>Changes to this policy</h2>
            <p>
              If this policy changes in a meaningful way, we&apos;ll update the date at the top and, where the
              change is significant, let registered users know.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
