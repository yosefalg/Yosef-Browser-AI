import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { getCurrentSession } from '@/lib/auth';
import { getVpnProvisioningState, isVpnConnected } from '@/lib/vpn';

type State = { signedIn:boolean; vpnConnected:boolean; vpnReady:boolean; vpnSource:string };

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

  const vpnText=state.vpnConnected ? 'متصل ومحمي' : state.vpnReady ? 'جاهز للاتصال' : 'بانتظار تجهيز الخدمة';
  const accountText=state.signedIn ? 'الحساب متصل' : 'غير مسجل الدخول';

  return <SafeAreaView style={s.root}>
    <View style={s.head}><Pressable onPress={()=>router.back()} style={s.back}><Text style={s.backText}>‹</Text></Pressable><View style={s.headText}><Text style={s.title}>حالة RAID</Text><Text style={s.sub}>الحساب والحماية في مكان واحد</Text></View><View style={{width:42}}/></View>
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={s.summary}>
        <View style={s.summaryTop}><Text style={s.version}>RAID {version}</Text><View style={[s.liveDot,(state.signedIn||state.vpnConnected)&&s.liveDotOn]}/></View>
        <Text style={s.summaryTitle}>مركز الحالة</Text>
        <Text style={s.summaryText}>عرض مختصر وثابت لحالة الحساب وVPN والإصدار المثبت.</Text>
      </View>

      <View style={s.grid}>
        <StatusCard title="الحساب" value={accountText} ok={state.signedIn}/>
        <StatusCard title="RAID VPN" value={vpnText} ok={state.vpnConnected}/>
        <StatusCard title="مصدر VPN" value={sourceLabel(state.vpnSource)} ok={state.vpnReady}/>
        <StatusCard title="الإصدار" value={version} ok/>
      </View>

      <Pressable disabled={busy} onPress={refresh} style={({pressed})=>[s.refresh,(busy||pressed)&&s.pressed]}>{busy?<View style={s.loadingRow}><ActivityIndicator size="small"/><Text style={s.refreshText}>جارٍ التحقق…</Text></View>:<Text style={s.refreshText}>تحديث الحالة</Text>}</Pressable>
      <Pressable onPress={()=>router.push('/vpn')} style={({pressed})=>[s.secondary,pressed&&s.pressed]}><Text style={s.secondaryText}>فتح RAID VPN</Text></Pressable>
    </ScrollView>
  </SafeAreaView>;
}

function sourceLabel(value:string){if(value==='service')return 'RAID Server';if(value==='cache')return 'محفوظ آمنًا';if(value==='local')return 'إعداد محلي';return 'غير مهيأ';}
function StatusCard({title,value,ok}:{title:string;value:string;ok:boolean}){return <View style={s.card}><View style={s.cardHead}><View style={[s.dot,ok&&s.dotOn]}/><Text style={s.cardTitle} numberOfLines={1}>{title}</Text></View><Text style={s.cardValue} numberOfLines={2}>{value}</Text></View>}

const s=StyleSheet.create({
  root:{flex:1,backgroundColor:'#ECE9E4'},
  head:{height:68,flexDirection:'row',alignItems:'center',paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:'#D8D2CB',backgroundColor:'#F6F3EE'},
  back:{width:42,height:42,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#D8D2CB'},backText:{fontSize:31,color:'#4A433D',marginTop:-3},headText:{flex:1,alignItems:'center'},title:{fontSize:19,fontWeight:'900',color:'#2D2A27'},sub:{fontSize:10,color:'#8A8179',marginTop:2},
  content:{paddingHorizontal:16,paddingTop:16,paddingBottom:28,gap:12},
  summary:{padding:18,borderRadius:24,backgroundColor:'#D8CEC2',borderWidth:1,borderColor:'#C8BBAF'},summaryTop:{flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center'},version:{fontSize:11,fontWeight:'900',color:'#765F4E'},liveDot:{width:9,height:9,borderRadius:5,backgroundColor:'#A79F98'},liveDotOn:{backgroundColor:'#567A67'},summaryTitle:{fontSize:21,fontWeight:'900',color:'#342E29',textAlign:'right',marginTop:8},summaryText:{marginTop:5,color:'#665D55',lineHeight:19,textAlign:'right',fontSize:12},
  grid:{flexDirection:'row-reverse',flexWrap:'wrap',justifyContent:'space-between',rowGap:10},
  card:{width:'48.5%',minHeight:104,borderRadius:20,backgroundColor:'#FAF9F7',borderWidth:1,borderColor:'#D8D2CB',padding:14,justifyContent:'space-between'},cardHead:{flexDirection:'row-reverse',alignItems:'center',gap:7},dot:{width:10,height:10,borderRadius:5,backgroundColor:'#A79F98'},dotOn:{backgroundColor:'#567A67'},cardTitle:{flex:1,color:'#4A433D',fontWeight:'900',fontSize:13,textAlign:'right'},cardValue:{color:'#7A716A',fontSize:12,textAlign:'right',lineHeight:18},
  refresh:{height:52,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'#9A806C'},refreshText:{color:'#fff',fontWeight:'900'},loadingRow:{flexDirection:'row-reverse',alignItems:'center',gap:9},pressed:{opacity:.65},secondary:{height:50,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'#E0D9D2',borderWidth:1,borderColor:'#CFC5BC'},secondaryText:{color:'#5D5148',fontWeight:'900'}
});
