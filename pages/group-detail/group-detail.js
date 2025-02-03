import {
  DevRFtypeOptions,
  groupTypeOptions,
  DevStatusOptions,
  DevTypeOptions,
  DevModelOptions
} from '../../utils/constants.js';

const api = require('../../utils/api');

Page({
  data: {
    group: {
      displayName: '',
      statusText: '',
      deviceCount: 0,
      onlineCount: 0,
      devmap: []
    },
    devices: [], // 所有设备列表
    selectedDevice: null, // 当前选择的设备
    expandedDetails: {}, // 用于存储每个设备的展开状态
    showDetails: false, // 控制详细信息显示
    DevStatusOptions: DevStatusOptions // 添加状态选项
  },

  // 切换详细信息显示
  toggleDetails(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      [`expandedDetails.${index}`]: !this.data.expandedDetails[index],
      showDetails: !this.data.showDetails
    });
  },

  onLoad(options) {
    // 绑定所有需要的方法

    this.loadGroupDetail = this.loadGroupDetail.bind(this);
    this.loadDeviceList = this.loadDeviceList.bind(this);

    try {
      if (options && options.group) {
        const group = JSON.parse(decodeURIComponent(options.group))
        this.groupData = group // 保存group数据用于刷新
        this.loadGroupDetail(group)
        this.loadDeviceList()
      } else {
        wx.showToast({
          title: '缺少群组数据',
          icon: 'none'
        })
      }
    } catch (error) {
      wx.showToast({
        title: '群组数据解析失败',
        icon: 'none'
      })
      console.error('Group data parse error:', error)
    }
  },

  // 加载设备列表
  async loadDeviceList() {
    try {
      const app = getApp()
      const userInfo = app.globalData.userInfo
      let devices = app.globalData.availableDevices || []
      const currentCallsign = userInfo?.callsign
      
      // 如果不是管理员，只显示当前用户的设备
      if (!userInfo?.roles?.includes('admin')) {
  
        devices = devices.filter(device => device.callsign === currentCallsign)
      }

      // 排序规则：当前用户设备 > 其他设备
   
      devices.sort((a, b) => {
        const isCurrentA = a.callsign === currentCallsign
        const isCurrentB = b.callsign === currentCallsign
        if (isCurrentA && !isCurrentB) return -1
        if (!isCurrentA && isCurrentB) return 1
        return 0
      })
      
      this.setData({ devices })
    } catch (error) {
      wx.showToast({
        title: '获取设备列表失败',
        icon: 'none'
      })
    }
  },

  // 选择设备
  selectDevice(e) {
    const index = e.detail.value
    const device = this.data.devices[index]
    if (device) {
      this.setData({ selectedDevice: device })
    }
  },

  // 加入当前群组
  async joinGroup() {
    const { selectedDevice } = this.data
    if (!selectedDevice) {
      wx.showToast({
        title: '请先选择设备',
        icon: 'none'
      })
      return
    }

    wx.showLoading({
      title: '正在处理中...',
      mask: true
    })

    try {
      const app = getApp()
      await api.updateDevice({
        ...selectedDevice,
        group_id: this.groupData.id
      })

      wx.showToast({
        title: '加入成功，正在刷新数据...',
        icon: 'success'
      })

      await Promise.all([
        this.loadGroupDetail(this.groupData),
        this.loadDeviceList(),
        // 刷新全局设备列表
        api.getDeviceList().then(devices => {
          app.globalData.availableDevices = devices

          if (selectedDevice.callsign === app.globalData.userInfo.callsign && selectedDevice.ssid === 100) {
            app.globalData.currentGroup = this.groupData;
            app.globalData.currentDevice = selectedDevice;
            const voicePage = app.globalData.voicePage;
            if (voicePage && voicePage.getCurrentGroup) {
              voicePage.getCurrentGroup();
            } else {
              console.warn('Voice page not found or getCurrentGroup method missing');
            }
          }

          })
      ])
      wx.showToast({
        title: '数据刷新完成',
        icon: 'success'
      })
    } catch (error) {
      wx.showToast({
        title: error.message || '操作失败',
        icon: 'none'
      })
      console.error('Error:', error)
    } finally {
      wx.hideLoading()
    }
  },


  // 获取设备类型名称
  getDevTypeName(typeId) {
    const type = DevTypeOptions.find(t => t.id === typeId);
    return type ? type.name : typeId;
  },

  // 获取设备型号名称
  getDevModelName(modelId) {
    const model = DevModelOptions.find(m => m.id === modelId);
    return model ? model.name : modelId;
  },

  // 获取设备射频类型名称
  getDevRFtypeName(rfTypeId) {
    if (typeof rfTypeId !== 'number') {
      console.warn('Invalid rfTypeId:', rfTypeId);
      return rfTypeId;
    }
    const rfType = DevRFtypeOptions.find(r => r.id === rfTypeId);
    return rfType ? rfType.name : rfTypeId;
  },

  // 获取群组类型名称
  getGroupTypeName(groupTypeId) {
    if (typeof groupTypeId !== 'number') {
      console.warn('Invalid groupTypeId:', groupTypeId);
      return groupTypeId;
    }
    const groupType = groupTypeOptions.find(g => g.id === groupTypeId);
    return groupType ? groupType.name : groupTypeId;
  },

  // 获取设备状态名称
  getDevStatusName(statusId) {
    if (typeof statusId !== 'number') {
      console.warn('Invalid statusId:', statusId);
      return statusId;
    }
    const status = DevStatusOptions.find(s => s.id === statusId);
    return status ? status.name : statusId;
  },

  // 获取设备状态对应的样式类
  getStatusClass(statusId) {
    const status = DevStatusOptions.find(s => s.id === statusId);
    if (!status) return 'unknown';

    switch (status.name) {
      case '全开': return 'normal';
      case '禁收': return 'disabled-receive';
      case '禁发': return 'disabled-send';
      case '双禁': return 'disabled-both';
      default: return 'unknown';
    }
  },

  // 处理状态选择
  async handleStatusChange(e) {
    const statusId = e.currentTarget.dataset.value;
    const device = e.currentTarget.dataset.device;

    //console.log('device:',device);

    const app = getApp()
    const userInfo = app.globalData.userInfo

    const currentCallsign = userInfo?.callsign

    if (!userInfo?.roles?.includes('admin') && device.callsign !== currentCallsign  ) {
      wx.showToast({
        title: '权限不够', 
        icon: 'errorerror'
      });

      return
     
    }


    wx.showLoading({
      title: '正在更新状态...',
      mask: true
    });

    try {
      await api.updateDevice({
        ...device,
        status: statusId
      });

      wx.showToast({
        title: '状态更新成功', 
        icon: 'success'
      });

      // // 更新设备状态显示
      // const devices = this.data.devices.map(d => {
      //   if (d.id === device.id) {
      //     return {
      //       ...d,
      //       status: statusId,
            
      //       statusText: this.getDevStatusName(statusId),
      //       statusClass: this.getStatusClass(statusId)
      //     };
      //   }
      //   return d;
      // });

      this.groupData.devmap[device.id].status = statusId; 
      
      //this.setData({ devices });
      this.loadGroupDetail(this.groupData)
    } catch (error) {
      wx.showToast({
        title: error.message || '状态更新失败',
        icon: 'none'
      });
      console.error('Error updating status:', error);
    } finally {
      wx.hideLoading();
    }
  },

  // 获取射频类型对应的样式类
  getRFtypeClass(rfTypeId) {
    const rfType = DevRFtypeOptions.find(r => r.id === rfTypeId);
    if (!rfType) return 'unknown';

    switch (rfType.name) {
      case '无': return 'none';
      case '内置': return 'internal';
      case '外置': return 'external';
      default: return 'unknown';
    }
  },

  // 获取群组类型对应的样式类
  getGroupTypeClass(groupTypeId) {
    const groupType = groupTypeOptions.find(g => g.id === groupTypeId);
    if (!groupType) return 'unknown';

    switch (groupType.name) {
      case '公共': return 'public';
      case '中继': return 'relay';
      case '设备': return 'device';
      case '监听': return 'listen';
      default: return 'other';
    }
  },


  loadGroupDetail(group) {
    if (!group) {
      console.warn('No group data provided')
      return
    }

    try {
      // 将设备map转换为数组
      // 优化性能：先处理时间格式
      const now = Date.now();
      const formatCache = new Map();

      const formatIfNeeded = (timeStr) => {
   timeStr
      };

      // 优化设备映射，在线设备优先
      const devices = Object.values(group.devmap || {});
      // 按在线状态排序，在线设备在前
      devices.sort((a, b) => {
        if (a.is_online === b.is_online) return 0;
        return a.is_online ? -1 : 1;
      });
      const devmap = new Array(devices.length);
      let onlineCount = 0;

      for (let i = 0; i < devices.length; i++) {
        const device = devices[i];
        if (device.is_online) onlineCount++;

        // Parse and validate device type and model
        let typeId = 0;
        let modelId = 0;

        try {
          // Convert to number if possible, otherwise use default 0
          typeId = Number(device.dev_type);
          if (isNaN(typeId)) {
            console.warn('Invalid device type:', device.dev_type);
            typeId = 0;
          }

          modelId = Number(device.dev_model);
          if (isNaN(modelId)) {
            console.warn('Invalid device model:', device.dev_model);
            modelId = 0;
          }
        } catch (error) {
          console.warn('Error parsing device type/model:', error);
        }

        // Parse and validate device rf type and status
        let rfTypeId = 0;
        let statusId = 0;

        try {
          rfTypeId = Number(device.rf_type);
          if (isNaN(rfTypeId)) {
            console.warn('Invalid device rf type:', device.rf_type);
            rfTypeId = 0;
          }

          statusId = Number(device.status);
          if (isNaN(statusId)) {
            console.warn('Invalid device status:', device.status);
            statusId = 0;
          }
        } catch (error) {
          console.warn('Error parsing device rf type/status:', error);
        }

        devmap[i] = {
          ...device,
          callsign: `${device.callsign || '无'}`,
          ssid: `${device.ssid || 0}`,
          name: `${device.name || '未命名设备'}`,
          type: this.getDevTypeName(typeId),
          model: this.getDevModelName(modelId),
          rfType: rfTypeId,
          rfTypeText: this.getDevRFtypeName(rfTypeId),
          status: statusId,
          statusText: this.getDevStatusName(statusId),
          statusClass: this.getStatusClass(statusId),
          rfTypeClass: this.getRFtypeClass(rfTypeId),
          groupTypeClass: this.getGroupTypeClass(groupTypeId),
          last_packet_time: formatIfNeeded(device.last_packet_time),
          last_voice_begin_time: formatIfNeeded(device.last_voice_begin_time),
          last_voice_end_time: formatIfNeeded(device.last_voice_end_time),
          create_time: formatIfNeeded(device.create_time),
          update_time: formatIfNeeded(device.update_time),
          online_time: formatIfNeeded(device.online_time)
        };
      }

      // 更高效的setData更新
      // Parse and validate group type
      let groupTypeId = 0;
      try {
        groupTypeId = Number(group.type);
        if (isNaN(groupTypeId)) {
          console.warn('Invalid group type:', group.type);
          groupTypeId = 0;
        }
      } catch (error) {
        console.warn('Error parsing group type:', error);
      }

      const update = {
        'group.deviceCount': devmap.length,
        'group.onlineCount': onlineCount,
        'group.devmap': devmap,
        'group.type': this.getGroupTypeName(groupTypeId),
        'group.typeName': this.getGroupTypeName(groupTypeId)
      };

      if (group.displayName !== this.data.group.displayName) {
        update['group.displayName'] = group.displayName;
      }
      if (group.statusText !== this.data.group.statusText) {
        update['group.statusText'] = group.statusText;
      }

      this.setData(update);
    } catch (error) {
      wx.showToast({
        title: '加载群组详情失败',
        icon: 'none'
      })
      console.error('Load group detail error:', error)
    }
  },

  onShow() {
    // 页面显示时刷新数据
    if (this.groupData) {
      this.loadGroupDetail(this.groupData)
    }
    this.loadDeviceList()
  },

  onPullDownRefresh() {
    // 下拉刷新
    if (this.groupData) {
      this.loadGroupDetail(this.groupData)
    }
    this.loadDeviceList()
    wx.stopPullDownRefresh()
  },

})
