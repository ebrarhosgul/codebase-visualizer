export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-neutral-950 text-neutral-100">
      <div className="max-w-2xl text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Codebase Visualizer
        </h1>
        <p className="text-lg text-neutral-400">
          Transform any public GitHub repository into an interactive architecture map.
        </p>
        <div className="pt-4 flex justify-center gap-3">
          <span className="px-3 py-1 text-xs rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
            Next.js 15
          </span>
          <span className="px-3 py-1 text-xs rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
            TypeScript 5
          </span>
          <span className="px-3 py-1 text-xs rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
            Tailwind CSS v4
          </span>
        </div>
      </div>
    </main>
  );
}
