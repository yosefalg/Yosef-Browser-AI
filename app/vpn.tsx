import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { connectVpn, disconnectVpn, getVpnProvisioningState, isVpnConnected } from '@/lib/vpn';
import { getCurrentSession } from '@/lib/auth';

type VpnSource='service'|'local'|'cache'|'none';
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(expected:boolean){let state=await isVpnConnected().catch(()=>!expected);for(const delay of [250,650,1200]){if(state===expected)break;await sleep(delay);state=await isVpnConnected().catch(()=>state);}return state;}

export default function VpnScreen(){
  const [connected,setConnected]=useState(false);
  const [ready,setReady]=useState(false);
  const [signedIn,setSignedIn]=useState(false);
  const [source,setSource]=useState<VpnSource>('none');
  const [busy,setBusy]=useState(true);
  const [message,setMessage]=useState('');
  const operating=useRef(false);

  const refresh=useCallback(async()=>{
    if(operating.current)return;
    setBusy(true);
    try{
      const [session,active]=await Promise.all([getCurrentSession().catch(()=>null),isVpnConnected().catch(()=>false)]);
      setSignedIn(Boolean(session));setConnected(active);
      const profile=await getVpnProvisioningState().catch(()=>({configured:false,source:'none' as const}));
      setReady(profile.configured);setSource(profile.source);
      if(active)setMessage('RAID VPN متصل فعليًا على Android.');
      else if(profile.configured&&profile.source==='local')setMessage('WireGuard محلي محفوظ وجاهز — لا يحتاج تسجيل دخول.');
      else if(profile.configured)setMessage('إعداد VPN جاهز للاتصال.');
      else setMessage('لا يوجد إعداد VPN صالح بعد. أضف WireGuard محلي أو سجّل الدخول لمزامنة RAID Server.');
    }finally{setBusy(false);}
  },[]);

  useFocusEffect(useCallback(()=>{void refresh();return()=>{}},[refresh]));
  useEffect(()=>{const sub=AppState.addEventListener('change',s=>{if(s==='active')void refresh()});return()=>sub.remove();},[refresh]);

  const toggle=async()=>{
    if(operating.current)return;
    if(!connected&&!ready){router.push('/vpn-provider');return;}
    operating.current=true;setBusy(true);
    try{
      if(connected){await disconnectVpn();const state=await waitFor(false);setConnected(state);setMessage(state?'تعذر تأكيد قطع الاتصال.':'تم قطع اتصال RAID VPN.');}
      else {await connectVpn();const state=await waitFor(true);setConnected(state);if(!state)throw new Error('Android لم يؤكد تشغيل النفق. تحقق من إذن VPN.');setMessage('RAID VPN متصل الآن عبر نفق حقيقي.');}
    }catch(error){const text=error instanceof Error?error.message:'تعذر تنفيذ العملية.';setMessage(text);Alert.alert('RAID VPN',text);}
    finally{operating.current=false;setBusy(false);}
  };

  const sourceLabel=source==='local'?'WireGuard محلي':source==='service'?'RAID Server':source==='cache'?'إعداد محفوظ':'غير مهيأ';
  return <SafeAreaView edges={['top','bottom','left','right']} style={s.root}>
    <View style={s.header}><Pressable onPress={()=>router.back()} style={s.back}><Text style={s.backText}>‹</Text></Pressable><View style={s.head}><Text style={s.title}>RAID VPN</Text><Text style={s.sub}>Local-first • Real WireGuard</Text></View><View style={[s.dot,connected&&s.dotOn]}/></View>
    <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
      <View style={[s.hero,connected&&s.heroOn]}>
        <Text style={s.kicker}>{connected?'متصل ومحمي':ready?'جاهز للاتصال':'غير مهيأ'}</Text>
        <View style={[s.circle,connected&&s.circleOn]}><Text style={s.symbol}>{connected?'◆':ready?'◇':'+'}</Text></View>
        <Text style={s.heroTitle}>{connected?'RAID VPN يعمل الآن':ready?'اضغط لتشغيل النفق':'أضف VPN مرة واحدة'}</Text>
        <Text style={s.desc}>{message}</Text>
        <Pressable disabled={busy} onPress={toggle} style={[s.primary,connected&&s.stop,busy&&s.disabled]}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.primaryText}>{connected?'قطع الاتصال':ready?'تشغيل VPN':'ربط WireGuard'}</Text>}</Pressable>
      </View>
      <View style={s.grid}><View style={s.card}><Text style={s.label}>المصدر</Text><Text style={s.value}>{sourceLabel}</Text></View><View style={s.card}><Text style={s.label}>الحساب</Text><Text style={s.value}>{signedIn?'مسجّل':'غير مطلوب للمحلي'}</Text></View></View>
      <View style={s.info}><Text style={s.infoTitle}>تشغيل بدون حساب</Text><Text style={s.infoText}>يمكنك حفظ إعداد WireGuard محلي وتشغيله مباشرة من هذا الجهاز. تسجيل الدخول مطلوب فقط إذا أردت مزامنة إعداد من خادم RAID.</Text></View>
      <Pressable onPress={()=>router.push('/vpn-provider')} style={s.secondary}><Text style={s.secondaryText}>{ready?'تغيير أو استبدال إعداد WireGuard':'إضافة إعداد WireGuard'}</Text></Pressable>
      {!signedIn&&<Pressable onPress={()=>router.push('/login')} style={s.link}><Text style={s.linkText}>تسجيل الدخول لمزامنة RAID Server</Text></Pressable>}
      <Pressable onPress={refresh} disabled={busy} style={s.link}><Text style={s.linkText}>تحديث الحالة</Text></Pressable>
    </ScrollView>
  </SafeAreaView>;
}

const s=StyleSheet.create({root:{flex:1,backgroundColor:'#080A0C'},header:{minHeight:66,flexDirection:'row',alignItems:'center',paddingHorizontal:16,gap:10,borderBottomWidth:1,borderBottomColor:'#252525'},back:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#141618'},backText:{fontSize:32,color:'#fff',marginTop:-4},head:{flex:1,alignItems:'center'},title:{color:'#fff',fontSize:20,fontWeight:'900'},sub:{color:'#887E76',fontSize:10,marginTop:2},dot:{width:11,height:11,borderRadius:6,backgroundColor:'#5A5551'},dotOn:{backgroundColor:'#45B67B'},body:{padding:16,gap:12,paddingBottom:36},hero:{padding:22,borderRadius:28,backgroundColor:'#121416',borderWidth:1,borderColor:'#34312E',alignItems:'center'},heroOn:{borderColor:'#39644F'},kicker:{color:'#B9AAA0',fontWeight:'900'},circle:{width:120,height:120,borderRadius:60,backgroundColor:'#1A1D20',alignItems:'center',justifyContent:'center',marginTop:18},circleOn:{backgroundColor:'#173626'},symbol:{fontSize:46,color:'#E9E2DC',fontWeight:'900'},heroTitle:{marginTop:18,color:'#fff',fontSize:24,fontWeight:'900',textAlign:'center'},desc:{marginTop:10,color:'#A99E95',lineHeight:21,textAlign:'center'},primary:{marginTop:18,width:'100%',height:56,borderRadius:18,backgroundColor:'#6658D8',alignItems:'center',justifyContent:'center'},stop:{backgroundColor:'#763F43'},disabled:{opacity:.5},primaryText:{color:'#fff',fontWeight:'900',fontSize:16},grid:{flexDirection:'row-reverse',gap:12},card:{flex:1,minHeight:94,borderRadius:20,padding:15,backgroundColor:'#121416',borderWidth:1,borderColor:'#2B2A29',justifyContent:'space-between'},label:{color:'#756E69',textAlign:'right'},value:{color:'#F0EBE6',fontWeight:'900',textAlign:'right'},info:{padding:17,borderRadius:21,backgroundColor:'#121416',borderWidth:1,borderColor:'#2B2A29'},infoTitle:{color:'#E7DDD5',fontWeight:'900',textAlign:'right'},infoText:{marginTop:7,color:'#948B84',lineHeight:20,textAlign:'right'},secondary:{height:52,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:'#203B5D'},secondaryText:{color:'#fff',fontWeight:'900'},link:{height:46,alignItems:'center',justifyContent:'center'},linkText:{color:'#B5A8FF',fontWeight:'800'}});
