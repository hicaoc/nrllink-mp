import {
  DevRFtypeOptions,
  groupTypeOptions,
  DevStatusOptions,
  DevTypeOptions,
  DevModelOptions
} from '../../utils/constants.js';

const api = require('../../utils/api');
const app = getApp()
let groupData = {}
let searchInput = ''

Page({
  data: {
    group: {
      displayName: '',
      //statusText: '',
      deviceCount: 0,
      onlineCount: 0,
      devmap: []
    },

    devices: [], // 所有设备列表
    selectedDevice: null, // 当前选择的设备
    expandedDetails: {}, // 用于存储每个设备的展开状态
    showDetails: false, // 控制详细信息显示
    DevStatusOptions: DevStatusOptions, // 添加状态选项
    relayOptions: [],
    searchInput: '', // 新增搜索输入
    filteredDevices: [], // 新增过滤后的设备列表
    showChangeGroupModal: false, // 控制换组模态框显示
    availableGroups: [], // 可用群组列表
    selectedGroupId: null // 选择的群组ID
  },
  onLoad(options) {
    // 绑定所有需要的方法
    console.log('onLoad-group-detail')

    // this.onSearchInput = this.onSearchInput.bind(this)
    // this.loadGroupDetail = this.loadGroupDetail.bind(this);
    // this.loadDeviceList = this.loadDeviceList.bind(this);
    // this.toggleDetails = this.toggleDetails.bind(this)
    // this.navigateToDeviceSettings = this.navigateToDeviceSettings.bind(this)

    let currentDevice = app.globalData.currentDevice
    currentDevice.displayName = currentDevice.callsign + '-' + currentDevice.ssid + '-' + currentDevice.cpuid + '-' + currentDevice.id
    this.setData({ selectedDevice: currentDevice })

    try {
      if (options && options.group) {
        const group = JSON.parse(decodeURIComponent(options.group))
        groupData = group // 保存group数据用于刷新
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

  async refreshData() {
    let currentGroup = await app.globalData.getGroup(groupData.id)
    this.loadGroupDetail(currentGroup)
    this.loadDeviceList()
   },
 
  loadReayList() {
    api.fetchRelayList({}).then((response) => {
      this.relayOptions = response.data.items
    })
  },

  // 加载设备列表
  async loadDeviceList() {
    try {
      let devlist = await app.globalData.getMyDevices() || []
      const devices = Object.values(devlist.items).map(device => ({
        ...device,
        displayName: `${device.callsign}-${device.ssid}(${device.cpuid}-${device.id})`
      }));
      this.setData({ devices })
    } catch (error) {
      console.error('Error loading device list:', error)
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
      await api.updateDevice({
        ...selectedDevice,
        group_id: groupData.id,
        last_voice_begin_time: "0001-01-01T00:00:00Z",
        last_voice_end_time: "0001-01-01T00:00:00Z",
      })

      wx.showToast({
        title: '加入成功，正在刷新数据...',
        icon: 'success'
      })

      groupData = await app.globalData.getGroup(groupData.id)
      this.loadGroupDetail(groupData)
      this.loadDeviceList()

      if (selectedDevice.callsign === app.globalData.userInfo.callsign && selectedDevice.ssid === 100) {
        app.globalData.currentGroup = groupData;
        app.globalData.currentDevice = selectedDevice;
      }

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

  formatGoTime(goTime) {
    if (goTime.length >= 19 && goTime.includes("T")) {
      const trimmedTime = goTime.substring(0, 19);
      return trimmedTime.replace("T", " ");
    } else {
      return '-';
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

  // 获取设备状态对应的样式类
  getStatusClass(statusId) {
    const status = DevStatusOptions.find(s => s.id === statusId);
    if (!status) return 'unknown';

    switch (status.name) {
      case '禁收': return 'disabled-receive';
      case '禁发': return 'disabled-send';
      default: return 'unknown';
    }
  },

  // 处理状态选择
  async handleStatusChange(e) {
    const statusId = e.currentTarget.dataset.value;
    const device = e.currentTarget.dataset.device;
    console.log('handleStatusChange', device)

    const userInfo = app.globalData.userInfo
    const currentCallsign = userInfo?.callsign

    if (!userInfo?.roles?.includes('admin') && device.callsign !== currentCallsign) {
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

    if (statusId === "1") {
      device.statusReceive = !device.statusReceive
    }
    if (statusId === "2") {
      device.statusSend = !device.statusSend
    }

    let status = 0
    if (device.statusReceive) {   
      status  = (status|1)
    }
    if (device.statusSend) {
      status  = (status|2)
    }

    device.status = status

    try {
      await api.updateDevice({
        ...device,
        status: status,
        last_voice_begin_time: "0001-01-01T00:00:00Z",
        last_voice_end_time: "0001-01-01T00:00:00Z",
      });

      wx.showToast({
        title: '状态更新成功',
        icon: 'success'
      });

      this.refreshData()
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

  // 处理换组
  async handleChangeGroup(e) {
    const device = e.currentTarget.dataset.device;
    this.setData({
      selectedDevice: device,
      selectedGroupId: device.group_id
    });
    this.showChangeGroupModal();
  },

  // Show change group modal
  showChangeGroupModal() {
    try {
      const groups = app.globalData.availableGroups || [];
      const validatedGroups = groups.map(group => ({
        id: group?.id || 0,
        name: group?.name || '未命名群组',
        online_dev_number: group?.online_dev_number || 0,
        total_dev_number: group?.total_dev_number || 0
      }));
      
      console.log('Showing change group modal with:', {
        groups: validatedGroups,
        selectedDevice: this.data.selectedDevice
      });
      
      this.setData({
        showChangeGroupModal: true,
        availableGroups: [],
        selectedGroupId: this.data.selectedDevice?.group_id || null
      });
      
      setTimeout(() => {
        this.setData({
          availableGroups: validatedGroups
        });
      }, 100);
      
    } catch (error) {
      console.error('Error showing change group modal:', error);
      wx.showToast({
        title: '加载群组列表失败',
        icon: 'none'
      });
    }
  },

  // Hide change group modal
  hideChangeGroupModal() {
    this.setData({
      showChangeGroupModal: false
    });
  },

  // Select group
  selectGroup(e) {
    try {
      if (!e || !e.currentTarget || !e.currentTarget.dataset) {
        throw new Error('Invalid event data');
      }

      const selectedGroup = e.currentTarget.dataset.group;
      
      if (!selectedGroup) {
        throw new Error('No group data found');
      }

      if (typeof selectedGroup.id === 'undefined') {
        throw new Error('Group ID is required');
      }

      const validatedGroup = {
        id: Number(selectedGroup.id) || 0,
        name: String(selectedGroup.name || '未命名群组'),
        online_dev_number: Number(selectedGroup.online_dev_number) || 0,
        total_dev_number: Number(selectedGroup.total_dev_number) || 0
      };

      if (isNaN(validatedGroup.id)) {
        throw new Error('Invalid group ID format');
      }

      this.setData({
        selectedGroupId: validatedGroup.id
      });

    } catch (error) {
      console.error('Error selecting group:', error);
      wx.showToast({
        title: '选择群组失败: ' + (error.message || '未知错误'),
        icon: 'none',
        duration: 3000
      });
      
      this.setData({
        selectedGroupId: null,
        showChangeGroupModal: false
      });
    }
  },

  async confirmChangeGroup() {
    console.log('Confirming group change...');
    try {
      const { selectedGroupId, selectedDevice } = this.data;
      const self = this;

      // Validate input data
      if (selectedGroupId === null || typeof selectedGroupId !== 'number') {
        throw new Error('Invalid group ID');
      }
      if (!selectedDevice) {
        throw new Error('No device selected');
      }

      const userInfo = app.globalData.userInfo;
      const currentCallsign = userInfo?.callsign;

      if (!userInfo?.roles?.includes('admin') && selectedDevice.callsign !== currentCallsign) {
        throw new Error('Insufficient permissions');
      }

      wx.showLoading({
        title: '正在处理中...',
        mask: true
      });

      await api.updateDevice({
        ...selectedDevice,
        group_id: selectedGroupId,
        last_voice_begin_time: "0001-01-01T00:00:00Z",
        last_voice_end_time: "0001-01-01T00:00:00Z",
      });

      wx.showToast({
        title: '换组成功，正在刷新数据...',
        icon: 'success'
      });

      await self.refreshData();
    } catch (error) {
      wx.showToast({
        title: error.message || '操作失败',
        icon: 'none'
      });
      console.error('Error:', error);
    } finally {
      wx.hideLoading();
      this.hideChangeGroupModal();
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
      default: return 'other';
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
      const devlist = Object.values(group.devmap || {});
      const devices = devlist.filter(device => device.callsign.toLowerCase().includes(searchInput));

      devices.sort((a, b) => {
        if (a.is_online === b.is_online) return 0;
        return a.is_online ? -1 : 1;
      });

      const devmap = new Array(devices.length);
      let onlineCount = 0;

      for (let i = 0; i < devices.length; i++) {
        const device = devices[i];
        if (device.is_online) onlineCount++;

        let typeId = 0;
        let modelId = 0;
        let rfTypeId = 0;
        let statusId = 0;

        try {
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

          rfTypeId = Number(device.rf_type);
          if (isNaN(rfTypeId)) {
            console.warn('Invalid device rf type:', device.rf_type);
            rfTypeId = 0;
          }
        } catch (error) {
          console.warn('Error parsing device type/model:', error);
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
          statusReceive: ((device.status & 1) === 1) ? true : false,
          statusSend: ((device.status & 2) === 2) ? true : false,
          rfTypeClass: this.getRFtypeClass(rfTypeId),
          groupTypeClass: this.getGroupTypeClass(groupTypeId),
          last_packet_time: device.last_packet_time,
          last_voice_begin_time: device.last_voice_begin_time,
          last_voice_end_time: this.formatGoTime(device.last_voice_end_time),
          qth: device.qth,
          create_time: device.create_time,
          update_time: device.update_time,
          online_time: device.online_time
        };
      }

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
        filteredDevices: devmap,
        'group.type': this.getGroupTypeName(groupTypeId),
        'group.typeName': this.getGroupTypeName(groupTypeId),
        'group.displayName': group?.id + '-' +group?.name
      };

      this.setData(update);

    } catch (error) {
      wx.showToast({
        title: '加载群组详情失败',
        icon: 'none'
      })
    }
  },

  onShow() {
    if (groupData) {
      this.refreshData()
    }
    this.loadDeviceList()
  },

  onPullDownRefresh() {
    if (groupData) {
      this.loadGroupDetail(groupData)
    }
    this.loadDeviceList()
    wx.stopPullDownRefresh()
  },

  toggleDetails(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      [`expandedDetails.${index}`]: !this.data.expandedDetails[index],
      showDetails: !this.data.showDetails
    });
  },

  navigateToDeviceSettings(e) {
    const userInfo = app.globalData.userInfo;
    const device = e.currentTarget.dataset.device;
    
    // 如果不是管理员，只显示当前用户的设备
    if (device.is_online &&
      (userInfo?.roles?.includes('admin') || device.callsign === userInfo?.callsign) &&
      device.device_parm
    ) {
      wx.navigateTo({
        url: `/pages/device-settings/device-settings?device=${encodeURIComponent(JSON.stringify(device))}`
      });
    }
  }
});
