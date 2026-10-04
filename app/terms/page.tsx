export default function TermsOfServicePage() {
  return (
    <div className="pop-art-theme min-h-screen" style={{ background: 'var(--pop-black)' }}>
      <div className="max-w-3xl mx-auto px-4 py-12">
        <a href="/" className="text-xs uppercase tracking-widest" style={{ color: 'var(--pop-blue)' }}>&larr; Back</a>
        <h1 className="pop-hero pop-hero--blue text-3xl sm:text-4xl mt-4 mb-2">Terms of Service</h1>
        <p className="text-xs uppercase tracking-widest mb-8" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Last updated 4 October 2026 &middot; first draft, not yet reviewed by a solicitor
        </p>

        <div className="pop-panel p-6 sm:p-8 space-y-7 text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.85)' }}>
          <section>
            <p>
              By creating an account on LMS All-Stars you agree to these terms. If you don&apos;t agree, please
              don&apos;t use the site.
            </p>
          </section>

          <section>
            <h2 className="pop-headline text-base mb-2" style={{ color: 'var(--pop-green)' }}>Who can play</h2>
            <p>
              You must be 18 or over and able to form a binding agreement to create an account. One account per
              person &mdash; multiple accounts or playing on someone else&apos;s behalf isn&apos;t allowed.
            </p>
          </section>

          <section>
            <h2 className="pop-headline text-base mb-2" style={{ color: 'var(--pop-green)' }}>Your account</h2>
            <p>
              You&apos;re responsible for keeping your login details secure and for anything that happens under
              your account. Tell us straight away if you think someone else has access to it.
            </p>
          </section>

          <section>
            <h2 className="pop-headline text-base mb-2" style={{ color: 'var(--pop-green)' }}>How the game works</h2>
            <p>
              Each gameweek has a pick deadline; picks can&apos;t be changed once it passes. Scoring, results and
              any disputes are decided at our discretion, acting reasonably and consistently with the published
              rules. We don&apos;t guarantee the site will always be available, error-free, or uninterrupted.
            </p>
          </section>

          <section>
            <h2 className="pop-headline text-base mb-2" style={{ color: 'var(--pop-green)' }}>Prizes</h2>
            <p>
              LMS All-Stars is currently free to play with no cash prizes. Where any prize is offered, it isn&apos;t
              exchangeable for cash unless we say otherwise. If that ever changes, these terms will be updated
              first, and the specific rules for that prize will be published alongside it.
            </p>
          </section>

          <section>
            <h2 className="pop-headline text-base mb-2" style={{ color: 'var(--pop-green)' }}>Fair play</h2>
            <p>
              Don&apos;t collude on picks, exploit bugs, abuse other players, or try to disrupt the game for
              others. We can warn, suspend, or permanently remove any account that breaks these terms, at our
              discretion.
            </p>
          </section>

          <section>
            <h2 className="pop-headline text-base mb-2" style={{ color: 'var(--pop-green)' }}>Content you post</h2>
            <p>
              Anything you post on the Wall or elsewhere stays yours, but you give us a licence to display it on
              the site. Posts are reviewed before going public, and we can remove or decline anything offensive,
              illegal, or that breaks these terms.
            </p>
          </section>

          <section>
            <h2 className="pop-headline text-base mb-2" style={{ color: 'var(--pop-green)' }}>Our content</h2>
            <p>
              The LMS All-Stars name, branding, and site design belong to us. You can use the site to play the
              game; you can&apos;t copy, resell, or build a competing product from it.
            </p>
          </section>

          <section>
            <h2 className="pop-headline text-base mb-2" style={{ color: 'var(--pop-green)' }}>Liability</h2>
            <p>
              The site is provided as a game for entertainment. To the extent the law allows, we&apos;re not liable
              for losses arising from using the site, service interruptions, or decisions made about scoring or
              prizes. Nothing here limits any liability that can&apos;t legally be limited.
            </p>
          </section>

          <section>
            <h2 className="pop-headline text-base mb-2" style={{ color: 'var(--pop-green)' }}>Ending your account</h2>
            <p>
              You can close your account at any time by contacting us. We can suspend or close an account that
              breaks these terms, or discontinue the game entirely, with reasonable notice where practical.
            </p>
          </section>

          <section>
            <h2 className="pop-headline text-base mb-2" style={{ color: 'var(--pop-green)' }}>Changes</h2>
            <p>We may update these terms as the game evolves. We&apos;ll update the date above when we do.</p>
          </section>

          <section>
            <h2 className="pop-headline text-base mb-2" style={{ color: 'var(--pop-green)' }}>Governing law</h2>
            <p>These terms are governed by the law of England and Wales.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
