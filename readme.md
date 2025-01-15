开发一个微信小程序， 使用udp协议发送和接受语音消息



 本程序共含2个页面，
 其中一个是登录页面， 输入用户名和密码登录，登录后获取到服务器返回的token，并在本地保存用户登录状态，这也是小程序未登录时的的默认打开页面
 。然后通过getinfo api接口获取当前登录用户的其他信息，用户名，呼号等信息。
 type userinfo struct {
	//uUID     string `db:"uuid"`
	PID      string `db:"pid" json:"pid"`
	ID       int    `db:"id" json:"id"`
	Name     string `db:"name" json:"name"`
	CallSign string `db:"callsign" json:"callsign"`
	Gird     string `db:"gird" json:"gird"`
	Phone    string `db:"phone" json:"phone"`
	Password string `db:"password" json:"password"`
	//	JobTime  string `db:"job_time" json:"job_time"`
	Birthday string `db:"birthday" json:"birthday"`
	Sex      int    `db:"sex" json:"sex"`
	Address  string
	Mail     string
	//CanSpeekerDev *connPoll
	//GroupsList []map[uint64]bool
	DevList map[int]*deviceInfo `json:"devlist"` //key 房间号
	//ConnPoll map[int]*currentConnPool //群组连接池表，每个组有一个连接池列表 /key为组号
	Groups map[int]*group //呼号map
	//	userID        int            `db:"user_id" json:"user_id"`
	//Position          int                 `db:"position" json:"position"`
	Introduction string   `db:"introduction" json:"introduction"`
	Avatar       string   `db:"avatar" json:"avatar"`
	Roles        []string `db:"roles" json:"roles"`
	UpdateTime   string   `db:"update_time" json:"update_time"`
	CreateTime   string   `db:"create_time" json:"create_time"`

	Routes        string `json:"routes" db:"routes"`
	Status        int    `json:"status" db:"status"`
	LastLoginTime string `json:"last_login_time" db:"last_login_time"`
	LastLoginIP   string `json:"last_login_ip" db:"last_login_ip"`
	LoginErrTimes int    `json:"login_err_times" db:"login_err_times"`
	AlarmMsg      bool   `json:"alarm_msg" db:"alarm_msg"`
	NickName      string `json:"nickname" db:"nickname"`
	OpenID        string `json:"openid" db:"openid"`
}

 
 第二个页面上有几个对话框，显示用户的信息，姓名，呼号callsign ，还有一个单选框，选择编码协议是G711还是opus， 还有大大的圆形按钮“讲话Talking”，按下后，充麦克风获取音频，松开后停止，并将音频编码程G711或者Opus发送到服务器指定的端口， 其中服务器端口默认为60050， 服务器地址默认和登录服务器一默认是nrlptt.com，支持修改服务器地址，并在本地保存。这个页面还会接收从服务器返回的udp数据包，并解码程语音播放.
 服务器登录的端口号是https 443,和语音通话的端口不一样
 语音数据使用udp封装，具体格式参照下面的代码： 
   type NRL21packet struct {
	timeStamp  time.Time
	UDPAddrStr string
	UDPAddr    *net.UDPAddr //报文来源UDP地址和端口
	Version    string       //协议标识 “NRL2” 每个报文都以 NRL2 4个字节开头
	Length     uint16       //上层数据长度
	CPUID      string       //设备唯一标识 长度7字节
	Password   string       //密码
	Type       byte         //上层数据类型 一个字节 0:心跳，1：控制指令 2：G.711语音 3：上线认证，4：设备状态，入电压，温度等，CPU使用率等 5:msg
	Status     byte         //设备状态位
	Count      uint16       //报文计数器2节
	CallSign   string       //所有者呼号 6字节
	SSID       byte         //所有者呼号 1字节
	DevMode    byte         //设备型号
	DATA       []byte       //上层数据内容
}

func (n *NRL21packet) decodeNRL21(d []byte) (err error) {

	if len(d) < 48 {
		return errors.New("packet too short ")
	}
	n.Version = string(d[0:4])

	if n.Version != "NRL2" {
		return errors.New("not NRL packet ")
	}

	n.Length = binary.BigEndian.Uint16(d[4:6])

	n.CPUID = fmt.Sprintf("%02X", d[6:10])
	n.Password = fmt.Sprintf("%02X", d[10:13])
	n.Type = d[20]
	n.Status = d[21]
	n.Count = binary.BigEndian.Uint16(d[21:23])
	n.CallSign = string(bytes.TrimRight(d[24:30], string([]byte{13, 0})))
	n.SSID = d[30]
	n.DevMode = d[31]
	n.DATA = d[48:]

	return nil

}


收到的语音也是这个格式的报文，其中type字段是2代表心跳报文，需要在登录后，第二个页面的时候，每秒发送一个，如果收到服务器回包，代表服务器在线。type为5，代表数据包是G711语音数据，需要解码成语音播放。type为8代表是opus音频数据，也需要解码音频播放。 

按下对话按钮的时候，如果单选框选择的是g711，就用G711的格式编码语音发送，如果是opus，就是opus的格式编码语音发送。如果是G711，当语音数据采集到500字节发送一次，如果是opus可以按照最少延时和最小带宽占用的方式发送。