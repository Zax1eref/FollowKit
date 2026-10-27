# Provider session revocation — 27 October 2026

Internal adapter only; no live logout, secrets, database changes or deployment. `deletionSessions` uses the supported SDK `auth.getUser(token)` to verify the exact job owner, then `auth.admin.signOut(token, 'global')`. It checks trusted job readiness before and after identity lookup and requires an independently observed zero session count before success. A null SDK error alone is not proof, since the SDK can normalize some logout errors.

`deletionSessionInspector` reads the candidate job, lease, retained tombstone, archive evidence, deleting/purged account state and count of managed auth.sessions. No managed Auth table writes occur in this implementation. It needs a restricted server database connection with explicit read privileges; no new grant or public RPC is provided. Use fresh autocommit/READ COMMITTED primary queries with bounded timeouts.

The token is transient constructor input, never saved into the queue or emitted. If zero sessions are observed for an authorized job, retry can succeed without a token. If sessions remain and the token is missing/expired/wrong-owner, the job stays pending. This does not solve unattended revocation of remaining sessions by user ID: admission should perform revocation while the confirmed request has a valid token, and a lost/expired token with sessions remaining requires a supported recovery/reauthentication path. Do not fabricate JWTs, treat a ban as revocation, or directly delete managed Auth rows.

Zero sessions is a point-in-time observation; a subsequent sign-in can create a new session. The durable tombstone must continue blocking all app access and provisioning, and final identity deletion must finish before complete status. Existing JWT signatures may remain valid until expiry; the application's active-session and tombstone checks provide its access boundary. Bounded waits do not cancel already-started provider requests; retry must reconcile observed state.

Tests: Node 163/163 including five new session groups; PostgreSQL WASM five combined purge/readiness groups, including the read-only inspector observing simulated provider sessions. `node tools/auth/deletion-sessions-test.mjs` verifies the pinned SDK's identity lookup and global logout request with mock transport. Test-only managed table mutations simulate the provider and must not be copied into production.

Remaining before deployment: admission/recent-auth recovery, database least-privilege role and connection, durable evidence writes, billing settlement, lease renewal, final completion and retained backup policy. This module can supply the coordinator revokeSessions stage but is not yet instantiated by a live service.

References: https://supabase.com/docs/reference/javascript/auth-admin-signout ; https://supabase.com/docs/guides/auth/signout ; https://supabase.com/docs/guides/auth/managing-user-data .
