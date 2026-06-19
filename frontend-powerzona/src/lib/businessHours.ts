export const HAVANA_TIME_ZONE = 'America/Havana';

export const CLOSED_MESSAGE_DEFAULT =
  'Estamos fuera de horario, pero puedes realizar tu pedido. Lo atenderemos en horario laboral.';

export const TEMPORARILY_CLOSED_MESSAGE_DEFAULT =
  'Estamos cerrados temporalmente. Vuelve pronto.';

export const DEFAULT_BUSINESS_HOURS = {
  monday: { enabled: false, open: '09:00', close: '18:00' },
  tuesday: { enabled: false, open: '09:00', close: '18:00' },
  wednesday: { enabled: false, open: '09:00', close: '18:00' },
  thursday: { enabled: false, open: '09:00', close: '18:00' },
  friday: { enabled: false, open: '09:00', close: '18:00' },
  saturday: { enabled: false, open: '09:00', close: '18:00' },
  sunday: { enabled: false, open: '09:00', close: '18:00' },
};

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEK_DAYS = [
  ['monday', 'Lunes'],
  ['tuesday', 'Martes'],
  ['wednesday', 'Miercoles'],
  ['thursday', 'Jueves'],
  ['friday', 'Viernes'],
  ['saturday', 'Sabado'],
  ['sunday', 'Domingo'],
];

export function parseBusinessHours(value: any) {
  if (!value) return DEFAULT_BUSINESS_HOURS;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : DEFAULT_BUSINESS_HOURS;
    } catch (_) {
      return DEFAULT_BUSINESS_HOURS;
    }
  }
  return value && typeof value === 'object' ? value : DEFAULT_BUSINESS_HOURS;
}

function isJsonLikeString(value: any) {
  const text = String(value || '').trim();
  return text.startsWith('{') || text.startsWith('[');
}

function legacyHoursText(value: any) {
  return typeof value === 'string' && value.trim() && !isJsonLikeString(value) ? value.trim() : '';
}

function formatTime(value: any) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

export function formatBusinessHours(settings: any) {
  const legacyText = legacyHoursText(settings?.business_hours);
  if (legacyText) return legacyText;

  const mode = settings?.business_hours_mode || 'always_available';
  if (mode === 'temporarily_closed') {
    return settings?.temporarily_closed_message || TEMPORARILY_CLOSED_MESSAGE_DEFAULT;
  }
  if (mode !== 'custom') return '';

  const hours = parseBusinessHours(settings?.business_hours);
  return WEEK_DAYS.map(([key, label]) => {
    const day = hours?.[key];
    if (!day || day.enabled !== true) return `${label}: Cerrado`;
    const open = formatTime(day.open);
    const close = formatTime(day.close);
    return open && close ? `${label}: ${open} - ${close}` : `${label}: Cerrado`;
  }).join('\n');
}

function timeToMinutes(value: any) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function havanaNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: HAVANA_TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dayIndex: weekdays[part('weekday')] ?? 0,
    minutes: Number(part('hour')) * 60 + Number(part('minute')),
  };
}

function dayIsOpen(day: any, minutes: number) {
  if (!day || day.enabled !== true) return false;
  const open = timeToMinutes(day.open);
  const close = timeToMinutes(day.close);
  if (open === null || close === null || open === close) return false;
  if (open < close) return minutes >= open && minutes < close;
  return minutes >= open || minutes < close;
}

export function getBusinessHoursStatus(settings: any, date = new Date()) {
  const mode = settings?.business_hours_mode || 'always_available';

  if (mode === 'temporarily_closed') {
    return {
      mode,
      isAvailable: false,
      isClosed: true,
      title: 'Cerrado temporalmente',
      message: settings?.temporarily_closed_message || TEMPORARILY_CLOSED_MESSAGE_DEFAULT,
      note: 'Nota: pedido realizado mientras la tienda estaba cerrada temporalmente.',
      allowOrders: false,
    };
  }

  if (mode !== 'custom') {
    return {
      mode: 'always_available',
      isAvailable: true,
      isClosed: false,
      title: '',
      message: '',
      note: '',
      allowOrders: true,
    };
  }

  const now = havanaNow(date);
  const hours = parseBusinessHours(settings?.business_hours);
  const today = hours[DAY_KEYS[now.dayIndex]];
  const isAvailable = dayIsOpen(today, now.minutes);

  return {
    mode,
    isAvailable,
    isClosed: !isAvailable,
    title: isAvailable ? 'Disponible ahora' : 'Fuera de horario',
    message: isAvailable ? '' : (settings?.closed_message || CLOSED_MESSAGE_DEFAULT),
    note: isAvailable ? '' : 'Nota: pedido realizado fuera de horario laboral.',
    allowOrders: settings?.allow_orders_when_closed !== false,
  };
}
