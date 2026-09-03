/// <reference path="../pb_data/types.d.ts" />

"use strict";

const MASTER_ADMIN_RULE = '@request.auth.role = "master_admin"';
const DEFAULT_FAQS = [
  { id: "store-types", visible: true, question: "¿Cuál es la diferencia entre Promocional y Ecommerce?", answer: "Promocional está orientada a presentar servicios, catálogo, reseñas y contacto. Ecommerce añade productos, pedidos y herramientas operativas de venta." },
  { id: "monthly-equivalent", visible: true, question: "¿Qué significa precio mensual equivalente?", answer: "En los periodos de 6 y 12 meses permite comparar el valor mensual, pero el total indicado corresponde al pago completo del periodo." },
  { id: "free-trial", visible: true, question: "¿Cómo funciona la prueba gratis?", answer: "La prueba dura 30 días, tiene un total de 0 CUP y puede utilizarse una sola vez por tienda." },
  { id: "android-apps", visible: true, question: "¿Las dos aplicaciones Android son iguales?", answer: "No. La aplicación administrativa es para el equipo que gestiona el negocio. La aplicación para clientes lleva la identidad de la tienda y está pensada para comprar." },
  { id: "advanced-security", visible: true, question: "¿Seguridad avanzada viene activada al crear la tienda?", answer: "No. No está incluida ni activada por defecto. En Ecommerce es una capacidad opcional por tienda y solo Master puede controlarla." },
  { id: "plan-renewal", visible: true, question: "¿Puedo cambiar o renovar el plan?", answer: "Sí. La administración Master gestiona la asignación, el cambio y la renovación dentro de los periodos comerciales disponibles." },
];

function idField(id) {
  return {
    autogeneratePattern: "[a-z0-9]{15}", hidden: false, id, max: 15, min: 15,
    name: "id", pattern: "^[a-z0-9]+$", presentable: false, primaryKey: true,
    required: true, system: true, type: "text",
  };
}

function textField(id, name, max, required) {
  return {
    autogeneratePattern: "", hidden: false, id, max, min: required ? 1 : 0,
    name, pattern: "", presentable: false, primaryKey: false,
    required: required === true, system: false, type: "text",
  };
}

migrate((app) => {
  const collection = new Collection({
    id: "pbc_1788447900",
    name: "public_homepage_settings",
    type: "base",
    system: false,
    listRule: "",
    viewRule: "",
    createRule: null,
    updateRule: MASTER_ADMIN_RULE,
    deleteRule: null,
    fields: [
      idField("text1788447901"),
      textField("text1788447902", "key", 40, true),
      { default: true, hidden: false, id: "bool1788447903", name: "stores_section_enabled", presentable: false, required: false, system: false, type: "bool" },
      { default: true, hidden: false, id: "bool1788447904", name: "faq_section_enabled", presentable: false, required: false, system: false, type: "bool" },
      textField("text1788447905", "faq_eyebrow", 80, true),
      textField("text1788447906", "faq_title", 140, true),
      textField("text1788447907", "faq_intro", 360, true),
      { hidden: false, id: "json1788447908", maxSize: 32768, name: "faqs_json", presentable: false, required: true, system: false, type: "json" },
      { hidden: false, id: "autodate1788447909", name: "created", onCreate: true, onUpdate: false, presentable: false, system: false, type: "autodate" },
      { hidden: false, id: "autodate1788447910", name: "updated", onCreate: true, onUpdate: true, presentable: false, system: false, type: "autodate" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX `idx_public_homepage_settings_key` ON `public_homepage_settings` (`key`)",
    ],
  });
  app.save(collection);

  const settings = new Record(collection, {
    key: "main",
    stores_section_enabled: true,
    faq_section_enabled: true,
    faq_eyebrow: "Preguntas frecuentes",
    faq_title: "Antes de comenzar.",
    faq_intro: "Los precios y límites mostrados provienen del catálogo comercial vigente de Tu Senda 84.",
    faqs_json: DEFAULT_FAQS,
  });
  app.save(settings);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1788447900");
  app.delete(collection);
});
