// 设备 AT 指令目录（按设备型号分发）。
// 指令集来源：NRL-ESP32 固件 src/lib/nrl_at_commands.cpp。
// 每条命令带中文名称与一句话说明 —— 普通用户看不懂 AT，界面只展示这些描述。
//
// type:
//   text     文本输入 + 保存按钮
//   number   数字输入（min/max 校验）+ 保存按钮
//   switch   ON/OFF 开关
//   select   options 中选择
//   action   按钮，点击发送 actionValue（confirm 非空时先弹确认）
//   readonly 只读（远程不可写或纯状态查询）
//
// 远程（经服务器）限制：WiFi 写、OTA 写会被固件拒绝，故全部 readonly。

const ESP32_CATEGORIES = [
  {
    id: 'link',
    name: '连接与身份',
    commands: [
      { key: 'CALL', label: '呼号', desc: '设备的电台呼号', type: 'text', write: true },
      { key: 'SSID', label: '呼号 SSID', desc: '同一呼号下区分多台设备（0-255）', type: 'number', min: 0, max: 255, write: true },
      { key: 'CH', label: '信道', desc: 'Moto 电台信道切换（0-7）', type: 'number', min: 0, max: 7, write: true },
      { key: 'D_IP', label: '服务器地址', desc: 'NRL 服务器域名或 IP', type: 'text', write: true },
      { key: 'D_PORT', label: '服务器端口', desc: 'NRL 服务器端口（1-65535）', type: 'number', min: 1, max: 65535, write: true },
      { key: 'L_PORT', label: '本地端口', desc: '设备本地端口（1-65535），一般无需修改', type: 'number', min: 1, max: 65535, write: true },
      { key: 'PTT_TIMEOUT', label: 'PTT 超时', desc: '单次发射最长时间（秒，5-3600），超时自动松开', type: 'number', min: 5, max: 3600, write: true },
      { key: 'REBOOT', label: '重启设备', desc: '远程重启设备，约 1 秒后生效', type: 'action', write: true, actionValue: '1', confirm: '确定要远程重启设备吗？' },
    ],
  },
  {
    id: 'audio',
    name: '语音与音频',
    commands: [
      { key: 'VOLUME', label: '喇叭音量', desc: '本机播放音量（0-255）', type: 'number', min: 0, max: 255, write: true },
      { key: 'MIC_GAIN', label: '麦克风增益', desc: '麦克风模拟增益（0-255）', type: 'number', min: 0, max: 255, write: true },
      { key: 'MIC_PCM_GAIN', label: '麦克风数字增益', desc: '数字增益倍数（0.1-5.0）', type: 'text', write: true },
      { key: 'CODEC', label: '语音编码', desc: 'G.711 兼容性好，Opus 音质更高', type: 'select', options: ['G711', 'OPUS'], write: true },
      { key: 'TAIL_SUPPRESS', label: '尾音抑制', desc: '消除语音结束后的拖尾（毫秒，0-5000，0=关闭）', type: 'number', min: 0, max: 5000, write: true },
      { key: 'VOICE_BYTES', label: '语音包大小', desc: '每个语音包字节数（160-500），一般无需修改', type: 'number', min: 160, max: 500, write: true },
      { key: 'LEN_P', label: '语音报文长度', desc: 'NRL 语音报文长度（字节）', type: 'text', write: true },
      { key: 'AEC', label: '回声消除', desc: '麦克风回声消除，重启后生效', type: 'switch', write: true },
      { key: 'HP_DRIVE', label: '耳机输出驱动', desc: '驱动耳机输出口', type: 'switch', write: true },
    ],
  },
  {
    id: 'wifi',
    name: 'WiFi 网络',
    hint: '远程仅支持查询；修改 WiFi 请用「设置 → 局域网设备管理」（手机与设备同一网络时）',
    commands: [
      { key: 'WIFI_SSID', label: 'WiFi 名称', type: 'readonly' },
      { key: 'WIFI_PASS', label: 'WiFi 密码', desc: '设备端打码显示，远程不可修改', type: 'readonly' },
      { key: 'WIFI_IP', label: 'IP 地址', type: 'readonly' },
      { key: 'WIFI_MASK', label: '子网掩码', type: 'readonly' },
      { key: 'WIFI_GW', label: '网关', type: 'readonly' },
      { key: 'WIFI_DNS', label: 'DNS', type: 'readonly' },
      { key: 'WIFI_DHCP', label: 'DHCP', type: 'readonly' },
    ],
  },
  {
    id: 'aprs',
    name: 'APRS',
    commands: [
      { key: 'APRS', label: 'APRS 总开关', type: 'switch', write: true },
      { key: 'APRS_NET', label: 'APRS-IS 网络收发', type: 'switch', write: true },
      { key: 'APRS_TX', label: '射频发射（AFSK）', type: 'switch', write: true },
      { key: 'APRS_RX', label: '射频接收（AFSK）', type: 'switch', write: true },
      { key: 'APRS_AUTO', label: '智能信标间隔', desc: '随移动速度自动加快信标', type: 'switch', write: true },
      { key: 'APRS_SERVER', label: 'APRS-IS 服务器', desc: '可带端口，如 asia.aprs2.net:14580', type: 'text', write: true },
      { key: 'APRS_SSID', label: 'APRS SSID', desc: '0-15', type: 'number', min: 0, max: 15, write: true },
      { key: 'APRS_SYMBOL', label: 'APRS 符号', desc: '两个字符，如 /I', type: 'text', write: true },
      { key: 'APRS_INTERVAL', label: '信标间隔（秒）', type: 'number', min: 10, max: 65535, write: true },
      { key: 'APRS_PATH', label: '射频路径', desc: '如 WIDE1-1', type: 'text', write: true },
      { key: 'APRS_POS', label: '默认位置', desc: '纬度,经度（如 3153.3100,11848.8460），无 GPS 时使用', type: 'text', write: true },
      { key: 'APRS_COMMENT', label: '信标注释', type: 'text', write: true },
      { key: 'APRS_BEACON', label: '立即发送信标', desc: '马上发一次位置信标', type: 'action', write: true, actionValue: '1' },
    ],
  },
  {
    id: 'signaling',
    name: '信令',
    commands: [
      { key: 'CTCSS_RX_MIC', label: '亚音解码（电台）', desc: '从麦克风/电台音频检测 CTCSS 亚音', type: 'switch', write: true },
      { key: 'CTCSS_RX_NRL', label: '亚音解码（网络）', desc: '从 NRL 下行音频检测 CTCSS 亚音', type: 'switch', write: true },
      { key: 'MDC', label: 'MDC1200 ID', desc: '格式：操作码,参数,ID（十六进制），如 01,00,1234', type: 'text', write: true },
      { key: 'MDC_RX_MIC', label: 'MDC 解码（电台）', type: 'switch', write: true },
      { key: 'MDC_RX_NRL', label: 'MDC 解码（网络）', type: 'switch', write: true },
      { key: 'MDC_TX_NRL', label: 'MDC 发送（本地 PTT 后）', type: 'switch', write: true },
      { key: 'MDC_TX_SPK', label: 'MDC 发送（网络语音后）', type: 'switch', write: true },
      { key: 'DTMF', label: 'DTMF ID', desc: '如 123#', type: 'text', write: true },
      { key: 'DTMF_RX_MIC', label: 'DTMF 解码（电台）', type: 'switch', write: true },
      { key: 'DTMF_RX_NRL', label: 'DTMF 解码（网络）', type: 'switch', write: true },
      { key: 'DTMF_TX_NRL', label: 'DTMF 发送（本地 PTT 后）', type: 'switch', write: true },
      { key: 'DTMF_TX_SPK', label: 'DTMF 发送（网络语音后）', type: 'switch', write: true },
    ],
  },
  {
    id: 'serial',
    name: '串口',
    hint: 'UART0 保留给系统日志和串口 AT 指令',
    commands: [
      { key: 'SCI', label: 'SCI 透传串口', desc: '格式：波特率,数据位,校验,停止位，如 9600,8,N,1', type: 'text', write: true },
      { key: 'UART1_ENABLE', label: 'UART1（SCI）启用', type: 'switch', write: true },
      { key: 'UART1_IO', label: 'UART1 引脚', desc: '格式：RX,TX（0-127）', type: 'text', write: true },
      { key: 'UART2_ENABLE', label: 'UART2（GPS）启用', type: 'switch', write: true },
      { key: 'UART2_IO', label: 'UART2 引脚', desc: '格式：RX,TX（0-127）', type: 'text', write: true },
      { key: 'UART2', label: 'UART2 参数', desc: '格式：波特率,数据位,校验,停止位', type: 'text', write: true },
    ],
  },
  {
    id: 'espnow',
    name: 'ESP-NOW 对讲',
    hint: '设备间近距离离网语音直连',
    commands: [
      { key: 'ESPNOW', label: 'ESP-NOW 对讲', type: 'switch', write: true },
      { key: 'ESPNOW_RX', label: 'ESP-NOW 接收', desc: '关闭发射时也能听到对讲', type: 'switch', write: true },
      { key: 'ESPNOW_CODEC', label: 'ESP-NOW 编码', type: 'select', options: ['G711', 'OPUS'], write: true },
      { key: 'PTT_MODE', label: 'PTT 模式', desc: 'NRL=网络发射，ESPNOW=离网直连', type: 'select', options: ['NRL', 'ESPNOW'], write: true },
    ],
  },
  {
    id: 'battery',
    name: '电池',
    hint: '仅部分带屏机型支持',
    commands: [
      { key: 'BATT', label: '电池电压（mV）', desc: '校准后的读数', type: 'readonly' },
      { key: 'BATT_RAW', label: '电池电压原始值（mV）', type: 'readonly' },
      { key: 'BATT_CAL', label: '校准系数', desc: '500-2000，1000=不修正', type: 'number', min: 500, max: 2000, write: true },
    ],
  },
  {
    id: 'system',
    name: '系统诊断',
    hint: '面向开发者；OTA 远程只读，升级请用「设置 → 局域网设备管理」',
    commands: [
      { key: 'OTAURL', label: 'OTA 升级服务器', type: 'readonly' },
      { key: 'OTACHECK', label: 'OTA 状态', type: 'readonly' },
      { key: 'TOP', label: '任务 CPU 占用', desc: '各任务 CPU 百分比（需固件开启统计）', type: 'action', write: true, actionValue: '1' },
      { key: 'MEMBENCH', label: '内存基准测试', type: 'action', write: true, actionValue: '1' },
    ],
  },
];

// 老硬件型号（NRL-2100/2200/2300/3100 等，dev_model < 100）新版固件的 AT
// 指令集。说明文字参照 nrllink-web 的 ATREADMEOptions（src/utils/system.js），
// 指令格式与老固件一致（如端口必须 5 位数、IP 每段必须 3 位数）。
const LEGACY_CATEGORIES = [
  {
    id: 'link',
    name: '身份与网络',
    commands: [
      { key: 'CALL', label: '呼号', desc: '最多 6 位', type: 'text', write: true },
      { key: 'SSID', label: '呼号 SSID', desc: '必须 3 位数，000-255', type: 'text', write: true },
      { key: 'DHCP', label: 'DHCP', desc: '自动获取 IP', type: 'select', options: ['ON', 'OFF'], write: true },
      { key: 'IP', label: '本机 IP', desc: '每段必须 3 位数，如 192.168.001.100', type: 'text', write: true },
      { key: 'MASK', label: '子网掩码', desc: '每段必须 3 位数', type: 'text', write: true },
      { key: 'GATEWAY', label: '网关', desc: '每段必须 3 位数', type: 'text', write: true },
      { key: 'DNS', label: 'DNS 服务器', desc: '每段必须 3 位数', type: 'text', write: true },
      { key: 'D_IP', label: '服务器地址', desc: 'NRL 服务器 IP/域名，IP 每段必须 3 位数', type: 'text', write: true },
      { key: 'D_PORT', label: '服务器端口', desc: '必须 5 位数', type: 'text', write: true },
      { key: 'PHY', label: 'MAC 地址', desc: '固定，无法修改', type: 'readonly' },
      { key: 'REBOOT', label: '重启设备', desc: '远程重启设备', type: 'action', write: true, actionValue: '1', confirm: '确定要远程重启设备吗？' },
    ],
  },
  {
    id: 'radio',
    name: '射频与 PTT',
    commands: [
      { key: 'CH', label: '电台信道', desc: 'Moto 电台信道切换', type: 'text', write: true },
      { key: 'PTT_EN', label: 'PTT 使能', desc: '允许/禁止发射', type: 'select', options: ['ENABLE', 'DISABLE'], write: true },
      { key: 'PTT_IO', label: 'PTT 电平', desc: '发射有效电平', type: 'select', options: ['H', 'L'], write: true },
      { key: 'PTT_RES', label: 'PTT 下拉电阻', desc: '使能 YAESU 或 MOTO 的 PTT 下拉电阻', type: 'select', options: ['ENABLE', 'DISABLE'], write: true },
      { key: 'PW', label: '发射功率', desc: '高/低功率', type: 'select', options: ['H', 'L'], write: true },
      { key: 'DCD', label: 'DCD 模式', desc: '载波检测方式：手动/静噪/声控/禁用', type: 'select', options: ['MANUAL', 'SQL_LO', 'SQL_HI', 'VOX', 'DISABLE'], write: true },
      { key: 'DUPLEX', label: '双工模式', type: 'select', options: ['ON', 'OFF'], write: true },
      { key: 'FILTER', label: '过滤器', desc: '对方设备编号 000-255', type: 'text', write: true },
      { key: '1W_FREQ', label: '1W 模块射频参数', desc: '见模块手册', type: 'text', write: true },
      { key: '1W_MIC', label: '1W 模块麦克风增益', desc: '见模块手册', type: 'text', write: true },
      { key: '1W_VOL', label: '1W 模块音量', desc: '见模块手册', type: 'text', write: true },
    ],
  },
  {
    id: 'audio',
    name: '音频与尾音',
    commands: [
      { key: 'VOLUME', label: '音量', desc: '0-100', type: 'number', min: 0, max: 100, write: true },
      { key: 'ADD_D', label: '添加尾音', desc: '必须 5 位数（00000-65000），单位 5ms', type: 'text', write: true },
      { key: 'DEL_D', label: '消除中继尾音', desc: '必须 5 位数（00000-65000），单位 5ms', type: 'text', write: true },
      { key: 'SQL_TIME', label: '接收超时', desc: '000-255，单位秒', type: 'number', min: 0, max: 255, write: true },
      { key: 'VOX_D', label: 'VOX 延迟断开', desc: '必须 5 位数，单位 5ms', type: 'text', write: true },
      { key: 'LEN_P', label: '语音报文长度', desc: 'NRL 语音报文长度（字节）', type: 'text', write: true },
    ],
  },
  {
    id: 'aprs',
    name: 'APRS',
    commands: [
      { key: 'APRS', label: 'APRS 开关', type: 'select', options: ['ON', 'OFF'], write: true },
      { key: 'A_IP', label: 'APRS 服务器', desc: '地址或域名，IP 每段必须 3 位数', type: 'text', write: true },
      { key: 'AMSG', label: 'APRS 消息内容', desc: '最长 64 字节', type: 'text', write: true },
      { key: 'WDJD', label: 'APRS 坐标', desc: '格式 3118.55N/12018.00E', type: 'text', write: true },
    ],
  },
  {
    id: 'display',
    name: '显示与电源',
    hint: '仅部分带屏机型支持',
    commands: [
      { key: 'LCD_TIME', label: '屏幕熄灭时间', desc: '000-255，单位秒', type: 'number', min: 0, max: 255, write: true },
      { key: 'LOGO', label: 'OLED 开机 LOGO', type: 'text', write: true },
      { key: 'BAT', label: '电池电量修正', desc: '+255 或 -255', type: 'text', write: true },
    ],
  },
  {
    id: 'player',
    name: '播放控制',
    hint: '仅支持语音/音乐播放的机型',
    commands: [
      { key: 'PLAY', label: '播放', type: 'action', write: true, actionValue: '1' },
      { key: 'PAUSE', label: '暂停', type: 'action', write: true, actionValue: '1' },
      { key: 'STOP', label: '停止', type: 'action', write: true, actionValue: '1' },
      { key: 'PREW', label: '上一首', type: 'action', write: true, actionValue: '1' },
      { key: 'NEXT', label: '下一首', type: 'action', write: true, actionValue: '1' },
      { key: 'REPEAT', label: '重复', type: 'action', write: true, actionValue: '1' },
      { key: 'PLAY_ID', label: '播放 ID', desc: '按 ID 播放指定内容', type: 'text', write: true },
    ],
  },
  {
    id: 'system',
    name: '系统诊断',
    hint: '面向开发者',
    commands: [
      { key: 'LOOP', label: '音频脱网环路测试', type: 'action', write: true, actionValue: '1' },
      { key: 'D_ID', label: '目标设备 CPU 序列号', desc: '8 位', type: 'text', write: true },
      { key: 'D_SN', label: '目标序列号', desc: '6 位', type: 'text', write: true },
      { key: 'S_ID', label: '源设备 CPU 序列号', desc: '8 位', type: 'text', write: true },
      { key: 'S_SN', label: '源序列号', desc: '6 位', type: 'text', write: true },
      { key: 'S_PORT', label: '源端口', desc: '必须 5 位数', type: 'text', write: true },
    ],
  },
];

// 设备型号（与 utils/constants.js DevModelOptions 对应）
const MODEL_ESP32 = 22;
// ESP32 衍生固件的第三方硬件型号，指令集与 NRL-ESP32 相同
const ESP32_FAMILY = [22, 60, 66, 70, 80, 90, 99];

// 返回设备的管理方式：
//   'at'        ESP32 系列（含第三方 ESP32 固件），走 AT 指令（ESP32 指令集）
//   'at-legacy' 其他老硬件（dev_model < 100），新版固件也走 AT（老指令集），
//               旧固件可退回 device-settings 的 EEPROM 参数设置
//   'none'      软终端/服务器端等，不支持远程配置
function manageKind(devModel) {
  const model = Number(devModel);
  if (ESP32_FAMILY.includes(model)) return 'at';
  if (model > 0 && model < 100) return 'at-legacy';
  return 'none';
}

// 取指定型号的 AT 指令目录（不支持 AT 的型号返回 null）
function getCatalog(devModel) {
  const kind = manageKind(devModel);
  if (kind === 'at') return ESP32_CATEGORIES;
  if (kind === 'at-legacy') return LEGACY_CATEGORIES;
  return null;
}

// ESP32 固件的特征键（老指令集不会出现），用于按设备上报内容识别指令目录
const ESP32_SIGNATURE_KEYS = [
  'AT+WIFI_SSID', 'WIFI_SSID',
  'AT+ESPNOW', 'ESPNOW',
  'AT+SCI', 'SCI',
  'AT+CODEC', 'CODEC',
  'AT+VOICE_BYTES', 'VOICE_BYTES',
];

// 按设备上报的 AT 数据选择指令目录（型号只是兜底）：
// 有 ESP32 特征键 → ESP32 目录；有 AT 数据但不像 ESP32 → 老指令集；
// 没有 AT 数据 → 按型号判断
function getCatalogForDevice(devModel, atmap) {
  if (atmap && Object.keys(atmap).length) {
    const isEsp32 = ESP32_SIGNATURE_KEYS.some((k) => atmap[k] !== undefined);
    return isEsp32 ? ESP32_CATEGORIES : LEGACY_CATEGORIES;
  }
  return getCatalog(devModel);
}

module.exports = {
  getCatalog,
  getCatalogForDevice,
  manageKind,
  MODEL_ESP32,
};
