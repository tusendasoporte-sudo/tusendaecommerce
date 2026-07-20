import {
  hasStoreCapability,
  type StoreCapabilityKey,
  type StoreCapabilityValues,
} from './storeCapabilities.ts';

export const STORE_PERMISSION_KEYS = [
  'catalog.view',
  'catalog.products.create',
  'catalog.products.edit',
  'catalog.products.delete',
  'catalog.products.visibility',
  'catalog.products.price',
  'catalog.products.stock',
  'catalog.products.images',
  'catalog.categories.manage',
  'catalog.expirations.manage',
  'orders.view',
  'orders.status.manage',
  'orders.items.manage',
  'orders.price_adjustment',
  'orders.cancel_delete',
  'orders.contact_customer',
  'shipping.manage',
  'promotions.manage',
  'coupons.manage',
  'gifts.manage',
  'raffles.manage',
  'reviews.manage',
  'notifications.view',
  'analytics.view',
  'landing_qr.manage',
  'store.settings.manage',
  'security.view',
  'security.manage',
] as const;

export const RESERVED_STORE_PERMISSION_KEYS = [
  'team.manage',
  'plan.manage',
  'primary_admin.replace',
  'premium_downgrade.confirm',
  'global_cleanup.execute',
] as const;

export const STORE_PERMISSION_TEMPLATE_CODES = [
  'secondary_admin',
  'catalog_inventory',
  'orders_shipping',
  'marketing_promotions',
  'read_only',
  'custom',
] as const;

export type StorePermission = (typeof STORE_PERMISSION_KEYS)[number];
export type ReservedStorePermission = (typeof RESERVED_STORE_PERMISSION_KEYS)[number];
export type StorePermissionTemplateCode = (typeof STORE_PERMISSION_TEMPLATE_CODES)[number];
export type StorePermissionGroupCode = 'catalog' | 'orders' | 'shipping' | 'marketing' | 'operation' | 'settings';

export type StorePermissionDefinition = Readonly<{
  key: StorePermission;
  label: string;
  description: string;
}>;

export type StorePermissionGroup = Readonly<{
  code: StorePermissionGroupCode;
  label: string;
  permissions: readonly StorePermissionDefinition[];
}>;

export type StorePermissionTemplate = Readonly<{
  code: StorePermissionTemplateCode;
  label: string;
  description: string;
  permissions: readonly StorePermission[];
}>;

const permission = (
  key: StorePermission,
  label: string,
  description: string,
): StorePermissionDefinition => Object.freeze({ key, label, description });

export const STORE_PERMISSION_CATALOG: readonly StorePermissionGroup[] = Object.freeze([
  Object.freeze({
    code: 'catalog',
    label: 'Catálogo',
    permissions: Object.freeze([
      permission('catalog.view', 'Ver catálogo', 'Consulta categorías, productos e inventario.'),
      permission('catalog.products.create', 'Crear productos', 'Agrega productos nuevos al catálogo.'),
      permission('catalog.products.edit', 'Editar productos', 'Modifica la información general de productos.'),
      permission('catalog.products.delete', 'Eliminar productos', 'Retira productos del catálogo.'),
      permission('catalog.products.visibility', 'Cambiar visibilidad de productos', 'Publica u oculta productos.'),
      permission('catalog.products.price', 'Gestionar precios de productos', 'Modifica precios de productos y variaciones.'),
      permission('catalog.products.stock', 'Gestionar inventario', 'Actualiza existencias e inventario.'),
      permission('catalog.products.images', 'Gestionar fotos de productos', 'Agrega, ordena o retira imágenes.'),
      permission('catalog.categories.manage', 'Gestionar categorías', 'Crea y modifica categorías.'),
      permission('catalog.expirations.manage', 'Gestionar vencimientos', 'Consulta y administra fechas de vencimiento.'),
    ]),
  }),
  Object.freeze({
    code: 'orders',
    label: 'Pedidos',
    permissions: Object.freeze([
      permission('orders.view', 'Ver pedidos', 'Consulta pedidos y sus detalles.'),
      permission('orders.status.manage', 'Cambiar estado de pedidos', 'Actualiza el flujo y estado de pedidos.'),
      permission('orders.items.manage', 'Gestionar artículos de pedidos', 'Modifica cantidades y artículos del pedido.'),
      permission('orders.price_adjustment', 'Ajustar precios de pedidos', 'Aplica ajustes manuales al importe del pedido.'),
      permission('orders.cancel_delete', 'Cancelar o eliminar pedidos', 'Cancela o retira pedidos cuando corresponda.'),
      permission('orders.contact_customer', 'Contactar clientes de pedidos', 'Usa los canales de contacto del pedido.'),
    ]),
  }),
  Object.freeze({
    code: 'shipping',
    label: 'Envíos',
    permissions: Object.freeze([
      permission('shipping.manage', 'Gestionar envíos', 'Configura y administra entregas y envíos.'),
    ]),
  }),
  Object.freeze({
    code: 'marketing',
    label: 'Marketing y promociones',
    permissions: Object.freeze([
      permission('promotions.manage', 'Gestionar promociones', 'Crea y modifica promociones.'),
      permission('coupons.manage', 'Gestionar cupones', 'Crea y modifica cupones.'),
      permission('gifts.manage', 'Gestionar regalos', 'Administra regalos del catálogo.'),
      permission('raffles.manage', 'Gestionar rifas', 'Crea y opera rifas cuando el plan lo permite.'),
    ]),
  }),
  Object.freeze({
    code: 'operation',
    label: 'Operación',
    permissions: Object.freeze([
      permission('reviews.manage', 'Gestionar reseñas', 'Modera y configura reseñas.'),
      permission('notifications.view', 'Ver notificaciones', 'Consulta avisos administrativos.'),
      permission('analytics.view', 'Ver analíticas', 'Consulta métricas de la tienda.'),
      permission('landing_qr.manage', 'Gestionar Landing QR', 'Configura la landing QR cuando el plan lo permite.'),
    ]),
  }),
  Object.freeze({
    code: 'settings',
    label: 'Configuración y seguridad',
    permissions: Object.freeze([
      permission('store.settings.manage', 'Gestionar ajustes de la tienda', 'Modifica la configuración de la tienda.'),
      permission('security.view', 'Ver Seguridad', 'Consulta el módulo de seguridad.'),
      permission('security.manage', 'Gestionar Seguridad', 'Administra reglas, bloqueos y acciones de seguridad.'),
    ]),
  }),
]);

export const STORE_PERMISSION_DEFINITIONS: Readonly<Record<StorePermission, StorePermissionDefinition>> =
  Object.freeze(Object.fromEntries(
    STORE_PERMISSION_CATALOG.flatMap((group) => group.permissions).map((item) => [item.key, item]),
  ) as Record<StorePermission, StorePermissionDefinition>);

export const STORE_PERMISSION_DEPENDENCIES: Readonly<Partial<Record<StorePermission, readonly StorePermission[]>>> = Object.freeze({
  'catalog.products.create': Object.freeze(['catalog.view']),
  'catalog.products.edit': Object.freeze(['catalog.view']),
  'catalog.products.delete': Object.freeze(['catalog.view']),
  'catalog.products.visibility': Object.freeze(['catalog.view']),
  'catalog.products.price': Object.freeze(['catalog.view']),
  'catalog.products.stock': Object.freeze(['catalog.view']),
  'catalog.products.images': Object.freeze(['catalog.view']),
  'catalog.categories.manage': Object.freeze(['catalog.view']),
  'catalog.expirations.manage': Object.freeze(['catalog.view']),
  'orders.status.manage': Object.freeze(['orders.view']),
  'orders.items.manage': Object.freeze(['orders.view', 'catalog.view']),
  'orders.price_adjustment': Object.freeze(['orders.view']),
  'orders.cancel_delete': Object.freeze(['orders.view']),
  'orders.contact_customer': Object.freeze(['orders.view']),
  'reviews.manage': Object.freeze(['orders.view']),
  'security.manage': Object.freeze(['security.view']),
});

export const STORE_PERMISSION_CAPABILITIES: Readonly<Partial<Record<StorePermission, StoreCapabilityKey>>> = Object.freeze({
  'catalog.expirations.manage': 'product_expiration_tools_enabled',
  'raffles.manage': 'raffles_enabled',
  'landing_qr.manage': 'landing_qr_enabled',
  'security.view': 'security_enabled',
  'security.manage': 'security_enabled',
});

const ALL_OPERATIONAL_PERMISSIONS = Object.freeze([...STORE_PERMISSION_KEYS]);
const CATALOG_INVENTORY_PERMISSIONS = Object.freeze([
  'catalog.view',
  'catalog.products.create',
  'catalog.products.edit',
  'catalog.products.visibility',
  'catalog.products.price',
  'catalog.products.stock',
  'catalog.products.images',
  'catalog.categories.manage',
  'catalog.expirations.manage',
] satisfies StorePermission[]);
const ORDERS_SHIPPING_PERMISSIONS = Object.freeze([
  'orders.view',
  'orders.status.manage',
  'orders.items.manage',
  'orders.contact_customer',
  'shipping.manage',
] satisfies StorePermission[]);
const MARKETING_PROMOTIONS_PERMISSIONS = Object.freeze([
  'promotions.manage',
  'coupons.manage',
  'gifts.manage',
  'raffles.manage',
  'analytics.view',
  'landing_qr.manage',
] satisfies StorePermission[]);
const READ_ONLY_PERMISSIONS = Object.freeze([
  'catalog.view',
  'orders.view',
  'analytics.view',
] satisfies StorePermission[]);

export const STORE_PERMISSION_TEMPLATES: Readonly<Record<StorePermissionTemplateCode, StorePermissionTemplate>> = Object.freeze({
  secondary_admin: Object.freeze({
    code: 'secondary_admin',
    label: 'Administrador secundario',
    description: 'Acceso operativo amplio, sin gestión del equipo, del plan ni acciones Master.',
    permissions: ALL_OPERATIONAL_PERMISSIONS,
  }),
  catalog_inventory: Object.freeze({
    code: 'catalog_inventory',
    label: 'Productos e inventario',
    description: 'Catálogo, productos, categorías, stock, fotos, precios y vencimientos.',
    permissions: CATALOG_INVENTORY_PERMISSIONS,
  }),
  orders_shipping: Object.freeze({
    code: 'orders_shipping',
    label: 'Pedidos y envíos',
    description: 'Pedidos, estados, artículos, contacto con clientes y envíos; sin ajuste de precio.',
    permissions: ORDERS_SHIPPING_PERMISSIONS,
  }),
  marketing_promotions: Object.freeze({
    code: 'marketing_promotions',
    label: 'Marketing y promociones',
    description: 'Promociones, cupones, regalos, rifas, Landing QR y analíticas.',
    permissions: MARKETING_PROMOTIONS_PERMISSIONS,
  }),
  read_only: Object.freeze({
    code: 'read_only',
    label: 'Solo lectura',
    description: 'Únicamente permisos de consulta; no permite modificar información.',
    permissions: READ_ONLY_PERMISSIONS,
  }),
  custom: Object.freeze({
    code: 'custom',
    label: 'Personalizado',
    description: 'Selección granular de permisos operativos.',
    permissions: Object.freeze([]),
  }),
});

const KNOWN_PERMISSIONS = new Set<string>(STORE_PERMISSION_KEYS);
const RESERVED_PERMISSIONS = new Set<string>(RESERVED_STORE_PERMISSION_KEYS);
const PERMISSION_ORDER = new Map<string, number>(STORE_PERMISSION_KEYS.map((key, index) => [key, index]));

function safeText(value: unknown) {
  try {
    return String(value === null || value === undefined ? '' : value).trim();
  } catch (_) {
    return '';
  }
}

function normalizedInput(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return raw.split(',');
    }
  }
  return [];
}

function sortPermissions(values: Iterable<StorePermission>) {
  return [...new Set(values)].sort((left, right) =>
    (PERMISSION_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER) -
    (PERMISSION_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER));
}

export function isStorePermission(value: unknown): value is StorePermission {
  return typeof value === 'string' && KNOWN_PERMISSIONS.has(value);
}

export function isReservedStorePermission(value: unknown): value is ReservedStorePermission {
  return typeof value === 'string' && RESERVED_PERMISSIONS.has(value);
}

export function isStorePermissionTemplateCode(value: unknown): value is StorePermissionTemplateCode {
  return typeof value === 'string' && STORE_PERMISSION_TEMPLATE_CODES.includes(value as StorePermissionTemplateCode);
}

export function resolvePermissionDependencies(value: unknown): StorePermission[] {
  const selected = new Set<StorePermission>();
  normalizedInput(value).forEach((entry) => {
    const key = safeText(entry);
    if (isStorePermission(key)) selected.add(key);
  });

  let changed = true;
  while (changed) {
    changed = false;
    [...selected].forEach((key) => {
      (STORE_PERMISSION_DEPENDENCIES[key] || []).forEach((dependency) => {
        if (!selected.has(dependency)) {
          selected.add(dependency);
          changed = true;
        }
      });
    });
  }
  return sortPermissions(selected);
}

export function normalizeStorePermissions(value: unknown): StorePermission[] {
  return resolvePermissionDependencies(value);
}

export function getStorePermissionTemplate(code: unknown): StorePermissionTemplate {
  return STORE_PERMISSION_TEMPLATES[isStorePermissionTemplateCode(code) ? code : 'custom'];
}

export function getStorePermissionTemplatePermissions(code: unknown): StorePermission[] {
  return normalizeStorePermissions(getStorePermissionTemplate(code).permissions);
}

export function storePermissionsEqual(left: unknown, right: unknown) {
  const normalizedLeft = normalizeStorePermissions(left);
  const normalizedRight = normalizeStorePermissions(right);
  return normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((key, index) => key === normalizedRight[index]);
}

export function detectStorePermissionTemplate(value: unknown): StorePermissionTemplateCode {
  for (const code of STORE_PERMISSION_TEMPLATE_CODES) {
    if (code !== 'custom' && storePermissionsEqual(value, STORE_PERMISSION_TEMPLATES[code].permissions)) return code;
  }
  return 'custom';
}

export function toggleStorePermission(value: unknown, permissionKey: StorePermission, enabled: boolean) {
  const selected = new Set(normalizeStorePermissions(value));
  if (enabled) {
    selected.add(permissionKey);
    return resolvePermissionDependencies([...selected]);
  }

  selected.delete(permissionKey);
  let changed = true;
  while (changed) {
    changed = false;
    [...selected].forEach((candidate) => {
      const dependencies = STORE_PERMISSION_DEPENDENCIES[candidate] || [];
      if (dependencies.some((dependency) => !selected.has(dependency))) {
        selected.delete(candidate);
        changed = true;
      }
    });
  }
  return sortPermissions(selected);
}

export type StorePermissionContext = {
  permissions?: unknown;
  isPrimaryAdmin?: boolean;
  is_primary_admin?: boolean;
  blockedByPlan?: boolean;
  blocked_by_plan?: boolean;
  status?: unknown;
  storePlanValues?: StoreCapabilityValues | null;
  capabilities?: Partial<Record<StoreCapabilityKey, unknown>> | null;
};

function capabilityAllowed(context: StorePermissionContext, permissionKey: StorePermission) {
  const capabilityKey = STORE_PERMISSION_CAPABILITIES[permissionKey];
  if (!capabilityKey) return true;
  if (context.capabilities && Object.prototype.hasOwnProperty.call(context.capabilities, capabilityKey)) {
    return context.capabilities[capabilityKey] === true;
  }
  if (context.storePlanValues) return hasStoreCapability(context.storePlanValues, capabilityKey);
  return true;
}

export function resolveEffectiveStorePermissions(context: StorePermissionContext | unknown): StorePermission[] {
  const normalizedContext: StorePermissionContext = Array.isArray(context) || typeof context === 'string'
    ? { permissions: context }
    : (context && typeof context === 'object' ? context as StorePermissionContext : {});
  const status = safeText(normalizedContext.status || 'active').toLowerCase();
  if (status === 'suspended' || normalizedContext.blockedByPlan === true || normalizedContext.blocked_by_plan === true) return [];
  // Private access/context responses already contain the backend-filtered
  // effective list (including plan capabilities). Never expand that list on
  // the client merely because the actor is the primary administrator.
  const hasExplicitPermissions = normalizedContext.permissions !== undefined
    && normalizedContext.permissions !== null;
  const source = (normalizedContext.isPrimaryAdmin === true || normalizedContext.is_primary_admin === true)
      && !hasExplicitPermissions
    ? ALL_OPERATIONAL_PERMISSIONS
    : normalizeStorePermissions(normalizedContext.permissions);
  return source.filter((key) => capabilityAllowed(normalizedContext, key));
}

export function hasStorePermission(
  context: StorePermissionContext | unknown,
  permissionKey: StorePermission | string,
) {
  return isStorePermission(permissionKey) && resolveEffectiveStorePermissions(context).includes(permissionKey);
}

export class StorePermissionError extends Error {
  readonly code = 'permission_denied';
  readonly status = 403;
  readonly permission: string;

  constructor(permissionKey: string) {
    super('No tienes permiso para realizar esta acción.');
    this.name = 'StorePermissionError';
    this.permission = permissionKey;
  }
}

export function requireStorePermission(
  context: StorePermissionContext | unknown,
  permissionKey: StorePermission | string,
) {
  if (!hasStorePermission(context, permissionKey)) throw new StorePermissionError(String(permissionKey || ''));
  return permissionKey as StorePermission;
}
