// 基础配置
//const BASE_URL = 'https://nrlptt.com';
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

  //console.log('response', response)
  // 20000 和 20001 都是有效状态码
  if (response.data.code === 20000 || response.data.code === 60204) {
    return response.data.data;
  } else if (response.data.code === 20001) {
    wx.showToast({
      title: response.data.message,
      icon: 'error',
      duration: 5000 // Further increase the duration for the success message
    });

    return

  }

  // 其他状态码需要跳转登录页
  app().globalData.token = null;
  wx.removeStorageSync('token');
  wx.removeStorageSync('userInfo');

  wx.showToast({
    title: '登录已过期，请重新登录',
    icon: 'none'
  });
  wx.reLaunch({
    url: '/pages/login/login'
  });
  throw new Error('登录已过期');

};

// 统一请求方法
const request = async (options, retries = 3, timeout = 10000) => {

  const app = getApp();

  //console.log('request.header:', options.header);

  const config = requestInterceptor({
    url: 'https://' + app.globalData.serverConfig.host + options.url,
    method: options.method || 'GET',
    header: {
      ...getDefaultHeaders(), // 获取默认的 header
      ...options.header       // 覆盖 options.header 中的字段
    },

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
export const api = {
  // 获取群组列表
  getGroupList() {
    return request({
      url: '/group/list',
      method: 'POST'
    });
  },

  // 获取群组mini列表
  getGroup(data) {
    return request({
      url: '/group/get',
      method: 'POST',
      data
    });
  },

  // 获取群组mini列表
  getGroupListMini() {
    return request({
      url: '/group/list/mini',
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

  // 获取设备列表
  getDevice(data) {
    return request({
      url: '/device/get', // 修改为新的接口地址
      method: 'POST',
      data
    });
  },

  getMyDevices() {
    return request({
      url: '/device/mydevlist', // 修改为新的接口地址
      method: 'GET',
    });
  },

  getQTH(data) {
    return request({
      url: '/device/qths', // 修改为新的接口地址
      method: 'POST',
      data
    });
  },



  // getQTHmap() {
  //   return request({
  //     url: '/device/qthmap', // 修改为新的接口地址
  //     method: 'GET',
  //   });
  // },




  // 获取设备列表
  getplatformList() {
    return request({
      url: '/platform/list', // 修改为新的接口地址
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

  updateAvatar(avatar) {
    return request({
      url: '/user/update/avatar',
      method: 'POST',
      data: avatar
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

  // 用户登录
  logout(data) {
    return request({
      url: '/user/logout',
      method: 'POST',
      data

    });
  },


  // 获取用户信息
  getUserInfo() {
    return request({
      url: '/user/info',
      method: 'GET'
    });
  },


  queryDevice(data) {
    return request({
      url: '/device/query',
      method: 'post',
      data
    })
  },

  bingDevice(data) {
    return request({
      url: '/device/binddevice',
      method: 'post',
      data
    })
  },

  changeDeviceParm(data) {
    // const formData = Object.keys(data)
    // .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(data[key])}`)
    // .join('&');

    //console.log(data);

    return request({
      url: '/device/change',
      method: 'POST',
      header: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data
    })
  },

  changeDevice1w(data) {
    return request({
      url: '/device/change1w',
      method: 'post',
      data
    })
  },

  changeDevice2w(data) {
    return request({
      url: '/device/change2w',
      method: 'post',
      data
    })
  },

  fetchDeviceStats(data) {
    return request({
      url: '/device/stats',
      method: 'post',
      data
    })
  },

  fetchRelayList(data) {
    return request({
      url: '/relay/list',
      method: 'post',
      data
    })
  },


  // 用户注册
  register(data, host) {
    return new Promise((resolve, reject) => {
      // 封装 wx.uploadFile 为 Promise
      const uploadFile = (url, filePath, name, formData) => {
        return new Promise((resolve, reject) => {
          wx.uploadFile({
            url,
            filePath,
            name,
            formData,
            success: (res) => {
              resolve(res); // 成功时返回响应对象
            },
            fail: (err) => {
              reject(err); // 失败时返回错误
            }
          });
        });
      };

      // 构造上传任务
      const licenseTask = uploadFile(
        'https://' + host + '/user/reg/create',
        data.license,
        'license',
        {
          ...data,
          license: undefined
        }
      );


      // 使用 Promise.all 处理并发任务
      Promise.all([licenseTask])
        .then(results => {
          const [licenseRes] = results;

          console.log('licenseRes', licenseRes);
          //console.log('certificateRes', certificateRes);

          // 检查上传结果的状态码
          if (!licenseRes || licenseRes.statusCode !== 200) {
            reject(new Error('电台执照上传失败'));
            return;
          }

          // if (!certificateRes || certificateRes.statusCode !== 200) {
          //   reject(new Error('操作证上传失败'));
          //   return;
          // }

          // 尝试解析响应数据
          try {
            resolve({
              license: JSON.parse(licenseRes.data || '{}'),

            });
          } catch (e) {
            reject(new Error('解析响应数据失败'));
          }
        })
        .catch(err => {
          reject(err);
        });
    });
  }

};

export const {
  getGroupList,
  getGroup,
  getGroupListMini,
  getDeviceList,
  getDevice,
  getMyDevices,
  getQTH,
  getplatformList,
  updateDevice,
  updateAvatar,
  login,
  logout,
  getUserInfo,
  queryDevice,
  bingDevice,
  changeDeviceParm,
  changeDevice1w,
  changeDevice2w,
  fetchDeviceStats,
  fetchRelayList,
  register
} = api;

export default api;
