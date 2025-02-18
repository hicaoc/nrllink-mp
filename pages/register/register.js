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

  onLoad: function(options) {
    console.log("options:",options)
    this.setData({
      name: options.name,
      host: options.host,
    });
  },

  chooseLicense() {
    wx.chooseImage({
      count: 1,
      success: (res) => {
        this.setData({
          license: res.tempFilePaths[0]
        })
      }
    })
  },

  chooseCertificate() {
    wx.chooseImage({
      count: 1,
      success: (res) => {
        this.setData({
          certificate: res.tempFilePaths[0]
        })
      }
    })
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
        title: '请上传电台执照',
        icon: 'none'
      });
      return;
    }
    
    if (!this.data.certificate) {
      wx.showToast({
        title: '请上传操作证',
        icon: 'none'
      });
      return;
    }
    
    formData.license = this.data.license;
    formData.certificate = this.data.certificate;
    
    wx.showLoading({
      title: '注册中...'
    });

    register(formData, this.data.host).then((res) => {
      console.log(res);
      wx.hideLoading();
      wx.showToast({
        title: '注册成功，请等待管理员审核后开通账号',
        showCancel: false,
        confirmText: '确定',
        success: (res) => {
          if (res.confirm) {
            wx.redirectTo({
              url: '/pages/login/login'
            })
          }
        }
      });
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({
        title: err.message || '注册失败',
        icon: 'none'
      });
    });
  }
})
