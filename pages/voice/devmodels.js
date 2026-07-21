// 设备型号映射：1-99 硬件设备，100-199 软件 APP，200-299 服务器端
// 与 utils/constants.js DevModelOptions 保持一致（110 NRL-Pulse 为语音页额外保留）
module.exports = [
  { id: 0, name: '未知' },
  { id: 1, name: 'NRL-2100' },
  { id: 2, name: 'NRL-2200' },
  { id: 3, name: 'NRL-2300' },
  { id: 7, name: '树莓派' },
  { id: 8, name: 'NRL-2600' },
  { id: 9, name: 'NRL-3188' },
  { id: 10, name: 'NRL-7100' },
  { id: 11, name: 'NRL-FT891' },
  { id: 12, name: 'NRL-TS480' },
  { id: 13, name: 'NRL-IC2720' },
  { id: 14, name: 'NRL-IC2730' },
  { id: 15, name: 'NRL-FT7900' },
  { id: 16, name: 'NRL-V71/D710' },
  { id: 17, name: 'NRL-3100' },
  { id: 18, name: 'NRL-8100-HF' },
  { id: 19, name: 'NRL-DR-635' },
  { id: 20, name: 'FTM-300D' },
  { id: 21, name: 'FTM-400D' },
  { id: 22, name: 'NRL-ESP32' },
  { id: 23, name: 'MMDVM' },
  { id: 24, name: 'W801S' },
  { id: 25, name: '4G便携' },
  { id: 26, name: '董哥定制便携' },
  { id: 28, name: '即时通9000' },
  { id: 29, name: 'NRL-TK90' },
  { id: 30, name: 'NRL-M802' },
  { id: 31, name: 'NRL-ICOM-F8101' },
  { id: 32, name: '旋转器RC-3040S' },
  { id: 33, name: 'DTRC APP' },
  { id: 35, name: 'NRL-3188P' },
  { id: 36, name: 'NRL-2700-HF-HOST' },
  { id: 37, name: 'NRL-2700-HF-PANEL' },
  { id: 50, name: '海能达中继' },
  { id: 55, name: 'UVE5' },

  // BG4SF 作品
  { id: 86, name: 'BG4SF-Cottell' },   // 开拓者
  { id: 68, name: 'BG4SF-Zeenow' },   // 指南者
  { id: 88, name: 'BG4SF-Leapower' }, // 领跑者
  { id: 221, name: 'BG4SF-FormatConversion-1' }, // 221/222 数据包长度互转 160-500
  { id: 222, name: 'BG4SF-FormatConversion-2' },

  // BA4QAO 作品
  { id: 60, name: 'BA4QAO-ESP32' },

  // BD4VKI 作品
  { id: 66, name: 'BD4VKI-ESP32' },

  // BI4UMD 作品
  { id: 70, name: 'BI4UMD-ESP32' },

  // BG4QG 作品
  { id: 80, name: 'BG4QG-ESP32' },

  // BH6BBH 作品
  { id: 90, name: 'BH6BBH-ESP32' },

  // BH4TIH 公网对讲
  { id: 99, name: 'BH4TIH-ESP32' },

  // 软件端
  { id: 100, name: 'NRL-微信小程序' },
  { id: 101, name: 'NRL-73HAM安卓' },
  { id: 102, name: 'NR工具集-IOS' },
  { id: 103, name: 'NRL-Win' },
  { id: 105, name: 'NRL-浏览器' },
  { id: 106, name: 'NRL-救援-ios' },
  { id: 107, name: 'NRL-互联安卓' },
  { id: 108, name: 'NRL-Win-BD4VKI' },
  { id: 109, name: 'NRL-win-BG5FOX' },
  { id: 110, name: 'NRL-Pulse' },
  { id: 111, name: 'NRL-BH6BBH' },
  { id: 119, name: 'NRL-73HAM Pro 安卓' },

  // 服务器端
  { id: 200, name: 'NRL-Server' },
  { id: 201, name: 'NRL-会议' },
  { id: 202, name: 'NRL-BM' },
  { id: 250, name: 'NRL-保姆' },
  { id: 255, name: 'NRL-全网互连' }
];
