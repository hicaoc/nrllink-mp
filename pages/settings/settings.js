// 设置落地页：三个导航入口 —— NRL 设备配网、群组设备管理、退出登录。
Page({
  data: {
    showLogout: true,
  },

  onLoad() {
    const app = getApp();
    if (app && app.registerPage) app.registerPage(this);
  },

  // NRL 设备蓝牙配网
  navigateToBleConfig() {
    wx.navigateTo({ url: '/pages/ble-config/ble-config' });
  },

  // 局域网设备管理（子网扫描发现 + 设备 web API 管理）
  navigateToLanDevices() {
    wx.navigateTo({ url: '/pages/lan-devices/lan-devices' });
  },

  // 群组设备管理（原配置页）
  navigateToGroupManage() {
    wx.navigateTo({ url: '/pages/config/config' });
  },

  // 退出登录，回到登录页
  handleLogout() {
    wx.showModal({
      title: '提示',
      content: '确定退出登录？',
      success: (res) => {
        if (!res.confirm) return;
        const app = getApp();
        if (app && app.globalData && app.globalData.logout) {
          app.globalData.logout();
        }
      },
    });
  },
});
