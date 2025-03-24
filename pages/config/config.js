//const api = require('../../utils/api');
//import * as nrl21 from '../../utils/nrl21';


Page({
  data: {
    groups: [], // 群组列表
    showLogout: true
  },

  onLoad() {
    const app = getApp();
    app.registerPage(this);


    this.refreshData();
  },

  onShow() {
    this.refreshData();
  },

  async refreshData() {

    const app = getApp();

    //await app.globalData.getGroupList()
    const groups = await app.globalData.getGroupList();

          // 按在线状态排序，在线设备在前
          groups.sort((a, b) => {
            if (a.id === b.id) return 0;
            return a.id < b.id ? -1 : 1;
          });
    
    

    this.setData({ groups });

  },



  // 跳转到群组详情页面
  navigateToGroupDetail(e) {
    const group = e.currentTarget.dataset.group;
    //console.log("group:", group, e);
    wx.navigateTo({
      url: `/pages/group-detail/group-detail?group=${encodeURIComponent(JSON.stringify(group))}`
    });
  },

  // 退出登录
  handleLogout() {
    const app = getApp();
 
    app.globalData.logout();
  },

  async onPullDownRefresh() {
    try {
      // 下拉刷新
      this.refreshData();

      console.log('Pull-down refresh completed successfully.');
    } catch (error) {
      console.error('Error during pull-down refresh:', error);
    } finally {
      wx.stopPullDownRefresh();
    }
  },

});
