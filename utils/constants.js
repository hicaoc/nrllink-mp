// 连接的射频设备类型：0:无连接，1,内置1W模块，2，内置2W模块，3，外接moto3188，4,moto3688, 5，外接yaesu，6，外接，icom，7，外接其它
export const DevRFtypeOptions = [
    { id: 0, name: '无射频' },
    { id: 1, name: '1W模块' },
    { id: 2, name: '2W模块' },
    { id: 3, name: 'Moto3188/3688' },
    { id: 5, name: 'Yaesu' },
    { id: 6, name: 'ICOM' },
    { id: 7, name: '其它' }
];

export const groupTypeOptions = [
    { id: 0, name: '公共房间' },
    { id: 1, name: '中继互联' },
    { id: 2, name: '设备互联' },
    { id: 3, name: '守听' },
    { id: 4, name: '数模互联' },
    { id: 5, name: '俱乐部' },
    { id: 6, name: '车友会' },
    { id: 7, name: '会议组' },
    { id: 8, name: '私人房间' },
    { id: 100, name: '其他' }
];

export const DevStatusOptions = [
    // { id: 0, name: '全开' },
    { id: 1, name: '禁收' },
    { id: 2, name: '禁发' },
    // { id: 3, name: '双禁' }
];

// 设备类型映射
export const DevTypeOptions = [
    { id: 0, name: '未知' },
    { id: 1, name: '中继' },
    { id: 2, name: '热点' },
    { id: 3, name: 'APP' },
    { id: 4, name: 'WEB' }
];

// 设备型号映射：1-99 硬件设备，100-199 软件 APP，200-299 服务器端
export const DevModelOptions = [
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
    { id: 111, name: 'NRL-BH6BBH' },
    { id: 119, name: 'NRL-73HAM Pro 安卓' },

    // 服务器端
    { id: 200, name: 'NRL-Server' },
    { id: 201, name: 'NRL-会议' },
    { id: 202, name: 'NRL-BM' },
    { id: 250, name: 'NRL-保姆' },
    { id: 255, name: 'NRL-全网互连' },
];

export const ctcssOptions = [
    { id: '0', name: '000.0' },
    { id: '1', name: '067.0' },
    { id: '2', name: '071.9' },
    { id: '3', name: '074.4' },
    { id: '4', name: '077.0' },
    { id: '5', name: '079.7' },
    { id: '6', name: '082.5' },
    { id: '7', name: '085.4' },
    { id: '8', name: '088.5' },
    { id: '9', name: '091.5' },
    { id: '10', name: '094.8' },
    { id: '11', name: '097.4' },
    { id: '12', name: '100.0' },
    { id: '13', name: '103.5' },
    { id: '14', name: '107.2' },
    { id: '15', name: '110.9' },
    { id: '16', name: '114.8' },
    { id: '17', name: '118.8' },
    { id: '18', name: '123.0' },
    { id: '19', name: '127.3' },
    { id: '20', name: '131.8' },
    { id: '21', name: '136.5' },
    { id: '22', name: '141.3' },
    { id: '23', name: '146.2' },
    { id: '24', name: '151.4' },
    { id: '25', name: '156.7' },
    { id: '26', name: '162.2' },
    { id: '27', name: '167.9' },
    { id: '28', name: '173.8' },
    { id: '29', name: '179.9' },
    { id: '30', name: '186.2' },
    { id: '31', name: '192.8' },
    { id: '32', name: '203.5' },
    { id: '33', name: '210.7' },
    { id: '34', name: '218.1' },
    { id: '35', name: '225.7' },
    { id: '36', name: '233.6' },
    { id: '37', name: '241.8' },
    { id: '38', name: '250.3' }
  
  ]
  