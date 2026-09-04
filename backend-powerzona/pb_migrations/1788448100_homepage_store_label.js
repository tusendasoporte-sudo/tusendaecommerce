/// <reference path="../pb_data/types.d.ts" />

"use strict";

const COPY = {
  previous: {
    "store-types": {
      question: "¿Cuál es la diferencia entre Promocional y Ecommerce?",
      answer: "Promocional está orientada a presentar servicios, catálogo, reseñas y contacto. Ecommerce añade productos, pedidos y herramientas operativas de venta.",
    },
    "advanced-security": {
      answer: "No. No está incluida ni activada por defecto. En Ecommerce es una capacidad opcional por tienda y solo Master puede controlarla.",
    },
  },
  current: {
    "store-types": {
      question: "¿Cuál es la diferencia entre Promocional y Tienda?",
      answer: "Promocional está orientada a presentar servicios, catálogo, reseñas y contacto. Tienda añade productos, pedidos y herramientas operativas de venta.",
    },
    "advanced-security": {
      answer: "No. No está incluida ni activada por defecto. En la modalidad Tienda es una capacidad opcional y solo Master puede controlarla.",
    },
  },
};

function jsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  try {
    const parsed = JSON.parse(JSON.stringify(value));
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === "string") {
      const reparsed = JSON.parse(parsed);
      return Array.isArray(reparsed) ? reparsed : [];
    }
  } catch (_) {}
  return [];
}

function updateDefaultCopy(app, source, target) {
  let settings = null;
  try {
    settings = app.findFirstRecordByFilter("public_homepage_settings", 'key = "main"');
  } catch (_) {
    return;
  }

  const faqs = jsonArray(settings.get("faqs_json"));
  let changed = false;
  const updated = faqs.map((faq) => {
    if (!faq || typeof faq !== "object" || Array.isArray(faq)) return faq;
    const id = String(faq.id || "");
    const previous = source[id];
    const current = target[id];
    if (!previous || !current) return faq;
    const next = { ...faq };
    ["question", "answer"].forEach((field) => {
      if (previous[field] && current[field] && next[field] === previous[field]) {
        next[field] = current[field];
        changed = true;
      }
    });
    return next;
  });

  if (!changed) return;
  settings.set("faqs_json", updated);
  app.save(settings);
}

migrate((app) => {
  updateDefaultCopy(app, COPY.previous, COPY.current);
}, (app) => {
  updateDefaultCopy(app, COPY.current, COPY.previous);
});
