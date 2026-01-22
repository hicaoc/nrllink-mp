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
    // --- 移除模态框相关 data ---
    // showChangeGroupModal: false, 
    // availableGroups: [], 
    // selectedGroupId: null 
    // --- 添加 Picker 相关 data ---
    availableGroupsForPicker: [] // 用于 Picker 的群组列表
  },
  onLoad(options) {
    // 绑定所有需要的方法
    //console.log('onLoad-group-detail',app.globalData.currentDevice)

    // this.onSearchInput = this.onSearchInput.bind(this)
    // this.loadGroupDetail = this.loadGroupDetail.bind(this);
    // this.loadDeviceList = this.loadDeviceList.bind(this);
    // this.toggleDetails = this.toggleDetails.bind(this)
    // this.navigateToDeviceSettings = this.navigateToDeviceSettings.bind(this)

    let currentDevice = app.globalData.currentDevice
    currentDevice.displayName = currentDevice.callsign + '-' + currentDevice.ssid + '-' + currentDevice.dmrid + '-' + currentDevice.id
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
        displayName: `${device.callsign}-${device.ssid}(${device.dmrid}-${device.id})`
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
      // Capture the response from the API call
      const response = await api.updateDevice({
        ...selectedDevice,
        group_id: groupData.id,
        last_voice_begin_time: "0001-01-01T00:00:00Z",
        last_voice_end_time: "0001-01-01T00:00:00Z",
      });

      console.log('updateDevice response:', response);
      // Check the response code
// Success case
      wx.showToast({
        title: '加入成功，正在刷新数据...',
        icon: 'success',
        duration: 3000 // Further increase the duration for the success message
      });

        groupData = await app.globalData.getGroup(groupData.id);
        this.loadGroupDetail(groupData);
        this.loadDeviceList();

        if (selectedDevice.callsign === app.globalData.userInfo.callsign && selectedDevice.ssid === 100) {
          app.globalData.currentGroup = groupData;
          app.globalData.currentDevice = selectedDevice;
        }

        // Consider removing the second success toast or making it more specific
        // wx.showToast({
        //   title: '数据刷新完成',
        //   icon: 'success'
        // });
      
    } catch (error) {
      // Handle network errors or exceptions during the API call
      wx.showToast({
        title: error.message || '操作失败',
        icon: 'none'
      });
      console.error('Error joining group:', error);
    } finally {
      wx.hideLoading();
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

  // --- 移除模态框相关函数 ---
  // handleChangeGroup, showChangeGroupModal, hideChangeGroupModal, selectGroup, confirmChangeGroup

  // --- 新增 Picker 选择事件处理函数 ---
  async onGroupPickerChange(e) {
    try {
      const selectedIndex = e.detail.value; // 获取选中的索引
      const selectedGroup = this.data.availableGroupsForPicker[selectedIndex]; // 获取选中的群组对象
      const deviceToChange = e.currentTarget.dataset.device; // 获取当前操作的设备对象

      if (!selectedGroup || !deviceToChange) {
        console.error('Picker selection error: Missing group or device data.');
        wx.showToast({ title: '选择出错', icon: 'none' });
        return;
      }

      const newGroupId = selectedGroup.id; // 获取新群组的 ID

      // 权限校验 (与之前 confirmChangeGroup 逻辑一致)
      const userInfo = app.globalData.userInfo;
      const currentCallsign = userInfo?.callsign;
      if (!userInfo?.roles?.includes('admin') && deviceToChange.callsign !== currentCallsign) {
         wx.showToast({ title: '权限不足', icon: 'error' }); // 使用 error 图标
         return;
      }

      // 防止重复提交或无效选择 (如果选择的群组就是当前群组)
      if (newGroupId === deviceToChange.group_id) {
        // wx.showToast({ title: '已在该群组', icon: 'none' });
        return; // 静默处理或给提示
      }


      // 调用 API 更新设备群组
      await api.updateDevice({
        ...deviceToChange, // 传入完整的设备信息
        group_id: newGroupId, // 更新 group_id
        // 确保时间字段被正确处理，如果API需要特定格式或不需要这些字段，请调整
        last_voice_begin_time:  "0001-01-01T00:00:00Z",
        last_voice_end_time: "0001-01-01T00:00:00Z",
      })


      wx.showToast({ title: '切换成功',  duration: 3000,  icon: 'success' });

      // 刷新当前页面数据
      await this.refreshData();

    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message || '切换失败', icon: 'none' });
      console.error('Error changing group via picker:', error);
    }
  },

  // --- 新增加载可用群组列表的函数 ---
  loadAvailableGroups() {
    try {
      const groups = app.globalData.availableGroups || [];
      // 过滤无效群组并添加用于 Picker 显示的字段
      const validatedGroups = groups.map(group => {
        if (typeof group !== 'object' || group === null) return null;
        const id = group.id;
        const name = group.name;
        const idIsValid = (typeof id === 'number' && !isNaN(id)) || (typeof id === 'string' && id.trim() !== '');
        if (!idIsValid) return null;

        return {
          ...group, // 保留原始群组信息
          id: id, // 确保 id 存在
          displayGroupName: `${id} - ${typeof name === 'string' ? name : '未命名'}` // 创建 Picker 显示的名称
        };
      }).filter(group => group !== null);

      this.setData({ availableGroupsForPicker: validatedGroups });
      //console.log('Loaded available groups for picker:', validatedGroups);

    } catch (error) {
      console.error('Error loading available groups for picker:', error);
      wx.showToast({ title: '加载群组列表失败', icon: 'none' });
      this.setData({ availableGroupsForPicker: [] }); // 出错时清空列表
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
    // 每次显示页面时都刷新数据和群组列表
    if (groupData && groupData.id) { // 确保 groupData 有效
      this.refreshData();
    } else {
       console.warn("Missing groupData in onShow, cannot refresh group details.");
       // 可能需要处理 groupData 无效的情况，例如返回上一页或提示错误
    }
    this.loadDeviceList(); // 加载用户自己的设备列表（用于加入群组）
    this.loadAvailableGroups(); // 加载所有可用群组列表（用于 Picker）
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
