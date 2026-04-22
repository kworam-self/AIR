export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">AIR</h1>
      <p className="text-lg text-neutral-600 dark:text-neutral-400">
        AI Reviewer — GitHub App webhooks, Inngest, and org-scoped RBAC will
        land here. Run <code className="rounded bg-neutral-200 px-1.5 py-0.5 text-sm dark:bg-neutral-800">npm install</code> then{" "}
        <code className="rounded bg-neutral-200 px-1.5 py-0.5 text-sm dark:bg-neutral-800">npm run dev</code> to start.
      </p>
    </main>
  );
}
