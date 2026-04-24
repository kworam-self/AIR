# AIR (AI Reviewer) — business plan (draft)

## Goals for this project

- Learn modern web application architecture and best practices.
- Create a demonstration project for potential employers.

## Product summary

AIR is a multi-tenant GitHub App that generates AI-powered reviews for pull requests.

**AIRC** is the organization that builds and operates the hosted AIR product (the vendor / platform operator). That is distinct from a **customer company** that installs AIR. References to an “AIRC operator” mean internal platform staff with vendor-side privileges, not customer admins.

## Target customers and buyer

- **Customer company**: installs AIR in one or more GitHub organizations.
- **Customer Admin**: configures AIR, invites members, manages limits/billing for their company.

## Pricing and metering (MVP)

- **Customer-facing meter**: **weighted PR units**.
  - Each eligible PR review consumes a **base** number of units.
  - Larger PRs consume **incremental** units based on “size”.
- **Internal cost tracking (COGS)**: AIR still records **AI token usage** per review run for cost/margin monitoring and sizing, but tokens are not shown as billable line items.
- AIR should support:
  - **Free trial**: limited by a PR-unit quota.
  - **Paid usage**: based on PR units (exact pricing can be added later).

### What is a PR unit?

A PR unit is AIR’s measure of the “middleman work” required to review a PR (ingestion, orchestration, context collection, AI review generation, posting results, retries, and dashboarding).

For the MVP, PR unit sizing should be deliberately simple and versioned. Example shapes:

- **Token-sized buckets (internal-only input)**: map internal token usage to a size bucket (S/M/L/XL), then map bucket → integer PR units.
- **Future option**: incorporate GitHub diff stats (changed files, additions+deletions) to reduce sensitivity to model/provider changes.

## Roles (AIR-defined, fixed)

Customers cannot define their own roles/privileges. AIR provides exactly:

- **SuperUser** (AIRC operator—vendor-side staff; not a customer role)
  - Provision/manage/deactivate customers
  - View global analytics
  - Manage quotas (seats + token limits)
- **Customer Admin**
  - Invite/manage members
  - View analytics for their org
  - Set usage limits (company/team/user)
- **Team Lead**
  - Configure AI strictness/rules for collections of repos
  - Has Developer capabilities
- **Developer**
  - View/interact with AI feedback on PRs

## Customer onboarding and member onboarding (MVP)

### Company onboarding

1. Company Admin installs the AIR GitHub App on their GitHub organization.
2. AIR creates/links an internal customer record and links it to Clerk Organization membership.

### Employee onboarding (invite-only)

- Employee membership is **invite-only**.
- Customer Admin invites an employee by email from AIR.
- Employee accepts a dedicated invite link and **joins the company in AIR** (see [system architecture](system-architecture.md) for what that implies technically).

## Success criteria for the demo

- Installable GitHub App with a working webhook → async processing pipeline.
- Invite-only membership, role-gated configuration UI, and visible usage accounting in PR units (with internal token accounting for cost).
- Clear architecture boundaries (`IdentityPort`, `JobsPort`, and metering abstraction) that demonstrate provider-independence.