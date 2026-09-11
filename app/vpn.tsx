import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { connectVpn, disconnectVpn, getVpnProvisioningState, isVpnConnected } from '@/lib/vpn';
import { getCurrentSession } from '@/lib/auth';

type VpnSource = 'service' | 'local' | 'cache' | 'none';
type ProvisioningIssue = 'none' | 'server-unconfigured' | 'temporary' | 'session' | 'unknown';
const RETRIES = [0, 300, 700, 1200] as const;

const sleep = (ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

async function waitForVpnState(expected:boolean){
  let active=await isVpnConnected().catch(()=>!expected);
  if(active===expected)return active;
  for(const delay of RETRIES.slice(1)){
    await sleep(delay);
    active=await isVpnConnected().catch(()=>active);
    if(active===expected)break;
  }
  return active;
}

function classify(error:unknown):ProvisioningIssue{
  const raw=error instanceof Error?error.message:'';
  if(/غير مربوط بخدمة التزويد|VPN_SERVICE_NOT_CONFIGURED|غير مهيأة على الخادم|NO_VPN_SERVER/i.test(raw))return 'server-unconfigured';
  if(/PROVISIONING_UNAVAILABLE|غير متاحة مؤقت|تعذر الاتصال بخدمة RAID VPN|تعذر مزامنة إعداد VPN/i.test(raw))return 'temporary';
  if(/انتهت جلسة الحساب|سجّل الدخول مجدد|UNAUTHORIZED/i.test(raw))return 'session';
  return raw?'unknown':'none';
}

function friendly(error:unknown){
  const raw=error instanceof Error?error.message:'تعذر تنفيذ العملية.';
  const issue=classify(error);
  if(issue==='server-unconfigured')return 'الخادم المركزي غير مجهز الآن، لكن يمكنك استخدام مزود مجاني أو WireGuard مخصص مباشرة من RAID.';
  if(issue==='temporary')return 'خدمة RAID المركزية غير متاحة مؤقتًا. يمكنك إعادة الفحص أو استخدام مزود بديل.';
  return raw;
}

export default function VpnScreen(){
  const [connected,setConnected]=useState(false);
  const [ready,setReady]=useState(false);
  const [signedIn,setSignedIn]=useState(false);
  const [source,setSource]=useState<VpnSource>('none');
  const [busy,setBusy]=useState(true);
  const [issue,setIssue]=useState<ProvisioningIssue>('none');
  const [message,setMessage]=useState('');
  const [lastChecked,setLastChecked]=useState<Date|null>(null);
  const operation=useRef(false);

  const refresh=useCallback(async()=>{
    if(operation.current)return;
    setBusy(true);
    try{
      const session=await getCurrentSession().catch(()=>null);
      setSignedIn(Boolean(session));
      const active=await isVpnConnected().catch(()=>false);
      setConnected(active);
      if(!session){setReady(false);setSource('none');setIssue('none');setMessage('سجّل الدخول أولًا لاستخدام RAID VPN.');return;}
      try{
        const profile=await getVpnProvisioningState();
        setReady(profile.configured);
        setSource(profile.source);
        setIssue('none');
        setMessage(profile.configured
          ? (profile.source==='local'?'مزود VPN بديل محفوظ وجاهز على هذا الهاتف.':'RAID VPN جاهز لهذا الحساب.')
          : 'لا يوجد إعداد VPN جاهز بعد.');
      }catch(error){
        setReady(false);setSource('none');setIssue(classify(error));setMessage(friendly(error));
      }
    }finally{setLastChecked(new Date());setBusy(false);}
  },[]);

  useFocusEffect(useCallback(()=>{void refresh();return()=>{}},[refresh]));
  useEffect(()=>{const sub=AppState.addEventListener('change',state=>{if(state==='active')void refresh()});return()=>sub.remove()},[refresh]);

  const toggle=async()=>{
    if(!signedIn){router.push('/login');return;}
    if(operation.current)return;
    operation.current=true;setBusy(true);
    try{
      if(connected){
        await disconnectVpn();
        const active=await waitForVpnState(false);
        setConnected(active);
        setMessage(active?'تعذر تأكيد قطع الاتصال. حاول مجددًا.':'تم قطع اتصال RAID VPN.');
        return;
      }
      setMessage('جارٍ تشغيل النفق الآمن…');
      await connectVpn();
      const active=await waitForVpnState(true);
      setConnected(active);
      if(!active)throw new Error('لم يؤكد Android تشغيل النفق. تحقق من إذن VPN ثم حاول مجددًا.');
      const profile=await getVpnProvisioningState().catch(()=>null);
      if(profile){setReady(profile.configured);setSource(profile.source);}
      setIssue('none');
      setMessage('RAID VPN متصل الآن والنفق يعمل على Android.');
    }catch(error){
      const nextIssue=classify(error);setIssue(nextIssue);setMessage(friendly(error));
      setConnected(await isVpnConnected().catch(()=>connected));
      if(nextIssue!=='server-unconfigured'&&nextIssue!=='temporary')Alert.alert('RAID VPN',friendly(error));
    }finally{operation.current=false;setLastChecked(new Date());setBusy(false);}
  };

  const blocked=issue==='server-unconfigured';
  const temporary=issue==='temporary';
  const primaryText=connected?'قطع الاتصال':!signedIn?'تسجيل الدخول':ready?'تشغيل VPN':(blocked||temporary)?'اختيار VPN مجاني':'تشغيل VPN';
  const primaryAction=connected||ready?toggle:!signedIn?()=>router.push('/login'):(blocked||temporary)?()=>router.push('/vpn-provider'):toggle;
  const sourceLabel=source==='service'?'RAID Server':source==='cache'?'نسخة آمنة':source==='local'?'مزود محلي':'غير مربوط';
  const stateLabel=connected?'متصل ومحمي':ready?'جاهز للاتصال':blocked?'الخادم المركزي غير متاح':temporary?'الخدمة مؤقتًا غير متاحة':'بانتظار إعداد VPN';
  const mainTitle=connected?'RAID VPN يعمل الآن':ready?'RAID VPN جاهز':blocked?'استخدم مزود VPN مجاني الآن':temporary?'اختر مزودًا بديلًا':'تشغيل RAID VPN';
  const description=connected
    ?'النفق يعمل عبر WireGuard الحقيقي على Android.'
    :ready
      ?'إعداد VPN صالح ومحفوظ. اضغط تشغيل للاتصال مباشرة.'
      :(blocked||temporary)
        ?'بدل انتظار خادم RAID المركزي، اختر Proton أو Windscribe أو hide.me أو PrivadoVPN أو أي WireGuard قياسي.'
        :'RAID سيفحص الإعداد المتاح ويستخدم WireGuard الحقيقي فقط.';

  return <SafeAreaView edges={['top','bottom','left','right']} style={s.root}>
    <View style={s.header}>
      <Pressable onPress={()=>router.back()} style={s.back}><Text style={s.backText}>‹</Text></Pressable>
      <View style={s.headText}><Text style={s.title}>RAID VPN</Text><Text style={s.sub}>One-tap secure tunnel</Text></View>
      <View style={[s.dot,connected&&s.dotOn,(blocked||temporary)&&s.dotWarn]}/>
    </View>
    <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
      <View style={[s.hero,connected&&s.heroOn,(blocked||temporary)&&s.heroWarn]}>
        <Text style={s.state}>{stateLabel}</Text>
        <View style={[s.circle,connected&&s.circleOn]}><Text style={s.symbol}>{connected?'◆':ready?'◇':'!'}</Text></View>
        <Text style={s.mainTitle}>{mainTitle}</Text>
        <Text style={s.desc}>{description}</Text>
        {!!message&&<Text style={s.statusMessage}>{message}</Text>}
        <Text style={s.checked}>{lastChecked?`آخر فحص: ${lastChecked.toLocaleTimeString('ar-IQ',{hour:'2-digit',minute:'2-digit'})}`:'لم يتم الفحص بعد'}</Text>
        <Pressable disabled={busy} onPress={primaryAction} style={[s.primary,connected&&s.stop,(blocked||temporary)&&s.alt,busy&&s.disabled]}>
          {busy?<ActivityIndicator color="#fff"/>:<Text style={s.primaryText}>{primaryText}</Text>}
        </Pressable>
      </View>
      <View style={s.row}>
        <View style={s.card}><Text style={s.cardLabel}>الحساب</Text><Text style={s.cardValue}>{signedIn?'متصل':'غير مسجّل'}</Text></View>
        <View style={s.card}><Text style={s.cardLabel}>مصدر VPN</Text><Text style={s.cardValue}>{sourceLabel}</Text></View>
      </View>
      <View style={s.infoCard}>
        <Text style={s.infoTitle}>بديل مجاني جاهز</Text>
        <Text style={s.infoText}>إذا كان خادم RAID غير جاهز، افتح قائمة المزودين واربط إعداد WireGuard صالح. المفتاح يبقى محفوظًا داخل SecureStore على جهازك.</Text>
      </View>
      <Pressable onPress={()=>router.push('/vpn-provider')} style={s.providerBtn}><Text style={s.providerText}>فتح مزودي VPN المجانيين</Text></Pressable>
      <Pressable onPress={refresh} disabled={busy} style={[s.secondary,busy&&s.disabled]}><Text style={s.secondaryText}>تحديث حالة الخدمة</Text></Pressable>
    </ScrollView>
  </SafeAreaView>;
}

const s=StyleSheet.create({
  root:{flex:1,backgroundColor:'#080A0C'},header:{minHeight:66,flexDirection:'row',alignItems:'center',paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:'#2A2927',gap:10,backgroundColor:'#0D0F11'},back:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,.06)',borderWidth:1,borderColor:'#373532'},backText:{fontSize:32,color:'#F4F1EC',marginTop:-4},headText:{flex:1,alignItems:'center'},title:{color:'#F5F2ED',fontSize:20,fontWeight:'900'},sub:{color:'#A99686',fontSize:11,fontWeight:'800',marginTop:2},dot:{width:11,height:11,borderRadius:6,backgroundColor:'#5F5A55'},dotOn:{backgroundColor:'#5FAF86'},dotWarn:{backgroundColor:'#C89554'},
  body:{padding:16,paddingBottom:34,gap:12},hero:{borderRadius:28,padding:20,backgroundColor:'#121416',borderWidth:1,borderColor:'#34312E',alignItems:'center'},heroOn:{borderColor:'#456958'},heroWarn:{borderColor:'#765637'},state:{color:'#C7B7AA',fontWeight:'800'},circle:{width:118,height:118,borderRadius:59,marginTop:18,backgroundColor:'#1B1D1F',alignItems:'center',justifyContent:'center'},circleOn:{backgroundColor:'#183126'},symbol:{fontSize:48,color:'#EAD8CB',fontWeight:'900'},mainTitle:{marginTop:18,fontSize:25,fontWeight:'900',color:'#F7F3EE',textAlign:'center'},desc:{marginTop:10,color:'#A99E95',lineHeight:22,textAlign:'center'},statusMessage:{marginTop:10,color:'#D5B589',lineHeight:20,textAlign:'center',fontSize:12},checked:{marginTop:8,color:'#726B65',fontSize:11},primary:{marginTop:18,width:'100%',height:56,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'#6D7C70'},alt:{backgroundColor:'#80613E'},stop:{backgroundColor:'#6E3939'},disabled:{opacity:.5},primaryText:{color:'#fff',fontWeight:'900',fontSize:16},
  row:{flexDirection:'row-reverse',gap:12},card:{flex:1,minHeight:100,borderRadius:22,padding:16,backgroundColor:'#121416',borderWidth:1,borderColor:'#2A2927',justifyContent:'space-between'},cardLabel:{color:'#716A64',textAlign:'right'},cardValue:{color:'#EEE8E2',fontWeight:'900',fontSize:16,textAlign:'right'},infoCard:{padding:16,borderRadius:22,backgroundColor:'#121416',borderWidth:1,borderColor:'#2A2927'},infoTitle:{color:'#E5D8CE',fontWeight:'900',textAlign:'right'},infoText:{marginTop:7,color:'#8E8680',lineHeight:21,textAlign:'right'},providerBtn:{height:52,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'#2E5C91'},providerText:{color:'#fff',fontWeight:'900'},secondary:{height:50,borderRadius:18,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#34312E',backgroundColor:'#151719'},secondaryText:{color:'#D8CEC6',fontWeight:'900'}
});
