export const STORE_PLAN_CODES = ['free', 'basic', 'premium'] as const;

export type StorePlanCode = (typeof STORE_PLAN_CODES)[number] | '';
export type StorePlanState = 'unconfigured' | 'active' | 'expiring' | 'critical' | 'grace' | 'expired';
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
export const STORE_PAID_PLAN_GRACE_DAYS = 3;
export const STORE_PLAN_TIME_ZONE = 'America/Havana';

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

function havanaCivilParts(value: Date) {
  try {
    const parts = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
      timeZone: STORE_PLAN_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);
    const mapped: Record<string, number> = {};
    parts.forEach((part) => {
      if (part.type !== 'literal') mapped[part.type] = Number(part.value);
    });
    if (mapped.year && mapped.month && mapped.day) {
      return { year: mapped.year, month: mapped.month, day: mapped.day };
    }
  } catch (_) {}

  const year = value.getUTCFullYear();
  const marchFirst = new Date(Date.UTC(year, 2, 1));
  const secondSundayMarch = 8 + ((7 - marchFirst.getUTCDay()) % 7);
  const novemberFirst = new Date(Date.UTC(year, 10, 1));
  const firstSundayNovember = 1 + ((7 - novemberFirst.getUTCDay()) % 7);
  const dstStart = Date.UTC(year, 2, secondSundayMarch, 5, 0, 0);
  const dstEnd = Date.UTC(year, 10, firstSundayNovember, 5, 0, 0);
  const offsetHours = value.getTime() >= dstStart && value.getTime() < dstEnd ? -4 : -5;
  const shifted = new Date(value.getTime() + offsetHours * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function getHavanaCivilDateKey(value: unknown) {
  const date = normalizeDate(value);
  if (!date) return null;
  const parts = havanaCivilParts(date);
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function getHavanaCalendarDaysRemaining(expiresAt: unknown, now: unknown) {
  const expiration = normalizeDate(expiresAt);
  const current = normalizeDate(now);
  if (!expiration || !current) return null;
  const expirationParts = havanaCivilParts(expiration);
  const currentParts = havanaCivilParts(current);
  const expirationDay = Date.UTC(expirationParts.year, expirationParts.month - 1, expirationParts.day);
  const currentDay = Date.UTC(currentParts.year, currentParts.month - 1, currentParts.day);
  return Math.max(0, Math.floor((expirationDay - currentDay) / DAY_MS));
}

function formatHavanaDate(value: Date) {
  const parts = havanaCivilParts(value);
  return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}`;
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

  const daysRemaining = getHavanaCalendarDaysRemaining(expiration, current);
  if (daysRemaining === null) return unconfigured(code);
  const expiresAt = expiration.toISOString();

  if (expiration.getTime() <= current.getTime()) {
    const expiredDate = formatHavanaDate(expiration);
    const graceExpiration = code === 'free'
      ? null
      : new Date(expiration.getTime() + STORE_PAID_PLAN_GRACE_DAYS * DAY_MS);
    if (graceExpiration && current.getTime() < graceExpiration.getTime()) {
      const graceDaysRemaining = getHavanaCalendarDaysRemaining(graceExpiration, current) ?? 0;
      const graceDate = formatHavanaDate(graceExpiration);
      const detail = graceDaysRemaining === 0
        ? 'Último día para renovar'
        : `${pluralDays(graceDaysRemaining)} de gracia para renovar`;
      return {
        code,
        title: 'PERIODO DE GRACIA',
        shortName: 'En gracia',
        contextTitle: 'Suscripción en periodo de gracia',
        detail,
        compactDetail: detail,
        contextDetail: `Renueva antes del ${graceDate}`,
        state: 'grace',
        isPermanent: false,
        daysRemaining: 0,
        expiresAt,
        tone: 'warning',
        icon: 'clock',
        dotTone: 'warning',
        ariaLabel: `Suscripción en periodo de gracia, renueva antes del ${graceDate}`,
      };
    }
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
  const detail = daysRemaining === 0
    ? 'Vence hoy'
    : state === 'critical'
      ? `Vence en ${pluralDays(daysRemaining)}`
    : `${pluralDays(daysRemaining)} restantes`;
  const compactDetail = daysRemaining === 0 ? 'Vence hoy' : pluralDays(daysRemaining);
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
