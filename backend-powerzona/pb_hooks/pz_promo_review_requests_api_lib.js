/// <reference path="../pb_data/types.d.ts" />

"use strict";

const promo = typeof __hooks === "undefined"
  ? require("./pz_promo_permissions_lib.js")
  : require(`${__hooks}/pz_promo_permissions_lib.js`);
const promoAudit = typeof __hooks === "undefined"
  ? require("./pz_promo_audit_lib.js")
  : require(`${__hooks}/pz_promo_audit_lib.js`);
const pubcfgApi = typeof __hooks === "undefined"
  ? require("./pz_promo_pubcfg_api_lib.js")
  : require(`${__hooks}/pz_promo_pubcfg_api_lib.js`);
const contracts = typeof __hooks === "undefined"
  ? require("./pz_promo_review_requests_lib.js")
  : require(`${__hooks}/pz_promo_review_requests_lib.js`);
const secrets = typeof __hooks === "undefined"
  ? require("./pz_security_secret_contract.js")
  : require(`${__hooks}/pz_security_secret_contract.js`);

const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const RATE_MAX_SUBMISSIONS = 3;
const submissionBuckets = new Map();

const SAFE_ERROR_CODES = new Set([
  "unauthorized", "session_revoked", "user_inactive", "blocked_by_plan", "promo_not_found",
  "store_not_promo", "store_inactive", "promo_site_inactive", "promo_store_context_required",
  "promo_capability_denied", "promo_permission_denied", "invalid_payload", "invalid_origin",
  "unsafe_review_content", "review_submission_too_fast", "review_rate_limited",
  "invalid_review_request", "review_request_used", "review_request_expired", "review_request_revoked",
  "review_request_link_unavailable",
  "promo_reviews_unavailable",
]);

function codedError(code, status) {
  const safe = SAFE_ERROR_CODES.has(code) ? code : "promo_reviews_unavailable";
  const error = new Error(safe);
  error.code = safe;
  error.status = Number.isInteger(status) ? status : 503;
  return error;
}

function errorCode(error) {
  const value = String(error && (error.code || error.message) || "");
  return SAFE_ERROR_CODES.has(value) ? value : "promo_reviews_unavailable";
}

function errorStatus(error) {
  if (error && Number.isInteger(error.status)) return error.status;
  const code = errorCode(error);
  if (["invalid_payload", "unsafe_review_content"].includes(code)) return 400;
  if (["invalid_review_request", "promo_not_found"].includes(code)) return 404;
  if (["review_request_used", "review_request_expired", "review_request_revoked", "review_request_link_unavailable"].includes(code)) return 409;
  if (["review_submission_too_fast", "review_rate_limited"].includes(code)) return 429;
  if (code === "promo_reviews_unavailable") return 503;
  return 403;
}

function setHeaders(e, isPrivate) {
  try {
    const headers = e.response.header();
    headers.set("Cache-Control", isPrivate ? "private, no-store, max-age=0" : "no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Content-Type-Options", "nosniff");
  } catch (_) {}
}

function sendError(e, error, isPrivate) {
  setHeaders(e, isPrivate);
  return e.json(errorStatus(error), { ok: false, error: errorCode(error) });
}

function findRecord(app, collection, id) {
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function findRows(app, collection, filter, sort, limit, offset, params) {
  return Array.from(app.findRecordsByFilter(
    collection, filter, sort || "id", limit || 500, offset || 0, params || {},
  ) || []);
}

function findExact(app, collection, filter, params) {
  const rows = findRows(app, collection, filter, "id", 2, 0, params);
  if (rows.length > 1) throw codedError("promo_reviews_unavailable", 503);
  return rows[0] || null;
}

function collectionsReady(app) {
  try {
    const requests = app.findCollectionByNameOrId("promo_review_requests");
    const reviews = app.findCollectionByNameOrId("reviews");
    return [
      "site", "store", "token_sha256", "token_encrypted", "status", "locale", "review",
      "created_by", "expires_at", "received_at", "revoked_at", "created", "updated",
    ].every((field) => !!requests.fields.getByName(field))
      && ["store", "type", "rating", "customer_name", "comment", "status", "source", "featured", "approved_at"]
        .every((field) => !!reviews.fields.getByName(field));
  } catch (_) { return false; }
}

function headerValue(info, name) {
  const headers = info && info.headers || {};
  const normalized = String(name || "").toLowerCase().replace(/-/g, "_");
  try {
    if (typeof headers.get === "function") return String(headers.get(name) || headers.get(normalized) || "").trim().slice(0, 80);
  } catch (_) {}
  const key = Object.keys(headers).find((candidate) => String(candidate).toLowerCase().replace(/-/g, "_") === normalized);
  return key ? String(headers[key] || "").trim().slice(0, 80) : "";
}

function privateContext(e) {
  setHeaders(e, true);
  if (!e || !e.auth || !collectionsReady(e.app)) throw codedError("unauthorized", 403);
  const info = e.requestInfo();
  if (!info || !contracts.exactPayload(info.query || {}, [])) throw codedError("invalid_payload", 400);
  const decision = promo.requirePromoAction(e.app, e.auth, "promo.reviews.manage", {
    requestedStoreId: headerValue(info, "X-PZ-Promo-Store"),
  });
  return { decision, info };
}

function siteForSlug(app, slug) {
  if (!collectionsReady(app) || !contracts.PUBLIC_SLUG_PATTERN.test(String(slug || ""))) {
    throw codedError("promo_not_found", 404);
  }
  const site = findExact(app, "promo_sites", "public_slug = {:slug}", { slug });
  if (!site || contracts.recordString(site, "public_slug", 120) !== slug) throw codedError("promo_not_found", 404);
  let published;
  try { published = pubcfgApi.resolvePublicProjectionForSite(app, site, { canonicalMode: "platform" }); }
  catch (_) { throw codedError("promo_not_found", 404); }
  const store = findRecord(app, "stores", contracts.relationId(site, "store"));
  if (!store || contracts.recordString(store, "status", 30) !== "active") throw codedError("promo_not_found", 404);
  const rating = published.document && published.document.adapters && published.document.adapters.store_rating;
  const sectionVisible = Array.isArray(published.document && published.document.sections)
    && published.document.sections.some((item) => item && item.type === "store_rating" && item.visible === true);
  if (!rating || rating.enabled !== true || !sectionVisible) throw codedError("promo_not_found", 404);
  return { ...published, store };
}

function requestedLocale(context, locale) {
  const published = context && context.document && context.document.locales && context.document.locales.published;
  if (!Array.isArray(published) || !published.includes(locale)) throw codedError("invalid_payload", 400);
  return locale;
}

function queryCount(app, sql, bindings) {
  const rows = arrayOf(new DynamicModel({ total: 0 }));
  app.db().newQuery(sql).bind(bindings || {}).all(rows);
  return Math.max(0, Math.trunc(Number(rows[0] && rows[0].total) || 0));
}

function requestForReview(app, siteId, reviewId) {
  return findExact(app, "promo_review_requests", "site = {:site} && review = {:review}", {
    site: siteId, review: reviewId,
  });
}

function publicMetadata(app, context, review) {
  const request = requestForReview(app, context.siteId, contracts.recordId(review));
  return { verified: Boolean(request && contracts.requestState(request) === "received") };
}

function handlePublicList(e) {
  setHeaders(e, false);
  try {
    const info = e.requestInfo();
    const parsed = contracts.parsePublicList(info && info.query || {});
    const slug = String(e.request.pathValue("publicSlug") || "");
    const context = siteForSlug(e.app, slug);
    requestedLocale(context, parsed.locale);
    const storeId = contracts.recordId(context.store);
    const total = queryCount(e.app, `
      SELECT COUNT(*) AS total FROM reviews
      WHERE store = {:store} AND type = 'store' AND status = 'approved' AND rating BETWEEN 1 AND 5
    `, { store: storeId });
    const totalPages = Math.max(1, Math.ceil(total / contracts.PUBLIC_PAGE_SIZE));
    if (parsed.page > totalPages && total > 0) throw codedError("invalid_payload", 400);
    const rows = findRows(
      e.app,
      "reviews",
      "store = {:store} && type = 'store' && status = 'approved'",
      "-featured,-created,-id",
      contracts.PUBLIC_PAGE_SIZE,
      (parsed.page - 1) * contracts.PUBLIC_PAGE_SIZE,
      { store: storeId },
    );
    return e.json(200, {
      ok: true,
      contract: contracts.PUBLIC_PAGE_CONTRACT,
      page: parsed.page,
      per_page: contracts.PUBLIC_PAGE_SIZE,
      total_items: total,
      total_pages: totalPages,
      reviews: rows.map((record) => contracts.publicReview(record, publicMetadata(e.app, context, record))),
    });
  } catch (error) { return sendError(e, error, false); }
}

function remoteFingerprint(e, siteId) {
  let ip = "";
  try { ip = String(e.realIP() || "").trim(); } catch (_) {}
  if (!ip || ip.length > 80) throw codedError("review_rate_limited", 429);
  return contracts.sha256(`${siteId}|${ip}`);
}

function enforceRate(e, siteId) {
  const now = Date.now();
  for (const [key, bucket] of submissionBuckets.entries()) {
    if (!bucket || bucket.expires <= now) submissionBuckets.delete(key);
  }
  const key = remoteFingerprint(e, siteId);
  const current = submissionBuckets.get(key);
  if (current && current.count >= RATE_MAX_SUBMISSIONS) throw codedError("review_rate_limited", 429);
  submissionBuckets.set(key, current && current.expires > now
    ? { count: current.count + 1, expires: current.expires }
    : { count: 1, expires: now + RATE_WINDOW_MS });
}

function findRequestByToken(app, token) {
  const digest = contracts.sha256(token);
  return findExact(app, "promo_review_requests", "token_sha256 = {:digest}", { digest });
}

function usableRequest(app, siteId, token) {
  const request = findRequestByToken(app, token);
  if (!request || contracts.relationId(request, "site") !== siteId) throw codedError("invalid_review_request", 404);
  const state = contracts.requestState(request);
  if (state === "received") throw codedError("review_request_used", 409);
  if (state === "expired") throw codedError("review_request_expired", 409);
  if (state === "revoked") throw codedError("review_request_revoked", 409);
  if (state !== "pending") throw codedError("invalid_review_request", 404);
  return request;
}

function lockRequest(app, id) {
  app.db().newQuery("UPDATE promo_review_requests SET id = id WHERE id = {:id}").bind({ id }).execute();
}

function handlePublicSubmit(e) {
  setHeaders(e, false);
  let parsed;
  let context;
  try {
    const info = e.requestInfo();
    if (!info || !contracts.exactPayload(info.query || {}, [])) throw codedError("invalid_payload", 400);
    parsed = contracts.parsePublicSubmission(info.body || {});
    context = siteForSlug(e.app, String(e.request.pathValue("publicSlug") || ""));
    enforceRate(e, context.siteId);
  } catch (error) { return sendError(e, error, false); }
  try {
    let response;
    e.app.runInTransaction((app) => {
      let request = parsed.requestToken ? usableRequest(app, context.siteId, parsed.requestToken) : null;
      if (request) {
        lockRequest(app, contracts.recordId(request));
        request = usableRequest(app, context.siteId, parsed.requestToken);
      }
      const review = new Record(app.findCollectionByNameOrId("reviews"), {});
      review.set("store", contracts.recordId(context.store));
      review.set("type", "store");
      review.set("rating", parsed.rating);
      review.set("customer_name", parsed.name);
      review.set("comment", parsed.comment);
      review.set("status", "pending");
      review.set("source", "public_store");
      review.set("verified_purchase", false);
      review.set("featured", false);
      review.set("approved_at", "");
      app.save(review);
      if (request) {
        request.set("status", "received");
        request.set("review", contracts.recordId(review));
        request.set("received_at", new Date().toISOString());
        app.save(request);
      }
      response = {
        ok: true,
        contract: contracts.PUBLIC_SUBMISSION_CONTRACT,
        status: "pending",
        service_verified: Boolean(request),
      };
    });
    return e.json(201, response);
  } catch (error) { return sendError(e, error, false); }
}

function handleRequestContext(e) {
  setHeaders(e, false);
  try {
    const info = e.requestInfo();
    if (!info || !contracts.exactPayload(info.query || {}, [])) throw codedError("invalid_payload", 400);
    const parsed = contracts.parseRequestContext(info.body || {});
    const context = siteForSlug(e.app, String(e.request.pathValue("publicSlug") || ""));
    const request = usableRequest(e.app, context.siteId, parsed.token);
    return e.json(200, {
      ok: true,
      contract: contracts.PUBLIC_REQUEST_CONTEXT_RESPONSE_CONTRACT,
      locale: contracts.recordString(request, "locale", 12),
      customer_label: contracts.recordString(request, "customer_label", 120),
      work_label: contracts.recordString(request, "work_label", 240),
      expires_at: contracts.recordString(request, "expires_at", 80),
    });
  } catch (error) { return sendError(e, error, false); }
}

function createToken(app) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = contracts.requestToken();
    const digest = contracts.sha256(token);
    if (!findExact(app, "promo_review_requests", "token_sha256 = {:digest}", { digest })) return { token, digest };
  }
  throw codedError("promo_reviews_unavailable", 503);
}

function encryptToken(token) {
  const key = secrets.getValidAesKey();
  if (!key) throw codedError("promo_reviews_unavailable", 503);
  try {
    const encrypted = String($security.encrypt(String(token || ""), key) || "");
    if (encrypted && encrypted !== token && encrypted.length <= 1024) return encrypted;
  } catch (_) {}
  throw codedError("promo_reviews_unavailable", 503);
}

function decryptToken(record) {
  const encrypted = contracts.recordString(record, "token_encrypted", 1024);
  if (!encrypted) throw codedError("review_request_link_unavailable", 409);
  const key = secrets.getValidAesKey();
  if (!key) throw codedError("promo_reviews_unavailable", 503);
  try {
    const token = String($security.decrypt(encrypted, key) || "");
    const digest = contracts.recordString(record, "token_sha256", 64);
    if (contracts.TOKEN_PATTERN.test(token) && contracts.sha256(token) === digest) return token;
  } catch (error) {
    if (error && error.code === "promo_reviews_unavailable") throw error;
  }
  throw codedError("promo_reviews_unavailable", 503);
}

function handlePrivateCreate(e) {
  let context;
  let parsed;
  try {
    context = privateContext(e);
    parsed = contracts.parsePrivateCreate(context.info.body || {});
  } catch (error) { return sendError(e, error, true); }
  try {
    let response;
    e.app.runInTransaction((app) => {
      const siteId = contracts.recordId(context.decision.site);
      const secret = createToken(app);
      const record = new Record(app.findCollectionByNameOrId("promo_review_requests"), {});
      record.set("site", siteId);
      record.set("store", contracts.recordId(context.decision.store));
      record.set("token_sha256", secret.digest);
      record.set("token_encrypted", encryptToken(secret.token));
      record.set("status", "pending");
      record.set("locale", parsed.locale);
      record.set("customer_label", parsed.customerLabel);
      record.set("work_label", parsed.workLabel);
      record.set("review", "");
      record.set("created_by", contracts.recordId(context.decision.actor));
      record.set("expires_at", new Date(Date.now() + parsed.expiresDays * 24 * 60 * 60 * 1000).toISOString());
      record.set("received_at", "");
      record.set("revoked_at", "");
      app.save(record);
      promoAudit.createPromoAudit(app, context.decision, {
        action: "promo.reviews.request.create",
        resourceType: "promo_review_request",
        resourceId: contracts.recordId(record),
        changedPaths: ["/status", "/locale", "/expires_at"],
        previousValues: { status: "", locale: "", expires: false },
        newValues: { status: "pending", locale: parsed.locale, expires: true },
        sourceEventKey: `promo.reviews.request.create.${contracts.recordId(record)}`,
      });
      response = {
        ok: true,
        contract: contracts.PRIVATE_CREATED_CONTRACT,
        token: secret.token,
        request: contracts.requestDescriptor(record),
      };
    });
    return e.json(201, response);
  } catch (error) { return sendError(e, error, true); }
}

function handlePrivateReveal(e) {
  let context;
  let parsed;
  try {
    context = privateContext(e);
    parsed = contracts.parsePrivateReveal(context.info.body || {});
  } catch (error) { return sendError(e, error, true); }
  try {
    let response;
    e.app.runInTransaction((app) => {
      const siteId = contracts.recordId(context.decision.site);
      let record = findRecord(app, "promo_review_requests", parsed.requestId);
      if (!record || contracts.relationId(record, "site") !== siteId) throw codedError("invalid_review_request", 404);
      lockRequest(app, parsed.requestId);
      record = findRecord(app, "promo_review_requests", parsed.requestId);
      const state = contracts.requestState(record);
      if (state !== "pending") throw codedError(state === "received" ? "review_request_used" : `review_request_${state}`, 409);
      const token = decryptToken(record);
      const accessedAt = new Date().toISOString();
      promoAudit.createPromoAudit(app, context.decision, {
        action: "promo.reviews.request.reveal",
        resourceType: "promo_review_request",
        resourceId: parsed.requestId,
        changedPaths: [],
        previousValues: {},
        newValues: {},
        sourceEventKey: `promo.reviews.request.reveal.${parsed.requestId}.${promoAudit.stableFingerprint({
          accessed_at: accessedAt,
          actor_id: contracts.recordId(context.decision.actor),
        })}`,
      });
      response = {
        ok: true,
        contract: contracts.PRIVATE_REVEALED_CONTRACT,
        token,
        request: contracts.requestDescriptor(record),
      };
    });
    return e.json(200, response);
  } catch (error) { return sendError(e, error, true); }
}

function expireRequests(app, siteId) {
  const rows = findRows(app, "promo_review_requests", "site = {:site} && status = 'pending'", "id", 5000, 0, { site: siteId });
  rows.forEach((record) => {
    if (contracts.requestState(record) !== "expired") return;
    record.set("status", "expired");
    app.save(record);
  });
}

function handlePrivateList(e) {
  setHeaders(e, true);
  try {
    const context = privateContext(e);
    const parsed = contracts.parsePrivateList(context.info.body || {});
    const siteId = contracts.recordId(context.decision.site);
    expireRequests(e.app, siteId);
    const total = queryCount(e.app, "SELECT COUNT(*) AS total FROM promo_review_requests WHERE site = {:site}", { site: siteId });
    const totalPages = Math.max(1, Math.ceil(total / contracts.PRIVATE_PAGE_SIZE));
    if (parsed.page > totalPages && total > 0) throw codedError("invalid_payload", 400);
    const rows = findRows(
      e.app, "promo_review_requests", "site = {:site}", "-created,-id",
      contracts.PRIVATE_PAGE_SIZE, (parsed.page - 1) * contracts.PRIVATE_PAGE_SIZE, { site: siteId },
    );
    const counts = { pending: 0, received: 0, expired: 0, revoked: 0 };
    findRows(e.app, "promo_review_requests", "site = {:site}", "id", 5000, 0, { site: siteId })
      .forEach((record) => { const status = contracts.requestState(record); counts[status] += 1; });
    return e.json(200, {
      ok: true,
      contract: contracts.PRIVATE_PAGE_CONTRACT,
      page: parsed.page,
      per_page: contracts.PRIVATE_PAGE_SIZE,
      total_items: total,
      total_pages: totalPages,
      summary: counts,
      requests: rows.map(contracts.requestDescriptor),
    });
  } catch (error) { return sendError(e, error, true); }
}

function handlePrivateRevoke(e) {
  let context;
  let parsed;
  try {
    context = privateContext(e);
    parsed = contracts.parsePrivateRevoke(context.info.body || {});
  } catch (error) { return sendError(e, error, true); }
  try {
    let response;
    e.app.runInTransaction((app) => {
      const siteId = contracts.recordId(context.decision.site);
      let record = findRecord(app, "promo_review_requests", parsed.requestId);
      if (!record || contracts.relationId(record, "site") !== siteId) throw codedError("invalid_review_request", 404);
      lockRequest(app, parsed.requestId);
      record = findRecord(app, "promo_review_requests", parsed.requestId);
      const before = contracts.requestState(record);
      if (before !== "pending") throw codedError(before === "received" ? "review_request_used" : `review_request_${before}`, 409);
      record.set("status", "revoked");
      record.set("revoked_at", new Date().toISOString());
      app.save(record);
      promoAudit.createPromoAudit(app, context.decision, {
        action: "promo.reviews.request.revoke",
        resourceType: "promo_review_request",
        resourceId: parsed.requestId,
        changedPaths: ["/status"],
        previousValues: { status: before },
        newValues: { status: "revoked" },
        sourceEventKey: `promo.reviews.request.revoke.${parsed.requestId}`,
      });
      response = {
        ok: true,
        contract: contracts.PRIVATE_REVOKED_CONTRACT,
        request: contracts.requestDescriptor(record),
      };
    });
    return e.json(200, response);
  } catch (error) { return sendError(e, error, true); }
}

function handlePrivateDelete(e) {
  let context;
  let parsed;
  try {
    context = privateContext(e);
    parsed = contracts.parsePrivateDelete(context.info.body || {});
  } catch (error) { return sendError(e, error, true); }
  try {
    let response;
    e.app.runInTransaction((app) => {
      const siteId = contracts.recordId(context.decision.site);
      let record = findRecord(app, "promo_review_requests", parsed.requestId);
      if (!record || contracts.relationId(record, "site") !== siteId) throw codedError("invalid_review_request", 404);
      lockRequest(app, parsed.requestId);
      record = findRecord(app, "promo_review_requests", parsed.requestId);
      const state = contracts.requestState(record);
      promoAudit.createPromoAudit(app, context.decision, {
        action: "promo.reviews.request.delete",
        resourceType: "promo_review_request",
        resourceId: parsed.requestId,
        changedPaths: [],
        previousValues: {
          status: state,
          locale: contracts.recordString(record, "locale", 12),
          expires: Boolean(contracts.recordString(record, "expires_at", 80)),
        },
        newValues: {},
        sourceEventKey: `promo.reviews.request.delete.${parsed.requestId}`,
      });
      app.delete(record);
      response = {
        ok: true,
        contract: contracts.PRIVATE_DELETED_CONTRACT,
        request_id: parsed.requestId,
      };
    });
    return e.json(200, response);
  } catch (error) { return sendError(e, error, true); }
}

module.exports = {
  SAFE_ERROR_CODES,
  collectionsReady,
  enforceRate,
  errorCode,
  errorStatus,
  handlePrivateCreate,
  handlePrivateDelete,
  handlePrivateList,
  handlePrivateReveal,
  handlePrivateRevoke,
  handlePublicList,
  handlePublicSubmit,
  handleRequestContext,
  publicMetadata,
  siteForSlug,
  usableRequest,
};
