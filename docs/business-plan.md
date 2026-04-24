# AIR (AI Reviewer) — business plan (draft)

## Goals for this project

- Learn modern web application architecture and best practices.
- Create a demonstration project for potential employers.

## Product summary

AIR is a multi-tenant GitHub App that generates AI-powered reviews for pull requests.

## Target customers and buyer

- **Customer company**: installs AIR in one or more GitHub organizations.
- **Customer Admin**: configures AIR, invites members, manages limits/billing for their company.

## Pricing and metering (MVP)

- **Primary meter**: **AI token usage** (the cost driver).
- AIR should support:
  - **Free trial**: limited by a token quota.
  - **Paid usage**: based on token consumption (exact pricing can be added later).

## Roles (AIR-defined, fixed)

Customers cannot define their own roles/privileges. AIR provides exactly:

- **SuperUser** (AIRC operator)
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
- Employee accepts a dedicated invite link and joins the company in AIR.

## Success criteria for the demo

- Installable GitHub App with a working webhook → async processing pipeline.
- Invite-only membership, role-gated configuration UI, and visible usage (token) accounting.
- Clear architecture boundaries (`IdentityPort`, `JobsPort`, and metering abstraction) that demonstrate provider-independence.

