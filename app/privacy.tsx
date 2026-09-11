import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { clearHistory } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { getVpnProvisioningState, isVpnConnected } from '@/lib/vpn';

type LiveState = { signedIn:boolean; vpnConnected:boolean; vpnReady:boolean; vpnSource:string };

export default function PrivacyScreen(){
  const version=Constants.expoConfig?.version || '—';
  const [msg,setMsg]=useState('');
  const [live,setLive]=useState<LiveState>({signedIn:false,vpnConnected:false,vpnReady:false,vpnSource:'none'});
  const [checking,setChecking]=useState(false);

  const refresh=useCallback(async()=>{
    if(checking)return;
    setChecking(true);
    try{
      const session=await getCurrentSession().catch(()=>null);
      const connected=await isVpnConnected().catch(()=>false);
      const profile=session ? await getVpnProvisioningState().catch(()=>({configured:false,source:'none' as const})) : {configured:false,source:'none' as const};
      setLive({signedIn:Boolean(session),vpnConnected:connected,vpnReady:profile.configured,vpnSource:profile.source});
    } finally { setChecking(false); }
  },[checking]);

  useFocusEffect(useCallback(()=>{void refresh();return()=>{}},[refresh]));

  const auth=async()=>{
    const ok=await LocalAuthentication.hasHardwareAsync();
    if(!ok){setMsg('لا توجد مصادقة حيوية مدعومة على هذا الجهاز.');return;}
    const r=await LocalAuthentication.authenticateAsync({promptMessage:'تحقق من هوية مستخدم RAID',cancelLabel:'إلغاء'});
    setMsg(r.success?'تم التحقق بنجاح.':'فشل التحقق أو أُلغي.');
  };

  const clear=async()=>{await clearHistory();setMsg('تم مسح سجل التصفح المحلي.');};
  const source=live.vpnSource==='service'?'خادم RAID':live.vpnSource==='local'?'WireGuard محلي':live.vpnSource==='cache'?'نسخة آمنة محفوظة':'غير مهيأ';

  return <SafeAreaView edges={['top','bottom','left','right']} style={s.root}>
    <View style={s.head}>
      <Pressable onPress={()=>router.back()} style={s.backButton}><Text style={s.back}>‹</Text></Pressable>
      <View style={s.headCopy}><Text style={s.title}>مركز الخصوصية</Text><Text style={s.sub}>حالة فعلية — RAID {version}</Text></View>
      <View style={{width:40}}/>
    </View>
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.liveCard}>
        <Text style={s.liveTitle}>الحماية الآن</Text>
        <View style={s.liveRow}><Text style={s.liveLabel}>الحساب</Text><Text style={[s.liveValue,live.signedIn&&s.ok]}>{live.signedIn?'متصل':'غير مسجل'}</Text></View>
        <View style={s.liveRow}><Text style={s.liveLabel}>VPN</Text><Text style={[s.liveValue,live.vpnConnected&&s.ok]}>{live.vpnConnected?'متصل فعليًا':live.vpnReady?'جاهز للاتصال':'غير جاهز'}</Text></View>
        <View style={s.liveRow}><Text style={s.liveLabel}>المصدر</Text><Text style={s.liveValue}>{source}</Text></View>
        <Pressable disabled={checking} onPress={refresh} style={[s.refresh,checking&&s.dim]}><Text style={s.refreshText}>{checking?'جارٍ الفحص…':'فحص الحالة الآن'}</Text></Pressable>
      </View>

      <View style={s.card}><Text style={s.cardTitle}>الوضع الخاص</Text><Text style={s.text}>يعمل WebView بوضع التصفح الخفي: لا سجل، لا مزامنة، ولا سياق RAID AI من هذه الجلسة.</Text></View>
      <View style={s.card}><Text style={s.cardTitle}>RAID AI</Text><Text style={s.text}>سياق الصفحة لا يُرسل إلا عند استخدام المساعد، والخدمة تتطلب جلسة حساب صالحة.</Text></View>
      <View style={s.card}><Text style={s.cardTitle}>VPN كامل الجهاز</Text><Text style={s.text}>RAID لا يعرض اتصالًا وهميًا. الحالة أعلاه تأتي من وحدة Android الأصلية. إذا لم يوجد ملف WireGuard صالح، افتح مزود VPN بدل تكرار فحص خادم غير موجود.</Text><Pressable onPress={()=>router.push('/vpn-provider')} style={s.inline}><Text style={s.inlineText}>اختيار مزود VPN فعلي</Text></Pressable></View>
      <View style={s.card}><Text style={s.cardTitle}>حماية WebView الحالية</Text><Text style={s.text}>الوصول إلى الملفات المحلية والوصول العام من file:// معطّلان، والتصفح الخاص يعطّل الكاش والتخزين المشترك والكوكيز المشتركة.</Text></View>
      <View style={s.card}><Text style={s.cardTitle}>Google Sign-In</Text><Text style={s.text}>تسجيل Google يحتاج إعداد Google Cloud صحيح وربطه بـSupabase. لن نخفي هذا الخطأ برسالة نجاح وهمية؛ الإصدار القادم سينقل المسار إلى Native ID Token عند توفر بيانات Google الصحيحة.</Text></View>

      <Pressable onPress={auth} style={s.action}><Text style={s.actionText}>اختبار قفل البصمة أو الوجه</Text></Pressable>
      <Pressable onPress={clear} style={[s.action,s.danger]}><Text style={s.actionText}>مسح سجل التصفح</Text></Pressable>
      {!!msg&&<Text style={s.msg}>{msg}</Text>}
    </ScrollView>
  </SafeAreaView>
}

const s=StyleSheet.create({
  root:{flex:1,backgroundColor:'#070B14'},head:{minHeight:66,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:14,paddingVertical:6,borderBottomWidth:1,borderBottomColor:'#1E293B'},backButton:{width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:'#111827'},back:{fontSize:30,color:'#fff',marginTop:-3},headCopy:{flex:1,alignItems:'center'},title:{fontSize:18,fontWeight:'900',color:'#fff'},sub:{fontSize:10,color:'#7C8AA5',marginTop:2},content:{padding:16,gap:12,paddingBottom:34},
  liveCard:{padding:17,borderRadius:22,backgroundColor:'#0D1628',borderWidth:1,borderColor:'#263653',gap:10},liveTitle:{color:'#C4B5FD',fontWeight:'900',fontSize:16,textAlign:'right'},liveRow:{flexDirection:'row-reverse',justifyContent:'space-between',gap:12},liveLabel:{color:'#94A3B8',fontWeight:'800'},liveValue:{color:'#F59E0B',fontWeight:'900'},ok:{color:'#34D399'},refresh:{height:46,borderRadius:14,backgroundColor:'#2563EB',alignItems:'center',justifyContent:'center',marginTop:2},refreshText:{color:'#fff',fontWeight:'900'},dim:{opacity:.5},
  card:{padding:17,borderRadius:20,backgroundColor:'#111827',borderWidth:1,borderColor:'#27324A'},cardTitle:{color:'#fff',fontWeight:'900',fontSize:16,marginBottom:6,textAlign:'right'},text:{color:'#94A3B8',lineHeight:20,textAlign:'right'},inline:{marginTop:12,height:44,borderRadius:13,backgroundColor:'#172033',alignItems:'center',justifyContent:'center'},inlineText:{color:'#C4B5FD',fontWeight:'900'},action:{height:52,borderRadius:16,backgroundColor:'#7C3AED',alignItems:'center',justifyContent:'center'},danger:{backgroundColor:'#7F1D1D'},actionText:{color:'#fff',fontWeight:'800'},msg:{color:'#CBD5E1',textAlign:'center',marginTop:4}
});
