import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { getCurrentSession, getSupabase } from '@/lib/auth';
import { getVpnProvisioningState, isVpnConnected } from '@/lib/vpn';
import { getSetting } from '@/lib/db';
import { getTheme, isThemeName, type ThemeName } from '@/lib/theme';

type State={signedIn:boolean;vpnConnected:boolean;vpnReady:boolean;vpnSource:string};
const EMPTY:State={signedIn:false,vpnConnected:false,vpnReady:false,vpnSource:'none'};
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

async function resolveSession(){
  let session=await getCurrentSession();
  if(session)return session;
  await sleep(180);
  session=await getCurrentSession();
  return session;
}

export default function NotificationsScreen(){
  const version=Constants.expoConfig?.version||'—';
  const [busy,setBusy]=useState(true);
  const [state,setState]=useState<State>(EMPTY);
  const [lastChecked,setLastChecked]=useState<Date|null>(null);
  const [refreshError,setRefreshError]=useState('');
  const [themeName,setThemeName]=useState<ThemeName>('cinematic');
  const refreshGeneration=useRef(0);
  const theme=useMemo(()=>getTheme(themeName),[themeName]);

  const refresh=useCallback(async()=>{
    const generation=++refreshGeneration.current;
    setBusy(true);
    setRefreshError('');
    try{
      const [session,connected,profile]=await Promise.all([
        resolveSession(),
        isVpnConnected(),
        getVpnProvisioningState(),
      ]);
      if(generation!==refreshGeneration.current)return;
      setState({signedIn:Boolean(session),vpnConnected:connected,vpnReady:profile.configured,vpnSource:profile.source});
      setLastChecked(new Date());
    }catch{
      if(generation!==refreshGeneration.current)return;
      setRefreshError('تعذر تحديث الحالة الفعلية الآن. بقيت آخر نتيجة موثوقة ظاهرة ويمكنك إعادة المحاولة.');
    }finally{
      if(generation===refreshGeneration.current)setBusy(false);
    }
  },[]);

  useFocusEffect(useCallback(()=>{
    let active=true;
    void getSetting<ThemeName>('theme','cinematic')
      .then(savedTheme=>{if(active)setThemeName(isThemeName(savedTheme)?savedTheme:'cinematic');})
      .catch(()=>{if(active)setThemeName('cinematic');});
    void refresh();
    return()=>{active=false;};
  },[refresh]));

  useEffect(()=>{
    const appSub=AppState.addEventListener('change',value=>{if(value==='active')void refresh()});
    const {data}=getSupabase().auth.onAuthStateChange((_event,session)=>{
      setState(prev=>({...prev,signedIn:Boolean(session)}));
      void refresh();
    });
    return()=>{appSub.remove();data.subscription.unsubscribe();};
  },[refresh]);

  const vpnText=state.vpnConnected?'WireGuard متصل':state.vpnReady?'جاهز للاتصال':'غير مهيأ بعد';
  const accountText=state.signedIn?'الحساب متصل':'غير مسجل الدخول';
  const sourceText=sourceLabel(state.vpnSource);

  return <SafeAreaView edges={['top','bottom','left','right']} style={[s.root,{backgroundColor:theme.bg}]}>
    <View style={[s.head,{backgroundColor:theme.surface,borderBottomColor:theme.border}]}>
      <Pressable onPress={()=>router.back()} style={[s.back,{backgroundColor:theme.surface2,borderColor:theme.border}]}><Text style={[s.backText,{color:theme.text}]}>‹</Text></Pressable>
      <View style={s.headText}><Text style={[s.title,{color:theme.text}]}>حالة RAID</Text><Text style={[s.sub,{color:theme.muted}]}>الحساب واتصال WireGuard في مكان واحد</Text></View>
      <View style={{width:42}}/>
    </View>
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={[s.summary,{backgroundColor:theme.surface2,borderColor:theme.border}]}>
        <View style={s.summaryTop}><Text style={[s.version,{color:theme.accent}]}>RAID {version}</Text><View style={[s.liveDot,{backgroundColor:theme.muted},(state.signedIn||state.vpnConnected)&&s.liveDotOn]}/></View>
        <Text style={[s.summaryTitle,{color:theme.text}]}>مركز الحالة</Text>
        <Text style={[s.summaryText,{color:theme.muted}]}>الحالة تُحدّث من جلسة الحساب الفعلية وWireGuard، وليس من قيمة مخزنة قديمة.</Text>
        <Text style={[s.checked,{color:theme.muted}]}>{lastChecked?`آخر تحقق ناجح: ${lastChecked.toLocaleTimeString('ar-IQ',{hour:'2-digit',minute:'2-digit'})}`:busy?'جارٍ التحقق…':'لم ينجح التحقق بعد'}</Text>
      </View>

      <View style={s.grid}>
        <StatusCard title="الحساب" value={accountText} ok={state.signedIn} theme={theme}/>
        <StatusCard title="RAID VPN" value={vpnText} ok={state.vpnConnected||state.vpnReady} theme={theme}/>
        <StatusCard title="مصدر VPN" value={sourceText} ok={state.vpnReady} theme={theme}/>
        <StatusCard title="الإصدار" value={version} ok theme={theme}/>
      </View>

      {!!refreshError&&<View style={[s.error,{backgroundColor:theme.surface2,borderColor:theme.border}]} accessibilityRole="alert" accessibilityLiveRegion="polite"><Text style={[s.errorText,{color:theme.text}]}>{refreshError}</Text></View>}
      <Pressable disabled={busy} onPress={refresh} style={({pressed})=>[s.refresh,{backgroundColor:theme.accent},(busy||pressed)&&s.pressed]} accessibilityRole="button" accessibilityState={{disabled:busy,busy}}>
        {busy?<View style={s.loadingRow}><ActivityIndicator size="small" color="#fff"/><Text style={s.refreshText}>جارٍ التحقق…</Text></View>:<Text style={s.refreshText}>تحديث الحالة</Text>}
      </Pressable>
      {!state.vpnReady?<Pressable onPress={()=>router.push('/vpn-provider')} style={s.provider}><Text style={s.providerText}>اختيار مزود VPN مجاني</Text></Pressable>:null}
      <Pressable onPress={()=>router.push('/vpn')} style={({pressed})=>[s.secondary,{backgroundColor:theme.surface2,borderColor:theme.border},pressed&&s.pressed]}><Text style={[s.secondaryText,{color:theme.text}]}>فتح RAID VPN</Text></Pressable>
    </ScrollView>
  </SafeAreaView>;
}

function sourceLabel(value:string){if(value==='service')return 'RAID Server';if(value==='cache')return 'محفوظ محليًا';if(value==='local')return 'مزود محلي';return 'غير مهيأ';}
function StatusCard({title,value,ok,theme}:{title:string;value:string;ok:boolean;theme:ReturnType<typeof getTheme>}){return <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.border}]}><View style={s.cardHead}><View style={[s.dot,{backgroundColor:theme.muted},ok&&s.dotOn]}/><Text style={[s.cardTitle,{color:theme.text}]} numberOfLines={1}>{title}</Text></View><Text style={[s.cardValue,{color:theme.muted}]} numberOfLines={2}>{value}</Text></View>}

const s=StyleSheet.create({
  root:{flex:1},head:{minHeight:64,flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingVertical:6,borderBottomWidth:1},back:{width:42,height:42,borderRadius:15,alignItems:'center',justifyContent:'center',borderWidth:1},backText:{fontSize:31,marginTop:-3},headText:{flex:1,alignItems:'center'},title:{fontSize:19,fontWeight:'900'},sub:{fontSize:10,marginTop:2},
  content:{paddingHorizontal:16,paddingTop:16,paddingBottom:28,gap:12},summary:{padding:18,borderRadius:24,borderWidth:1},summaryTop:{flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center'},version:{fontSize:11,fontWeight:'900'},liveDot:{width:9,height:9,borderRadius:5},liveDotOn:{backgroundColor:'#4CB884'},summaryTitle:{fontSize:21,fontWeight:'900',textAlign:'right',marginTop:8},summaryText:{marginTop:5,lineHeight:19,textAlign:'right',fontSize:12},checked:{marginTop:8,fontSize:10,textAlign:'right'},
  grid:{flexDirection:'row-reverse',flexWrap:'wrap',justifyContent:'space-between',rowGap:10},card:{width:'48.5%',minHeight:104,borderRadius:20,borderWidth:1,padding:14,justifyContent:'space-between'},cardHead:{flexDirection:'row-reverse',alignItems:'center',gap:7},dot:{width:10,height:10,borderRadius:5},dotOn:{backgroundColor:'#4CB884'},cardTitle:{flex:1,fontWeight:'900',fontSize:13,textAlign:'right'},cardValue:{fontSize:12,textAlign:'right',lineHeight:18},
  error:{padding:13,borderRadius:17,borderWidth:1},errorText:{fontSize:11,lineHeight:18,textAlign:'right',fontWeight:'700'},refresh:{height:52,borderRadius:18,alignItems:'center',justifyContent:'center'},refreshText:{color:'#fff',fontWeight:'900'},loadingRow:{flexDirection:'row-reverse',alignItems:'center',gap:9},pressed:{opacity:.65},provider:{height:50,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'#466B91'},providerText:{color:'#fff',fontWeight:'900'},secondary:{height:50,borderRadius:18,alignItems:'center',justifyContent:'center',borderWidth:1},secondaryText:{fontWeight:'900'}
});
