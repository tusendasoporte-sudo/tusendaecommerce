export const STORE_PLAN_CODES = ['free', 'basic', 'premium'] as const;

export type StorePlanCode = (typeof STORE_PLAN_CODES)[number] | '';
export type StorePlanState = 'unconfigured' | 'active' | 'expiring' | 'critical' | 'expired';
export type StorePlanTone = 'neutral' | 'trial' | 'basic' | 'premium' | 'warning' | 'danger';
export type StorePlanIcon = 'clock' | 'badge' | 'crown' | 'expired' | 'info';
export type StorePlanDotTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export type StorePlanValues = {
  plan?: unknown;
  plan_started_at?: unknown;
  plan_expires_at?: unknown;
  plan_duration_months?: unknown;
  plan_is_permanent?: unknown;
  free_trial_used?: unknown;
};

export type StorePlanPresentation = {
  code: StorePlanCode;
  title: string;
  shortName: string;
  contextTitle: string;
  detail: string;
  compactDetail: string;
  contextDetail: string;
  state: StorePlanState;
  isPermanent: boolean;
  daysRemaining: number | null;
  expiresAt: string | null;
  tone: StorePlanTone;
  icon: StorePlanIcon;
  dotTone: StorePlanDotTone;
  ariaLabel: string;
};

const DAY_MS = 86_400_000;

const PLAN_COPY: Record<Exclude<StorePlanCode, ''>, {
  title: string;
  shortName: string;
  contextTitle: string;
  tone: StorePlanTone;
  icon: StorePlanIcon;
  dotTone: StorePlanDotTone;
}> = {
  free: {
    title: 'PRUEBA GRATUITA',
    shortName: 'Prueba',
    contextTitle: 'Prueba gratuita',
    tone: 'trial',
    icon: 'clock',
    dotTone: 'info',
  },
  basic: {
    title: 'PLAN BÁSICO',
    shortName: 'Básico',
    contextTitle: 'Plan Básico',
    tone: 'basic',
    icon: 'badge',
    dotTone: 'info',
  },
  premium: {
    title: 'PLAN PREMIUM',
    shortName: 'Premium',
    contextTitle: 'Plan Premium',
    tone: 'premium',
    icon: 'crown',
    dotTone: 'success',
  },
};

function text(value: unknown) {
  if (value === null || value === undefined) return '';
  try {
    return String(value).trim();
  } catch (_) {
    return '';
  }
}

function normalizePlanCode(value: unknown): StorePlanCode {
  const code = text(value).toLowerCase();
  return STORE_PLAN_CODES.includes(code as Exclude<StorePlanCode, ''>)
    ? code as Exclude<StorePlanCode, ''>
    : '';
}

function normalizeDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
  }

  const raw = text(value);
  if (!raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw)
    ? raw.replace(' ', 'T')
    : raw;
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function formatUtcDate(value: Date) {
  const day = String(value.getUTCDate()).padStart(2, '0');
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${value.getUTCFullYear()}`;
}

function pluralDays(days: number) {
  return `${days} ${days === 1 ? 'día' : 'días'}`;
}

function unconfigured(code: StorePlanCode = ''): StorePlanPresentation {
  return {
    code,
    title: 'PLAN SIN CONFIGURAR',
    shortName: 'Sin configurar',
    contextTitle: 'Plan sin configurar',
    detail: 'Contacta al administrador principal',
    compactDetail: 'Sin configurar',
    contextDetail: 'Requiere configuración',
    state: 'unconfigured',
    isPermanent: false,
    daysRemaining: null,
    expiresAt: null,
    tone: 'neutral',
    icon: 'info',
    dotTone: 'neutral',
    ariaLabel: 'Plan sin configurar, contacta al administrador principal',
  };
}

export function resolveStorePlanPresentation(
  storePlanValues: StorePlanValues | null | undefined,
  now: Date | string | number = new Date(),
): StorePlanPresentation {
  if (!storePlanValues || typeof storePlanValues !== 'object') return unconfigured();

  const code = normalizePlanCode(storePlanValues.plan);
  if (!code) return unconfigured();

  const copy = PLAN_COPY[code];
  const requestedPermanent = storePlanValues.plan_is_permanent === true;
  if (code === 'free' && requestedPermanent) return unconfigured(code);

  if (requestedPermanent) {
    return {
      code,
      title: copy.title,
      shortName: copy.shortName,
      contextTitle: copy.contextTitle,
      detail: 'Sin vencimiento',
      compactDetail: 'Permanente',
      contextDetail: 'Permanente',
      state: 'active',
      isPermanent: true,
      daysRemaining: null,
      expiresAt: null,
      tone: copy.tone,
      icon: copy.icon,
      dotTone: 'success',
      ariaLabel: `${copy.contextTitle}, permanente, sin vencimiento`,
    };
  }

  const rawExpiration = text(storePlanValues.plan_expires_at);
  const expiration = normalizeDate(storePlanValues.plan_expires_at);
  if (!rawExpiration || !expiration) return unconfigured(code);

  const current = normalizeDate(now);
  if (!current) return unconfigured(code);

  const difference = expiration.getTime() - current.getTime();
  const daysRemaining = difference <= 0 ? 0 : Math.ceil(difference / DAY_MS);
  const expiresAt = expiration.toISOString();

  if (daysRemaining === 0) {
    const expiredDate = formatUtcDate(expiration);
    const detail = `Venció el ${expiredDate}`;
    return {
      code,
      title: 'PLAN VENCIDO',
      shortName: 'Vencido',
      contextTitle: 'Plan vencido',
      detail,
      compactDetail: detail,
      contextDetail: detail,
      state: 'expired',
      isPermanent: false,
      daysRemaining: 0,
      expiresAt,
      tone: 'danger',
      icon: 'expired',
      dotTone: 'danger',
      ariaLabel: `Plan vencido, venció el ${expiredDate}`,
    };
  }

  const state: StorePlanState = daysRemaining <= 3
    ? 'critical'
    : daysRemaining <= 7
      ? 'expiring'
      : 'active';
  const detail = state === 'critical'
    ? `Vence en ${pluralDays(daysRemaining)}`
    : `${pluralDays(daysRemaining)} restantes`;
  const compactDetail = pluralDays(daysRemaining);
  const tone = state === 'critical' ? 'danger' : state === 'expiring' ? 'warning' : copy.tone;
  const dotTone = state === 'critical' ? 'danger' : state === 'expiring' ? 'warning' : copy.dotTone;
  const stateLabel = state === 'critical' ? 'estado crítico' : state === 'expiring' ? 'próximo a vencer' : 'activo';

  return {
    code,
    title: copy.title,
    shortName: copy.shortName,
    contextTitle: copy.contextTitle,
    detail,
    compactDetail,
    contextDetail: detail,
    state,
    isPermanent: false,
    daysRemaining,
    expiresAt,
    tone,
    icon: copy.icon,
    dotTone,
    ariaLabel: `${copy.contextTitle}, ${stateLabel}, ${detail.toLowerCase()}`,
  };
}
