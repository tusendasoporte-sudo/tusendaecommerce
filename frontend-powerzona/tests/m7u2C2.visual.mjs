import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(SCRIPT_DIR, '..');
const REPOSITORY_DIR = path.resolve(FRONTEND_DIR, '..');
const BACKEND_DIR = path.join(REPOSITORY_DIR, 'backend-powerzona');
const HOOKS_DIR = path.join(BACKEND_DIR, 'pb_hooks');
const MIGRATIONS_DIR = path.join(BACKEND_DIR, 'pb_migrations');
const POCKETBASE_EXE = path.join(BACKEND_DIR, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');
const ASTRO_CLI = path.join(FRONTEND_DIR, 'node_modules', 'astro', 'bin', 'astro.mjs');
const TEMP_ROOT = path.join(BACKEND_DIR, '.tmp');
const IS_C2F1_VISUAL = process.env.PZ_C2F1_VISUAL === '1';
const EVIDENCE_ID = IS_C2F1_VISUAL ? 'M7U2-C2F1' : 'M7U2-C2';
const TEMP_PREFIX = IS_C2F1_VISUAL ? 'M7U2C2F1QA_VISUAL_' : 'M7U2C2QA_VISUAL_';
const EVIDENCE_DIR = path.join(REPOSITORY_DIR, 'docs', 'tusenda84', 'reportes', 'evidencias', EVIDENCE_ID);
const ASTRO_STATE_DIR = path.join(FRONTEND_DIR, '.astro');
const LOOPBACK = '127.0.0.1';
const SCREENSHOTS = Object.freeze(IS_C2F1_VISUAL ? [
  '01-correo-visible-pc.png',
  '02-correo-visible-movil.png',
  '03-dialogo-correo-copiar.png',
  '04-selector-motivos.png',
  '05-motivo-otro.png',
  '06-eliminacion-exitosa.png',
  '07-actividad-motivo.png',
] : [
  '01-actividad-equipo-pc.png',
  '02-actividad-equipo-movil.png',
  '03-filtros-actividad.png',
  '04-detalle-cambio.png',
  '05-requiere-correccion.png',
  '06-reporte-usuario.png',
  '07-mi-actividad.png',
  '08-eliminar-usuario-dialogo.png',
  '09-usuario-eliminado-listado.png',
  '10-evento-usuario-eliminado.png',
  '11-producto-ultima-modificacion.png',
  '12-pedido-ultima-modificacion.png',
  '13-vencimiento-ultima-modificacion.png',
  '14-ajustes-ultima-modificacion.png',
]);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const randomPassword = () => `Qa-${randomBytes(24).toString('base64url')}!7a`;
const randomDeviceToken = () => {
  const token = randomBytes(32).toString('base64url');
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  return token;
};

async function pollValue(probe, predicate, label, timeout = 30000) {
  const deadline = Date.now() + timeout;
  let lastValue;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      lastValue = await probe();
      lastError = null;
      if (predicate(lastValue)) return lastValue;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  const detail = lastError ? (lastError.stack || lastError.message) : JSON.stringify(lastValue);
  throw new Error(`${label}; ultimo valor: ${detail}`);
}

function assertOwnedEvidenceDirectory(directory = EVIDENCE_DIR) {
  const expected = path.resolve(REPOSITORY_DIR, 'docs', 'tusenda84', 'reportes', 'evidencias', EVIDENCE_ID);
  assert.equal(path.resolve(directory), expected, `directorio de evidencias fuera de alcance: ${directory}`);
  assert.equal(path.basename(directory), EVIDENCE_ID);
}

function assertOwnedTempDirectory(directory) {
  const resolved = path.resolve(directory);
  assert.equal(path.dirname(resolved), path.resolve(TEMP_ROOT), `directorio temporal fuera de alcance: ${resolved}`);
  assert.match(
    path.basename(resolved),
    IS_C2F1_VISUAL ? /^M7U2C2F1QA_VISUAL_[A-Za-z0-9_-]+$/ : /^M7U2C2QA_VISUAL_[A-Za-z0-9_-]+$/,
  );
}

function resetEvidenceDirectory() {
  assertOwnedEvidenceDirectory();
  fs.rmSync(EVIDENCE_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

async function freeLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, LOOPBACK, () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function pocketBaseFlags(dataDirectory, migrationsDirectory) {
  return [
    `--dir=${dataDirectory}`,
    `--hooksDir=${HOOKS_DIR}`,
    `--migrationsDir=${migrationsDirectory}`,
    '--hooksWatch=false',
    '--hooksPool=2',
    '--automigrate=true',
    '--indexFallback=false',
  ];
}

function bootstrapSuperuser(dataDirectory, migrationsDirectory, email, password) {
  const result = spawnSync(
    POCKETBASE_EXE,
    ['superuser', 'create', email, password, ...pocketBaseFlags(dataDirectory, migrationsDirectory)],
    { cwd: BACKEND_DIR, encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
  );
  assert.equal(
    result.status,
    0,
    `bootstrap superuser fallo (exit=${result.status}): ${result.error || ''}\n${result.stdout || ''}\n${result.stderr || ''}`,
  );
}

function startRuntime(command, args, options) {
  let output = '';
  let spawnError = null;
  const child = spawn(command, args, {
    ...options,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const capture = (chunk) => { output = `${output}${String(chunk)}`.slice(-50000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.on('error', (error) => {
    spawnError = error;
    capture(`\nspawn error: ${error.stack || error.message}`);
  });
  return { child, output: () => output, spawnError: () => spawnError };
}

async function waitForHttp(runtime, url, label, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (runtime.spawnError()) throw runtime.spawnError();
    if (runtime.child.exitCode !== null) {
      throw new Error(`${label} termino antes de iniciar (exit=${runtime.child.exitCode}).\n${runtime.output()}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.status >= 200 && response.status < 500) return;
    } catch (_) {}
    await sleep(150);
  }
  throw new Error(`${label} no quedo listo en ${timeout} ms.\n${runtime.output()}`);
}

async function stopRuntime(runtime, label) {
  const hasExited = () => runtime.child.exitCode !== null || runtime.child.signalCode !== null;
  if (!runtime || hasExited()) return;
  const exited = new Promise((resolve) => runtime.child.once('exit', resolve));
  runtime.child.kill('SIGTERM');
  const graceful = await Promise.race([exited.then(() => true), sleep(5000).then(() => false)]);
  if (!graceful && !hasExited()) {
    runtime.child.kill('SIGKILL');
    await Promise.race([exited, sleep(5000)]);
  }
  assert.equal(hasExited(), true, `${label} no termino.\n${runtime.output()}`);
}

async function apiRequest(baseUrl, route, { token = '', body, headers = {}, method = body === undefined ? 'GET' : 'POST' } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) {}
  return { status: response.status, data, raw, headers: Object.fromEntries(response.headers.entries()) };
}

function assertStatus(result, expected, label) {
  const accepted = Array.isArray(expected) ? expected : [expected];
  assert.ok(accepted.includes(result.status), `${label}: HTTP ${result.status}; esperados ${accepted.join('/')}\n${result.raw}`);
}

function dateOnlyAfter(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function seedFixtures(baseUrl, identity) {
  const request = (route, options) => apiRequest(baseUrl, route, options);
  const superAuth = await request('/api/collections/_superusers/auth-with-password', {
    body: { identity: identity.superEmail, password: identity.superPassword },
  });
  assertStatus(superAuth, 200, 'autenticar superuser visual');
  const superToken = superAuth.data.token;

  async function create(collection, body) {
    const result = await request(`/api/collections/${collection}/records`, { token: superToken, body });
    assertStatus(result, [200, 201], `crear ${collection}`);
    return result.data;
  }

  async function login(email, password, device = '') {
    const result = await request('/api/collections/users/auth-with-password', {
      body: { identity: email, password },
      headers: device ? { 'X-PZ-Admin-Device': device } : {},
    });
    assertStatus(result, 200, `login ${email}`);
    return result.data;
  }

  const store = await create('stores', {
    name: `${identity.prefix} Tienda visual`,
    slug: identity.slug,
    status: 'active',
    plan: 'premium',
    plan_started_at: new Date().toISOString(),
    plan_expires_at: '',
    plan_duration_months: 0,
    plan_is_permanent: true,
  });
  const master = await create('users', {
    email: identity.masterEmail,
    password: identity.masterPassword,
    passwordConfirm: identity.masterPassword,
    display_name: `${identity.prefix} Master`,
    role: 'master_admin',
    status: 'active',
    emailVisibility: true,
  });
  const primary = await create('users', {
    store: store.id,
    email: identity.primaryEmail,
    password: identity.primaryPassword,
    passwordConfirm: identity.primaryPassword,
    display_name: identity.primaryName,
    role: 'store_admin',
    status: 'active',
    emailVisibility: true,
  });

  const masterAuth = await login(master.email, identity.masterPassword);
  const plan = await request('/api/pz/master/store-plan/change', {
    token: masterAuth.token,
    body: {
      store_id: store.id,
      plan: 'premium',
      is_permanent: true,
      duration_months: 0,
      reason: `${identity.prefix} activar premium para QA visual`,
      confirm_expiration_cleanup: false,
    },
  });
  assertStatus(plan, 200, 'activar Premium visual');
  const assigned = await request('/api/pz/master/primary-admin/assign', {
    token: masterAuth.token,
    body: {
      store_id: store.id,
      user_id: primary.id,
      reason: `${identity.prefix} asignar principal para QA visual`,
    },
  });
  assertStatus(assigned, 200, 'asignar principal visual');

  const primaryAuth = await login(primary.email, identity.primaryPassword, identity.primaryDevice);
  const primaryToken = primaryAuth.token;
  const currency = await create('currencies', {
    store: store.id,
    code: 'USD',
    name: `${identity.prefix} Dolar`,
    symbol: '$',
    exchange_rate: 1,
    active: true,
    is_default: true,
  });
  const settings = await create('settings', {
    store: store.id,
    stored_name: `${identity.prefix} Tienda visual`,
    store_name: `${identity.prefix} Tienda visual`,
    whatsapp_number: '+15551234567',
    default_currency: currency.id,
    active: true,
    order_prefix: 'QA',
    notifications_enabled: true,
    notify_new_order: true,
  });
  const product = await create('products', {
    store: store.id,
    name: identity.productName,
    slug: `${identity.slug}-creatina`,
    active: true,
    base_price_usd: 25,
    regular_price_usd: 25,
    stock: 20,
    track_stock: true,
    has_variations: false,
    delivery_mode: 'both',
  });

  const memberCreate = await request('/api/pz/store/team/create', {
    token: primaryToken,
    body: {
      email: identity.memberEmail,
      display_name: identity.memberName,
      phone: '+1 555 0199',
      template_code: 'custom',
      permissions: ['catalog.view', 'catalog.products.edit', 'catalog.products.stock'],
      reason: `${identity.prefix} crear responsable de catalogo`,
    },
  });
  assertStatus(memberCreate, 200, 'crear integrante visual');
  const member = memberCreate.data.user;
  const temporaryPassword = memberCreate.data.temporary_password;
  assert.ok(String(temporaryPassword || '').length >= 20, 'credencial temporal visual ausente');
  const memberAuth = await login(member.email, temporaryPassword, identity.memberDevice);
  const memberUpdate = await request(`/api/collections/products/records/${product.id}`, {
    token: memberAuth.token,
    method: 'PATCH',
    headers: { 'X-Request-ID': `${identity.prefix}-member-product` },
    body: { stock: 18 },
  });
  assertStatus(memberUpdate, 200, 'integrante modifica producto');

  const primaryUpdate = await request(`/api/collections/products/records/${product.id}`, {
    token: primaryToken,
    method: 'PATCH',
    headers: { 'X-Request-ID': `${identity.prefix}-primary-product` },
    body: { stock: 17, expiration_date: dateOnlyAfter(18) },
  });
  assertStatus(primaryUpdate, 200, 'principal modifica producto');

  const checkout = await request('/api/pz/checkout/orders', {
    body: {
      store_id: store.id,
      idempotency_key: `${identity.prefix}_checkout_${identity.suffix}`,
      customer_name: `${identity.prefix} Cliente`,
      customer_phone: '+1 555 123 4567',
      currency_id: currency.id,
      delivery_method: 'pickup',
      items: [{ product_id: product.id, quantity: 1 }],
    },
  });
  assertStatus(checkout, 200, 'crear pedido visual');
  const order = checkout.data.order;
  assert.ok(order?.id, 'pedido visual sin id');
  const transition = await request(`/api/pz/admin/orders/${order.id}/transition`, {
    token: primaryToken,
    body: { status: 'confirmed' },
  });
  assertStatus(transition, 200, 'confirmar pedido visual');

  const settingsUpdate = await request(`/api/collections/settings/records/${settings.id}`, {
    token: primaryToken,
    method: 'PATCH',
    headers: { 'X-Request-ID': `${identity.prefix}-primary-settings` },
    body: { notifications_enabled: false },
  });
  assertStatus(settingsUpdate, 200, 'principal modifica ajustes');
  const readableSettings = await request(
    `/api/collections/settings/records?${new URLSearchParams({ page: '1', perPage: '10', filter: `store = "${store.id}"` })}`,
    { token: primaryToken },
  );
  assertStatus(readableSettings, 200, 'principal puede leer ajustes');
  assert.ok(readableSettings.data.items.some((record) => record.id === settings.id), 'ajustes visuales no son legibles por principal');

  const memberEvents = await request('/api/pz/store/activity/list', {
    token: primaryToken,
    body: {
      actor_id: member.id,
      module: 'catalog',
      action: 'product_updated',
      resource_type: 'product',
      resource_id: product.id,
      page: 1,
      per_page: 50,
    },
  });
  assertStatus(memberEvents, 200, 'validar evento del integrante');
  assert.ok(memberEvents.data.events.length >= 1, 'no se genero actividad del integrante');

  return {
    store,
    primary,
    primaryAuth,
    primaryToken,
    member,
    temporaryPassword,
    product,
    order,
    settings,
    memberActivityId: memberEvents.data.events[0].id,
  };
}

async function assertNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body?.scrollWidth || 0,
  }));
  assert.ok(
    dimensions.document <= dimensions.viewport + 1 && dimensions.body <= dimensions.viewport + 1,
    `${label}: overflow horizontal ${JSON.stringify(dimensions)}`,
  );
}

async function assertActivityPrivacy(root, secrets, label) {
  const corpus = await root.innerText();
  for (const secret of secrets.filter(Boolean)) {
    assert.equal(corpus.includes(secret), false, `${label}: dato sensible visible`);
  }
  assert.equal(/\{\s*"(?:token|record|events|items)"\s*:/.test(corpus), false, `${label}: JSON crudo visible`);
}

async function center(locator) {
  await locator.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await locator.waitFor({ state: 'visible' });
}

async function waitForLoadedLastModification(locator, label) {
  await locator.waitFor({ state: 'visible', timeout: 30000 });
  await pollValue(
    () => locator.getAttribute('data-last-modification-loaded'),
    (value) => value === 'true',
    `${label}: ultima modificacion no termino de cargar`,
  );
  const text = (await locator.innerText()).trim();
  assert.match(text, /Editado por|Modificado|Sin historial/i, `${label}: metadata inutil: ${text}`);
  return text;
}

async function runBrowser(frontendUrl, pocketBaseUrl, fixtures, identity) {
  const browser = await chromium.launch({ headless: true });
  let context = null;
  const pageErrors = [];
  const serverErrors = [];
  const lastModifiedRequests = [];
  const settingsTraffic = [];
  try {
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      locale: 'es-ES',
      colorScheme: 'light',
      reducedMotion: 'reduce',
      permissions: IS_C2F1_VISUAL ? ['clipboard-read', 'clipboard-write'] : [],
    });
    await context.addCookies([
      {
        name: 'pb_auth',
        value: encodeURIComponent(JSON.stringify({ token: fixtures.primaryAuth.token, record: fixtures.primaryAuth.record })),
        url: frontendUrl,
        sameSite: 'Lax',
      },
      { name: 'pz_admin_device', value: identity.primaryDevice, url: frontendUrl, sameSite: 'Lax' },
    ]);
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', (error) => pageErrors.push(error.stack || error.message));
    page.on('response', (response) => {
      if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
      if (response.url().includes('/api/collections/settings/records')) {
        settingsTraffic.push(`${response.status()} ${response.request().method()} ${new URL(response.url()).pathname}`);
      }
    });
    page.on('request', (request) => {
      if (request.url().startsWith(`${pocketBaseUrl}/api/pz/store/activity/last-modified`)) {
        let payload = null;
        try { payload = request.postDataJSON(); } catch (_) {}
        lastModifiedRequests.push({ url: request.url(), payload });
      }
    });

    const screenshot = async (name) => {
      assert.ok(SCREENSHOTS.includes(name), `captura no autorizada: ${name}`);
      await page.screenshot({ path: path.join(EVIDENCE_DIR, name), fullPage: false, animations: 'disabled' });
    };
    const goto = async (route, readySelector) => {
      const response = await page.goto(`${frontendUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      assert.ok(response && response.status() < 400, `${route}: HTTP ${response?.status()}`);
      assert.equal(new URL(page.url()).pathname.startsWith('/login'), false, `${route}: redireccion inesperada a login`);
      if (readySelector) await page.locator(readySelector).first().waitFor({ state: 'visible' });
    };
    const activityRows = (root) => root.locator('[data-activity-event-ref]');
    const waitActivity = async (root, label) => {
      await root.locator('[data-activity-refresh]').waitFor({ state: 'visible' });
      await pollValue(
        () => root.locator('[data-activity-refresh]').getAttribute('aria-busy'),
        (value) => value !== 'true',
        `${label}: actividad sigue cargando`,
      );
      assert.ok(await activityRows(root).count() >= 1, `${label}: sin eventos`);
    };

    if (IS_C2F1_VISUAL) {
      const teamPath = `/t/${encodeURIComponent(identity.slug)}/admin/team`;
      await goto(teamPath, '[data-store-team-root]');
      const usersRoot = page.locator('[data-store-team-root]');
      const memberRow = usersRoot.locator('article.store-team-row[data-user-ref]').filter({ hasText: identity.memberName });
      await memberRow.waitFor({ state: 'visible' });
      const visibleEmail = memberRow.locator('.store-team-row__email');
      assert.equal((await visibleEmail.innerText()).trim(), identity.memberEmail);
      assert.equal((await visibleEmail.innerText()).includes('*'), false, 'correo PC permanece enmascarado');
      await assertNoHorizontalOverflow(page, 'correo completo PC');
      await screenshot('01-correo-visible-pc.png');

      await page.setViewportSize({ width: 390, height: 844 });
      await center(memberRow);
      assert.equal((await visibleEmail.innerText()).trim(), identity.memberEmail);
      await assertNoHorizontalOverflow(page, 'correo completo movil 390');
      const mobileNav = page.locator('.pz-admin-mobile-bottom-nav');
      await mobileNav.waitFor({ state: 'visible' });
      assert.equal(await mobileNav.locator('.pz-admin-mobile-bottom-nav__link').count(), 4);
      await screenshot('02-correo-visible-movil.png');

      await page.setViewportSize({ width: 1440, height: 900 });
      await memberRow.locator('[data-team-menu-toggle]').click();
      const deleteAction = usersRoot.locator('[data-team-floating-menu] [data-team-action="delete"]');
      await deleteAction.waitFor({ state: 'visible' });
      await deleteAction.click();
      const deleteDialog = usersRoot.locator('[data-team-delete-dialog]');
      await deleteDialog.waitFor({ state: 'visible' });
      assert.equal((await deleteDialog.locator('[data-team-delete-email-value]').innerText()).trim(), identity.memberEmail);
      const confirmationInput = deleteDialog.locator('#store-team-delete-email');
      assert.equal(await confirmationInput.inputValue(), '', 'copiar no debe autocompletar la confirmacion');
      await deleteDialog.locator('[data-team-delete-email-copy]').click();
      await pollValue(
        () => deleteDialog.locator('[data-team-delete-copy-feedback]').innerText(),
        (value) => value.includes('Correo copiado'),
        'feedback de copia no aparecio',
      );
      assert.equal(await confirmationInput.inputValue(), '', 'la confirmacion cambio al copiar');
      await screenshot('03-dialogo-correo-copiar.png');

      const reasonSelect = deleteDialog.locator('#store-team-delete-reason');
      assert.equal(await reasonSelect.locator('option').count(), 9, 'selector debe contener placeholder y ocho motivos');
      await reasonSelect.selectOption('access_no_longer_needed');
      await confirmationInput.fill(identity.memberEmail);
      assert.equal(await deleteDialog.locator('[data-team-delete-submit]').isEnabled(), true);
      assert.equal(await deleteDialog.locator('[data-team-delete-detail-field]').isHidden(), true);
      await screenshot('04-selector-motivos.png');

      await page.setViewportSize({ width: 412, height: 915 });
      await reasonSelect.selectOption('other');
      const detailField = deleteDialog.locator('[data-team-delete-detail-field]');
      const detailInput = deleteDialog.locator('#store-team-delete-detail');
      await detailField.waitFor({ state: 'visible' });
      assert.equal(await deleteDialog.locator('[data-team-delete-submit]').isDisabled(), true);
      await detailInput.fill('1234567');
      assert.equal(await deleteDialog.locator('[data-team-delete-submit]').isDisabled(), true);
      await detailInput.fill('Cuenta sustituida por otra identidad de acceso.');
      assert.equal(await deleteDialog.locator('[data-team-delete-submit]').isEnabled(), true);
      await assertNoHorizontalOverflow(page, 'dialogo Otro movil 412');
      await center(deleteDialog);
      const mobileDialogBounds = await deleteDialog.boundingBox();
      const mobileSubmitBounds = await deleteDialog.locator('[data-team-delete-submit]').boundingBox();
      assert.ok(mobileDialogBounds && mobileDialogBounds.y >= 0 && mobileDialogBounds.y + mobileDialogBounds.height <= 916,
        `dialogo movil fuera del viewport: ${JSON.stringify(mobileDialogBounds)}`);
      assert.ok(mobileSubmitBounds && mobileSubmitBounds.y >= 0 && mobileSubmitBounds.y + mobileSubmitBounds.height <= 916,
        `accion de eliminacion cubierta: ${JSON.stringify(mobileSubmitBounds)}`);
      await screenshot('05-motivo-otro.png');

      await reasonSelect.selectOption('access_no_longer_needed');
      assert.equal(await detailField.isHidden(), true);
      assert.equal(await detailInput.inputValue(), '', 'cambiar desde Otro debe limpiar el detalle');
      await page.setViewportSize({ width: 1440, height: 900 });
      await deleteDialog.locator('[data-team-delete-submit]').click();
      await deleteDialog.waitFor({ state: 'hidden' });
      await pollValue(() => memberRow.count(), (value) => value === 0, 'usuario eliminado permanece visible');
      const toast = usersRoot.locator('[data-team-toast]');
      await toast.waitFor({ state: 'visible' });
      assert.match(await toast.innerText(), /Usuario eliminado permanentemente/i);
      await screenshot('06-eliminacion-exitosa.png');
      await toast.waitFor({ state: 'hidden', timeout: 6000 });

      await usersRoot.locator('[data-team-tab="activity"]').click();
      const deletionActivity = usersRoot.locator('[data-store-activity-root][data-activity-mode="team"]');
      await waitActivity(deletionActivity, 'actividad C2F1 tras eliminacion');
      const deletionRow = activityRows(deletionActivity)
        .filter({ hasText: identity.memberName })
        .filter({ hasText: 'Acceso ya no necesario' })
        .first();
      await deletionRow.waitFor({ state: 'visible' });
      assert.match(await deletionRow.innerText(), /Usuario eliminado/i);
      await assertActivityPrivacy(
        deletionActivity,
        [identity.memberEmail, fixtures.temporaryPassword, fixtures.primaryAuth.token],
        'actividad C2F1',
      );
      await center(deletionRow);
      await screenshot('07-actividad-motivo.png');

      assert.deepEqual(pageErrors, [], `errores de pagina:\n${pageErrors.join('\n')}`);
      assert.deepEqual(serverErrors, [], `respuestas 5xx:\n${serverErrors.join('\n')}`);
      return;
    }

    const teamPath = `/t/${encodeURIComponent(identity.slug)}/admin/team`;
    await goto(`${teamPath}?tab=activity`, '[data-store-team-root]');
    const teamRoot = page.locator('[data-store-team-root]');
    const teamActivity = teamRoot.locator('[data-store-activity-root][data-activity-mode="team"]');
    await waitActivity(teamActivity, 'actividad de equipo PC');
    await assertActivityPrivacy(
      teamActivity,
      [identity.memberEmail, identity.primaryEmail, fixtures.temporaryPassword, fixtures.primaryAuth.token],
      'actividad de equipo PC',
    );
    await assertNoHorizontalOverflow(page, 'actividad de equipo PC');
    await screenshot('01-actividad-equipo-pc.png');

    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoHorizontalOverflow(page, 'actividad de equipo movil 390');
    const mobileNav = page.locator('.pz-admin-mobile-bottom-nav');
    await mobileNav.waitFor({ state: 'visible' });
    assert.equal(await mobileNav.locator('.pz-admin-mobile-bottom-nav__link').count(), 4, 'navegacion movil debe tener cuatro destinos');
    await screenshot('02-actividad-equipo-movil.png');

    await page.setViewportSize({ width: 412, height: 915 });
    const filterForm = teamActivity.locator('[data-activity-filter-form]');
    await filterForm.locator('select[name="module"]').selectOption('catalog');
    await filterForm.locator('input[name="action"]').fill('product_updated');
    await filterForm.locator('select[name="severity"]').selectOption('critical');
    await filterForm.locator('select[name="review_status"]').selectOption('pending');
    await filterForm.locator('input[name="search"]').fill(identity.productName);
    await filterForm.locator('button[type="submit"]').click();
    await waitActivity(teamActivity, 'actividad filtrada');
    await assertNoHorizontalOverflow(page, 'filtros actividad 412');
    await center(teamActivity.locator('[data-activity-filter-details]'));
    await screenshot('03-filtros-actividad.png');

    await page.setViewportSize({ width: 1440, height: 900 });
    const filteredEvent = activityRows(teamActivity).first();
    await filteredEvent.locator('[data-activity-view-change]').click();
    const detailDialog = teamActivity.locator('[data-activity-detail-dialog]');
    await detailDialog.waitFor({ state: 'visible' });
    await pollValue(
      async () => (await detailDialog.locator('[data-activity-detail-changes]').innerText()).trim().length,
      (value) => value > 0,
      'detalle no cargo cambios',
    );
    assert.match(await detailDialog.innerText(), /Campos modificados|Resumen/i);
    await screenshot('04-detalle-cambio.png');

    await detailDialog.locator('[data-activity-detail-correction]').click();
    const correctionDialog = teamActivity.locator('[data-activity-correction-dialog]');
    await correctionDialog.waitFor({ state: 'visible' });
    const correctionNote = `${identity.prefix} verificar y corregir el stock registrado`;
    await correctionDialog.locator('textarea[name="note"]').fill(correctionNote);
    await screenshot('05-requiere-correccion.png');
    await correctionDialog.locator('[data-activity-correction-submit]').click();
    await correctionDialog.waitFor({ state: 'hidden' });
    await pollValue(
      async () => (await teamActivity.innerText()).includes('Requiere correcci'),
      (value) => value === true,
      'estado requiere correccion no se reflejo',
    );
    if (await detailDialog.isVisible()) await detailDialog.locator('[data-activity-dialog-close]').last().click();

    await goto(`${teamPath}/${encodeURIComponent(fixtures.member.id)}/activity`, '[data-store-activity-root][data-activity-mode="user"]');
    const userActivity = page.locator('[data-store-activity-root][data-activity-mode="user"]');
    await waitActivity(userActivity, 'reporte individual');
    assert.match(await userActivity.locator('[data-activity-title]').innerText(), new RegExp(identity.memberName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await assertActivityPrivacy(userActivity, [identity.memberEmail, fixtures.temporaryPassword, fixtures.primaryAuth.token], 'reporte individual');
    await screenshot('06-reporte-usuario.png');

    await goto(`/t/${encodeURIComponent(identity.slug)}/admin/account#my-activity`, '#my-activity [data-store-activity-root]');
    const selfActivity = page.locator('#my-activity [data-store-activity-root]');
    await waitActivity(selfActivity, 'mi actividad');
    await center(selfActivity);
    await assertActivityPrivacy(selfActivity, [identity.memberEmail, identity.primaryEmail, fixtures.temporaryPassword, fixtures.primaryAuth.token], 'mi actividad');
    await screenshot('07-mi-actividad.png');

    await goto(teamPath, '[data-store-team-root]');
    const usersRoot = page.locator('[data-store-team-root]');
    const memberRow = usersRoot.locator('article.store-team-row[data-user-ref]').filter({ hasText: identity.memberName });
    await memberRow.waitFor({ state: 'visible' });
    await memberRow.locator('[data-team-menu-toggle]').click();
    const deleteAction = usersRoot.locator('[data-team-floating-menu] [data-team-action="delete"]');
    await deleteAction.waitFor({ state: 'visible' });
    await deleteAction.click();
    const deleteDialog = usersRoot.locator('[data-team-delete-dialog]');
    await deleteDialog.waitFor({ state: 'visible' });
    await deleteDialog.locator('#store-team-delete-email').fill(identity.memberEmail);
    await deleteDialog.locator('#store-team-delete-reason').selectOption('access_no_longer_needed');
    assert.match(await deleteDialog.innerText(), /Eliminar usuario permanentemente|no permite restaurar/i);
    await screenshot('08-eliminar-usuario-dialogo.png');

    await deleteDialog.locator('[data-team-delete-submit]').click();
    await deleteDialog.waitFor({ state: 'hidden' });
    await pollValue(
      () => memberRow.count(),
      (value) => value === 0,
      'el usuario eliminado permanece en Mi equipo',
    );
    const toast = usersRoot.locator('[data-team-toast]');
    await toast.waitFor({ state: 'visible' });
    assert.match(await toast.locator('[data-team-toast-message]').innerText(), /eliminado permanentemente/i);
    await screenshot('09-usuario-eliminado-listado.png');

    await usersRoot.locator('[data-team-tab="activity"]').click();
    const deletedActivity = usersRoot.locator('[data-store-activity-root][data-activity-mode="team"]');
    await waitActivity(deletedActivity, 'actividad tras eliminacion');
    const actorFilter = deletedActivity.locator('select[name="user_ref"]');
    const deletedOption = actorFilter.locator('option').filter({ hasText: identity.memberName }).first();
    await deletedOption.waitFor({ state: 'attached' });
    const deletedRef = await deletedOption.getAttribute('value');
    assert.ok(deletedRef, 'actor eliminado sin referencia opaca');
    await actorFilter.selectOption(deletedRef);
    await deletedActivity.locator('select[name="module"]').selectOption('catalog');
    await deletedActivity.locator('input[name="action"]').fill('product_updated');
    await deletedActivity.locator('select[name="severity"]').selectOption('critical');
    await deletedActivity.locator('select[name="review_status"]').selectOption('');
    await deletedActivity.locator('input[name="search"]').fill('');
    await deletedActivity.locator('[data-activity-filter-form] button[type="submit"]').click();
    await waitActivity(deletedActivity, 'actividad del usuario eliminado');
    assert.match(await activityRows(deletedActivity).first().innerText(), /Usuario eliminado/i);
    await assertActivityPrivacy(deletedActivity, [identity.memberEmail, fixtures.temporaryPassword, fixtures.primaryAuth.token], 'actividad eliminada');
    await screenshot('10-evento-usuario-eliminado.png');

    const verifyOneBatch = async (start, label, expectedResource) => {
      await sleep(250);
      const calls = lastModifiedRequests.slice(start);
      assert.equal(calls.length, 1, `${label}: se esperaban 1 request batch last-modified y hubo ${calls.length}`);
      const resources = calls[0].payload?.resources;
      assert.ok(Array.isArray(resources) && resources.length >= 1 && resources.length <= 100, `${label}: payload batch invalido`);
      if (expectedResource) {
        assert.ok(
          resources.some((resource) => resource?.type === expectedResource.type && resource?.id === expectedResource.id),
          `${label}: el batch no incluyo ${expectedResource.type}:${expectedResource.id}`,
        );
      }
    };

    let batchStart = lastModifiedRequests.length;
    await goto(`/t/${encodeURIComponent(identity.slug)}/admin/products`, `article.product-row[data-product-id="${fixtures.product.id}"]`);
    const productRow = page.locator(`article.product-row[data-product-id="${fixtures.product.id}"]`);
    const productMeta = productRow.locator('[data-pz-last-modification][data-resource-type="product"]');
    const productMetaText = await waitForLoadedLastModification(productMeta, 'producto');
    assert.match(productMetaText, new RegExp(identity.primaryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await center(productRow);
    await verifyOneBatch(batchStart, 'productos', { type: 'product', id: fixtures.product.id });
    await screenshot('11-producto-ultima-modificacion.png');

    batchStart = lastModifiedRequests.length;
    await goto(`/t/${encodeURIComponent(identity.slug)}/admin/orders`, `article.order-table-row[data-order-id="${fixtures.order.id}"]`);
    const orderRow = page.locator(`article.order-table-row[data-order-id="${fixtures.order.id}"]`);
    const orderMeta = orderRow.locator('[data-pz-last-modification][data-resource-type="order"]');
    const orderMetaText = await waitForLoadedLastModification(orderMeta, 'pedido');
    assert.match(orderMetaText, new RegExp(identity.primaryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await center(orderRow);
    await verifyOneBatch(batchStart, 'pedidos', { type: 'order', id: fixtures.order.id });
    await screenshot('12-pedido-ultima-modificacion.png');

    batchStart = lastModifiedRequests.length;
    await goto(`/t/${encodeURIComponent(identity.slug)}/admin/expirations?view=upcoming&range=30`, '.expiration-row');
    const expirationRow = page.locator('.expiration-row').filter({ hasText: identity.productName }).first();
    await expirationRow.waitFor({ state: 'visible' });
    const expirationMeta = expirationRow.locator('[data-pz-last-modification]');
    await waitForLoadedLastModification(expirationMeta, 'vencimiento');
    assert.match(await expirationRow.innerText(), /Ver historial/i);
    await center(expirationRow);
    await verifyOneBatch(batchStart, 'vencimientos', { type: 'product', id: fixtures.product.id });
    await screenshot('13-vencimiento-ultima-modificacion.png');

    batchStart = lastModifiedRequests.length;
    await goto(`/t/${encodeURIComponent(identity.slug)}/admin/store-settings`, '[data-settings-last-modification]');
    const settingsMeta = page.locator('#settings-last-modification');
    try {
      await pollValue(
        () => settingsMeta.getAttribute('data-resource-id'),
        (value) => value === fixtures.settings.id,
        'ajustes no asigno resource id',
        15000,
      );
    } catch (error) {
      const authDiagnostic = await page.evaluate(() => {
        const cookie = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('pb_auth=')) || '';
        try {
          const parsed = JSON.parse(decodeURIComponent(cookie.slice('pb_auth='.length)));
          return { authCookie: Boolean(cookie), tokenLength: String(parsed?.token || '').length };
        } catch (_) {
          return { authCookie: Boolean(cookie), tokenLength: 0 };
        }
      });
      throw new Error(`${error.message}\nsettings traffic: ${settingsTraffic.join(', ') || 'ninguno'}\npage errors: ${pageErrors.join(' | ') || 'ninguno'}\nauth: ${JSON.stringify(authDiagnostic)}`);
    }
    const settingsMetaText = await waitForLoadedLastModification(settingsMeta, 'ajustes');
    assert.match(settingsMetaText, new RegExp(identity.primaryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await center(settingsMeta);
    await verifyOneBatch(batchStart, 'ajustes', { type: 'settings', id: fixtures.settings.id });
    await screenshot('14-ajustes-ultima-modificacion.png');

    assert.deepEqual(pageErrors, [], `errores de pagina:\n${pageErrors.join('\n')}`);
    assert.deepEqual(serverErrors, [], `respuestas 5xx:\n${serverErrors.join('\n')}`);
  } finally {
    await context?.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

function verifyEvidenceSet() {
  assertOwnedEvidenceDirectory();
  const entries = fs.readdirSync(EVIDENCE_DIR, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  const unexpectedDirectories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  assert.deepEqual(unexpectedDirectories, [], `subdirectorios inesperados: ${unexpectedDirectories.join(', ')}`);
  assert.deepEqual(files, [...SCREENSHOTS].sort(), `evidencias inesperadas:\n${files.join('\n')}`);
  for (const name of files) {
    const stats = fs.statSync(path.join(EVIDENCE_DIR, name));
    assert.ok(stats.size > 10_000, `${name}: captura vacia o incompleta (${stats.size} bytes)`);
  }
}

async function main() {
  assert.equal(fs.existsSync(POCKETBASE_EXE), true, `falta PocketBase: ${POCKETBASE_EXE}`);
  assert.equal(fs.existsSync(ASTRO_CLI), true, `falta Astro CLI: ${ASTRO_CLI}`);
  fs.mkdirSync(TEMP_ROOT, { recursive: true });
  const tempDirectory = fs.mkdtempSync(path.join(TEMP_ROOT, TEMP_PREFIX));
  assertOwnedTempDirectory(tempDirectory);
  const dataDirectory = path.join(tempDirectory, 'pb_data');
  const runtimeMigrationsDirectory = path.join(tempDirectory, 'pb_migrations');
  fs.mkdirSync(dataDirectory, { recursive: true });
  fs.cpSync(MIGRATIONS_DIR, runtimeMigrationsDirectory, { recursive: true });
  const astroStateExisted = fs.existsSync(ASTRO_STATE_DIR);

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`.toLowerCase();
  const fixturePrefix = IS_C2F1_VISUAL ? 'M7U2C2F1QA' : 'M7U2C2QA';
  const fixtureSlug = IS_C2F1_VISUAL ? 'm7u2c2f1qa' : 'm7u2c2qa';
  const identity = {
    suffix,
    prefix: `${fixturePrefix}_${suffix}`,
    slug: `${fixtureSlug}-${suffix}`,
    superEmail: `${fixtureSlug}-${suffix}-super@example.test`,
    superPassword: randomPassword(),
    masterEmail: `${fixtureSlug}-${suffix}-master@example.test`,
    masterPassword: randomPassword(),
    primaryEmail: `${fixtureSlug}-${suffix}-primary@example.test`,
    primaryPassword: randomPassword(),
    primaryName: 'Valeria Administradora',
    memberEmail: IS_C2F1_VISUAL
      ? `${fixtureSlug}-${suffix}-catalogo-responsable-con-correo-largo@example.test`
      : `${fixtureSlug}-${suffix}-catalog@example.test`,
    memberName: 'Mateo Catalogo',
    productName: 'Creatina Monohidratada QA',
    primaryDevice: randomDeviceToken(),
    memberDevice: randomDeviceToken(),
  };

  let pocketBaseRuntime = null;
  let astroRuntime = null;
  let failure = null;
  let completed = false;
  let cleanupRunning = false;

  const cleanup = async () => {
    if (cleanupRunning) return;
    cleanupRunning = true;
    const cleanupErrors = [];
    try { await stopRuntime(astroRuntime, 'Astro visual'); } catch (error) { cleanupErrors.push(error); }
    try { await stopRuntime(pocketBaseRuntime, 'PocketBase visual'); } catch (error) { cleanupErrors.push(error); }
    try {
      assertOwnedTempDirectory(tempDirectory);
      fs.rmSync(tempDirectory, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
      assert.equal(fs.existsSync(tempDirectory), false, `no se limpio ${tempDirectory}`);
    } catch (error) { cleanupErrors.push(error); }
    if (!astroStateExisted) {
      try { fs.rmSync(ASTRO_STATE_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
      catch (error) { cleanupErrors.push(error); }
    }
    if (!completed) {
      try {
        assertOwnedEvidenceDirectory();
        fs.rmSync(EVIDENCE_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch (error) { cleanupErrors.push(error); }
    }
    if (cleanupErrors.length) {
      const cleanupMessage = cleanupErrors.map((error) => error.stack || error.message).join('\n');
      if (failure) failure.message += `\nErrores de cleanup:\n${cleanupMessage}`;
      else failure = new Error(`Errores de cleanup:\n${cleanupMessage}`);
    }
  };

  const onSignal = (signal) => {
    failure = failure || new Error(`interrumpido por ${signal}`);
    void cleanup().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  try {
    resetEvidenceDirectory();
    bootstrapSuperuser(dataDirectory, runtimeMigrationsDirectory, identity.superEmail, identity.superPassword);
    const [pocketBasePort, astroPort] = await Promise.all([freeLoopbackPort(), freeLoopbackPort()]);
    assert.notEqual(pocketBasePort, astroPort, 'los puertos visuales deben ser distintos');
    const pocketBaseUrl = `http://${LOOPBACK}:${pocketBasePort}`;
    const frontendUrl = `http://${LOOPBACK}:${astroPort}`;

    pocketBaseRuntime = startRuntime(
      POCKETBASE_EXE,
      ['serve', `--http=${LOOPBACK}:${pocketBasePort}`, ...pocketBaseFlags(dataDirectory, runtimeMigrationsDirectory)],
      { cwd: BACKEND_DIR },
    );
    await waitForHttp(pocketBaseRuntime, `${pocketBaseUrl}/api/health`, 'PocketBase visual');
    const fixtures = await seedFixtures(pocketBaseUrl, identity);

    astroRuntime = startRuntime(
      process.execPath,
      [ASTRO_CLI, 'dev', '--host', LOOPBACK, '--port', String(astroPort), '--strictPort'],
      {
        cwd: FRONTEND_DIR,
        env: {
          ...process.env,
          PUBLIC_POCKETBASE_URL: pocketBaseUrl,
          ASTRO_TELEMETRY_DISABLED: '1',
          PZ_VISUAL_TEST: '1',
        },
      },
    );
    await waitForHttp(astroRuntime, `${frontendUrl}/login`, 'Astro visual', 60000);
    await runBrowser(frontendUrl, pocketBaseUrl, fixtures, identity);
    verifyEvidenceSet();
    completed = true;

    process.stdout.write([
      `${EVIDENCE_ID} visual: APROBADO`,
      `PocketBase/Astro: loopback efimero (${pocketBasePort}/${astroPort})`,
      `Fixtures aislados: ${identity.prefix} (base desechable)`,
      `Capturas: ${SCREENSHOTS.length}/${SCREENSHOTS.length}`,
      `Evidencias: ${EVIDENCE_DIR}`,
    ].join('\n') + '\n');
  } catch (error) {
    failure = error;
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    await cleanup();
    if (failure && pocketBaseRuntime?.output()) failure.message += `\nPocketBase log (cola):\n${pocketBaseRuntime.output()}`;
    if (failure && astroRuntime?.output()) failure.message += `\nAstro log (cola):\n${astroRuntime.output()}`;
  }

  if (failure) throw failure;
  assert.equal(fs.existsSync(tempDirectory), false, 'fixture temporal no fue eliminado');
  assert.equal(
    pocketBaseRuntime?.child.exitCode === null && pocketBaseRuntime?.child.signalCode === null,
    false,
    'PocketBase visual sigue activo',
  );
  assert.equal(
    astroRuntime?.child.exitCode === null && astroRuntime?.child.signalCode === null,
    false,
    'Astro visual sigue activo',
  );
  verifyEvidenceSet();
  process.stdout.write('Cleanup: 0 procesos propios, 0 fixtures propios, 0 temp/traces/videos/storage\n');
}

await main();
