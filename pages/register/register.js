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
    certificate: ''
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
    const formData = e.detail.value
    formData.license = this.data.license
    formData.certificate = this.data.certificate

    register(formData).then(() => {
      wx.showToast({
        title: '注册成功',
        icon: 'success'
      })
      wx.navigateBack()
    }).catch(err => {
      wx.showToast({
        title: err.message || '注册失败',
        icon: 'none'
      })
    })
  }
})
