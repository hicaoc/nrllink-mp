# 微信小程序 - 语音对讲系统

## 功能概述
本小程序实现基于UDP协议的实时语音对讲功能，主要包含以下功能模块：

### 1. 用户系统
- 用户登录/登出
- 用户信息管理
- 权限控制

### 2. 语音对讲
- 实时语音采集
- G711/Opus编码
- UDP协议传输
- 实时语音播放
- 服务器状态检测

### 3. 系统配置
- 服务器地址配置
- 编码格式选择
- 设备信息管理

## 技术架构
- 前端：微信小程序原生开发
- 网络协议：UDP + NRL21协议封装
- 音频编码：G711/Opus
- 数据存储：微信本地存储

## 项目结构
```
.
├── app.js                # 小程序入口
├── app.json              # 全局配置
├── pages/
│   ├── login/            # 登录页面
│   │   ├── login.js
│   │   ├── login.wxml
│   │   └── login.wxss
│   └── voice/            # 语音对讲页面
│       ├── voice.js
│       ├── voice.wxml
│       └── voice.wxss
└── utils/
    ├── audio.js          # 音频处理模块
    ├── udp.js            # UDP通信模块
    └── nrl21.js          # NRL21协议处理
```

## 使用说明

### 1. 登录系统
- 输入用户名和密码登录
- 登录成功后获取用户信息
- 自动保存登录状态

### 2. 语音对讲
1. 选择编码格式（G711/Opus）
2. 按住"讲话"按钮开始录音
3. 松开按钮停止录音并发送
4. 实时接收并播放其他用户的语音

### 3. 系统配置
- 修改服务器地址
- 查看设备信息
- 切换编码格式

## 开发说明

### 协议格式
语音数据采用NRL21协议封装，主要字段：
- Version: 协议版本（固定"NRL2"）
- Length: 数据长度
- CPUID: 设备唯一标识
- Type: 数据类型（1:心跳，2:G711，8:Opus）
- CallSign: 用户呼号
- DATA: 语音数据

### 音频处理
- 采样率：8000Hz
- 位深：16bit
- 原始数据率：128kbps (8000 samples/s * 16 bits)
- G711压缩后数据率：64kbps
- 帧间隔：62.5ms
- 每帧大小：4KB
- UDP分包：每500字节为一个包，每帧分成8个包发送

## 注意事项
1. 确保麦克风权限已开启
2. 保持网络连接稳定
3. 服务器默认地址：nrlptt.com
4. 语音端口：60050
5. 心跳间隔：5秒

## 版本历史
- v1.0.0 初始版本
  - 实现基本语音对讲功能
  - 支持G711编码
  - 实现用户登录系统
