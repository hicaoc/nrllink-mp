// NRL 设备局域网发现。新固件使用一个 UDP 广播即可发现整个 LAN；
// 旧固件保留 /24 HTTP 扫描和手动 IP 作为兼容回退。

const { ping, get } = require('./nrlLan');
const { parseDeviceName } = require('./nrlPortalParser');

const DEVICES_KEY = 'lanDevices';
const SUBNET_KEY = 'lanSubnet';
const DISCOVERY_PORT = 60051;
const DISCOVERY_REQUEST = 'NRL_DISCOVER/1';

function arrayBufferText(value) {
  if (typeof value === 'string') return value;
  const bytes = new Uint8Array(value || new ArrayBuffer(0));
  let text = '';
  for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
  try { return decodeURIComponent(escape(text)); } catch (e) { return text; }
}

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
 * Low-cost discovery: broadcast NRL_DISCOVER/1 and collect unicast JSON
 * replies for `timeout` milliseconds. Returns { promise, cancel }.
 */
function scanBroadcast(subnet, callbacks = {}, timeout = 2600) {
  const { onFound } = callbacks;
  let socket = null;
  let timer = null;
  let cancelled = false;
  let finishScan = null;
  const byId = {};

  const promise = new Promise((resolve) => {
    const finish = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (socket) {
        try { socket.close(); } catch (e) {}
        socket = null;
      }
      resolve(Object.keys(byId).map((key) => byId[key]));
    };
    finishScan = finish;

    try {
      socket = wx.createUDPSocket();
      socket.onMessage((res) => {
        if (cancelled) return;
        try {
          const info = JSON.parse(arrayBufferText(res.message));
          if (!info || info.protocol !== 'nrl-discovery/1') return;
          const ip = res.remoteInfo && res.remoteInfo.address;
          if (!subnetOf(ip)) return;
          const device = {
            ip,
            port: Number(info.http_port) || 80,
            atPath: info.at_path || '/api/at',
            deviceId: info.device_id || ip,
            name: info.name || 'NRL 设备',
            callsign: info.callsign || '',
            ssid: Number(info.ssid) || 0,
            model: info.model || '',
            dev_model: info.model || '',
            version: info.version || '',
            lastSeen: Date.now(),
            online: true,
            is_online: true,
            transport: 'lan',
          };
          const key = device.deviceId || ip;
          if (byId[key]) return;
          byId[key] = device;
          if (onFound) onFound(device);
        } catch (e) {
          // Ignore unrelated UDP broadcasts on the discovery port.
        }
      });
      socket.onError(() => finish());
      socket.bind();

      const addresses = ['255.255.255.255'];
      if (subnet) addresses.push(`${subnet}.255`);
      const send = () => {
        if (!socket || cancelled) return;
        addresses.forEach((address) => {
          try { socket.send({ address, port: DISCOVERY_PORT, message: DISCOVERY_REQUEST }); } catch (e) {}
        });
      };
      // A few tiny broadcasts tolerate WiFi power-save and AP packet loss.
      setTimeout(send, 60);
      setTimeout(send, 450);
      setTimeout(send, 1000);
      timer = setTimeout(finish, timeout);
    } catch (e) {
      finish();
    }
  });

  return {
    promise,
    cancel: () => {
      cancelled = true;
      if (finishScan) finishScan();
    },
  };
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
  scanBroadcast,
  scanSubnet,
  loadDevices,
  mergeDevices,
  removeDevice,
  upsertDevice,
};
