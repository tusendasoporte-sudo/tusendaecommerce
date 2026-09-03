/// <reference path="../pb_data/types.d.ts" />

onRecordCreate(
  (e) => require(`${__hooks}/pz_taxonomy_contract_lib.js`).handleCategoryMutation(e, "create"),
  "categories",
);
onRecordUpdate(
  (e) => require(`${__hooks}/pz_taxonomy_contract_lib.js`).handleCategoryMutation(e, "update"),
  "categories",
);
onRecordDelete(
  (e) => require(`${__hooks}/pz_taxonomy_contract_lib.js`).handleCategoryDelete(e),
  "categories",
);

onRecordCreate(
  (e) => require(`${__hooks}/pz_taxonomy_contract_lib.js`).handleSubcategoryMutation(e, "create"),
  "subcategories",
);
onRecordUpdate(
  (e) => require(`${__hooks}/pz_taxonomy_contract_lib.js`).handleSubcategoryMutation(e, "update"),
  "subcategories",
);
onRecordDelete(
  (e) => require(`${__hooks}/pz_taxonomy_contract_lib.js`).handleSubcategoryDelete(e),
  "subcategories",
);

onRecordCreate(
  (e) => require(`${__hooks}/pz_taxonomy_contract_lib.js`).handleProductTaxonomyMutation(e, "create"),
  "products",
);
onRecordUpdate(
  (e) => require(`${__hooks}/pz_taxonomy_contract_lib.js`).handleProductTaxonomyMutation(e, "update"),
  "products",
);
