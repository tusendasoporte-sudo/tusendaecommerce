/// <reference path="../pb_data/types.d.ts" />

"use strict";

const domain = typeof __hooks === "undefined"
  ? require("./pz_promo_domain_lib.js")
  : require(`${__hooks}/pz_promo_domain_lib.js`);
const shellApi = typeof __hooks === "undefined"
  ? require("./pz_promo_shell_api_lib.js")
  : require(`${__hooks}/pz_promo_shell_api_lib.js`);
const seo = typeof __hooks === "undefined"
  ? require("./pz_promo_seo_lib.js")
  : require(`${__hooks}/pz_promo_seo_lib.js`);

function setHeaders(e, hostScoped) {
  try {
    const headers = e.response.header();
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    if (hostScoped) headers.set("Vary", "Host");
  } catch (_) {}
}

function handlePlatform(e, resource) {
  try {
    shellApi.exactRequestInfo(e);
    const slug = String(e.request.pathValue("publicSlug") || "");
    const context = shellApi.publishedPlatformContext(e.app, slug);
    const result = context.action === "redirect"
      ? seo.resourceRedirect(resource, context.canonicalHostname)
      : seo.resourceEnvelope(context.projection, { source: "platform", resource });
    setHeaders(e, false);
    return e.json(200, result);
  } catch (_) {
    setHeaders(e, false);
    return e.json(404, { ok: false, error: "promo_public_unavailable" });
  }
}

function handleHost(e, resource) {
  try {
    const info = shellApi.exactRequestInfo(e);
    const context = domain.resolveHostContext(
      e.app,
      shellApi.authoritativeRequestHeaders(e, info),
      { trustedProxy: false },
    );
    const result = context.binding_role === "alias"
      ? seo.resourceRedirect(resource, context.canonical_hostname)
      : seo.resourceEnvelope(context.projection, {
        source: "custom",
        canonicalHostname: context.canonical_hostname,
        resource,
      });
    setHeaders(e, true);
    return e.json(200, result);
  } catch (_) {
    setHeaders(e, true);
    return e.json(421, { ok: false, error: "promo_host_unavailable" });
  }
}

module.exports = {
  handleHost,
  handlePlatform,
  setHeaders,
};
