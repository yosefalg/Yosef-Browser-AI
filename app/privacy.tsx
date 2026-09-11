import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { clearHistory, getBookmarks, getHistory, getSetting } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { getVpnProvisioningState, isVpnConnected } from '@/lib/vpn';
import { getTheme, type ThemeName } from '@/lib/theme';

type LiveState={signedIn:boolean;vpnConnected:boolean;vpnReady:boolean;vpnSource:string;history:number;bookmarks:number;biometric:boolean};

export default function PrivacyScreen(){
  const version=Constants.expoConfig?.version||'—';
  const busy=useRef(false);
  const [checking,setChecking]=useState(false);
  const [msg,setMsg]=useState('');
  const [themeName,setThemeName]=useState<ThemeName>('cinematic');
  const [live,setLive]=useState<LiveState>({signedIn:false,vpnConnected:false,vpnReady:false,vpnSource:'none',history:0,bookmarks:0,biometric:false});
  const theme=useMemo(()=>getTheme(themeName),[themeName]);

  const refresh=useCallback(async()=>{
    if(busy.current)return;
    busy.current=true;setChecking(true);
    try{
      const [session,connected,history,bookmarks,profile,biometric,savedTheme]=await Promise.all([
        getCurrentSession().catch(()=>null),
        isVpnConnected().catch(()=>false),
        getHistory(2000).catch(()=>[]),
        getBookmarks().catch(()=>[]),
        getVpnProvisioningState().catch(()=>({configured:false,source:'none' as const})),
        LocalAuthentication.hasHardwareAsync().catch(()=>false),
        getSetting<ThemeName>('theme','cinematic').catch(()=>'cinematic' as ThemeName),
      ]);
      setLive({signedIn:Boolean(session),vpnConnected:Boolean(connected),vpnReady:Boolean(profile.configured),vpnSource:profile.source,history:history.length,bookmarks:bookmarks.length,biometric:Boolean(biometric)});
      setThemeName(savedTheme==='cinematic'||savedTheme==='amoled'||savedTheme==='light'?savedTheme:'cinematic');
    } finally {busy.current=false;setChecking(false);}
  },[]);

  useFocusEffect(useCallback(()=>{void refresh();return()=>{}},[refresh]));

  const auth=async()=>{
    if(!live.biometric){setMsg('لا توجد مصادقة حيوية مدعومة على هذا الجهاز.');return;}
    const r=await LocalAuthentication.authenticateAsync({promptMessage:'تحقق من هوية مستخدم RAID',cancelLabel:'إلغاء'});
    setMsg(r.success?'تم التحقق بنجاح.':'فشل التحقق أو أُلغي.');
  };
  const clear=async()=>{await clearHistory();setLive(v=>({...v,history:0}));setMsg('تم مسح سجل التصفح المحلي.');};
  const source=live.vpnSource==='service'?'خادم RAID':live.vpnSource==='local'?'WireGuard محلي':live.vpnSource==='cache'?'ملف محفوظ':'غير مهيأ';

  const status=(label:string,value:string,ok:boolean,icon:'person-outline'|'shield-outline'|'key-outline'|'finger-print-outline')=><View style={[s.status,{backgroundColor:theme.surface,borderColor:theme.border}]}><View style={[s.statusIcon,{backgroundColor:theme.surface2}]}><Ionicons name={icon} size={20} color={ok?'#4DB47A':theme.accent}/></View><View style={s.statusCopy}><Text style={[s.statusLabel,{color:theme.muted}]}>{label}</Text><Text style={[s.statusValue,{color:ok?'#4DB47A':theme.text}]}>{value}</Text></View></View>;

  const action=(label:string,sub:string,icon:'shield-outline'|'trash-outline'|'settings-outline'|'finger-print-outline',onPress:()=>void,danger=false)=><Pressable accessibilityRole="button" onPress={onPress} style={({pressed})=>[s.action,{backgroundColor:theme.surface,borderColor:theme.border},pressed&&s.press]}><View style={[s.actionIcon,{backgroundColor:danger?'rgba(173,74,67,.16)':theme.surface2}]}><Ionicons name={icon} size={21} color={danger?'#C7746D':theme.accent}/></View><View style={s.actionCopy}><Text style={[s.actionTitle,{color:danger?'#D9948D':theme.text}]}>{label}</Text><Text style={[s.actionSub,{color:theme.muted}]}>{sub}</Text></View><Ionicons name="chevron-back" size={18} color={theme.muted}/></Pressable>;

  return <LinearGradient colors={[...theme.gradient]} style={s.fill}><SafeAreaView edges={['top','bottom','left','right']} style={s.root}>
    <View style={[s.head,{borderBottomColor:theme.border}]}>
      <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={()=>router.back()} style={[s.headButton,{backgroundColor:theme.surface,borderColor:theme.border}]}><Ionicons name="chevron-forward" size={22} color={theme.text}/></Pressable>
      <View style={s.headCopy}><Text style={[s.title,{color:theme.text}]}>لوحة الخصوصية</Text><Text style={[s.sub,{color:theme.muted}]}>RAID {version} • حالات فعلية فقط</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="تحديث الحالة" disabled={checking} onPress={refresh} style={[s.headButton,{backgroundColor:theme.surface,borderColor:theme.border},checking&&s.dim]}><Ionicons name="refresh-outline" size={20} color={theme.accent}/></Pressable>
    </View>

    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.statusGrid}>
        {status('الحساب',live.signedIn?'مسجل الدخول':'غير مسجل',live.signedIn,'person-outline')}
        {status('RAID VPN',live.vpnConnected?'متصل فعليًا':'غير متصل',live.vpnConnected,'shield-outline')}
        {status('ملف VPN',live.vpnReady?source:'غير جاهز',live.vpnReady,'key-outline')}
        {status('القفل الحيوي',live.biometric?'مدعوم':'غير متاح',live.biometric,'finger-print-outline')}
      </View>

      <View style={[s.summary,{backgroundColor:theme.surface,borderColor:theme.border}]}>
        <View style={s.summaryHead}><View><Text style={[s.summaryTitle,{color:theme.text}]}>بيانات التصفح المحلية</Text><Text style={[s.summarySub,{color:theme.muted}]}>لا تشمل جلسات الوضع الخاص</Text></View><Ionicons name="lock-closed-outline" size={22} color={theme.accent}/></View>
        <View style={s.metrics}><View style={[s.metric,{backgroundColor:theme.surface2}]}><Text style={[s.metricValue,{color:theme.text}]}>{live.history}</Text><Text style={[s.metricLabel,{color:theme.muted}]}>صفحة في السجل</Text></View><View style={[s.metric,{backgroundColor:theme.surface2}]}><Text style={[s.metricValue,{color:theme.text}]}>{live.bookmarks}</Text><Text style={[s.metricLabel,{color:theme.muted}]}>عنصر مفضلة</Text></View></View>
      </View>

      <View style={[s.securityCard,{backgroundColor:theme.surface,borderColor:theme.border}]}>
        <View style={s.securityHead}><Ionicons name="shield-checkmark-outline" size={22} color={theme.accent}/><Text style={[s.securityTitle,{color:theme.text}]}>خط الأساس الأمني</Text></View>
        <Text style={[s.securityText,{color:theme.muted}]}>الوصول إلى الملفات المحلية معطّل داخل WebView، والوضع الخاص يعزل التخزين والكاش والكوكيز المشتركة، وحالة VPN تُقرأ من الوحدة الأصلية ولا يتم عرض اتصال وهمي.</Text>
      </View>

      <View style={s.sectionHead}><Text style={[s.sectionTitle,{color:theme.text}]}>إجراءات مباشرة</Text><Text style={[s.sectionHint,{color:theme.muted}]}>بدون حالات تجريبية</Text></View>
      <View style={s.actions}>
        {action('فتح RAID VPN',live.vpnConnected?'عرض حالة النفق الحالي':live.vpnReady?'الاتصال بملف WireGuard الجاهز':'إضافة أو استيراد إعداد WireGuard','shield-outline',()=>router.push('/vpn'))}
        {action('التحقق بالبصمة أو الوجه',live.biometric?'اختبار القفل الحيوي على هذا الجهاز':'الجهاز لا يعلن دعمًا حيويًا','finger-print-outline',()=>void auth())}
        {action('الإعدادات','إدارة المظهر والخصوصية وإعدادات المتصفح','settings-outline',()=>router.push('/settings'))}
        {action('مسح سجل التصفح',live.history?`حذف ${live.history} سجلًا محليًا`:'السجل المحلي فارغ','trash-outline',()=>void clear(),true)}
      </View>

      {!!msg&&<View style={[s.message,{backgroundColor:theme.surface2,borderColor:theme.border}]}><Ionicons name="information-circle-outline" size={18} color={theme.accent}/><Text style={[s.messageText,{color:theme.text}]}>{msg}</Text></View>}
    </ScrollView>
  </SafeAreaView></LinearGradient>;
}

const s=StyleSheet.create({fill:{flex:1},root:{flex:1},head:{minHeight:68,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:14,paddingVertical:7,borderBottomWidth:1},headButton:{width:42,height:42,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},headCopy:{flex:1,alignItems:'center',paddingHorizontal:10},title:{fontSize:18,fontWeight:'900'},sub:{fontSize:10,marginTop:3},content:{padding:16,gap:14,paddingBottom:36},statusGrid:{flexDirection:'row-reverse',flexWrap:'wrap',gap:10},status:{width:'48.5%',minHeight:82,borderRadius:20,borderWidth:1,padding:12,flexDirection:'row-reverse',alignItems:'center',gap:10},statusIcon:{width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center'},statusCopy:{flex:1},statusLabel:{fontSize:10,textAlign:'right'},statusValue:{fontSize:12,fontWeight:'900',textAlign:'right',marginTop:4},summary:{borderRadius:24,borderWidth:1,padding:16,gap:14},summaryHead:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'},summaryTitle:{fontSize:16,fontWeight:'900',textAlign:'right'},summarySub:{fontSize:10,marginTop:4,textAlign:'right'},metrics:{flexDirection:'row-reverse',gap:10},metric:{flex:1,minHeight:74,borderRadius:17,alignItems:'center',justifyContent:'center'},metricValue:{fontSize:19,fontWeight:'900'},metricLabel:{fontSize:10,marginTop:4},securityCard:{borderRadius:24,borderWidth:1,padding:16},securityHead:{flexDirection:'row-reverse',alignItems:'center',gap:9,marginBottom:8},securityTitle:{fontSize:16,fontWeight:'900',textAlign:'right'},securityText:{fontSize:12,lineHeight:20,textAlign:'right'},sectionHead:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',paddingHorizontal:2},sectionTitle:{fontSize:16,fontWeight:'900'},sectionHint:{fontSize:10},actions:{gap:9},action:{minHeight:70,borderRadius:20,borderWidth:1,padding:11,flexDirection:'row-reverse',alignItems:'center',gap:11},actionIcon:{width:44,height:44,borderRadius:14,alignItems:'center',justifyContent:'center'},actionCopy:{flex:1},actionTitle:{fontSize:14,fontWeight:'900',textAlign:'right'},actionSub:{fontSize:10.5,marginTop:4,textAlign:'right',lineHeight:16},message:{borderRadius:18,borderWidth:1,padding:12,flexDirection:'row-reverse',alignItems:'center',gap:8},messageText:{flex:1,textAlign:'right',fontSize:11},press:{transform:[{scale:.985}],opacity:.84},dim:{opacity:.5}});
