# Multi-tenant data model, authentication gate deferred

ElectroBard's target is a hosted, multi-tenant service where each GM has their own account and library. We build the **data model** as multi-tenant from day one — a `User` exists and every Sound, Layer, Set, and uploaded file is owned by a user (`user_id` everywhere from the first migration) — but we **defer the authentication gate**. During early development there is no signup/login; the app runs as a single implicit "current user" (a seeded default user / dev bypass that resolves every request to one account). Adding real auth later is then additive, not a migration.

## Consequences

- **No painful migration later.** The expensive part of multi-tenancy (owner column on every entity, owner filter on every query) is present from the start. Only the login mechanism is missing.
- Code reads a `current_user` everywhere from the beginning; today it is hardcoded, later it comes from a verified session.
- **PostgreSQL is confirmed** as the database — appropriate for a hosted multi-tenant target.
- **Security note:** until the auth gate exists, the running app is unprotected and must only be exposed on a trusted network. "No auth yet" is a development stage, not the launch security posture.
- "No sharing between users" remains a real, meaningful scope line because users are first-class.

## Eventual authentication

Planned via external OAuth, leaning **Google / Discord** (Discord is notable given the TTRPG audience). Exact provider(s) undecided; own email/password is not currently planned. To be confirmed before real multi-user exposure.
