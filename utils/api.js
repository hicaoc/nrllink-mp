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
  // 20000 和 20001 都是有效状态码
  if (response.data.code === 20000 || response.data.code === 20001) {
    return response.data.data;
  }
  
  // 其他状态码需要跳转登录页
  wx.removeStorageSync('token');
  wx.removeStorageSync('userInfo');
  wx.removeStorageSync('cpuId');
  wx.showToast({
    title: '登录已过期，请重新登录',
    icon: 'none'
  });
  wx.reLaunch({
    url: '/pages/login/login'
  });
  throw new Error('登录已过期');
  return response.data.data;
};

// 统一请求方法
const request = async (options, retries = 3, timeout = 10000) => {
  const config = requestInterceptor({
    url: BASE_URL + options.url,
    method: options.method || 'GET',
    header: Object.assign({}, getDefaultHeaders(), options.headers || {}),
    data: options.data || {},
    timeout
  });

  // 检查网络状态
  const checkNetwork = () => new Promise((resolve, reject) => {
    wx.getNetworkType({
      success: (res) => {
        if (res.networkType === 'none') {
          reject(new Error('网络不可用，请检查网络连接'));
        } else {
          resolve();
        }
      },
      fail: () => reject(new Error('网络状态检查失败'))
    });
  });

  for (let i = 0; i < retries; i++) {
    try {
      await checkNetwork();
      
      const result = await new Promise((resolve, reject) => {
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

      return result;
    } catch (error) {
      if (i === retries - 1) {
        throw error;
      }
      
      // 等待一段时间后重试
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
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
            url: '/device/list', // 修改为新的接口地址
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
