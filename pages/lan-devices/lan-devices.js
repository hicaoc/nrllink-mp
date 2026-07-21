// 局域网 NRL 设备发现列表页：子网扫描 + 缓存设备管理 + 手动添加。
const discovery = require('../../utils/nrlDiscovery');
const { ping } = require('../../utils/nrlLan');

Page({
  data: {
    devices: [],
    scanning: false,
    subnet: '',
    progressDone: 0,
    progressTotal: 254,
    progressPercent: 0,
    statusText: '就绪',
  },

  onShow() {
    this.cancelScan();
    const devices = discovery.loadDevices();
    this.setData({ devices, statusText: devices.length ? '刷新在线状态…' : '就绪' });
    this.refreshOnline(devices);
  },

  onUnload() {
    this.cancelScan();
  },

  // 逐个 ping 缓存设备刷新在线状态
  refreshOnline(devices) {
    if (!devices.length) return;
    Promise.all(devices.map(async (d) => {
      const online = await ping(d.ip);
      const list = this.data.devices.map((x) => (x.ip === d.ip ? Object.assign({}, x, { online }) : x));
      this.setData({ devices: list });
    })).then(() => {
      if (!this.data.scanning) this.setData({ statusText: '就绪' });
    });
  },

  toggleScan() {
    if (this.data.scanning) {
      this.cancelScan();
      this.setData({ scanning: false, statusText: '已停止' });
      return;
    }
    this.startScan();
  },

  async startScan() {
    const subnet = await discovery.getLocalSubnet();
    if (!subnet) {
      wx.showModal({
        title: '无法确定网段',
        content: '请确认手机已连接 WiFi，或使用手动添加设备 IP。',
        showCancel: false,
      });
      return;
    }
    this.setData({
      scanning: true,
      subnet,
      progressDone: 0,
      progressPercent: 0,
      statusText: '扫描中…',
    });

    const found = [];
    this._scan = discovery.scanSubnet(subnet, {
      onProgress: (done, total) => {
        this.setData({
          progressDone: done,
          progressTotal: total,
          progressPercent: Math.round((done * 100) / total),
        });
      },
      onFound: (device) => {
        found.push(device);
        this.setData({ devices: discovery.mergeDevices([device]) });
      },
    });

    this._scan.promise.then(() => {
      const wasCancelled = this.data.scanning === false;
      this._scan = null;
      this.setData({
        scanning: false,
        statusText: wasCancelled ? '已停止' : `扫描完成，发现 ${found.length} 台设备`,
      });
    });
  },

  cancelScan() {
    if (this._scan) {
      this._scan.cancel();
      this._scan = null;
    }
  },

  addManually() {
    wx.showModal({
      title: '手动添加设备',
      editable: true,
      placeholderText: '设备 IP，如 192.168.1.100',
      success: (res) => {
        if (!res.confirm || !res.content) return;
        const ip = res.content.trim();
        if (!discovery.subnetOf(ip)) {
          wx.showToast({ title: 'IP 格式不正确', icon: 'none' });
          return;
        }
        wx.showLoading({ title: '连接中…' });
        discovery.identifyDevice(ip).then((device) => {
          wx.hideLoading();
          if (!device) {
            wx.showToast({ title: '该地址不是 NRL 设备或不可达', icon: 'none' });
            return;
          }
          this.setData({ devices: discovery.upsertDevice(device) });
          this.openDeviceByIp(ip);
        });
      },
    });
  },

  openDevice(e) {
    this.openDeviceByIp(e.currentTarget.dataset.ip);
  },

  openDeviceByIp(ip) {
    const device = this.data.devices.find((d) => d.ip === ip) || { ip };
    const param = encodeURIComponent(JSON.stringify(device));
    wx.navigateTo({ url: `/pages/lan-device/lan-device?device=${param}` });
  },

  removeDevice(e) {
    const ip = e.currentTarget.dataset.ip;
    wx.showModal({
      title: '移除设备',
      content: `从列表移除 ${ip}？`,
      success: (res) => {
        if (!res.confirm) return;
        discovery.removeDevice(ip);
        this.setData({ devices: discovery.loadDevices() });
      },
    });
  },

  goBleConfig() {
    wx.navigateTo({ url: '/pages/ble-config/ble-config' });
  },
});
