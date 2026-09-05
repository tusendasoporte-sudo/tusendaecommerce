// Fixed, public metric names only: never include URLs, store IDs or customer data.
const HOME_STAGES = [
  'route', 'store', 'settings', 'categories', 'subcategories', 'products',
  'taxonomy', 'visuals', 'gifts', 'raffles', 'promotions', 'review-summary',
  'reviews', 'product-reviews', 'data',
] as const;
type HomeStage = typeof HOME_STAGES[number];
export type PublicHomeTiming = Partial<Record<HomeStage, number>>;

export function isPublicStoreHome(pathname: string) {
  return /^\/t\/[^/]+\/?$/.test(pathname);
}

export async function measurePublicHome<T>(
  timing: PublicHomeTiming | undefined,
  stage: HomeStage,
  operation: () => T | Promise<T>,
): Promise<T> {
  if (!timing) return operation();
  const start = performance.now();
  try { return await operation(); }
  finally { timing[stage] = (timing[stage] || 0) + performance.now() - start; }
}

export function publicHomeTimingHeader(timing: PublicHomeTiming) {
  return HOME_STAGES.flatMap(stage => {
    const value = timing[stage];
    return typeof value === 'number' && Number.isFinite(value)
      ? [`pz-home-${stage};dur=${Math.max(0, value).toFixed(1)}`] : [];
  }).join(', ');
}

// Astro can return a Response before its nested component frontmatter finishes.
// Read only its first chunk, not the complete HTML, to include pre-content work
// in the headers. Forward every byte, the remaining stream and cancellation.
export async function appendPublicHomeTiming(
  response: Response,
  timing: PublicHomeTiming,
  requestStartedAt: number,
  method = 'GET',
) {
  if (method !== 'GET' || response.status !== 200 || !response.body
    || !response.headers.get('Content-Type')?.toLowerCase().includes('text/html')) return response;

  const reader = response.body.getReader();
  let first: ReadableStreamReadResult<Uint8Array>;
  try { first = await reader.read(); }
  catch (error) { reader.releaseLock(); throw error; }
  const firstChunkMs = Math.max(0, performance.now() - requestStartedAt);
  const headers = new Headers(response.headers);
  const stages = publicHomeTimingHeader(timing);
  headers.append('Server-Timing', [stages, `pz-home-first-chunk;dur=${firstChunkMs.toFixed(1)}`].filter(Boolean).join(', '));

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      if (first.done) { controller.close(); reader.releaseLock(); }
      else controller.enqueue(first.value);
    },
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) { controller.close(); reader.releaseLock(); }
        else controller.enqueue(next.value);
      } catch (error) { controller.error(error); reader.releaseLock(); }
    },
    async cancel(reason) {
      try { await reader.cancel(reason); } finally { reader.releaseLock(); }
    },
  });
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}
