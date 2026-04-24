---

name: AIR implementation roadmap
overview: A phased plan to build AI Reviewer (AIR) from the current Next.js + Prisma skeleton and identity/jobs ports toward a production-shaped multi-tenant GitHub App with Clerk RBAC, Inngest-backed PR processing, and AI-generated review feedback—grounded in [AI Reviewer Notes](AI%20Reviewer%20Notes) and the code already in the repo.
todos:

- id: phase-0-hygiene
content: Standardize package manager, document env/setup (README or extend AI Reviewer Notes), verify Prisma migrate path against Supabase URLs
status: pending
- id: phase-1-clerk
content: Wire ClerkProvider, middleware with IdentityPort handshake handling, Clerk webhook → Prisma user/org sync, minimal protected dashboard; support multiple Customer Admins per org and model invite vs active membership for later admin directory
status: pending
- id: phase-2-github-app
content: GitHub App manifest + callback; persist Organization.githubInstallationId; define Clerk↔GitHub org linking model; local webhook tunnel docs
status: pending
- id: phase-3-webhooks-inngest
content: Signed GitHub webhook route; emit air/github.pull_request.enqueued with idempotency; Inngest serve route + handler; optional repo sync from GitHub API
status: pending
- id: phase-4-rbac
content: Central authorization from OrganizationRole + RepositoryScope; guard dashboard/server actions; document superuser vs org roles; treat CustomerAdmin as a repeatable role (multiple per org)
status: pending
- id: phase-5-ai
content: AiReviewPort + provider; PR context assembly; post review to GitHub; failure/retry policy and minimal repo-level AI settings in schema
status: pending
- id: phase-6-dashboard
content: Org/repo settings UI, PR/review history surfacing, Customer Admin member directory (all org users + invited/active/inactive-style status) and role management aligned with Clerk
status: pending
- id: phase-7-hardening
content: Tests for webhooks/RBAC, CI pipeline, observability and security review (tokens, permissions, logging)
status: pending
isProject: false

---

# AIR detailed implementation plan

## Decisions locked in

- **Clerk usage**: Clerk is used heavily for speed, but stays behind `IdentityPort` so it remains swappable.
- **Customer admins**: do **not** access the Clerk dashboard; Clerk is internal/transparent to end users.
- **Membership onboarding**: **invite-only**; employees join via a **dedicated invite link**.
- **Membership system of record**: **Clerk Organizations**; AIR mirrors into its DB for authorization, billing, and audit.
- **Roles/privileges**: AIR defines a **fixed** role list and privilege matrix (SuperUser, CustomerAdmin, TeamLead, Developer). Customers cannot define roles.
- **Multiple Customer Admins**: A single customer organization may have **more than one** user with the **CustomerAdmin** AIR role (no single “owner admin” assumption in product or schema).
- **Org user directory (Customer Admin)**: Customer Admins need a **members** view that lists **every person** in the org (invited and joined) with a clear **status** (for example: invited, active, inactive—exact labels mapped from Clerk invitation + membership lifecycle during implementation) and their **AIR role**.
- **Metering**: customer-facing quotas/billing use **weighted PR units**; AIR also tracks **token usage internally** for cost and PR sizing.

## Sources of truth

- **Architecture (non-functional rules, DPA-oriented data flow, domain events):** [system-architecture.md](system-architecture.md) — canonical detail; this roadmap **references** it in phases (for example Phase 3 event payloads, Phase 5 context assembly) without duplicating full policy text.
- **Product / architecture intent:** [AI Reviewer Notes](AI%20Reviewer%20Notes) — multi-tenant GitHub App (org-level install, Option B), Clerk org RBAC, Supabase Postgres + Prisma, Inngest for async AI work, webhook-driven `pull_request` flow.
- **Current code:** Next.js App Router app, [prisma/schema.prisma](prisma/schema.prisma), [src/lib/prisma.ts](src/lib/prisma.ts), placeholder [src/app/page.tsx](src/app/page.tsx), and **started but unwired** boundaries: [src/lib/identity/](src/lib/identity/) (`IdentityPort` + `ClerkIdentityAdapter` + [src/lib/identity/server.ts](src/lib/identity/server.ts)), [src/lib/jobs/](src/lib/jobs/) (`JobsPort` + `InngestJobsAdapter` + [src/lib/jobs/domain-events.ts](src/lib/jobs/domain-events.ts) including `air/github.pull_request.enqueued`).

There is no implementation code intentionally — the repo is in a planning-first state.

## Target architecture (end state)

```mermaid
flowchart LR
  subgraph clients [Clients]
    GH[GitHub]
    User[Dashboard user]
  end
  subgraph next [Next.js]
    WH["/api/webhooks/github"]
    ID["/api/webhooks/clerk"]
    GHSetup["GitHub App setup routes"]
    UI[App UI]
  end
  subgraph data [Data]
    DB[(Postgres Prisma)]
  end
  subgraph async [Async]
    ING[Inngest]
    W[Workers review PR]
  end
  GH -->|signed webhooks| WH
  WH -->|emit domain event| ING
  ING --> W
  W -->|fetch diff context| GH
  W -->|post review comments| GH
  User --> UI
  UI -->|Clerk session| next
  ID -->|sync users orgs| DB
  GHSetup -->|manifest exchange| DB
```



**Boundaries already sketched (keep and extend):** dashboard and domain code should depend on `IdentityPort` / `JobsPort`, not raw Clerk/Inngest SDKs, so swapping providers or queues stays localized.

---

## Phase 0 — Project hygiene and environments

- **Keep docs current**: business plan, architecture, and roadmap must be reviewable before writing code.
- When implementation restarts: standardize package manager and environment setup in `README.md`.

**Exit criteria:** Fresh clone can install, migrate, and run `dev` with empty DB.

---

## Phase 1 — Clerk dashboard shell (identity wired end-to-end)

**Goal:** Clerk-backed auth + Clerk Organizations membership with invite-only onboarding, mirrored into AIR DB, while keeping AIR’s role/privilege model fixed and enforced by AIR.

- **Server-only Clerk admin API use**: customer admins never see Clerk; AIR server calls Clerk APIs.
- **Multiple Customer Admins**: any **CustomerAdmin** in the org may invite and manage members (subject to the same RBAC rules); do not assume a sole admin when designing flows or UI.
- Implement **invite-only onboarding**:
  - AIR UI for Customer Admin to invite an employee by email and assign AIR role.
  - AIR server creates a Clerk organization invitation (redirect back to AIR).
- **Clerk webhooks**: mirror membership events into AIR DB:
  - `User` upsert by `clerkUserId`.
  - `Organization` upsert by `clerkOrganizationId`.
  - `OrganizationMember` upsert with AIR role.

**Exit criteria:** Sign-in, org switch, and DB rows stay in sync for test users; webhook signature failures return 400.

---

## Phase 2 — GitHub App lifecycle (manifest + installation mapping)

**Goal:** Persist `installation_id` → [Organization](prisma/schema.prisma) per [AI Reviewer Notes](AI%20Reviewer%20Notes).

- Implement **GitHub App manifest** flow: public URL that serves manifest JSON (or build-time config), **callback** route that exchanges `code` for `installation_id` + tokens per GitHub docs, then **upsert** `Organization` (`githubInstallationId` unique).
- **Linking model** (critical design choice—document in code comments):
  - **A)** One Clerk org ↔ one GitHub installation (recommended for clarity): after GitHub install, admin associates Clerk org id in UI or via webhook metadata.
  - **B)** GitHub org created first, Clerk linked later—requires merge rules to avoid duplicate `Organization` rows.
- Store **installation access token** strategy: short-lived tokens via GitHub API when needed vs encrypted storage—prefer **on-demand** token creation in workers using the installation id + private key to reduce secrets in DB.
- Local dev: **smee.io** or **ngrok** → webhook URL documented in README.

**Exit criteria:** Installing the app on a test GitHub org creates/updates `Organization` and is reproducible from a clean DB.

---

## Phase 3 — GitHub webhooks → Inngest (vertical slice, no AI yet)

**Goal:** Signed `pull_request` webhooks enqueue durable work via [JobsPort](src/lib/jobs/jobs-port.ts).

- Add `POST` handler e.g. [src/app/api/webhooks/github/route.ts](src/app/api/webhooks/github/route.ts): verify `X-Hub-Signature-256` with `GITHUB_WEBHOOK_SECRET`; parse payload; **idempotency** using `X-GitHub-Delivery` as `AirDomainEvent` `id` when emitting `air/github.pull_request.enqueued` (aligns with [domain-events.ts](src/lib/jobs/domain-events.ts)).
- Extend payload type in `AirDomainEventPayload` as needed (at minimum: installation id, repo full name, PR number, action, and **`X-GitHub-Delivery`** / delivery id for correlation). **Do not** put full diffs or file contents in the event body—workers fetch code from GitHub **in memory** and Postgres stores **minimal** durable state; rationale in [system-architecture.md](system-architecture.md) § *Customer data: webhooks, Postgres, Inngest (DPA-oriented)*.
- **Inngest serve route** (App Router): `GET/POST/PUT` handler per Inngest Next.js docs, exporting `inngest` client + **functions** array.
- First function: handler for `air/github.pull_request.enqueued` that logs, validates installation belongs to a known `Organization`, and optionally **syncs** [Repository](prisma/schema.prisma) metadata from GitHub API (still no AI).
- Optional: `air/test.ping` function for smoke tests.

**Exit criteria:** Opening/updating a PR on a wired repo produces one Inngest run per delivery; replays are safe with idempotent DB writes.

---

## Phase 4 — RBAC model in application code

**Goal:** Encode roles from the brief (fixed list; AIR-controlled): SuperUser, CustomerAdmin, TeamLead, Developer—plus per-repo scopes—enforced in AIR code/DB.

- Central **authorization module** (pure functions + small DB queries): given `userId`, `organizationId`, optional `repositoryId`, return allowed actions (e.g. `configure_ai_rules`, `view_feedback`, `manage_members`, `billing`).
- Rules from notes:
  - **ADMIN (CustomerAdmin):** there may be **many** per org; each has implicit access to all repos in org and may manage members and roles (same capability set unless you later split “billing admin” vs “IT admin”).
  - **TEAM_LEAD:** `RepositoryScope.canConfigure` for repos they configure; may view/configure only scoped repos unless you grant org-wide read.
  - **DEVELOPER:** visibility/interaction limited by `RepositoryScope` when present; clarify “optional scopes” vs “all repos if no rows.”
  - **isSuperuser:** platform operations only—guard with explicit checks on admin routes.
- Apply guards to **dashboard API routes** and future **mutations** (do not rely on UI hiding alone).

**Exit criteria:** Matrix of roles × actions covered by tests or a documented checklist; 403 on forbidden API calls.

---

## Phase 5 — AI review pipeline (core product)

**Goal:** On eligible PR events, generate review text and post back to GitHub.

- **Data minimization:** keep **domain event payloads** identifier-first and load bulk PR context from the **GitHub API inside workers** (same rule as Phase 3); do **not** widen Inngest payloads to carry full diffs when adding AI—see [system-architecture.md](system-architecture.md) § *Customer data: webhooks, Postgres, Inngest (DPA-oriented)* (including the **Agreed implementation default** bullet there).
- **Trigger policy:** which `pull_request` actions (opened, synchronize, ready_for_review, reopened) and ignore drafts/bots if desired—configurable per org/repo later; start with a conservative default.
- **Context assembly job:** fetch files/diff via GitHub APIs (respect rate limits; chunk large PRs); respect org/repo **opt-in** flags (new columns on `Repository` or a `RepoAiSettings` model: strictness, max files, excluded paths).
- **AI providers:** support **more than one** vendor over time (diagram examples: OpenAI, Anthropic); each integration sits behind **`AiReviewPort`** with env/config per provider (same pattern as identity/jobs) so models and prompts stay swappable.
- **Internal token metering (first-class):** every AI call records token usage with enough metadata to attribute cost to org/user/repo/run:
  - `provider`, `model`, `inputTokens`, `outputTokens`, `totalTokens`
  - `organizationId`, `userId`, `repositoryId`, PR identifiers, and job/run correlation id
  - optional `costUsd` (derived from model pricing) for dashboards later
- **Billing usage (first-class):** every completed PR review records customer-facing PR units with enough metadata for quotas/invoicing:
  - `organizationId`, `repositoryId`, PR identifiers, and job/run correlation id
  - `units`, `pricingVersion`, and the sizing input used (e.g. `sizeBucket`)
- **Output:** GitHub review comments or a single review body—define UX (inline vs summary) in a short spec; implement minimal viable **summary review** first, then iterate to inline comments if needed.
- **Failure handling:** Inngest retries, dead-letter behavior, and user-visible error state (optional table or Inngest run URL in dashboard).

### Worker ↔ Postgres (concrete reads and writes)

High-level arrows on [system architecture](system-architecture.md) compress a lot of Prisma work into **“load customer AI policy/config”** (reads) and **“record status and usage”** (writes). Implementation should plan for at least the following:

**Reads (examples):**

- Resolve **`Organization`** (and GitHub installation mapping) from webhook payload identifiers such as `installation_id`.
- Load **`Repository`** and **AI policy / config** (enabled flag, strictness, max files/chunking, excluded paths) needed to decide whether and how to review.
- Read **idempotency / dedupe** state keyed by **`X-GitHub-Delivery`**, PR identity, or a derived run key so Inngest retries do not double-post or double-bill.
- Optionally read **`OrganizationMember`** (or mirrored role data) when attributing a run to a user or enforcing org-level flags.
- Read any **quota / limit** rows needed before spending tokens or PR units (if you enforce limits in the worker).

**Writes (examples):**

- Insert or update a **`ReviewRun`** (or equivalent) through status transitions: `queued` → `running` → `succeeded` / `failed`, with timestamps and correlation ids.
- Append **internal AI cost / token usage** rows per provider call (`provider`, `model`, input/output tokens, `organizationId`, repo/PR identifiers, job/run id); optional derived **`costUsd`** later.
- Append **customer-facing PR-unit billing** events on successful review completion (`units`, `pricingVersion`, sizing inputs such as `sizeBucket`).
- Upsert **`Repository`** metadata synced from GitHub when the job refreshes repo state.
- Persist **structured errors** (and optionally Inngest run URLs) for dashboard visibility when jobs fail.

Exact table names follow Prisma models; treat the list as a **checklist**, not a frozen schema.

### Worker ↔ AI providers (what “request PR review” means)

“Inngest calls the AI provider” means **your Inngest function invokes vendor HTTP APIs** (never a human). Typical **requests** include:

- A **chat-completions**-style call where the **system** message encodes reviewer behavior (security vs style, verbosity, “no bikeshedding,” org/repo rules).
- A **user** message that carries a **structured PR context bundle**: title, description, base/head refs, changed-file list, diff hunks or **summarized** chunks for oversized PRs, optional hints (e.g. `CODEOWNERS`, risk labels).
- A **second** (or follow-up) call when needed: e.g. compress to an **executive summary**, or emit **JSON** with severities / file paths / line ranges to map cleanly into GitHub review comments.
- Each successful call yields **assistant text** plus **token usage** that must be fed into the Postgres write path above for **COGS** and **PR-unit sizing** inputs.

### Worker ↔ GitHub (unchanged scope, for alignment)

Workers continue to use installation auth to **fetch PR context** and to **post** review comments or summaries—kept on the roadmap’s Phase 5 output and failure-handling bullets.

**Exit criteria:** Demo PR receives an AI-generated review comment on a private test repo with correct installation auth.

---

## Phase 6 — Dashboard product surface

- **Org home:** installation status, linked Clerk org, repo list with enable/disable AI and “strictness” for team leads/admins.
- **PR activity:** list recent Inngest runs / review outcomes (data from new tables or denormalized summaries—add `PullRequestReview` or `ReviewRun` model when you outgrow logs-only).
- **Member management (Customer Admin requirement):** a **directory** of all people in the org: show **AIR role**, identity basics (email/name as available), and a **status** column suitable for operations (for example **invited** for pending Clerk org invitations, **active** for accepted members, **inactive** for removed/suspended—finalize enum vs Clerk states during build). Support **invite/remove** and **role changes** (Clerk vs DB source of truth—prefer Clerk for membership if using Clerk Organizations, and mirror roles into `OrganizationMember` for app-specific TEAM_LEAD/DEV semantics).

**Exit criteria:** Non-developer stakeholders can complete install + configure without touching the database.

---

## Phase 7 — Hardening

- **Observability:** structured logs for webhook and worker steps; correlation ids (`deliveryId`, PR id).
- **Security:** rotate webhook secrets; least-privilege GitHub App permissions; never log tokens; validate GitHub event repository matches `Organization` installation.
- **Testing:** unit tests for signature verification and RBAC; integration tests with recorded payloads or GitHub fixtures.
- **CI:** lint, typecheck, `prisma validate`, optional migration check on PRs.

---

## Schema / domain gaps to resolve during implementation

The current Prisma models are a strong backbone but the brief implies features you will likely add:

- **Billing** (Admin): no tables yet—defer or add `OrganizationBilling` stub if scope includes Stripe.
- **Usage metering**:
  - customer-facing **BillingUsageEvent** (PR units)
  - internal **AiCostEvent** (tokens)
- **AI rules / strictness:** either columns on `Repository` or normalized `AiPolicy` / `RepoAiSettings`.
- **PR / review history:** optional `ReviewRun` for dashboard and deduplication beyond GitHub delivery id.
- **GitHub ↔ Clerk org linking:** explicit nullable fields or join table to avoid ambiguous duplicates.
- **Member lifecycle for admin UI:** if Clerk webhooks alone are insufficient for “invited” rows, add a persisted invitation record or poll/list Clerk org invitations via `IdentityPort` so the Customer Admin directory stays accurate.

---

## Suggested implementation order (summary)

1. Phase 0–1: runnable app + Clerk + user/org sync.
2. Phase 2: GitHub App manifest + `Organization` persistence + linking story.
3. Phase 3: GitHub webhook + Inngest slice (sync repo metadata).
4. Phase 4: RBAC enforcement before exposing dangerous settings.
5. Phase 5: AI pipeline + GitHub posting.
6. Phase 6–7: dashboard depth, polish, CI, and security.

This order matches the brief’s “webhook → Inngest” spine while keeping RBAC in place before AI and org-wide settings go live.