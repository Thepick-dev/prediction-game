import Shell from '../components/ceefax-shell'

export default function PendingPage() {
  return (
    <Shell>
      <div className="max-w-md mx-auto text-center py-16">
        <div className="text-4xl mb-4">⏳</div>
        <h1 className="text-2xl font-bold mb-3">Awaiting Approval</h1>
        <p className="text-gray-500 text-sm leading-relaxed mb-6">
          Your account is pending approval from the admin.
          You will be able to access the game once approved.
          Check back soon.
        </p>
        <p className="text-xs text-gray-400">
          If you have been waiting a while, contact the game organiser directly.
        </p>
      </div>
    </Shell>
  )
}