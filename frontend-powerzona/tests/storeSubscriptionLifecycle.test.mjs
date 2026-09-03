import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = (relativePath) => fs.readFileSync(path.resolve(here, '..', relativePath), 'utf8');

test('Prompt 8 muestra llamadas a contratar o renovar y conserva datos al reducir el plan', () => {
  const master = source('src/components/master/MasterStorePlanView.astro');
  const sidebar = source('src/components/admin/AdminSidebar.astro');

  assert.match(master, /Todos los datos de la tienda permanecen conservados/);
  assert.match(master, /Los datos Premium se conservarán/);
  assert.match(master, /Prueba ya utilizada/);
  assert.match(master, /Renueva por 1, 6 o 12 meses/);
  assert.doesNotMatch(master, /Esta acción es irreversible/);

  assert.match(sidebar, /Contratar un plan/);
  assert.match(sidebar, /Renovar suscripción/);
  assert.match(sidebar, /Renovar durante la gracia/);
  assert.match(sidebar, /plan_grace_period/);
});
