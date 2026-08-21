import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const report = read('../src/pages/admin/team/[userId]/activity.astro');
const history = read('../src/pages/t/[storeSlug]/admin/account/history.astro');
const teamPage = read('../src/pages/admin/team.astro');
const team = read('../src/components/admin/StoreTeamView.astro');
const activity = read('../src/components/admin/StoreActivityView.astro');
const activityStyles = read('../src/styles/store-activity.css');
const teamStyles = read('../src/styles/store-team.css');

test('actividad individual usa la cabecera compacta aprobada', () => {
  assert.match(report, /store-activity-report-actions/);
  assert.match(report, /store-activity-report-back__icon/);
  assert.match(report, /justify-content: flex-end/);
  assert.match(report, /filtersInitiallyOpen=\{false\}/);
  assert.match(report, /pageSize=\{10\}/);
  assert.match(activity, /mode === 'team' && <h2/);
  assert.match(activity, /isIndividualActivity && 'is-user-heading'/);
  assert.match(activity, /Consulta el historial operativo de este integrante sin alterar los eventos originales\./);
  assert.match(activity, /isIndividualActivity && 'is-icon-only'/);
  assert.match(activityStyles, /\.store-activity-heading\.is-user-heading \{[\s\S]*?border: 0;[\s\S]*?background: transparent;/);
});

test('el administrador principal usa una sola ruta canónica para su historial', () => {
  assert.match(teamPage, /currentUserId=\{currentUserId\}/);
  assert.match(team, /user\.id === config\.currentUserId/);
  assert.match(team, /account\/history'\)}\?from=team/);
  assert.match(report, /if \(userId === currentUserId\)[\s\S]*?account\/history/);
  assert.match(history, /Astro\.url\.searchParams\.get\('from'\) === 'team'/);
  assert.match(history, /backLabel = returnToTeam \? 'Volver a Mi equipo' : 'Volver a Mi cuenta'/);
  assert.match(history, /class="pz-account-activity-view"/);
  assert.doesNotMatch(history, /id="my-activity" class="pz-account-card"/);
});

test('actividad individual presenta las ocho métricas como lista premium', () => {
  assert.match(activity, /\{isIndividualActivity && \(/);
  assert.match(activity, /<h3>Resumen de actividad<\/h3>/);
  assert.equal((activity.match(/data-activity-user-summary=/g) || []).length, 8);
  assert.match(activity, /<AdminIcon name="chart"/);
  assert.match(activity, /<AdminIcon name="box"/);
  assert.match(activity, /<AdminIcon name="cart"/);
  assert.match(activity, /<AdminIcon name="tag"/);
  assert.match(activity, /<AdminIcon name="calendar"/);
  assert.match(activity, /<AdminIcon name="clock"/);
  assert.match(activity, /<AdminIcon name="alert"/);
  assert.match(activity, /<AdminIcon name="clipboard"/);
  assert.match(activityStyles, /\.store-activity-summary\.is-user-report \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);[\s\S]*?border-radius: 22px;/);
  assert.match(activityStyles, /\.store-activity-summary\.is-user-report article \{[\s\S]*?grid-template-columns: 42px minmax\(0, 1fr\) auto;/);
});

test('filtros y paginación coinciden con el diseño aprobado', () => {
  assert.match(activity, /<span>Filtros de actividad<\/span>/);
  assert.match(activity, /<h3>Actividad reciente<\/h3>/);
  assert.match(activity, /\{resolvedPageSize\} eventos por página/);
  assert.match(activity, /data-activity-page-range/);
  assert.match(activity, /Mostrando \$\{firstItem\}–\$\{lastItem\} de \$\{currentPagination\.total_items\} eventos/);
  assert.match(activity, />Siguiente<\/button>/);
  assert.match(activityStyles, /\.store-activity-filters summary \{[\s\S]*?display: grid;/);
  assert.match(activityStyles, /\.store-activity-pagination \{[\s\S]*?grid-template-columns: auto minmax\(72px, 1fr\) auto;/);
});

test('menú móvil de acciones aparece centrado y no como hoja inferior', () => {
  const mobileMenu = teamStyles.slice(teamStyles.indexOf('@media (max-width: 640px)'));
  assert.match(mobileMenu, /\.store-team-menu \{[\s\S]*?top: 50% !important;/);
  assert.match(mobileMenu, /left: 50% !important;/);
  assert.match(mobileMenu, /bottom: auto;/);
  assert.match(mobileMenu, /transform: translate\(-50%, -50%\)/);
  assert.match(mobileMenu, /width: min\(420px, calc\(100vw - 48px\)\)/);
  assert.doesNotMatch(mobileMenu, /bottom: calc\(72px \+ env\(safe-area-inset-bottom\)\)/);
});
