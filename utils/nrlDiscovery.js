// NRL 设备局域网发现：子网扫描。
// 设备固件没有 mDNS 广播、也没有 UDP 发现应答，只能扫子网：
// 对每个候选 IP 发 GET /ping（返回 "ok"），命中后再 GET / 确认页面含
// NRL 标识并解析设备名（呼号）。

const { ping, get } = require('./nrlLan');
const { parseDeviceName } = require('./nrlPortalParser');

const DEVICES_KEY = 'lanDevices';
const SUBNET_KEY = 'lanSubnet';

// "192.168.1.6" -> "192.168.1"；非法输入返回 null
function subnetOf(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(ip || '');
  if (!m) return null;
  if (Number(m[1]) > 255 || Number(m[2]) > 255 || Number(m[3]) > 255) return null;
  return `${m[1]}.${m[2]}.${m[3]}`;
}

// 取本机局域网网段；失败（iOS 返回 unknown / 蜂窝网 0.0.0.0）时
// 回退到上次扫描成功的网段；都没有则返回 null（调用方提示手动添加）。
function getLocalSubnet() {
  return new Promise((resolve) => {
    const fallback = () => resolve(wx.getStorageSync(SUBNET_KEY) || null);
    if (!wx.getLocalIPAddress) {
      fallback();
      return;
    }
    wx.getLocalIPAddress({
      success: (res) => {
        const subnet = subnetOf(res.localip);
        if (!subnet || subnet === '0.0.0') {
          fallback();
          return;
        }
        wx.setStorageSync(SUBNET_KEY, subnet);
        resolve(subnet);
      },
      fail: fallback,
    });
  });
}

// 确认 ip 是 NRL 设备并取设备信息；不是则 resolve(null)。
function identifyDevice(ip) {
  return get(ip, '/', 1500).then((res) => {
    const html = typeof res.data === 'string' ? res.data : '';
    if (res.statusCode !== 200 || html.indexOf('NRL') === -1) return null;
    const name = parseDeviceName(html);
    return {
      ip,
      name: name || 'NRL 设备',
      callsign: name,
      lastSeen: Date.now(),
      online: true,
    };
  }).catch(() => null);
}

/**
 * 扫描整个 /24 网段。
 * callbacks: onProgress(done, total) / onFound(device)
 * 返回 { promise, cancel }；promise resolve 为发现的设备数组。
 */
function scanSubnet(subnet, callbacks = {}) {
  const { onProgress, onFound } = callbacks;
  const total = 254;
  let cancelled = false;
  const found = [];

  const hosts = [];
  for (let i = 1; i <= 254; i++) hosts.push(`${subnet}.${i}`);

  const promise = (async () => {
    let done = 0;
    // 分批控制节奏（底层 nrlLan 还有全局并发限制兜底）
    const BATCH = 32;
    for (let off = 0; off < hosts.length && !cancelled; off += BATCH) {
      const batch = hosts.slice(off, off + BATCH);
      await Promise.all(batch.map(async (ip) => {
        if (cancelled) return;
        const alive = await ping(ip);
        done++;
        if (onProgress) onProgress(done, total);
        if (!alive || cancelled) return;
        const device = await identifyDevice(ip);
        if (device && !cancelled) {
          found.push(device);
          if (onFound) onFound(device);
        }
      }));
    }
    return found;
  })();

  return {
    promise,
    cancel: () => { cancelled = true; },
  };
}

// ---- 缓存设备列表 ----

function loadDevices() {
  return wx.getStorageSync(DEVICES_KEY) || [];
}

function saveDevices(devices) {
  wx.setStorageSync(DEVICES_KEY, devices);
}

// 合并扫描结果进缓存（按 ip 去重，更新 lastSeen/online/name）
function mergeDevices(fresh) {
  const cached = loadDevices();
  const byIp = {};
  cached.forEach((d) => { byIp[d.ip] = d; });
  fresh.forEach((d) => {
    byIp[d.ip] = Object.assign({}, byIp[d.ip], d, { online: true });
  });
  const merged = Object.keys(byIp).map((ip) => byIp[ip]);
  saveDevices(merged);
  return merged;
}

function removeDevice(ip) {
  saveDevices(loadDevices().filter((d) => d.ip !== ip));
}

function upsertDevice(device) {
  return mergeDevices([device]);
}

module.exports = {
  subnetOf,
  getLocalSubnet,
  identifyDevice,
  scanSubnet,
  loadDevices,
  mergeDevices,
  removeDevice,
  upsertDevice,
};
