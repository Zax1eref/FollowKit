# Decision log
D001 2026-10-24: Keep FollowKit; target Thai solo web freelancers only as hypothesis. E1 closest role match; Thai demand UNKNOWN. Revisit after 5 interviews.
D002: Build reversible local prototype first per validation gate, no broad backend expansion. 3 full public sources and 2 unverified leads insufficient.
D003: Templates instead of paid AI API. No spending authorization; core copy/edit value test does not need AI.
D004: Static dependency-free HTML/JS for demo; Node tests, local SQLite relational spike. Online target candidate managed Auth/Postgres after gate.
D005: No waitlist data collected; consent form demonstrator explicitly labels no submission. Real notice/controller/contact not configured.
D006: No public hosting/payment/outreach launched; approvals required by user-supplied master prompt sections 2,7,10.
D007: Replaced crypto.randomUUID with local monotonic demo IDs after preview HTTP failure. Not a token/security generator.
D008 2026-10-24 continuation: build local API spike only to test ownership/quota/transactions with trusted fixture identities. No network listener, no public real-data collection.
D009: narrow screens use stacked quote cards; preserve desktop table. Tested at 390px iframe.
D010: remote Supabase auth is an isolated adapter comparison, NOT a hosting/auth commitment. Sites hosted implementation must retain native identity. Resolve independent signup requirement and identity model before UI integration.
D011 2026-10-24: connect browser to local test harness with explicitly synthetic A/B identities; no claim of real auth. Preserve standalone HTML mode.
D012: new-customer + quote creation uses nested savepoint/outer transaction to prevent orphan customer on quote/quota failure.
D013: keep test DB and opaque runtime session data out of release archives; package script verifies exclusions.

D014 2026-10-24: Select standalone Cloudflare Workers + Supabase Auth/Postgres to preserve PRD signup/login/reset. Do not add external auth to Sites. Current harness remains local; no provisioning/deploy approval inferred. See docs/production-decision.md and production-migration-plan.md.
D015: Separate portable Fault type from SQLite store; compatibility re-export retained. All 54 tests + build pass; asynchronous repository migration still required.
