/// <reference path="../pb_data/types.d.ts" />

const KIBIBYTE = 1024;

function setPrivateHeaders(e) {
  try {
    const headers = e.response.header();
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    headers.set("Referrer-Policy", "no-referrer");
  } catch (_) {}
}

function recordString(record, key) {
  if (!record) return "";
  try { return String(record.getString(key) || "").trim(); }
  catch (_) {
    try { return String(record.get(key) || "").trim(); }
    catch (_) { return ""; }
  }
}

function isActiveMaster(record) {
  const status = recordString(record, "status").toLowerCase();
  return recordString(record, "role") === "master_admin" && status !== "suspended";
}

function requireAuthenticatedUser(e) {
  setPrivateHeaders(e);
  if (!e.auth) return e.json(403, { ok: false, error: "unauthorized" });
  return e.next();
}

function bytesToText(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value.length !== "number") return String(value || "");
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    output += String.fromCharCode(Number(value[index]) & 255);
  }
  return output;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function percentage(used, total) {
  if (!(total > 0)) return 0;
  return Math.round(Math.min(100, Math.max(0, used / total * 100)) * 10) / 10;
}

function metric(totalBytes, usedBytes, availableBytes) {
  const total = positiveInteger(totalBytes);
  const used = Math.min(total, positiveInteger(usedBytes));
  const available = Math.min(total, positiveInteger(availableBytes));
  if (!total) throw new Error("invalid_metric_total");
  return {
    total_bytes: total,
    used_bytes: used,
    available_bytes: available,
    percent: percentage(used, total),
  };
}

function parseMemoryInfo(rawValue) {
  const values = {};
  bytesToText(rawValue).split(/\r?\n/).forEach((line) => {
    const match = /^([A-Za-z_()]+):\s+(\d+)\s+kB$/i.exec(line.trim());
    if (match) values[match[1]] = positiveInteger(match[2]);
  });

  const totalKiB = positiveInteger(values.MemTotal);
  const fallbackAvailableKiB = positiveInteger(values.MemFree)
    + positiveInteger(values.Buffers)
    + positiveInteger(values.Cached);
  const availableKiB = Math.min(
    totalKiB,
    positiveInteger(values.MemAvailable) || fallbackAvailableKiB,
  );
  if (!totalKiB) throw new Error("memory_unavailable");
  return metric(
    totalKiB * KIBIBYTE,
    (totalKiB - availableKiB) * KIBIBYTE,
    availableKiB * KIBIBYTE,
  );
}

function parseDiskInfo(rawValue) {
  const lines = bytesToText(rawValue)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error("disk_unavailable");
  const fields = lines[lines.length - 1].split(/\s+/);
  if (fields.length < 6) throw new Error("disk_unavailable");

  const totalKiB = positiveInteger(fields[1]);
  const usedKiB = positiveInteger(fields[2]);
  const availableKiB = positiveInteger(fields[3]);
  if (!totalKiB) throw new Error("disk_unavailable");
  return metric(
    totalKiB * KIBIBYTE,
    usedKiB * KIBIBYTE,
    availableKiB * KIBIBYTE,
  );
}

function collectServerMetrics(osApi) {
  const system = osApi || $os;
  const memory = parseMemoryInfo(system.readFile("/proc/meminfo"));
  const disk = parseDiskInfo(system.cmd("/bin/df", "-kP", "/").output());
  return {
    sampled_at: new Date().toISOString(),
    memory,
    disk,
  };
}

function logFailure(error) {
  try {
    $app.logger().error(
      "PowerZona server metrics failed safely.",
      "detail",
      String(error && error.message ? error.message : error || "unknown").slice(0, 160),
    );
  } catch (_) {}
}

function handleServerMetrics(e) {
  setPrivateHeaders(e);
  let info;
  try { info = e.requestInfo(); }
  catch (_) { info = { auth: e.auth || null }; }
  if (!isActiveMaster(info && info.auth)) {
    return e.json(403, { ok: false, error: "unauthorized" });
  }

  try {
    return e.json(200, { ok: true, ...collectServerMetrics() });
  } catch (error) {
    logFailure(error);
    return e.json(503, { ok: false, error: "metrics_unavailable" });
  }
}

module.exports = {
  handleServerMetrics,
  requireAuthenticatedUser,
  _test: {
    bytesToText,
    collectServerMetrics,
    isActiveMaster,
    parseDiskInfo,
    parseMemoryInfo,
    percentage,
  },
};
