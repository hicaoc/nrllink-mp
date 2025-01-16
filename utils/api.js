// 基础配置
const BASE_URL = 'https://nrlptt.com';
const getDefaultHeaders = () => ({
  'Content-Type': 'application/json',
  'x-token': wx.getStorageSync('token') || ''
});

// 请求拦截器
const requestInterceptor = (config) => {
  wx.showLoading({
    title: '加载中...',
    mask: true
  });
  return config;
};

// 响应拦截器
const responseInterceptor = (response) => {
  wx.hideLoading();
  if (response.statusCode !== 200) {
    throw new Error('网络请求失败');
  }
  if (response.data.code !== 20000) {
    throw new Error(response.data.message || '请求失败');
  }
  return response.data.data;
};

// 统一请求方法
const request = (options) => {
  const config = requestInterceptor({
    url: BASE_URL + options.url,
    method: options.method || 'GET',
    header: Object.assign({}, getDefaultHeaders(), options.headers || {}),
    data: options.data || {}
  });

  return new Promise((resolve, reject) => {
    wx.request({
      ...config,
      success: (res) => {
        try {
          const data = responseInterceptor(res);
          resolve(data);
        } catch (error) {
          reject(error);
        }
      },
      fail: (error) => {
        wx.hideLoading();
        reject(error);
      }
    });
  });
};

// API 集合
const api = {
  // 获取群组列表
  getGroupList() {
    return request({
      url: '/group/list',
      method: 'POST'
    });
  },

  // 获取设备列表
  getDeviceList() {
    return request({
      url: '/device/mydevlist',
      method: 'POST'
    });
  },

  // 更新设备信息
  updateDevice(device) {
    return request({
      url: '/device/update',
      method: 'POST',
      data: device
    });
  },

  // 用户登录
  login(credentials) {
    return request({
      url: '/user/login',
      method: 'POST',
      data: credentials
    });
  },

  // 获取用户信息
  getUserInfo() {
    return request({
      url: '/user/info',
      method: 'GET'
    });
  }
};

module.exports = api;
