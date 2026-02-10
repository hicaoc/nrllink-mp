const { register } = require('../../utils/api')

Page({
  data: {
    callsign: '',
    name: '',
    phone: '',
    password: '',
    address: '',
    mail: '',
    license: '',
    certificate: '',
    name: '',
    host: '',
    serverConfig: null
  },

  onLoad: function (options) {
    console.log("options:", options)
    this.setData({
      name: options.name,
      host: options.host,
    });
  },

  chooseLicense() {
    wx.chooseImage({
      count: 1,
      success: async (res) => {
        const tempFilePath = res.tempFilePaths[0];
        wx.showLoading({ title: '正在压缩照片中...' });
        try {
          const compressedPath = await this.compressImageToLimit(tempFilePath);
          this.setData({ license: compressedPath });
        } catch (e) {
          wx.showToast({ title: e.message || '图片处理失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      }
    });
  },

  async compressImageToLimit(filePath) {
    const MAX_SIZE = 512 * 1024;

    const getSize = (path) => new Promise((resolve) => {
      wx.getFileInfo({
        filePath: path,
        success: (res) => resolve(res.size),
        fail: () => resolve(Infinity)
      });
    });

    const compress = (src, quality) => new Promise((resolve, reject) => {
      wx.compressImage({ src, quality, success: (res) => resolve(res.tempFilePath), fail: reject });
    });

    if (await getSize(filePath) <= MAX_SIZE) return filePath;

    for (const quality of [80, 60, 40]) {
      const compressed = await compress(filePath, quality);
      if (await getSize(compressed) <= MAX_SIZE) return compressed;
    }

    throw new Error('图片过大，请换一张');
  },


  onSubmit(e) {
    const formData = e.detail.value;

    // 字段验证
    if (!formData.callsign || !/^[A-Z0-9]{5,6}$/.test(formData.callsign)) {
      wx.showToast({
        title: '呼号只能包含5-6位大写字母和数字',
        icon: 'none'
      });
      return;
    }

    if (!formData.name) {
      wx.showToast({
        title: '请输入姓名',
        icon: 'none'
      });
      return;
    }

    if (!formData.phone || !/^\d{11,}$/.test(formData.phone)) {
      wx.showToast({
        title: '请输入11位以上数字的手机号',
        icon: 'none'
      });
      return;
    }

    if (!formData.password) {
      wx.showToast({
        title: '请输入密码',
        icon: 'none'
      });
      return;
    }

    if (!formData.address) {
      wx.showToast({
        title: '请输入地址',
        icon: 'none'
      });
      return;
    }

    if (!formData.mail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.mail)) {
      wx.showToast({
        title: '请输入有效的邮箱地址',
        icon: 'none'
      });
      return;
    }

    if (!this.data.license) {
      wx.showToast({
        title: '请上传操作证和电台执照',
        icon: 'none'
      });
      return;
    }

    formData.license = this.data.license;

    wx.showLoading({
      title: '注册中...'
    });

    register(formData, this.data.host).then((res) => {
       
      wx.hideLoading();

      if (res.code === 20000) {


        wx.showModal({
          title: '注册成功',
          content: '请等待管理员审核，一般48小时以内完成，如急需，请主动连续管理员。',
          confirmText: '确定',
          success: (res) => {
            if (res.confirm) {
              wx.redirectTo({
                url: '/pages/login/login'
              })
            }
          }
        });
      }
      else {
        wx.showModal({
          title: '注册失败',
          content: '手机号或者呼号已经存在，请直接登录试试。如果失败，请联系管理员！',
          confirmText: '确定',
          success: (res) => {
            if (res.confirm) {
              wx.redirectTo({
                url: '/pages/login/login'
              })
            }
          }
        });

      }
    }).catch(err => {
      console.log("register err:", err);
      wx.hideLoading();
      wx.showToast({
        title: err.message || '注册失败',
        icon: 'none'
      });
    });
  }
})
