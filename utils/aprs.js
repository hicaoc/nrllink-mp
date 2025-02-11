// utils/aprs.js
const AX25 = require('./ax25.js');

/**
 * 生成APRS位置报告包
 * @param {string} callsign 呼号
 * @param {number} lat 纬度
 * @param {number} lon 经度 
 * @param {string} comment 注释
 * @returns {Buffer} APRS数据包
 */
function encodeAPRS(callsign, lat, lon, comment = '') {
  // 格式化坐标
  const latStr = convertLatitude(lat);
  const lonStr = convertLongitude(lon);
  
  // 构建信息字段
  let infoField = `!${latStr}/${lonStr}`;
  if (comment) {
    infoField += ` ${comment}`;
  }

  // 构建AX25帧
  const frame = new AX25.Frame({
    destination: 'APRS',
    source: `${callsign}-100`.padEnd(9, ' '),
    digipeaters: [],
    info: new TextEncoder().encode(infoField)
  });

  return frame.encode();
}

/**
 * 转换纬度
 * @param {number} lat 纬度
 * @returns {string} 格式化后的纬度字符串
 */
function convertLatitude(lat) {
  const absLat = Math.abs(lat);
  const degrees = Math.floor(absLat);
  const minutes = (absLat - degrees) * 60;
  const direction = lat >= 0 ? 'N' : 'S';
  return `${degrees.toString().padStart(2, '0')}${minutes.toFixed(2).padStart(5, '0')}${direction}`;
}

/**
 * 转换经度
 * @param {number} lon 经度
 * @returns {string} 格式化后的经度字符串
 */
function convertLongitude(lon) {
  const absLon = Math.abs(lon);
  const degrees = Math.floor(absLon);
  const minutes = (absLon - degrees) * 60;
  const direction = lon >= 0 ? 'E' : 'W';
  return `${degrees.toString().padStart(3, '0')}${minutes.toFixed(2).padStart(5, '0')}${direction}`;
}

function generateAPRSPasscode(callsign) {
  callsign = callsign.split('-')[0].toUpperCase();
  let passcode = 29666;
  let i = 0;
  while (i < callsign.length) {
    passcode ^= callsign.charCodeAt(i) * 256;
    if (i + 1 < callsign.length) {
      passcode ^= callsign.charCodeAt(i + 1);
    }
    i += 2;
  }
  passcode &= 32767;
  return passcode;
}

module.exports = {
  encodeAPRS,
  generateAPRSPasscode
};
