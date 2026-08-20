const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const memoryInfo = [
  'MemTotal:        3905948 kB',
  'MemFree:          610000 kB',
  'MemAvailable:    1680040 kB',
  'Buffers:           12000 kB',
  'Cached:           900000 kB',
].join('\n');
const diskInfo = [
  'Filesystem 1024-blocks Used Available Capacity Mounted on',
  'overlay 78425224 13841544 61338940 18% /',
].join('\n');

function record(values) {
  return {
    getString(key) { return String(values[key] ?? ''); },
    get(key) { return values[key]; },
  };
}

function loadModule() {
  const sourcePath = path.resolve(__dirname, '../pb_hooks/pz_master_server_metrics_lib.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const sandbox = {
    module: { exports: {} },
    exports: {},
    Date,
    Error,
    Math,
    Number,
    Object,
    String,
    $app: { logger() { return { error() {} }; } },
    $os: {
      readFile(name) {
        assert.equal(name, '/proc/meminfo');
        return memoryInfo;
      },
      cmd(name, ...args) {
        assert.equal(name, '/bin/df');
        assert.deepEqual(args, ['-kP', '/']);
        return { output() { return diskInfo; } };
      },
    },
  };
  vm.runInNewContext(source, sandbox, { filename: sourcePath });
  return sandbox.module.exports;
}

const metrics = loadModule();

test('convierte MemTotal y MemAvailable a bytes usados reales', () => {
  const memory = metrics._test.parseMemoryInfo(memoryInfo);
  assert.equal(memory.total_bytes, 3905948 * 1024);
  assert.equal(memory.available_bytes, 1680040 * 1024);
  assert.equal(memory.used_bytes, (3905948 - 1680040) * 1024);
  assert.equal(memory.percent, 57);
});

test('interpreta df POSIX sin confundir capacidad ni punto de montaje', () => {
  const disk = metrics._test.parseDiskInfo(diskInfo);
  assert.equal(disk.total_bytes, 78425224 * 1024);
  assert.equal(disk.used_bytes, 13841544 * 1024);
  assert.equal(disk.available_bytes, 61338940 * 1024);
  assert.equal(disk.percent, 17.6);
});

test('acepta buffers binarios devueltos por JSVM', () => {
  const bytes = Uint8Array.from(Buffer.from(memoryInfo, 'utf8'));
  assert.equal(metrics._test.parseMemoryInfo(bytes).total_bytes, 3905948 * 1024);
});

test('solo un Master activo puede consultar las métricas', () => {
  assert.equal(metrics._test.isActiveMaster(record({ role: 'master_admin', status: 'active' })), true);
  assert.equal(metrics._test.isActiveMaster(record({ role: 'master_admin', status: 'suspended' })), false);
  assert.equal(metrics._test.isActiveMaster(record({ role: 'store_admin', status: 'active' })), false);
  assert.equal(metrics._test.isActiveMaster(null), false);
});

test('el colector solo ejecuta lecturas fijas y devuelve una muestra completa', () => {
  const result = metrics._test.collectServerMetrics({
    readFile(name) {
      assert.equal(name, '/proc/meminfo');
      return memoryInfo;
    },
    cmd(name, ...args) {
      assert.equal(name, '/bin/df');
      assert.deepEqual(args, ['-kP', '/']);
      return { output() { return diskInfo; } };
    },
  });
  assert.match(result.sampled_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(result.memory.percent, 57);
  assert.equal(result.disk.percent, 17.6);
});

test('el contrato HTTP falla cerrado para roles ajenos', () => {
  function invoke(role, status = 'active') {
    const auth = role ? record({ role, status }) : null;
    const response = { status: 0, payload: null };
    metrics.handleServerMetrics({
      auth,
      requestInfo() { return { auth }; },
      response: { header() { return { set() {} }; } },
      json(code, payload) {
        response.status = code;
        response.payload = payload;
        return response;
      },
    });
    return response;
  }

  assert.equal(invoke('master_admin').status, 200);
  assert.equal(invoke('store_admin').status, 403);
  assert.equal(invoke('store_staff').status, 403);
  assert.equal(invoke('master_admin', 'suspended').status, 403);
  assert.equal(invoke('').status, 403);
});
