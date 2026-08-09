export default function DeployingChangesHelpPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">How-To: Making Simple Changes Yourself</h1>
      <p className="text-gray-500 text-sm mb-8">Swapping an image or similar small file — without needing Claude Code to do it for you.</p>

      <div className="space-y-6 max-w-2xl">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="font-bold mb-2 text-blue-900">The short version</h2>
          <p className="text-sm text-gray-700">
            The live site rebuilds automatically every time a change is saved (&quot;pushed&quot;) to the project&apos;s GitHub
            repository — that&apos;s all a deploy actually is. For a simple asset swap (replacing an image file with a new
            one of the exact same name), you don&apos;t need Claude Code at all: GitHub&apos;s own website lets you upload a
            replacement file directly, and the site rebuilds itself within about a minute.
          </p>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">Steps — replacing an image</h2>
          <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-2">
            <li>Go to the repository: <a href="https://github.com/Thepick-dev/prediction-game" target="_blank" rel="noopener noreferrer" className="underline">github.com/Thepick-dev/prediction-game</a> (you&apos;ll need to be logged into the GitHub account with access).</li>
            <li>Open the <strong>public</strong> folder — every image the site uses (logo, mascot, favicon) lives there.</li>
            <li>Click into the file you want to replace, so you can see its exact name — the replacement file must use that <strong>exact same name</strong> (including capitalisation and file type, e.g. <code>.png</code>), or the site won&apos;t pick it up.</li>
            <li>Click the pencil/edit icon, or go back to the folder view and use <strong>Add file → Upload files</strong>, then drag in your new image using that same filename. GitHub will treat it as replacing the old one.</li>
            <li>Scroll down to &quot;Commit changes&quot; and click the green <strong>Commit changes</strong> button (the default options are fine).</li>
            <li>That&apos;s it — Vercel (the hosting service) notices the change automatically and rebuilds the site, usually ready inside a minute or two. Refresh the live site to see it.</li>
          </ol>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h2 className="font-bold mb-2 text-yellow-800">What this is safe for — and what it isn&apos;t</h2>
          <p className="text-sm text-gray-700">
            This upload-a-file approach is only for swapping existing image/asset files, where the code already
            expects that exact filename and nothing else needs to change (the mascot photo and logo were built
            specifically to work this way). It is <strong>not</strong> a safe way to edit any actual code file — there&apos;s no
            spellcheck, no test run, and no build check before it goes live, so a small typo in a code file could break
            the whole site with no warning. For anything beyond a same-name file swap, come back to Claude Code as usual.
          </p>
        </div>
      </div>
    </div>
  )
}
