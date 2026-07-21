// NRL 设备 HTML portal 表单解析。
// 固件没有 JSON 配置读取接口，当前配置值嵌在 GET / /nrl /aprs /signaling
// 返回的 HTML 表单控件里（input 的 value / checkbox 的 checked / select 的
// selected option）。解析逻辑集中在本文件，固件页面结构变动时只改这里。

function decodeEntities(text) {
  if (!text) return '';
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function attr(tag, name) {
  const re = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i');
  const m = tag.match(re);
  return m ? decodeEntities(m[1]) : null;
}

// 解析整页 HTML，输出扁平 { name: value }：
// - 普通 input：value 属性（无 value 视为 ''）
// - checkbox：勾选为 '1'，未勾选为 ''
// - select：选中 option 的 value
// 同名控件以后出现的为准（portal 各配置键的 name 唯一，不受影响）。
function parseFormValues(html) {
  const values = {};
  if (!html || typeof html !== 'string') return values;

  const inputRe = /<input\b[^>]*>/gi;
  let m;
  while ((m = inputRe.exec(html)) !== null) {
    const tag = m[0];
    const name = attr(tag, 'name');
    if (!name) continue;
    const type = (attr(tag, 'type') || 'text').toLowerCase();
    if (type === 'checkbox' || type === 'radio') {
      values[name] = /\bchecked\b/i.test(tag) ? (attr(tag, 'value') || '1') : '';
    } else {
      values[name] = attr(tag, 'value') || '';
    }
  }

  const selectRe = /<select\b[^>]*>[\s\S]*?<\/select>/gi;
  while ((m = selectRe.exec(html)) !== null) {
    const block = m[0];
    const openTag = block.match(/<select\b[^>]*>/i)[0];
    const name = attr(openTag, 'name');
    if (!name) continue;
    const optionRe = /<option\b[^>]*>/gi;
    let opt;
    let firstValue = null;
    while ((opt = optionRe.exec(block)) !== null) {
      const v = attr(opt[0], 'value') || '';
      if (firstValue === null) firstValue = v;
      if (/\bselected\b/i.test(opt[0])) {
        values[name] = v;
        firstValue = null;
        break;
      }
    }
    if (firstValue !== null) values[name] = firstValue; // 无 selected 时取首项
  }

  return values;
}

// 从设备首页 HTML 提取显示名：优先呼号（callsign + callsign_ssid），否则取 <title>。
function parseDeviceName(html) {
  const values = parseFormValues(html);
  if (values.callsign) {
    const ssid = values.callsign_ssid;
    return ssid && ssid !== '0' ? `${values.callsign}-${ssid}` : values.callsign;
  }
  const m = html.match(/<title>([^<]*)<\/title>/i);
  return m && m[1] ? m[1].trim() : '';
}

module.exports = {
  parseFormValues,
  parseDeviceName,
};
