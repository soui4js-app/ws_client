import * as soui4 from "soui4";
import {R} from "uires/R.js";
import * as ws4js from "ws4js.dll"

var g_workDir="";

/**
 * 登陆状态
 */
const LoginState = {
	Logout: 0, //登陆失败
	Logining: 1,//正在登陆
	Login: 2,//登陆成功
  };

 /**
  * 用户列表适配器对象，继承自soui4.SLvAdapter
  */ 
class PeerLvAdapter extends soui4.SLvAdapter{
	constructor(mainDlg){
		super();
		this.mainDlg = mainDlg;
		//设置onGetView和onGetCount这两个回调
		this.onGetView= this.getView;
		this.onGetCount = this.getCount;
		this.id = -1;
		this.peers = []; //prepare a app list.
	}

	/**
	 * onGetView回调方法，在这个方法中填充当前列表项的显示数据
	 * @param {number} pos 列表项索引 
	 * @param {soui4.IItemPanel} pItem 列表项窗口UI
	 * @param {soui4.IXmlNode} pTemplate 列表项的xml模板
	 */
	getView(pos,pItem,pTemplate){
		if(pItem.GetChildrenCount()==0){
			pItem.InitFromXml(pTemplate);
		}
		if(pos==0){
			//all
			pItem.FindIChildByName("txt_name").SetWindowText("all");
			pItem.FindIChildByName("txt_id").SetWindowText("-1");
		}else{
			pos--;
			pItem.FindIChildByName("txt_name").SetWindowText(this.peers[pos].name);
			if(this.peers[pos].id == this.id)
				pItem.FindIChildByName("txt_id").SetWindowText(""+this.peers[pos].id+"*");
			else
				pItem.FindIChildByName("txt_id").SetWindowText(""+this.peers[pos].id);
		}
	}

	/**
	 * 获取列表数据量
	 * @returns 这里返回peer数据+1, 多的项用来代表全体peer
	 */
	getCount(){
		return this.peers.length+1;
	}

	/**
	 * 更新peer数据
	 * @param {object} peers 所有peer的name,id数据 
	 */
	setPeers(peers){
		for(let i=0;i<peers.length;i++){
			if(peers[i].id == this.id){
				let myself = peers[i];
				peers.splice(i,1);
				peers.unshift(myself);				
				break;
			}
		}
		this.peers = peers;
		this.notifyDataSetChanged();
	}
	
	/**
	 * 设置当前peer自己的id，用来在显示的时候将自己移动到最前
	 * @param {number} id peer自己的id 
	 */
	setMyselfId(id){
		this.id = id;
	}

	/**
	 * 获取peer数据
	 * @returns 
	 */
	getPeers(){
		return this.peers;
	}

	/**
	 * 从peer的id转换为name
	 * @param {number} id 
	 * @returns peer的name
	 */
	id2name(id){
		for(let i=0;i<this.peers.length;i++){
			if(this.peers[i].id == id){
				return this.peers[i].name;
			}
		}
		return "unknown";
	}
};

class MainDialog extends soui4.JsHostWnd{
	constructor(){
		super("layout:dlg_main");
		this.onEvt = this.onEvent;
		this.loginState = LoginState.Logout;
		this.ws = null;
		this.lvapi=null;
		this.lvAdapter=null;
		this.id = -2;
	}

	onEvent(e){
		if(e.GetID()==soui4.EVT_INIT){//event_init
			this.init();
		}else if(e.GetID()==soui4.EVT_EXIT){
			this.uninit();
		}
		return false;
	}
	
	/**
	 * 登陆按钮响应函数
	 * @param {soui4.IEvtArgs} e 
	 * @returns 
	 */
	onBtnLogin(e){
		if(this.loginState != LoginState.Logout)
		   return;
		this.loginState = LoginState.Logining;

		let svr = this.FindIChildByName("edit_svr").GetWindowText(true);
		let username = this.FindIChildByName("edit_user").GetWindowText(true);
		if(!svr.endsWith("/"))
		   svr += "/";
		svr += "?name="+username;

		   this.ws = new ws4js.WebSocket(svr,"",
		   g_workDir + "\\cert\\server.crt",
		   true,true,true
		   );
   
		   this.ws.cbHandler = this;
		   this.ws.onConnected = this.onWsConn;
		   this.ws.onClose = this.onWsClose;
		   this.ws.onText = this.onWsText;
		   this.ws.onError = this.onWsErr;
		   this.FindIChildByName("btn_login").EnableWindow(false,true);
	}

	/**
	 * 发送聊天数据按钮响应函数
	 * @param {soui4.IEvtArgs} e 
	 * @returns 
	 */
	onBtnSend(e){
		if(this.loginState != LoginState.Login)
			return;
		let input = this.FindIChildByName("edit_input").GetWindowText(true);
		let to = this.lvapi.GetSel();
		if(to<=0)
			to = -1;
		else
			to = this.lvAdapter.getPeers()[to-1].id;
		if(to == this.id){
			soui4.SMessageBox(this.GetHwnd(),"can't send to yourself","error",soui4.MB_OK|soui4.MB_ICONERROR);
			return;
		}
		let msg = {type:"chat",data:{content:input,to:to}};
		this.ws.sendText(JSON.stringify(msg),-1);
	}

	/**
	 * 连接服务器成功回调
	 */
	onWsConn(){
		this.loginState= LoginState.Login;
		console.log("login succeed!");
	}

	/**
	 * 连接断开回调
	 */
	onWsClose(){
		this.loginState= LoginState.Logout;
		console.log("conn break, set state to logout");
		this.FindIChildByName("btn_login").EnableWindow(true,true);
	}
	
	/**
	 * 将收到的文本消息输出到聊天历史窗口
	 * @param {string} text 
	 */
	appendMsg(text){
		let edit_chat = this.FindIChildByName("edit_chat");
		let editApi = soui4.QiIRichEdit(edit_chat);
		editApi.SetSel(-1,-1,false);
		editApi.ReplaceSel(text,false);
		editApi.Release();
		edit_chat.SSendMessage(0x115,7)//WM_VSCROLL= 0x115, SB_BOTTOM=7
	}

	/**
	 * 收到文本消息
	 * @param {string} str 文本消息json，支持peers,id,chat 3种消息类型
	 */
	onWsText(str){
		console.log("recv:"+str);
		try{
			let msg = JSON.parse(str);
			if(msg.type=="peers"){
				//receive peers
				this.lvAdapter.setPeers(msg.peers);
			}else if(msg.type=="id"){
				this.id = msg.id;
				this.lvAdapter.setMyselfId(this.id);
			}else if(msg.type=="chat"){
				let fromId = msg.data.from;
				let from = this.lvAdapter.id2name(fromId);
				let content = msg.data.content;
				let text = "["+from+"]:"+content+"\n";
				this.appendMsg(text);
			}
			
		}catch(e){
			console.error("ws text err:",e);
		}

	}

	/**
	 * websocket错误回调的处理
	 * @param {string} errStr 错误描述 
	 */
	onWsErr(errStr){
		this.loginState= LoginState.Logout;
		console.log("ws err:"+errStr);
		this.FindIChildByName("btn_login").EnableWindow(true,true);
		soui4.SMessageBox(this.GetHwnd(),errStr,"conn err",soui4.MB_OK|soui4.MB_ICONERROR);
	}

	/**
	 * 初始化
	 */
	init(){
		console.log("init");
		soui4.SConnect(this.FindIChildByName("btn_login"),soui4.EVT_CMD,this,this.onBtnLogin);
		soui4.SConnect(this.FindIChildByName("btn_send"),soui4.EVT_CMD,this,this.onBtnSend);
		let lv_applist=this.FindIChildByName("lv_peer");
		this.lvapi = soui4.QiIListView(lv_applist);
		this.lvAdapter = new PeerLvAdapter(this);
		this.lvapi.SetAdapter(this.lvAdapter);
		
	}

	/**
	 * 程序退出前处理
	 */
	uninit(){
		//do uninit.
		this.ws = null;
		this.lvapi.SetAdapter(null);
		this.lvapi.Release();
		this.lvapi=null;
		this.lvAdapter=null;

		console.log("uninit");
	}
};


function main(inst,workDir,args)
{
	soui4.log(workDir);
	g_workDir = workDir;
	let theApp = soui4.GetApp();
	let res = theApp.InitXmlNamedID(R.name_arr,R.id_arr);
	console.log("InitXmlNamedID ret:",res);
	let souiFac = soui4.CreateSouiFactory();
	//*
	let resProvider = souiFac.CreateResProvider(1);
	soui4.InitFileResProvider(resProvider,workDir + "\\uires");
	//*/
	/*
	// show how to load resource from a zip file
	let resProvider = soui4.CreateZipResProvider(theApp,workDir +"\\uires.zip","souizip");
	if(resProvider === 0){
		soui4.log("load res from uires.zip failed");
		return -1;
	}
	//*/
	let resMgr = theApp.GetResProviderMgr();
	resMgr.AddResProvider(resProvider,"uidef:xml_init");
	resProvider.Release();
	let hwnd = soui4.GetActiveWindow();
	let hostWnd = new MainDialog();
	hostWnd.Create(hwnd,0,0,0,0);
	hostWnd.SendMessage(0x110,0,0);//send init dialog message.
	hostWnd.ShowWindow(soui4.SW_SHOWNORMAL); 
	souiFac.Release();
	let ret= theApp.Run(hostWnd.GetHwnd());
	hostWnd=null;
	soui4.log("js quit");
	return ret;
}

globalThis.main=main;