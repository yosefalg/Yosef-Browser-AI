import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { connectVpn, disconnectVpn, getVpnProvisioningState, isVpnConnected } from '@/lib/vpn';
import { getCurrentSession } from '@/lib/auth';
import { getSetting } from '@/lib/db';
import { getTheme, type ThemeName } from '@/lib/theme';

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
  const [themeName,setThemeName]=useState<ThemeName>('cinematic');
  const operating=useRef(false);
  const theme=useMemo(()=>getTheme(themeName),[themeName]);

  const refresh=useCallback(async()=>{
    if(operating.current)return;
    setBusy(true);
    try{
      const [session,active,savedTheme]=await Promise.all([
        getCurrentSession().catch(()=>null),
        isVpnConnected().catch(()=>false),
        getSetting<ThemeName>('theme','cinematic').catch(()=>'cinematic' as ThemeName),
      ]);
      setSignedIn(Boolean(session));setConnected(active);
      setThemeName(savedTheme==='cinematic'||savedTheme==='amoled'||savedTheme==='light'?savedTheme:'cinematic');
      const profile=await getVpnProvisioningState().catch(()=>({configured:false,source:'none' as const}));
      setReady(profile.configured);setSource(profile.source);
      if(active)setMessage('النفق متصل فعليًا على Android.');
      else if(profile.configured&&profile.source==='local')setMessage('إعداد WireGuard المحلي محفوظ وجاهز للاتصال بدون تسجيل دخول.');
      else if(profile.configured)setMessage('إعداد VPN صالح وجاهز للتشغيل.');
      else setMessage('لا يوجد إعداد VPN صالح بعد. أضف ملف WireGuard من مزودك للبدء.');
    }finally{setBusy(false);}
  },[]);

  useFocusEffect(useCallback(()=>{void refresh();return()=>{}},[refresh]));
  useEffect(()=>{const sub=AppState.addEventListener('change',state=>{if(state==='active')void refresh()});return()=>sub.remove();},[refresh]);

  const toggle=async()=>{
    if(operating.current)return;
    if(!connected&&!ready){router.push('/vpn-provider');return;}
    operating.current=true;setBusy(true);
    try{
      if(connected){await disconnectVpn();const state=await waitFor(false);setConnected(state);setMessage(state?'تعذر تأكيد قطع الاتصال من Android.':'تم قطع اتصال RAID VPN.');}
      else{await connectVpn();const state=await waitFor(true);setConnected(state);if(!state)throw new Error('Android لم يؤكد تشغيل النفق. تحقق من إذن VPN ثم حاول مجددًا.');setMessage('النفق متصل فعليًا الآن.');}
    }catch(error){const text=error instanceof Error?error.message:'تعذر تنفيذ العملية.';setMessage(text);Alert.alert('RAID VPN',text);}
    finally{operating.current=false;setBusy(false);}
  };

  const sourceLabel=source==='local'?'WireGuard محلي':source==='service'?'RAID Server':source==='cache'?'إعداد محفوظ':'غير مهيأ';
  const stateTitle=connected?'متصل الآن':ready?'جاهز للاتصال':'يحتاج إعداد';
  const stateIcon=connected?'shield-check':ready?'shield-key-outline':'shield-plus-outline';
  const stateColor=connected?'#4CB884':theme.accent;

  return <SafeAreaView edges={['top','bottom','left','right']} style={[s.root,{backgroundColor:theme.bg}]}>
    <View style={[s.header,{backgroundColor:theme.surface,borderBottomColor:theme.border}]}>
      <Pressable onPress={()=>router.back()} style={({pressed})=>[s.iconButton,{backgroundColor:theme.surface2,borderColor:theme.border},pressed&&s.pressed]} accessibilityLabel="رجوع"><MaterialCommunityIcons name="chevron-right" size={25} color={theme.text}/></Pressable>
      <View style={s.head}><Text style={[s.title,{color:theme.text}]}>RAID VPN</Text><Text style={[s.sub,{color:theme.muted}]}>نفق WireGuard محلي وآمن</Text></View>
      <View style={[s.stateDot,{backgroundColor:connected?'#4CB884':theme.border}]}/>
    </View>

    <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
      <View style={[s.hero,{backgroundColor:theme.surface,borderColor:connected?'#3D7359':theme.border}]}>
        <View style={[s.heroIcon,{backgroundColor:theme.surface2,borderColor:connected?'#3D7359':theme.border}]}><MaterialCommunityIcons name={stateIcon as never} size={46} color={stateColor}/></View>
        <Text style={[s.kicker,{color:stateColor}]}>{stateTitle}</Text>
        <Text style={[s.heroTitle,{color:theme.text}]}>{connected?'RAID VPN يعمل على الجهاز':ready?'كل شيء جاهز للتشغيل':'أضف إعداد WireGuard مرة واحدة'}</Text>
        <Text style={[s.desc,{color:theme.muted}]}>{message}</Text>
        <Pressable disabled={busy} onPress={toggle} style={({pressed})=>[s.primary,{backgroundColor:connected?'#7B5148':theme.accent},(busy||pressed)&&s.pressed]}>{busy?<ActivityIndicator color="#fff"/>:<View style={s.buttonRow}><MaterialCommunityIcons name={connected?'power':'shield-key-outline'} size={20} color="#fff"/><Text style={s.primaryText}>{connected?'قطع الاتصال':ready?'تشغيل VPN':'إضافة WireGuard'}</Text></View>}</Pressable>
      </View>

      <View style={s.grid}>
        <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.border}]}><MaterialCommunityIcons name="server-network" size={21} color={theme.accent}/><Text style={[s.label,{color:theme.muted}]}>المصدر</Text><Text style={[s.value,{color:theme.text}]}>{sourceLabel}</Text></View>
        <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.border}]}><MaterialCommunityIcons name={signedIn?'account-check-outline':'account-off-outline'} size={21} color={theme.accent}/><Text style={[s.label,{color:theme.muted}]}>الحساب</Text><Text style={[s.value,{color:theme.text}]}>{signedIn?'مسجّل':'غير مطلوب للمحلي'}</Text></View>
      </View>

      <View style={[s.info,{backgroundColor:theme.surface,borderColor:theme.border}]}><View style={s.infoHead}><MaterialCommunityIcons name="cellphone-lock" size={22} color={theme.accent}/><Text style={[s.infoTitle,{color:theme.text}]}>محلي أولًا</Text></View><Text style={[s.infoText,{color:theme.muted}]}>ملف WireGuard المحلي يبقى على هذا الجهاز ويعمل بدون حساب RAID. تسجيل الدخول مطلوب فقط للمزايا التي تعتمد على المزامنة أو الخادم.</Text></View>

      <Pressable onPress={()=>router.push('/vpn-provider')} style={({pressed})=>[s.secondary,{backgroundColor:theme.surface,borderColor:theme.border},pressed&&s.pressed]}><MaterialCommunityIcons name="file-key-outline" size={20} color={theme.accent}/><Text style={[s.secondaryText,{color:theme.text}]}>{ready?'تغيير إعداد WireGuard':'إضافة إعداد WireGuard'}</Text><MaterialCommunityIcons name="chevron-left" size={21} color={theme.muted}/></Pressable>
      {!signedIn&&<Pressable onPress={()=>router.push('/login')} style={({pressed})=>[s.link,{backgroundColor:theme.surface2,borderColor:theme.border},pressed&&s.pressed]}><MaterialCommunityIcons name="account-arrow-left-outline" size={19} color={theme.accent}/><Text style={[s.linkText,{color:theme.text}]}>تسجيل الدخول لخدمات RAID المرتبطة بالحساب</Text></Pressable>}
      <Pressable onPress={refresh} disabled={busy} style={({pressed})=>[s.refresh,pressed&&s.pressed]}><MaterialCommunityIcons name="refresh" size={18} color={theme.muted}/><Text style={[s.refreshText,{color:theme.muted}]}>تحديث الحالة الفعلية</Text></Pressable>
    </ScrollView>
  </SafeAreaView>;
}

const s=StyleSheet.create({
  root:{flex:1},header:{minHeight:66,flexDirection:'row-reverse',alignItems:'center',paddingHorizontal:14,paddingVertical:7,gap:10,borderBottomWidth:1},iconButton:{width:42,height:42,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},head:{flex:1,alignItems:'center'},title:{fontSize:19,fontWeight:'900'},sub:{fontSize:10,marginTop:2},stateDot:{width:11,height:11,borderRadius:6,marginHorizontal:15},body:{padding:16,gap:12,paddingBottom:40},
  hero:{padding:20,borderRadius:28,borderWidth:1,alignItems:'center'},heroIcon:{width:104,height:104,borderRadius:34,borderWidth:1,alignItems:'center',justifyContent:'center',marginBottom:14},kicker:{fontSize:11,fontWeight:'900'},heroTitle:{fontSize:22,fontWeight:'900',textAlign:'center',marginTop:5},desc:{marginTop:9,lineHeight:20,textAlign:'center'},primary:{marginTop:17,width:'100%',height:54,borderRadius:18,alignItems:'center',justifyContent:'center'},buttonRow:{flexDirection:'row-reverse',alignItems:'center',gap:8},primaryText:{color:'#fff',fontWeight:'900',fontSize:15},grid:{flexDirection:'row-reverse',gap:10},card:{flex:1,minHeight:108,borderRadius:20,borderWidth:1,padding:14,alignItems:'flex-end',justifyContent:'space-between'},label:{fontSize:10,marginTop:8},value:{fontWeight:'900',textAlign:'right',fontSize:12},
  info:{padding:16,borderRadius:21,borderWidth:1},infoHead:{flexDirection:'row-reverse',alignItems:'center',gap:8},infoTitle:{fontWeight:'900',textAlign:'right'},infoText:{marginTop:8,lineHeight:19,textAlign:'right',fontSize:11},secondary:{minHeight:54,borderRadius:18,borderWidth:1,paddingHorizontal:14,flexDirection:'row-reverse',alignItems:'center',gap:10},secondaryText:{flex:1,fontWeight:'900',textAlign:'right'},link:{minHeight:50,borderRadius:17,borderWidth:1,paddingHorizontal:14,flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:8},linkText:{fontWeight:'800',textAlign:'center',fontSize:11},refresh:{height:42,flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:7},refreshText:{fontSize:11,fontWeight:'800'},pressed:{opacity:.72,transform:[{scale:.985}]}
});
