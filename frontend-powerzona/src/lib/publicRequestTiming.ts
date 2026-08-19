export type PublicRequestTiming = Readonly<{
  securityDurationMs: number;
  renderDurationMs: number;
  totalDurationMs: number;
}>;

function safeDuration(value: number) {
  return Math.max(0, Number.isFinite(value) ? value : 0).toFixed(1);
}

export function appendPublicRequestTiming(response: Response, timing: PublicRequestTiming) {
  response.headers.append(
    'Server-Timing',
    [
      `pz-public-security;dur=${safeDuration(timing.securityDurationMs)}`,
      `pz-public-render;dur=${safeDuration(timing.renderDurationMs)}`,
      `pz-public-total;dur=${safeDuration(timing.totalDurationMs)}`,
    ].join(', '),
  );
  return response;
}
