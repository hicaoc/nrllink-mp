// 局域网 NRL 设备 HTTP 封装。
// 设备内置 web portal（esp_http_server，80 端口），同网段时小程序可用
// http://{ip}/... 直连，不校验安全域名、无需 https（基础库 2.4.0+）。
// 注意：不要复用 utils/api.js —— 它绑死了后端 https + 业务码协议。

// esp_http_server 连接槽有限，全局限制并发，扫描时尤其重要。
const MAX_CONCURRENT = 16;
let active = 0;
const queue = [];

function pump() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const run = queue.shift();
    run();
  }
}

/**
 * 基础请求。resolve 的是 wx.request 的 res（含 statusCode / data）。
 * options: { path, method, data, timeout, header }
 */
function request(ip, options = {}) {
  const {
    path = '/',
    method = 'GET',
    data,
    timeout = 3000,
    header = {},
  } = options;

  return new Promise((resolve, reject) => {
    queue.push(() => {
      active++;
      wx.request({
        url: `http://${ip}${path}`,
        method,
        data,
        timeout,
        header,
        success: resolve,
        fail: reject,
        complete: () => {
          active--;
          pump();
        },
      });
    });
    pump();
  });
}

function get(ip, path, timeout = 3000) {
  return request(ip, { path, method: 'GET', timeout });
}

// 表单 POST（application/x-www-form-urlencoded），与固件 bindPost 的解析匹配。
// fields 为扁平对象；值为 undefined/null 的键不会发送（wx.request 会自动编码）。
function postForm(ip, path, fields, timeout = 5000) {
  return request(ip, {
    path,
    method: 'POST',
    data: fields,
    timeout,
    header: { 'content-type': 'application/x-www-form-urlencoded' },
  });
}

// 探测单个 IP 是否是存活的设备 web 服务（GET /ping 返回 "ok"）。
function ping(ip, timeout = 800) {
  return get(ip, '/ping', timeout).then((res) => {
    return res.statusCode === 200 && typeof res.data === 'string' && res.data.indexOf('ok') !== -1;
  }).catch(() => false);
}

// 保存类接口返回 {"ok":bool,"fields":{...}}，统一按这个格式判定。
function checkSaveResponse(res) {
  if (res.statusCode !== 200) {
    return { ok: false, error: `HTTP ${res.statusCode}` };
  }
  const body = res.data;
  if (body && body.ok === true) {
    return { ok: true, fields: body.fields || {} };
  }
  return { ok: false, error: (body && body.error) || '设备拒绝保存' };
}

module.exports = {
  request,
  get,
  postForm,
  ping,
  checkSaveResponse,
};
