# AIR (AI Reviewer) — system architecture (draft)

## High-level architecture

AIR is a multi-tenant GitHub App with a Next.js web UI and webhook endpoints, a Postgres database (via Prisma), and an async worker pipeline (Inngest) that performs AI review work.

```mermaid
flowchart LR
  subgraph clients [Clients]
    GH[GitHub]
    User[Dashboard_user]
  end

  subgraph next [Next.js_app]
    UI[UI_routes]
    WH[GitHub_webhook_route]
    CW[Clerk_webhook_route]
    API[Server_actions_API]
  end

  subgraph services [External_services]
    Clerk[Clerk]
    Inngest[Inngest]
    AI[AI_provider]
  end

  subgraph data [Data]
    DB[(Postgres)]
  end

  User --> UI
  UI -->|session_auth| Clerk
  UI --> API
  API --> DB
  API -->|create_invite| Clerk

  GH -->|signed_webhooks| WH
  WH -->|emit_event| Inngest
  Inngest -->|run_jobs| AI
  Inngest -->|read_write| DB
  Inngest -->|post_review| GH

  Clerk -->|webhooks| CW
  CW -->|mirror_users_membership| DB
```

## Key domain concepts

- **Organization (customer company)**: maps to both a GitHub installation and a Clerk Organization.
- **Membership**: system-of-record in Clerk; mirrored to AIR DB for authorization and billing.
- **AIR roles**: fixed list (SuperUser, CustomerAdmin, TeamLead, Developer) enforced by AIR.
- **Usage**: token usage ledger used for trial/limits/billing.

## Identity and membership flow (invite-only)

```mermaid
sequenceDiagram
  participant Admin as CustomerAdmin
  participant AIR as AIR_server
  participant Clerk as Clerk
  participant DB as AIR_DB

  Admin->>AIR: InviteEmployee(email,airRole)
  AIR->>Clerk: createOrganizationInvitation(email,clerkOrgId,redirectUrl)
  Clerk-->>Admin: Email_invitation_sent
  Clerk-->>AIR: Webhook(membership_created)
  AIR->>DB: UpsertUser_and_OrganizationMember(airRole)
```

## Webhook → async pipeline (GitHub PR review)

```mermaid
sequenceDiagram
  participant GH as GitHub
  participant AIR as Next_webhook_route
  participant ING as Inngest
  participant W as Worker
  participant AI as AI_provider

  GH->>AIR: pull_request_webhook(signed)
  AIR->>ING: emit_air_github_pull_request_enqueued(idempotent)
  ING->>W: run_job
  W->>GH: fetch_PR_context(installation_auth)
  W->>AI: generate_review
  W->>W: record_token_usage
  W->>GH: post_review_comment
```

## Port-and-adapter boundaries (for provider swaps)

- **`IdentityPort`**: hides Clerk SDK details behind an internal interface used by server code.
- **`JobsPort`**: hides Inngest behind an internal interface used by webhook handlers/domain logic.
- **Usage metering abstraction**: a small interface for recording token usage events, so swapping AI providers does not require reworking billing logic.

## Security considerations (MVP)

- Verify GitHub webhooks (HMAC signature) and Clerk webhooks (signature verification).
- Treat all external identifiers as untrusted input; validate installation/org mappings.
- Never log tokens/keys; minimize secret storage (use installation auth on-demand where possible).

