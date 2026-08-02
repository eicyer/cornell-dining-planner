export default function HomePage() {
  return (
    <main className="min-h-screen p-6 max-w-5xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white">
          🌽 Cornell Dining
        </h1>
        <p className="text-slate-400 mt-1">
          Personalized meal planning for Cornell dining halls
        </p>
      </header>

      {/* Phase 1: EateryList will go here */}
      <div className="grid gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-slate-400 text-sm">
            🚧 Run <code className="bg-slate-800 px-1 rounded">/api/cron/sync</code> first
            to populate today&apos;s menus, then build out the EateryList component.
          </p>
        </div>
      </div>
    </main>
  )
}
