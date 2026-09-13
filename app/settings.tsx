import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { getSetting, setSetting } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { isVpnConnected } from '@/lib/vpn';
import { getTheme, isThemeName, type ThemeName } from '@/lib/theme';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';

type SettingsRow={title:string;hint:string;icon:string;route:string;badge?:string};

export default function SettingsScreen(){
  const [themeName,setThemeName]=useState<ThemeName>('cinematic');
  const [signedIn,setSignedIn]=useState(false);
  const [vpnConnected,setVpnConnected]=useState(false);
  const theme=useMemo(()=>getTheme(themeName),[themeName]);

  const refresh=useCallback(async()=>{
    const [savedTheme,session,vpn]=await Promise.all([
      getSetting<ThemeName>('theme','cinematic').catch(()=>'cinematic' as ThemeName),
      getCurrentSession().catch(()=>null),
      isVpnConnected().catch(()=>false),
    ]);
    setThemeName(isThemeName(savedTheme)?savedTheme:'cinematic');
    setSignedIn(Boolean(session?.user));
    setVpnConnected(vpn);
  },[]);

  useFocusEffect(useCallback(()=>{void refresh();return()=>{};},[refresh]));
  const choose=async(t:ThemeName)=>{setThemeName(t);await setSetting('theme',t)};

  const browsing:SettingsRow[]=[
    {title:'RAID Performance',hint:'Boost ومودات التصفح للشبكات العراقية والمتذبذبة',icon:'speedometer',route:'/performance',badge:'جديد'},
    {title:'التنزيلات',hint:'الملفات النشطة والمكتملة',icon:'download-circle-outline',route:'/downloads'},
    {title:'المكتبة',hint:'المفضلة والسجل والمحتوى المحفوظ',icon:'bookshelf',route:'/library'},
    {title:'التبويبات',hint:'إدارة جلسات التصفح واستعادتها',icon:'tab-multiple',route:'/tabs'},
  ];
  const services:SettingsRow[]=[
    {title:'حساب RAID',hint:signedIn?'الحساب متصل ويمكن مزامنته':'غير مسجل الدخول',icon:signedIn?'account-check-outline':'account-outline',route:'/account',badge:signedIn?'متصل':'غير مسجل'},
    {title:'قفل RAID',hint:'قفل اختياري ببصمة أو وجه الجهاز',icon:'shield-lock-outline',route:'/app-lock',badge:'حماية'},
    {title:'RAID Security Center',hint:'فحص الروابط وكشف مؤشرات التمويه قبل الفتح',icon:'shield-search-outline',route:'/security',badge:'جديد'},
    {title:'RAID AI',hint:'المساعد الذكي وسياق الصفحة',icon:'creation',route:'/ai'},
    {title:'RAID VPN',hint:vpnConnected?'النفق متصل فعليًا':'إدارة WireGuard والاتصال',icon:vpnConnected?'shield-check':'shield-outline',route:'/vpn',badge:vpnConnected?'متصل':'غير متصل'},
    {title:'مركز الخصوصية',hint:'الحماية والبيانات المحلية',icon:'shield-lock-outline',route:'/privacy'},
    {title:'مدير كلمات المرور',hint:'بيانات الدخول المحفوظة',icon:'key-chain-variant',route:'/passwords'},
  ];
  const system:SettingsRow[]=[
    {title:'مركز الحالة',hint:'الخدمات والإصدار والتنبيهات',icon:'pulse',route:'/notifications'},
    {title:'مزودات VPN',hint:'WireGuard ومصدر الإعداد',icon:'server-network',route:'/vpn-provider'},
    {title:'تواصل مع RAID',hint:'القنوات الرسمية والدعم',icon:'message-processing-outline',route:'/contact'},
  ];

  return <SafeAreaView edges={['top','bottom','left','right']} style={[s.root,{backgroundColor:theme.bg}]}>
    <View style={[s.head,{backgroundColor:theme.surface,borderBottomColor:theme.border}]}>
      <Pressable onPress={()=>router.back()} style={({pressed})=>[s.iconButton,{backgroundColor:theme.surface2,borderColor:theme.border},pressed&&s.pressed]} accessibilityLabel="رجوع"><MaterialCommunityIcons name="chevron-right" size={25} color={theme.text}/></Pressable>
      <View style={s.headText}><Text style={[s.title,{color:theme.text}]}>الإعدادات</Text><Text style={[s.subtitle,{color:theme.muted}]}>RAID Control Center</Text></View>
      <Pressable onPress={()=>router.push('/security')} style={({pressed})=>[s.iconButton,{backgroundColor:theme.surface2,borderColor:theme.border},pressed&&s.pressed]} accessibilityLabel="مركز الأمان"><MaterialCommunityIcons name="shield-search-outline" size={21} color={theme.accent}/></Pressable>
    </View>

    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={[s.hero,{backgroundColor:theme.surface,borderColor:theme.border}]}>
        <View style={[s.heroIcon,{backgroundColor:theme.surface2,borderColor:theme.border}]}><MaterialCommunityIcons name="tune-variant" size={28} color={theme.accent}/></View>
        <View style={s.heroCopy}><Text style={[s.heroKicker,{color:theme.accent}]}>RAID Browser</Text><Text style={[s.heroTitle,{color:theme.text}]}>إعدادات مرتبة بدون ازدحام</Text><Text style={[s.heroText,{color:theme.muted}]}>التصفح، الحساب، الحماية، الأداء، الذكاء الاصطناعي والمظهر من مركز واحد.</Text></View>
      </View>

      <StatusStrip theme={theme} signedIn={signedIn} vpnConnected={vpnConnected}/>
      <Section title="التصفح والأداء والبيانات" rows={browsing} theme={theme}/>
      <Section title="الحساب والخدمات" rows={services} theme={theme}/>

      <View style={s.sectionWrap}>
        <View style={s.sectionHead}><MaterialCommunityIcons name="palette-outline" size={18} color={theme.accent}/><Text style={[s.sectionTitle,{color:theme.accent}]}>المظهر Premium</Text></View>
        <View style={[s.themeCard,{backgroundColor:theme.surface,borderColor:theme.border}]}><ThemeSwitcher value={themeName} onChange={value=>void choose(value)}/><Text style={[s.themeNote,{color:theme.muted}]}>6 ثيمات مصممة لـRAID: سينمائي، Graphite، Deep Teal، AMOLED، Light وWarm Ivory. الاختيار يُحفظ مباشرة.</Text></View>
      </View>

      <Section title="النظام والدعم" rows={system} theme={theme}/>
    </ScrollView>
  </SafeAreaView>
}

function StatusStrip({theme,signedIn,vpnConnected}:{theme:ReturnType<typeof getTheme>;signedIn:boolean;vpnConnected:boolean}){
  return <View style={s.statusStrip}>
    <View style={[s.statusItem,{backgroundColor:theme.surface,borderColor:theme.border}]}><MaterialCommunityIcons name={signedIn?'account-check-outline':'account-outline'} size={20} color={signedIn?'#4CB884':theme.muted}/><Text style={[s.statusLabel,{color:theme.text}]}>الحساب</Text><Text style={[s.statusValue,{color:signedIn?'#4CB884':theme.muted}]}>{signedIn?'متصل':'غير مسجل'}</Text></View>
    <View style={[s.statusItem,{backgroundColor:theme.surface,borderColor:theme.border}]}><MaterialCommunityIcons name={vpnConnected?'shield-check':'shield-outline'} size={20} color={vpnConnected?'#4CB884':theme.muted}/><Text style={[s.statusLabel,{color:theme.text}]}>VPN</Text><Text style={[s.statusValue,{color:vpnConnected?'#4CB884':theme.muted}]}>{vpnConnected?'متصل':'غير متصل'}</Text></View>
  </View>
}

function Section({title,rows,theme}:{title:string;rows:SettingsRow[];theme:ReturnType<typeof getTheme>}){
  return <View style={s.sectionWrap}><View style={s.sectionHead}><View style={[s.sectionDot,{backgroundColor:theme.accent}]}/><Text style={[s.sectionTitle,{color:theme.accent}]}>{title}</Text></View><View style={[s.group,{backgroundColor:theme.surface,borderColor:theme.border}]}>{rows.map((row,index)=><Pressable key={row.title} onPress={()=>router.push(row.route as never)} style={({pressed})=>[s.row,index<rows.length-1&&{borderBottomWidth:1,borderBottomColor:theme.border},pressed&&s.pressed]}><View style={[s.rowIcon,{backgroundColor:theme.surface2,borderColor:theme.border}]}><MaterialCommunityIcons name={row.icon as never} size={21} color={theme.accent}/></View><View style={s.rowCopy}><View style={s.rowTitleLine}><Text style={[s.rowText,{color:theme.text}]}>{row.title}</Text>{row.badge?<View style={[s.badge,{backgroundColor:theme.surface2,borderColor:theme.border}]}><Text style={[s.badgeText,{color:theme.muted}]}>{row.badge}</Text></View>:null}</View><Text style={[s.rowHint,{color:theme.muted}]}>{row.hint}</Text></View><MaterialCommunityIcons name="chevron-left" size={23} color={theme.muted}/></Pressable>)}</View></View>
}

const s=StyleSheet.create({
  root:{flex:1},head:{minHeight:66,flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',paddingHorizontal:14,paddingVertical:7,borderBottomWidth:1},iconButton:{width:42,height:42,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},headText:{alignItems:'center'},title:{fontSize:18,fontWeight:'900'},subtitle:{marginTop:1,fontSize:9,letterSpacing:.6},content:{padding:16,gap:16,paddingBottom:42},hero:{padding:17,borderRadius:24,borderWidth:1,flexDirection:'row-reverse',alignItems:'center',gap:13},heroIcon:{width:54,height:54,borderRadius:18,borderWidth:1,alignItems:'center',justifyContent:'center'},heroCopy:{flex:1,alignItems:'flex-end'},heroKicker:{fontSize:9,fontWeight:'900',letterSpacing:.7},heroTitle:{fontSize:20,fontWeight:'900',textAlign:'right',marginTop:3},heroText:{marginTop:6,lineHeight:18,textAlign:'right',fontSize:11},
  statusStrip:{flexDirection:'row-reverse',gap:10},statusItem:{flex:1,minHeight:82,borderRadius:20,borderWidth:1,padding:12,alignItems:'flex-end',justifyContent:'center'},statusLabel:{fontSize:12,fontWeight:'900',marginTop:6},statusValue:{fontSize:10,fontWeight:'800',marginTop:3},sectionWrap:{gap:9},sectionHead:{flexDirection:'row-reverse',alignItems:'center',gap:8,paddingHorizontal:3},sectionDot:{width:7,height:7,borderRadius:4},sectionTitle:{fontWeight:'900',textAlign:'right'},group:{borderRadius:22,borderWidth:1,overflow:'hidden'},row:{minHeight:70,paddingHorizontal:12,paddingVertical:10,flexDirection:'row-reverse',alignItems:'center',gap:11},rowIcon:{width:44,height:44,borderRadius:15,borderWidth:1,alignItems:'center',justifyContent:'center'},rowCopy:{flex:1,alignItems:'flex-end'},rowTitleLine:{flexDirection:'row-reverse',alignItems:'center',gap:7},rowText:{fontWeight:'900',textAlign:'right'},rowHint:{marginTop:4,fontSize:10,textAlign:'right'},badge:{height:23,paddingHorizontal:8,borderRadius:11,borderWidth:1,alignItems:'center',justifyContent:'center'},badgeText:{fontSize:9,fontWeight:'800'},themeCard:{padding:12,borderRadius:22,borderWidth:1,gap:10},themeNote:{fontSize:10,lineHeight:17,textAlign:'right',paddingHorizontal:3},pressed:{opacity:.72,transform:[{scale:.99}]}
});
