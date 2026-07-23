// 局域网 NRL 设备发现列表页：优先 UDP 广播，旧固件可回退 /24 HTTP 扫描。
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
    this.setData({
      scanning: true,
      subnet: subnet || '',
      progressDone: 0,
      progressTotal: 1,
      progressPercent: 0,
      statusText: '正在广播发现设备…',
    });

    const found = [];
    this._scan = discovery.scanBroadcast(subnet, {
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
        progressDone: 1,
        progressPercent: 100,
        statusText: wasCancelled ? '已停止' : `扫描完成，发现 ${found.length} 台设备`,
      });
      if (!wasCancelled && found.length === 0 && subnet) {
        wx.showModal({
          title: '未收到发现响应',
          content: '可能是旧版固件。是否执行兼容扫描？兼容扫描会依次探测当前网段的 254 个地址。',
          confirmText: '兼容扫描',
          success: (res) => { if (res.confirm) this.startLegacyScan(subnet); },
        });
      }
    });
  },

  startLegacyScan(subnet) {
    const found = [];
    this.setData({
      scanning: true, subnet, progressDone: 0, progressTotal: 254,
      progressPercent: 0, statusText: '正在兼容扫描旧固件…',
    });
    this._scan = discovery.scanSubnet(subnet, {
      onProgress: (done, total) => this.setData({
        progressDone: done,
        progressTotal: total,
        progressPercent: Math.round((done * 100) / total),
      }),
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
        statusText: wasCancelled ? '已停止' : `兼容扫描完成，发现 ${found.length} 台设备`,
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
    wx.navigateTo({ url: `/pages/my-device-at/my-device-at?device=${param}` });
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
