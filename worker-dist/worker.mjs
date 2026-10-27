// src/server/deletion-http.mjs
var uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function deletionHttp({ origin: origin2, authenticate, admission, limiter }) {
  const reply2 = (status, code) => Response.json(status === 202 ? { accepted: true } : { error: { code } }, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...status === 429 ? { "Retry-After": "60" } : {} } });
  async function bounded(fn, ms = 1e4) {
    let t;
    try {
      return await Promise.race([Promise.resolve().then(fn), new Promise((_, reject) => {
        t = setTimeout(() => reject(Error("timeout")), ms);
      })]);
    } finally {
      clearTimeout(t);
    }
  }
  return async (request) => {
    try {
      const u = new URL(request.url);
      if (u.pathname !== "/api/account/deletion" || u.search) return reply2(404, "not_found");
      if (request.method !== "POST") return reply2(405, "method_not_allowed");
      if (u.origin !== origin2 || request.headers.get("Origin") !== origin2) return reply2(403, "origin_rejected");
      if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get("Content-Type") || "")) return reply2(415, "json_required");
      const match = (request.headers.get("Authorization") || "").match(/^Bearer ([^\s]{1,8192})$/);
      if (!match) return reply2(401, "unauthorized");
      const user = await bounded(() => authenticate(request));
      if (!uuid.test(user?.id || "")) return reply2(401, "unauthorized");
      if ((await bounded(() => limiter.limit({ key: "deletion:" + user.id })))?.success !== true) return reply2(429, "rate_limited");
      const reader = request.body?.getReader();
      if (!reader) return reply2(400, "invalid_request");
      let bytes = 0, text2 = "";
      const deadline = Date.now() + 1e4;
      const decoder = new TextDecoder();
      try {
        while (true) {
          const left = deadline - Date.now();
          if (left <= 0) throw Error("timeout");
          const { done, value } = await bounded(() => reader.read(), left);
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 1024) {
            void reader.cancel().catch(() => {
            });
            return reply2(413, "request_too_large");
          }
          text2 += decoder.decode(value, { stream: true });
        }
        text2 += decoder.decode();
      } finally {
        reader.releaseLock();
      }
      let body;
      try {
        body = JSON.parse(text2);
      } catch {
        return reply2(400, "invalid_request");
      }
      if (!body || Array.isArray(body) || Object.keys(body).length !== 1 || body.confirmation !== "DELETE MY ACCOUNT") return reply2(400, "confirmation_required");
      const result = await bounded(() => admission.confirm({ accessToken: match[1], body }));
      if (result?.accepted !== true || !uuid.test(result.jobId || "")) return reply2(503, "deletion_pending");
      return reply2(202);
    } catch {
      return reply2(503, "deletion_pending");
    }
  };
}

// src/server/rate-limit.mjs
function createRateLimiter({ now = () => Date.now(), windowMs = 6e4, readLimit = 120, writeLimit = 30, maxKeys = 1e4 } = {}) {
  const windows = /* @__PURE__ */ new Map();
  return (owner, method) => {
    const time = now();
    for (const [key2, w] of windows) if (w.until <= time) windows.delete(key2);
    const bucket = ["GET", "HEAD"].includes(method) ? "read" : "write";
    const key = JSON.stringify([owner, bucket]);
    let window = windows.get(key);
    if (!window) {
      if (windows.size >= maxKeys) return { allowed: false, retryAfter: 60 };
      window = { count: 0, until: time + windowMs };
      windows.set(key, window);
    }
    const limit = bucket === "read" ? readLimit : writeLimit;
    if (window.count >= limit) return { allowed: false, retryAfter: Math.max(1, Math.ceil((window.until - time) / 1e3)) };
    window.count++;
    return { allowed: true };
  };
}

// src/server/errors.mjs
var Fault = class extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
};

// src/domain.mjs
function bangkokDay(now = /* @__PURE__ */ new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
function validDay(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

// src/server/api.mjs
function reply(status, data, extraHeaders = {}) {
  return new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extraHeaders } });
}
async function readBody(request) {
  if (!(request.headers.get("content-type") || "").startsWith("application/json")) throw new Fault(415, "json_required");
  const reader = request.body?.getReader();
  if (!reader) throw new Fault(400, "invalid_json");
  let size = 0, chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) {
        await reader.cancel();
        throw new Fault(413, "body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Fault(400, "invalid_json");
  }
}
function createApi({ store, repositoryFor, authenticate = async () => null, isIdentityActive = () => true, clock = () => /* @__PURE__ */ new Date(), limiter = createRateLimiter() }) {
  return async function handle(request) {
    try {
      const identity = await authenticate(request);
      const active = async () => {
        if (!identity?.id || !await isIdentityActive(identity)) throw new Fault(401, "unauthorized");
      };
      await active();
      const owner = identity.id;
      const rate = limiter(owner, request.method);
      if (!rate.allowed) return reply(429, { error: { code: "rate_limited" } }, { "Retry-After": String(rate.retryAfter) });
      const repository = repositoryFor ? await repositoryFor({ identity, request }) : store;
      const run = async (method2, ...args) => {
        await active();
        if (typeof repository?.[method2] !== "function") throw new Fault(503, "repository_unavailable");
        return await repository[method2](owner, ...args);
      };
      const u = new URL(request.url), path = u.pathname, method = request.method;
      if (path === "/api/onboarding" && method === "GET") return reply(200, await run("onboardingStatus"));
      if (path === "/api/onboarding" && method === "POST") {
        const body = await readBody(request);
        if (!body || body.confirm !== true || Object.keys(body).length !== 1) throw new Fault(400, "confirmation_required");
        return reply(200, await run("provisionAccount"));
      }
      const account = await run("account");
      if (method === "GET" && path === "/api/account/export") return reply(200, await run("exportAccount", clock()), { "Content-Disposition": 'attachment; filename="followkit-account-export.json"' });
      if (method === "GET" && path === "/api/account") return reply(200, account);
      if (method === "GET" && path === "/api/dashboard") return reply(200, await run("dashboard", bangkokDay(clock())));
      if (path === "/api/billing/checkout" && method === "POST") return reply(503, { error: { code: "payment_not_configured" } });
      if (path === "/api/quote-drafts" && method === "POST") return reply(201, await run("createQuote", await readBody(request), request.headers.get("idempotency-key"), "quote-draft"));
      const match = path.match(/^\/api\/(customers|quotes)(?:\/([^/]+))?(?:\/(followups))?$/);
      if (!match) throw new Fault(404, "not_found");
      const [, table, id2, events] = match;
      if (events) {
        if (table !== "quotes" || !id2) throw new Fault(404, "not_found");
        if (method === "GET") return reply(200, { items: await run("followups", id2) });
        if (method === "POST") return reply(201, await run("followup", id2, await readBody(request), clock()));
        throw new Fault(405, "method_not_allowed");
      }
      if (method === "GET") return reply(200, id2 ? await run("get", table, id2) : await run("page", table, { limit: u.searchParams.has("limit") ? Number(u.searchParams.get("limit")) : 100, cursor: u.searchParams.get("cursor") }));
      if (method === "POST" && !id2) {
        const body = await readBody(request);
        return reply(201, table === "customers" ? await run("customer", body) : await run("createQuote", body, request.headers.get("idempotency-key"), "quote"));
      }
      if (method === "PATCH" && id2) return reply(200, await run(table === "customers" ? "customer" : "quote", await readBody(request), id2));
      if (method === "DELETE" && id2) {
        await run(table === "customers" ? "deleteCustomer" : "deleteQuote", id2);
        return reply(204);
      }
      throw new Fault(405, "method_not_allowed");
    } catch (e) {
      return reply(e instanceof Fault ? e.status : 500, { error: { code: e instanceof Fault ? e.code : "internal_error" } });
    }
  };
}

// src/server/auth.mjs
function supabaseAuthenticator({ url, publishableKey, fetcher = fetch, timeoutMs = 5e3 }) {
  const base = new URL(url);
  if (base.protocol !== "https:" || base.pathname !== "/" || base.username || base.password || base.search || base.hash || !publishableKey) throw Error("HTTPS auth origin and key required");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3e4) throw Error("Invalid auth timeout");
  return async (request) => {
    const authorization = request.headers.get("authorization") || "";
    if (!/^Bearer [^\s]{1,8192}$/.test(authorization)) return null;
    const controller = new AbortController();
    let timer;
    const work = (async () => {
      const response = await fetcher(new URL("/auth/v1/user", base), { headers: { authorization, apikey: publishableKey }, redirect: "manual", signal: controller.signal });
      if (response.status === 401 || response.status === 403) {
        void response.body?.cancel().catch(() => {
        });
        return null;
      }
      if (!response.ok) {
        void response.body?.cancel().catch(() => {
        });
        throw new Fault(503, "auth_unavailable");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Fault(503, "auth_unavailable");
      let size = 0, chunks = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 65536) {
            void reader.cancel().catch(() => {
            });
            throw new Fault(503, "auth_unavailable");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(size);
      let at = 0;
      for (const c of chunks) {
        bytes.set(c, at);
        at += c.length;
      }
      let user;
      try {
        user = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        throw new Fault(503, "auth_unavailable");
      }
      if (typeof user?.id !== "string" || !user.id || typeof user.email_confirmed_at !== "string" || !user.email_confirmed_at || user.is_anonymous === true) return null;
      return { id: user.id };
    })();
    try {
      return await Promise.race([work, new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Fault(503, "auth_unavailable"));
        }, timeoutMs);
      })]);
    } catch {
      throw new Fault(503, "auth_unavailable");
    } finally {
      clearTimeout(timer);
    }
  };
}

// src/server/http-repository.mjs
var uuid2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var bad = (code = "invalid_fields") => {
  throw new Fault(400, code);
};
var id = (value) => {
  if (typeof value !== "string" || !uuid2.test(value)) bad("invalid_id");
  return value;
};
function exact(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((k) => !keys.includes(k))) bad();
}
function text(value, max) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) bad("invalid_text");
  return value.trim();
}
function quoteFields(value, partial = false) {
  const keys = ["title", "amount_satang", "sent_on", "due_on", "status"];
  for (const key of keys) {
    if (!(key in value) && partial) continue;
    if (key === "status" && value[key] === void 0 && !partial) continue;
    if (key === "title") text(value[key], 160);
    else if (key === "amount_satang") {
      if (!Number.isSafeInteger(value[key]) || value[key] < 0 || value[key] > 1e10) bad("invalid_amount");
    } else if (key === "status") {
      if (!["pending", "won", "lost"].includes(value[key])) bad("invalid_status");
    } else if (!validDay(value[key])) bad("invalid_date");
  }
  if (value.sent_on && value.due_on && value.due_on < value.sent_on) bad("invalid_date");
}
var tableNames = { customers: "fk_customers", quotes: "fk_quotes" };
var errorCodes = { account_blocked: [403, "account_blocked"], confirmation_required: [400, "confirmation_required"], not_found: [404, "not_found"], unauthorized: [401, "unauthorized"], plan_limit: [409, "plan_limit"], customer_has_quotes: [409, "customer_has_quotes"], idempotency_conflict: [409, "idempotency_conflict"], quote_closed: [409, "quote_closed"], invalid_fields: [400, "invalid_fields"], choose_customer: [400, "choose_customer"], invalid_date: [400, "invalid_date"], idempotency_key_required: [400, "idempotency_key_required"] };
var protocol = () => {
  throw new Fault(502, "database_response_invalid");
};
function row(data) {
  if (Array.isArray(data)) {
    if (data.length !== 1) protocol();
    data = data[0];
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) protocol();
  return data;
}
var legacyFollowup = (f) => ({ ...f, note: JSON.stringify({ note: f.note, next_due: f.next_due }) });
function createHttpRepository({ url, publishableKey, owner, authorization, fetcher = fetch, timeoutMs = 5e3, maxResponseBytes = 5 * 1024 * 1024 }) {
  const base = new URL(url);
  if (base.protocol !== "https:" || base.pathname !== "/" || base.username || base.password || base.search || base.hash || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) throw Error("HTTPS origin and publishable key required");
  id(owner);
  if (!/^Bearer [^\s]{1,8192}$/.test(authorization || "")) throw new Fault(401, "unauthorized");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3e4 || !Number.isInteger(maxResponseBytes) || maxResponseBytes < 1) throw Error("Invalid transport bounds");
  const scoped = (value) => {
    if (value !== owner) throw new Fault(403, "owner_mismatch");
  };
  async function request(path, body) {
    const controller = new AbortController();
    let timer;
    const work = (async () => {
      const response = await fetcher(new URL("/rest/v1/" + path, base), { method: body === void 0 ? "GET" : "POST", headers: { apikey: publishableKey, Authorization: authorization, "Content-Type": "application/json", Prefer: "count=exact" }, ...body === void 0 ? {} : { body: JSON.stringify(body) }, redirect: "manual", signal: controller.signal });
      if (response.status >= 300 && response.status < 400) {
        void response.body?.cancel().catch(() => {
        });
        throw new Fault(503, "database_unavailable");
      }
      const reader = response.body?.getReader();
      let size = 0, chunks = [];
      if (reader) {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxResponseBytes) {
              void reader.cancel().catch(() => {
              });
              throw new Fault(502, "database_response_too_large");
            }
            chunks.push(value);
          }
        } finally {
          reader.releaseLock();
        }
      }
      let data = null;
      if (size) {
        const all = new Uint8Array(size);
        let offset = 0;
        for (const c of chunks) {
          all.set(c, offset);
          offset += c.length;
        }
        try {
          data = JSON.parse(new TextDecoder().decode(all));
        } catch {
          protocol();
        }
      }
      if (!response.ok) {
        const known = errorCodes[data?.message];
        if (known) throw new Fault(...known);
        if (response.status === 401) throw new Fault(401, "unauthorized");
        if (response.status === 403) throw new Fault(403, "forbidden");
        if (response.status === 429) throw new Fault(429, "rate_limited");
        if (["23514", "23502", "22P02", "22007", "22008"].includes(data?.code)) bad("invalid_input");
        if (data?.code === "23503") throw new Fault(409, "invalid_reference");
        throw new Fault(503, "database_unavailable");
      }
      return { data, response };
    })();
    try {
      return await Promise.race([work, new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Fault(504, "database_timeout"));
        }, timeoutMs);
      })]);
    } catch (e) {
      if (e instanceof Fault) throw e;
      throw new Fault(503, "database_unavailable");
    } finally {
      clearTimeout(timer);
    }
  }
  const rpc = async (name, args = {}) => (await request("rpc/" + name, args)).data;
  const owned = (r) => {
    r = row(r);
    if (r.account_id !== owner) protocol();
    return r;
  };
  async function get(who, table, key) {
    scoped(who);
    id(key);
    const target = tableNames[table];
    if (!target) bad();
    const data = (await request(target + "?" + new URLSearchParams({ select: "*", account_id: "eq." + owner, id: "eq." + key, limit: "1" }))).data;
    if (!Array.isArray(data)) protocol();
    if (!data.length) throw new Fault(404, "not_found");
    const result = owned(data);
    if (result.id !== key) protocol();
    return result;
  }
  return {
    async onboardingStatus(who) {
      scoped(who);
      const data = row(await rpc("fk_onboarding_status"));
      if (!["ready", "setup_required", "blocked"].includes(data.status)) protocol();
      return { status: data.status };
    },
    async provisionAccount(who) {
      scoped(who);
      const data = row(await rpc("fk_provision_account", { p_confirm: true }));
      if (data.id !== owner || !["free", "paid"].includes(data.plan)) protocol();
      return { id: data.id, plan: data.plan };
    },
    async account(who) {
      scoped(who);
      const data = (await request("fk_accounts?" + new URLSearchParams({ select: "id,plan,state", id: "eq." + owner, limit: "1" }))).data;
      if (!Array.isArray(data)) protocol();
      if (!data.length) throw new Fault(403, "account_unavailable");
      const a = row(data);
      if (a.id !== owner || a.state !== "active" || !["free", "paid"].includes(a.plan)) protocol();
      return { id: a.id, plan: a.plan };
    },
    get,
    async page(who, table, { limit = 100, cursor = null } = {}) {
      scoped(who);
      const target = tableNames[table];
      if (!target || !Number.isInteger(limit) || limit < 1 || limit > 200) bad("invalid_page_limit");
      let after;
      try {
        if (cursor) {
          if (typeof cursor !== "string" || cursor.length > 1024) throw Error();
          const c = JSON.parse(atob(cursor));
          if (c.owner !== owner || c.table !== table || !uuid2.test(c.after)) throw Error();
          after = c.after;
        }
      } catch {
        bad("invalid_cursor");
      }
      const params = new URLSearchParams({ select: "*", account_id: "eq." + owner, order: "id.asc", limit: String(limit + 1) });
      if (after) params.set("id", "gt." + after);
      const { data, response } = await request(target + "?" + params);
      if (!Array.isArray(data) || data.length > limit + 1) protocol();
      const range = response.headers.get("content-range")?.match(/^(?:\d+-\d+|\*)\/(\d+)$/);
      if (!range) protocol();
      const total = Number(range[1]);
      if (!Number.isSafeInteger(total) || total < data.length || !data.length && total) protocol();
      for (const r of data) {
        owned(r);
        if (!uuid2.test(r.id)) protocol();
      }
      const items = data.slice(0, limit);
      return { items, next_cursor: total > items.length ? btoa(JSON.stringify({ owner, table, after: items.at(-1).id })) : null };
    },
    async customer(who, input, key) {
      scoped(who);
      exact(input, ["name", "contact"]);
      const name = text(input.name, 100), contact = input.contact ?? "";
      if (typeof contact !== "string" || contact.length > 250) bad("invalid_contact");
      return owned(await rpc("fk_save_customer", { p_name: name, p_contact: contact, p_id: key ? id(key) : null }));
    },
    async deleteCustomer(who, key) {
      scoped(who);
      await rpc("fk_delete_customer", { p_id: id(key) });
    },
    async createQuote(who, input, key, scope = "quote-draft") {
      scoped(who);
      exact(input, scope === "quote" ? ["customer_id", "title", "amount_satang", "sent_on", "due_on", "status"] : ["customer_id", "customer_name", "title", "amount_satang", "sent_on", "due_on", "status"]);
      if (!["quote", "quote-draft"].includes(scope)) bad();
      quoteFields(input);
      if (typeof key !== "string" || !/^[-a-zA-Z0-9_]{16,128}$/.test(key)) bad("idempotency_key_required");
      if (Boolean(input.customer_id) === Boolean(input.customer_name)) bad("choose_customer");
      const args = { p_scope: scope, p_key: key, p_title: input.title, p_amount: input.amount_satang, p_sent: input.sent_on, p_due: input.due_on, p_status: input.status ?? "pending", p_customer_id: input.customer_id ? id(input.customer_id) : null, p_customer_name: input.customer_name ? text(input.customer_name, 100) : null };
      return owned(await rpc("fk_create_quote_scoped", args));
    },
    async quote(who, input, key) {
      scoped(who);
      id(key);
      exact(input, ["customer_id", "title", "amount_satang", "sent_on", "due_on", "status"]);
      quoteFields(input, true);
      if ("customer_id" in input) id(input.customer_id);
      return owned(await rpc("fk_patch_quote", { p_id: key, p_patch: input }));
    },
    async deleteQuote(who, key) {
      scoped(who);
      await rpc("fk_delete_quote", { p_id: id(key) });
    },
    async followups(who, key) {
      scoped(who);
      const data = await rpc("fk_followups_json", { p_id: id(key) });
      if (!Array.isArray(data)) protocol();
      return data.map((f) => {
        owned(f);
        if (f.quote_id !== key) protocol();
        return legacyFollowup(f);
      });
    },
    async followup(who, key, input) {
      scoped(who);
      exact(input, ["note", "next_due", "idempotency_key"]);
      const note = text(input.note, 2e3), requestKey = text(input.idempotency_key, 100);
      if (!validDay(input.next_due)) bad("invalid_date");
      const f = owned(await rpc("fk_followup", { p_quote_id: id(key), p_key: requestKey, p_note: note, p_next_due: input.next_due }));
      if (f.quote_id !== key) protocol();
      return legacyFollowup(f);
    },
    async dashboard(who, today) {
      scoped(who);
      if (!validDay(today)) bad("invalid_date");
      const d = row(await rpc("fk_dashboard", { p_today: today }));
      for (const key of ["customers", "pending", "due", "amount_satang"]) if (!Number.isSafeInteger(d[key]) || d[key] < 0) protocol();
      if (d.today !== today) protocol();
      return d;
    },
    async exportAccount(who) {
      scoped(who);
      const d = row(await rpc("fk_export_account"));
      if (d.account?.id !== owner || d.format !== "followkit-account-export" || d.version !== 1) protocol();
      for (const key of ["customers", "quotes", "followups", "subscriptions"]) {
        if (!Array.isArray(d[key])) protocol();
        d[key].forEach(owned);
      }
      return { ...d, followups: d.followups.map(legacyFollowup) };
    }
  };
}
function httpRepositoryFactory(config) {
  return ({ identity, request }) => createHttpRepository({ ...config, owner: identity.id, authorization: request.headers.get("authorization") });
}

// src/worker/index.mjs
var uuid3 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var failure = (status, code, headers = {}) => new Response(JSON.stringify({ error: { code } }), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } });
function secure(response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  headers.delete("Access-Control-Allow-Origin");
  return new Response(response.body, { status: response.status, headers });
}
function origin(value) {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password || u.pathname !== "/" || u.search || u.hash) throw Error("invalid origin");
  return u.origin;
}
function configuration(env) {
  if (env.FOLLOWKIT_API_ENABLED !== "true") throw Error("disabled");
  const appOrigin = origin(env.APP_ORIGIN), url = origin(env.SUPABASE_URL), publishableKey = env.SUPABASE_PUBLISHABLE_KEY;
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey || "")) throw Error("invalid key");
  return { appOrigin, url, publishableKey };
}
function deletionEnabled(env) {
  return env.FOLLOWKIT_DELETION_ENABLED === "true" && typeof env.DELETION_SERVICE?.confirm === "function" && typeof env.DELETION_RATE_LIMIT?.limit === "function";
}
function methods(path) {
  if (path === "/api/onboarding") return ["GET", "POST"];
  if (["/api/account", "/api/account/export", "/api/dashboard"].includes(path)) return ["GET"];
  if (["/api/quote-drafts", "/api/billing/checkout"].includes(path)) return ["POST"];
  if (["/api/customers", "/api/quotes"].includes(path)) return ["GET", "POST"];
  const match = path.match(/^\/api\/(customers|quotes)\/([^/]+)(\/followups)?$/);
  if (!match || !uuid3.test(match[2]) || match[3] && match[1] !== "quotes") return null;
  return match[3] ? ["GET", "POST"] : ["GET", "PATCH", "DELETE"];
}
function createWorker({ fetcher = (input, init) => fetch(input, init), authTimeoutMs = 5e3 } = {}) {
  let cachedConfig = "", api;
  return { async fetch(request, env = {}) {
    try {
      const u = new URL(request.url);
      const authPaths = ["/auth/", "/auth/callback", "/auth/recovery", "/auth/boot.mjs", "/auth/style.css", "/auth/thai.woff2", "/auth/config"];
      if (authPaths.includes(u.pathname)) {
        if (request.method !== "GET") return secure(failure(405, "method_not_allowed", { Allow: "GET" }));
        let config2;
        try {
          config2 = configuration(env);
        } catch {
          return secure(failure(503, "service_not_configured"));
        }
        if (u.origin !== config2.appOrigin || request.headers.has("origin") && request.headers.get("origin") !== config2.appOrigin) return secure(failure(403, "origin_rejected"));
        if (u.pathname === "/auth/config") return secure(new Response(JSON.stringify({ enabled: true, ...config2, ...deletionEnabled(env) ? { deletionEnabled: true } : {} }), { headers: { "Content-Type": "application/json" } }));
        if (!env.ASSETS) return secure(failure(503, "assets_unavailable"));
        const file = ["/auth/", "/auth/callback", "/auth/recovery"].includes(u.pathname) ? "/auth/index.html" : u.pathname;
        const asset = await env.ASSETS.fetch(new Request(new URL(file, config2.appOrigin)));
        if (!asset.ok) return secure(failure(503, "assets_unavailable"));
        const response = secure(asset);
        response.headers.set("Content-Security-Policy", `default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self' ${config2.url}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
        return response;
      }
      if (u.pathname === "/api/account/deletion") {
        if (!deletionEnabled(env)) return secure(failure(404, "not_found"));
        let config2;
        try {
          config2 = configuration(env);
        } catch {
          return secure(failure(503, "service_not_configured"));
        }
        return secure(await deletionHttp({ origin: config2.appOrigin, authenticate: supabaseAuthenticator({ ...config2, fetcher, timeoutMs: authTimeoutMs }), admission: env.DELETION_SERVICE, limiter: env.DELETION_RATE_LIMIT })(request));
      }
      const allowed = methods(u.pathname);
      if (!allowed) return secure(failure(404, "not_found"));
      if (!allowed.includes(request.method)) return secure(failure(405, "method_not_allowed", { Allow: allowed.join(", ") }));
      let config;
      try {
        config = configuration(env);
      } catch {
        return secure(failure(503, "service_not_configured"));
      }
      if (u.origin !== config.appOrigin) return secure(failure(403, "origin_rejected"));
      const suppliedOrigin = request.headers.get("origin");
      if (suppliedOrigin && suppliedOrigin !== config.appOrigin) return secure(failure(403, "origin_rejected"));
      const key = JSON.stringify(config);
      if (key !== cachedConfig) {
        const provider = supabaseAuthenticator({ ...config, fetcher, timeoutMs: authTimeoutMs });
        api = createApi({ authenticate: async (req) => {
          const user = await provider(req);
          return user && uuid3.test(user.id) ? user : null;
        }, repositoryFor: httpRepositoryFactory({ ...config, fetcher }) });
        cachedConfig = key;
      }
      return secure(await api(request));
    } catch {
      return secure(failure(500, "internal_error"));
    }
  } };
}
var index_default = createWorker();
export {
  createWorker,
  index_default as default
};
