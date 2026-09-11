import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { getCurrentSession, getSupabase } from '@/lib/auth';
import { getVpnProvisioningState, isVpnConnected } from '@/lib/vpn';

type State={signedIn:boolean;vpnConnected:boolean;vpnReady:boolean;vpnSource:string};
const EMPTY:State={signedIn:false,vpnConnected:false,vpnReady:false,vpnSource:'none'};
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

async function resolveSession(){
  let session=await getCurrentSession().catch(()=>null);
  if(session)return session;
  await sleep(180);
  session=await getCurrentSession().catch(()=>null);
  return session;
}

export default function NotificationsScreen(){
  const version=Constants.expoConfig?.version||'—';
  const [busy,setBusy]=useState(true);
  const [state,setState]=useState<State>(EMPTY);
  const [lastChecked,setLastChecked]=useState<Date|null>(null);

  const refresh=useCallback(async()=>{
    setBusy(true);
    try{
      const session=await resolveSession();
      const connected=await isVpnConnected().catch(()=>false);
      let profile:{configured:boolean;source:string}={configured:false,source:'none'};
      if(session){
        try{profile=await getVpnProvisioningState();}catch{profile={configured:false,source:'none'};}
      }
      setState({signedIn:Boolean(session),vpnConnected:connected,vpnReady:profile.configured,vpnSource:profile.source});
    }finally{
      setLastChecked(new Date());
      setBusy(false);
    }
  },[]);

  useFocusEffect(useCallback(()=>{void refresh();return()=>{}},[refresh]));

  useEffect(()=>{
    const appSub=AppState.addEventListener('change',value=>{if(value==='active')void refresh()});
    const {data}=getSupabase().auth.onAuthStateChange((_event,session)=>{
      setState(prev=>({...prev,signedIn:Boolean(session)}));
      void refresh();
    });
    return()=>{appSub.remove();data.subscription.unsubscribe();};
  },[refresh]);

  const vpnText=state.vpnConnected?'متصل ومحمي':state.vpnReady?'جاهز للاتصال':'غير مهيأ بعد';
  const accountText=state.signedIn?'الحساب متصل':'غير مسجل الدخول';
  const sourceText=sourceLabel(state.vpnSource);

  return <SafeAreaView edges={['top','bottom','left','right']} style={s.root}>
    <View style={s.head}>
      <Pressable onPress={()=>router.back()} style={s.back}><Text style={s.backText}>‹</Text></Pressable>
      <View style={s.headText}><Text style={s.title}>حالة RAID</Text><Text style={s.sub}>الحساب والحماية في مكان واحد</Text></View>
      <View style={{width:42}}/>
    </View>
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.summary}>
        <View style={s.summaryTop}><Text style={s.version}>RAID {version}</Text><View style={[s.liveDot,(state.signedIn||state.vpnConnected)&&s.liveDotOn]}/></View>
        <Text style={s.summaryTitle}>مركز الحالة</Text>
        <Text style={s.summaryText}>الحالة تُحدّث من جلسة الحساب الفعلية وWireGuard، وليس من قيمة مخزنة قديمة.</Text>
        <Text style={s.checked}>{lastChecked?`آخر تحقق: ${lastChecked.toLocaleTimeString('ar-IQ',{hour:'2-digit',minute:'2-digit'})}`:'جارٍ التحقق…'}</Text>
      </View>

      <View style={s.grid}>
        <StatusCard title="الحساب" value={accountText} ok={state.signedIn}/>
        <StatusCard title="RAID VPN" value={vpnText} ok={state.vpnConnected||state.vpnReady}/>
        <StatusCard title="مصدر VPN" value={sourceText} ok={state.vpnReady}/>
        <StatusCard title="الإصدار" value={version} ok/>
      </View>

      <Pressable disabled={busy} onPress={refresh} style={({pressed})=>[s.refresh,(busy||pressed)&&s.pressed]}>
        {busy?<View style={s.loadingRow}><ActivityIndicator size="small" color="#fff"/><Text style={s.refreshText}>جارٍ التحقق…</Text></View>:<Text style={s.refreshText}>تحديث الحالة</Text>}
      </Pressable>
      {!state.vpnReady?<Pressable onPress={()=>router.push('/vpn-provider')} style={s.provider}><Text style={s.providerText}>اختيار مزود VPN مجاني</Text></Pressable>:null}
      <Pressable onPress={()=>router.push('/vpn')} style={({pressed})=>[s.secondary,pressed&&s.pressed]}><Text style={s.secondaryText}>فتح RAID VPN</Text></Pressable>
    </ScrollView>
  </SafeAreaView>;
}

function sourceLabel(value:string){if(value==='service')return 'RAID Server';if(value==='cache')return 'محفوظ آمنًا';if(value==='local')return 'مزود محلي';return 'غير مهيأ';}
function StatusCard({title,value,ok}:{title:string;value:string;ok:boolean}){return <View style={s.card}><View style={s.cardHead}><View style={[s.dot,ok&&s.dotOn]}/><Text style={s.cardTitle} numberOfLines={1}>{title}</Text></View><Text style={s.cardValue} numberOfLines={2}>{value}</Text></View>}

const s=StyleSheet.create({
  root:{flex:1,backgroundColor:'#ECE9E4'},head:{minHeight:64,flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingVertical:6,borderBottomWidth:1,borderBottomColor:'#D8D2CB',backgroundColor:'#F6F3EE'},back:{width:42,height:42,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#D8D2CB'},backText:{fontSize:31,color:'#4A433D',marginTop:-3},headText:{flex:1,alignItems:'center'},title:{fontSize:19,fontWeight:'900',color:'#2D2A27'},sub:{fontSize:10,color:'#8A8179',marginTop:2},
  content:{paddingHorizontal:16,paddingTop:16,paddingBottom:28,gap:12},summary:{padding:18,borderRadius:24,backgroundColor:'#D8CEC2',borderWidth:1,borderColor:'#C8BBAF'},summaryTop:{flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center'},version:{fontSize:11,fontWeight:'900',color:'#765F4E'},liveDot:{width:9,height:9,borderRadius:5,backgroundColor:'#A79F98'},liveDotOn:{backgroundColor:'#567A67'},summaryTitle:{fontSize:21,fontWeight:'900',color:'#342E29',textAlign:'right',marginTop:8},summaryText:{marginTop:5,color:'#665D55',lineHeight:19,textAlign:'right',fontSize:12},checked:{marginTop:8,color:'#8A8179',fontSize:10,textAlign:'right'},
  grid:{flexDirection:'row-reverse',flexWrap:'wrap',justifyContent:'space-between',rowGap:10},card:{width:'48.5%',minHeight:104,borderRadius:20,backgroundColor:'#FAF9F7',borderWidth:1,borderColor:'#D8D2CB',padding:14,justifyContent:'space-between'},cardHead:{flexDirection:'row-reverse',alignItems:'center',gap:7},dot:{width:10,height:10,borderRadius:5,backgroundColor:'#A79F98'},dotOn:{backgroundColor:'#567A67'},cardTitle:{flex:1,color:'#4A433D',fontWeight:'900',fontSize:13,textAlign:'right'},cardValue:{color:'#7A716A',fontSize:12,textAlign:'right',lineHeight:18},
  refresh:{height:52,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'#9A806C'},refreshText:{color:'#fff',fontWeight:'900'},loadingRow:{flexDirection:'row-reverse',alignItems:'center',gap:9},pressed:{opacity:.65},provider:{height:50,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'#466B91'},providerText:{color:'#fff',fontWeight:'900'},secondary:{height:50,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'#E0D9D2',borderWidth:1,borderColor:'#CFC5BC'},secondaryText:{color:'#5D5148',fontWeight:'900'}
});
