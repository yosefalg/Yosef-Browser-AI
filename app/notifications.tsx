import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { getCurrentSession } from '@/lib/auth';
import { getVpnProvisioningState, isVpnConnected } from '@/lib/vpn';

type State = {
  signedIn: boolean;
  vpnConnected: boolean;
  vpnReady: boolean;
  vpnSource: string;
};

export default function NotificationsScreen(){
  const version=Constants.expoConfig?.version || '—';
  const [busy,setBusy]=useState(true);
  const [state,setState]=useState<State>({signedIn:false,vpnConnected:false,vpnReady:false,vpnSource:'none'});

  const refresh=useCallback(async()=>{
    setBusy(true);
    try{
      const session=await getCurrentSession().catch(()=>null);
      const connected=await isVpnConnected().catch(()=>false);
      const profile=session ? await getVpnProvisioningState().catch(()=>({configured:false,source:'none' as const})) : {configured:false,source:'none' as const};
      setState({signedIn:Boolean(session),vpnConnected:connected,vpnReady:profile.configured,vpnSource:profile.source});
    } finally { setBusy(false); }
  },[]);

  useFocusEffect(useCallback(()=>{void refresh();return()=>{}},[refresh]));
  useEffect(()=>{const sub=AppState.addEventListener('change',v=>{if(v==='active')void refresh()});return()=>sub.remove()},[refresh]);

  const vpnText=state.vpnConnected ? 'VPN متصل ومحمي الآن' : state.vpnReady ? 'VPN جاهز للاتصال' : 'VPN يحتاج تجهيز تلقائي من الخدمة';
  const accountText=state.signedIn ? 'جلسة حساب RAID فعالة' : 'لم يتم تسجيل الدخول بعد';

  return <SafeAreaView style={s.root}>
    <View style={s.head}><Pressable onPress={()=>router.back()} style={s.back}><Text style={s.backText}>‹</Text></Pressable><View style={s.headText}><Text style={s.title}>مركز التنبيهات</Text><Text style={s.sub}>حالة RAID الحقيقية الآن</Text></View><View style={{width:42}}/></View>
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.hero}><Text style={s.heroKicker}>RAID {version}</Text><Text style={s.heroTitle}>كل شيء واضح في شاشة واحدة</Text><Text style={s.heroText}>هذه الحالة تُقرأ مباشرة من التطبيق والجلسة وVPN، وليست إشعارات وهمية.</Text></View>

      <StatusCard title="الحساب" value={accountText} ok={state.signedIn}/>
      <StatusCard title="RAID VPN" value={vpnText} ok={state.vpnConnected}/>
      <StatusCard title="مصدر إعداد VPN" value={sourceLabel(state.vpnSource)} ok={state.vpnReady}/>
      <StatusCard title="الإصدار المثبت" value={`RAID Browser ${version}`} ok/>

      <Pressable disabled={busy} onPress={refresh} style={[s.refresh,busy&&s.disabled]}>{busy?<ActivityIndicator/>:<Text style={s.refreshText}>تحديث الحالة الآن</Text>}</Pressable>
      <Pressable onPress={()=>router.push('/vpn')} style={s.secondary}><Text style={s.secondaryText}>فتح RAID VPN</Text></Pressable>
    </ScrollView>
  </SafeAreaView>
}

function sourceLabel(value:string){
  if(value==='service')return 'RAID Server';
  if(value==='cache')return 'نسخة آمنة محفوظة';
  if(value==='local')return 'إعداد محلي';
  return 'غير مهيأ بعد';
}

function StatusCard({title,value,ok}:{title:string;value:string;ok:boolean}){return <View style={s.card}><View style={[s.dot,ok&&s.dotOn]}/><View style={s.cardCopy}><Text style={s.cardTitle}>{title}</Text><Text style={s.cardValue}>{value}</Text></View></View>}

const s=StyleSheet.create({
  root:{flex:1,backgroundColor:'#ECE9E4'},head:{minHeight:72,flexDirection:'row',alignItems:'center',paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:'#D8D2CB',backgroundColor:'rgba(246,243,238,.98)'},back:{width:42,height:42,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,.72)',borderWidth:1,borderColor:'#D8D2CB'},backText:{fontSize:31,color:'#4A433D',marginTop:-3},headText:{flex:1,alignItems:'center'},title:{fontSize:19,fontWeight:'900',color:'#2D2A27'},sub:{fontSize:10,color:'#8A8179',marginTop:2},content:{padding:18,gap:12,paddingBottom:40},hero:{padding:22,borderRadius:27,backgroundColor:'#D8CEC2',borderWidth:1,borderColor:'#C8BBAF'},heroKicker:{fontSize:11,fontWeight:'900',color:'#765F4E',textAlign:'right'},heroTitle:{fontSize:22,fontWeight:'900',color:'#342E29',textAlign:'right',marginTop:5},heroText:{marginTop:8,color:'#665D55',lineHeight:21,textAlign:'right'},card:{minHeight:74,borderRadius:22,backgroundColor:'rgba(255,255,255,.72)',borderWidth:1,borderColor:'#D8D2CB',padding:15,flexDirection:'row-reverse',alignItems:'center',gap:12},dot:{width:12,height:12,borderRadius:6,backgroundColor:'#A79F98'},dotOn:{backgroundColor:'#567A67'},cardCopy:{flex:1,alignItems:'flex-end'},cardTitle:{color:'#4A433D',fontWeight:'900'},cardValue:{marginTop:5,color:'#7A716A',fontSize:12,textAlign:'right'},refresh:{height:54,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'#9A806C',marginTop:2},refreshText:{color:'#fff',fontWeight:'900'},disabled:{opacity:.55},secondary:{height:50,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'#E0D9D2',borderWidth:1,borderColor:'#CFC5BC'},secondaryText:{color:'#5D5148',fontWeight:'900'}
});
