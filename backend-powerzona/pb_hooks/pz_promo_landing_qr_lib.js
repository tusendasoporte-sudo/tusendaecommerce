/// <reference path="../pb_data/types.d.ts" />

"use strict";

const LANDING_QR_LINK_CONTRACT = "promo.landing-qr-link.v1";

function emptyLandingQrLink() {
  return Object.freeze({
    contract: LANDING_QR_LINK_CONTRACT,
    enabled: false,
    link: null,
  });
}

function attachPublicLandingQr(_app, localized, _context) {
  const adapters = localized && localized.adapters && typeof localized.adapters === "object"
    ? localized.adapters
    : {};
  return {
    ...localized,
    adapters: {
      ...adapters,
      landing_qr_link: Object.freeze({ enabled: false }),
    },
    landing_qr_link: emptyLandingQrLink(),
  };
}

module.exports = {
  LANDING_QR_LINK_CONTRACT,
  attachPublicLandingQr,
  emptyLandingQrLink,
};
