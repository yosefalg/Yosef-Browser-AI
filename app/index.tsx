import { useCallback, useMemo, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { normalizeInput } from '@/lib/url';
import { getBrowserTabs, getSetting, setSetting } from '@/lib/db';
import { getTheme, type ThemeName } from '@/lib/theme';
import { isVpnConnected } from '@/lib/vpn';
import { HomeMenu, type HomeMenuItem } from '@/components/HomeMenu';
import { listDownloads } from '@/features/downloads/store';
import type { DownloadItem } from '@/features/downloads/types';
import { HomeHeader } from '@/components/home/HomeHeader';
import { HomeShortcuts } from '@/components/home/HomeShortcuts';
import { RaidLogo } from '@/components/RaidLogo';

function looksLikeAIQuery(value:string){const q=value.trim();return /[؟?]$/.test(q)||/^(يا\s+raid|اسأل|اشرح|لخص|قارن|شنو |شكو |وين |ما |ماذا |كيف |لماذا |هل )/i.test(q)}

export default function HomeScreen(){
  const [query,setQuery]=useState('');
  const [downloads,setDownloads]=useState<DownloadItem[]>([]);
  const [tabsCount,setTabsCount]=useState(0);
  const [themeName,setThemeName]=useState<ThemeName>('cinematic');
  const [menuOpen,setMenuOpen]=useState(false);
  const [vpnConnected,setVpnConnected]=useState(false);
  const [welcomeOpen,setWelcomeOpen]=useState(false);
  const theme=useMemo(()=>getTheme(themeName),[themeName]);

  useFocusEffect(useCallback(()=>{let alive=true;Promise.all([
    listDownloads(12).catch(()=>[] as DownloadItem[]),
    getBrowserTabs().catch(()=>[]),
    getSetting<ThemeName>('theme','cinematic').catch(()=>'cinematic' as ThemeName),
    isVpnConnected().catch(()=>false),
    getSetting<boolean>('raid_2_11_welcome_seen',false).catch(()=>false),
  ]).then(([items,tabs,saved,connected,welcomeSeen])=>{if(!alive)return;setDownloads(items);setTabsCount(tabs.length);setThemeName(saved==='cinematic'||saved==='amoled'||saved==='light'?saved:'cinematic');setVpnConnected(Boolean(connected));setWelcomeOpen(!welcomeSeen);});return()=>{alive=false};},[]));

  const openUrl=(value:string)=>{const clean=value.trim();if(!clean)return;Keyboard.dismiss();router.push({pathname:'/browser',params:{url:normalizeInput(clean)}})};
  const askAI=()=>{const prompt=query.trim();Keyboard.dismiss();router.push(prompt?{pathname:'/ai',params:{prompt}}:'/ai')};
  const submit=()=>looksLikeAIQuery(query)?askAI():openUrl(query);
  const go=(path:string)=>{setMenuOpen(false);router.push(path as never)};
  const dismissWelcome=()=>{setWelcomeOpen(false);void setSetting('raid_2_11_welcome_seen',true)};
  const activeDownloads=useMemo(()=>downloads.filter(item=>item.state==='downloading'||item.state==='paused'||item.state==='queued').length,[downloads]);
  const glass=themeName==='light'?'rgba(255,255,255,.76)':'rgba(255,255,255,.065)';

  const menuItems=useMemo<HomeMenuItem[]>(()=>[
    {label:'الرئيسية',icon:'home-outline',hint:'هنا البداية',onPress:()=>setMenuOpen(false)},
    {label:'تبويب جديد',icon:'add-circle-outline',hint:'افتح صفحة جديدة',onPress:()=>go('/browser')},
    {label:'تبويب خاص',icon:'eye-off-outline',hint:'تصفح بخصوصية',onPress:()=>go('/browser?privateMode=1')},
    {label:'التبويبات',icon:'albums-outline',hint:`${tabsCount} مفتوح`,badge:tabsCount||undefined,onPress:()=>go('/tabs')},
    {label:'المكتبة والسجل',icon:'library-outline',hint:'السجل والمفضلة بمكانها',onPress:()=>go('/library')},
    {label:'التنزيلات',icon:'download-outline',hint:activeDownloads?`${activeDownloads} شغال هسه`:'إدارة الملفات',badge:activeDownloads||undefined,onPress:()=>go('/downloads')},
    {label:'RAID AI',icon:'sparkles-outline',hint:'كله شتريد',onPress:()=>go('/ai')},
    {label:'RAID VPN',icon:vpnConnected?'shield-checkmark-outline':'shield-outline',hint:vpnConnected?'متصل وآمن':'غير متصل',onPress:()=>go('/vpn')},
    {label:'الخصوصية',icon:'lock-closed-outline',hint:'مركز الحماية',onPress:()=>go('/privacy')},
    {label:'الحساب',icon:'person-outline',hint:'إدارة الحساب',onPress:()=>go('/account')},
    {label:'الإعدادات',icon:'settings-outline',hint:'كل التخصيصات هنا',onPress:()=>go('/settings')},
  ],[activeDownloads,tabsCount,vpnConnected]);

  const shortcuts=[
    {label:'YouTube',url:'https://www.youtube.com',onPress:()=>openUrl('https://www.youtube.com')},
    {label:'Google',url:'https://www.google.com',onPress:()=>openUrl('https://www.google.com')},
    {label:'RAID AI',service:'ai' as const,onPress:askAI},
    {label:'RAID VPN',service:'vpn' as const,onPress:()=>router.push('/vpn')},
  ];

  const dock=[
    {label:'التبويبات',sub:`${tabsCount} مفتوح`,icon:'albums-outline' as const,onPress:()=>router.push('/tabs')},
    {label:'التنزيلات',sub:activeDownloads?`${activeDownloads} شغال`:'ماكو تنزيل نشط',icon:'download-outline' as const,onPress:()=>router.push('/downloads')},
    {label:'المكتبة',sub:'السجل والمفضلة',icon:'library-outline' as const,onPress:()=>router.push('/library')},
  ];

  return <LinearGradient colors={[...theme.gradient]} style={s.fill}><SafeAreaView edges={['top','bottom','left','right']} style={s.safe}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <HomeHeader theme={theme} vpnConnected={vpnConnected} tabsCount={tabsCount} downloadsCount={activeDownloads} onMenu={()=>setMenuOpen(true)} onTabs={()=>router.push('/tabs')} onDownloads={()=>router.push('/downloads')} onVpn={()=>router.push('/vpn')}/>

      <View style={s.greeting}><Text style={[s.hello,{color:theme.text}]}>هاي يولد 👋</Text><Text style={[s.question,{color:theme.muted}]}>وين تريد تروح اليوم؟</Text></View>

      <View style={[s.search,{backgroundColor:glass,borderColor:theme.border}]}>
        <View style={[s.searchIcon,{backgroundColor:theme.surface2}]}><Ionicons name="search-outline" size={21} color={theme.accent}/></View>
        <TextInput value={query} onChangeText={setQuery} onSubmitEditing={submit} returnKeyType="go" placeholder="وين تريد تروح أو شتريد تبحث؟" placeholderTextColor={theme.muted} style={[s.input,{color:theme.text}]} autoCapitalize="none" autoCorrect={false}/>
        <Pressable accessibilityRole="button" accessibilityLabel="اسأل RAID AI" onPress={askAI} style={({pressed})=>[s.aiQuick,{backgroundColor:theme.surface2,borderColor:theme.border},pressed&&s.press]}><Ionicons name="sparkles" size={18} color={theme.accent}/></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="روح" onPress={submit} style={({pressed})=>[s.go,{backgroundColor:theme.accent},pressed&&s.press]}><Ionicons name="arrow-back" size={20} color="#fff"/></Pressable>
      </View>

      <HomeShortcuts theme={theme} items={shortcuts} onMore={()=>setMenuOpen(true)}/>

      <View style={[s.quickRail,{backgroundColor:glass,borderColor:theme.border}]}> 
        {dock.map((item,index)=><View key={item.label} style={s.quickSlot}>
          <Pressable onPress={item.onPress} accessibilityRole="button" accessibilityLabel={item.label} style={({pressed})=>[s.quickAction,pressed&&s.quickPressed]}>
            <LinearGradient colors={[theme.surface2,themeName==='light'?'rgba(255,255,255,.82)':'rgba(255,255,255,.035)']} style={[s.quickIcon,{borderColor:theme.border}]}><Ionicons name={item.icon} size={21} color={theme.accent}/></LinearGradient>
            <Text style={[s.quickTitle,{color:theme.text}]} numberOfLines={1}>{item.label}</Text>
            <Text style={[s.quickSub,{color:theme.muted}]} numberOfLines={1}>{item.sub}</Text>
          </Pressable>
          {index<dock.length-1?<View style={[s.quickDivider,{backgroundColor:theme.border}]}/>:null}
        </View>)}
      </View>

      <Pressable onPress={()=>router.push('/privacy')} style={({pressed})=>[s.security,{backgroundColor:glass,borderColor:theme.border},pressed&&s.press]}><View style={[s.securityIcon,{backgroundColor:vpnConnected?'rgba(76,184,132,.14)':theme.surface2}]}><Ionicons name={vpnConnected?'shield-checkmark':'shield-checkmark-outline'} size={22} color={vpnConnected?'#4CB884':theme.accent}/></View><View style={s.securityCopy}><Text style={[s.securityTitle,{color:theme.text}]}>حماية RAID</Text><Text style={[s.securitySub,{color:theme.muted}]}>{vpnConnected?'VPN متصل • الحماية شغالة':'الحماية الأساسية شغالة • اضغط للتفاصيل'}</Text></View><Ionicons name="chevron-back" size={18} color={theme.muted}/></Pressable>

      <View style={s.signature}><Text style={[s.signatureTitle,{color:theme.text}]}>RAID</Text><Text style={[s.signatureSub,{color:theme.muted}]}>خفيف • مرتب • على كيفك</Text></View>
    </ScrollView>

    <HomeMenu visible={menuOpen} onClose={()=>setMenuOpen(false)} theme={theme} items={menuItems}/>

    <Modal visible={welcomeOpen} transparent animationType="fade" onRequestClose={dismissWelcome}>
      <View style={s.welcomeBackdrop}><LinearGradient colors={['rgba(8,12,20,.98)','rgba(16,25,35,.98)','rgba(24,20,42,.98)']} style={[s.welcomeCard,{borderColor:theme.border}]}><View style={s.logoGlow}><RaidLogo size={100}/></View><Text style={s.welcomeEyebrow}>RAID BROWSER</Text><Text style={s.welcomeTitle}>هلا بيك 👋</Text><Text style={s.welcomeText}>كلشي مرتب إلك: تصفح أسرع، واجهة أهدأ، وRAID AI أقرب لأوامرك داخل التطبيق.</Text><View style={s.welcomePoints}><View style={s.point}><Ionicons name="sparkles-outline" size={17} color="#8BE0CC"/><Text style={s.pointText}>تجربة أنظف وأخف</Text></View><View style={s.point}><Ionicons name="shield-checkmark-outline" size={17} color="#8BE0CC"/><Text style={s.pointText}>حماية بدون إزعاج</Text></View><View style={s.point}><Ionicons name="navigate-outline" size={17} color="#8BE0CC"/><Text style={s.pointText}>كله وين تريد وروح</Text></View></View><Pressable onPress={dismissWelcome} style={({pressed})=>[s.startButton,pressed&&s.press]}><Text style={s.startText}>يلا نبدأ</Text><Ionicons name="arrow-back" size={19} color="#071412"/></Pressable></LinearGradient></View>
    </Modal>
  </SafeAreaView></LinearGradient>;
}

const s=StyleSheet.create({
  fill:{flex:1},safe:{flex:1},content:{paddingHorizontal:18,paddingBottom:34,gap:16},
  greeting:{alignItems:'flex-end',paddingTop:4},hello:{fontSize:28,fontWeight:'900',textAlign:'right'},question:{fontSize:13,fontWeight:'700',textAlign:'right',marginTop:4},
  search:{minHeight:66,borderRadius:28,borderWidth:1,flexDirection:'row-reverse',alignItems:'center',paddingHorizontal:9,gap:7,shadowColor:'#000',shadowOpacity:.12,shadowRadius:18,elevation:3},searchIcon:{width:42,height:42,borderRadius:15,alignItems:'center',justifyContent:'center'},input:{flex:1,fontSize:15,textAlign:'right',paddingHorizontal:3},aiQuick:{width:42,height:42,borderRadius:15,borderWidth:1,alignItems:'center',justifyContent:'center'},go:{width:46,height:46,borderRadius:17,alignItems:'center',justifyContent:'center'},
  quickRail:{minHeight:94,borderRadius:28,borderWidth:1,flexDirection:'row-reverse',alignItems:'stretch',padding:8,shadowColor:'#000',shadowOpacity:.10,shadowRadius:22,elevation:3,overflow:'hidden'},quickSlot:{flex:1,position:'relative',justifyContent:'center'},quickAction:{flex:1,minHeight:76,borderRadius:20,alignItems:'center',justifyContent:'center',paddingHorizontal:7,paddingVertical:7},quickPressed:{transform:[{scale:.965}],backgroundColor:'rgba(255,255,255,.055)'},quickIcon:{width:40,height:40,borderRadius:15,borderWidth:1,alignItems:'center',justifyContent:'center',marginBottom:7},quickTitle:{fontSize:11.5,fontWeight:'900',textAlign:'center'},quickSub:{fontSize:8.5,fontWeight:'600',textAlign:'center',marginTop:3,maxWidth:92},quickDivider:{position:'absolute',left:0,top:18,bottom:18,width:StyleSheet.hairlineWidth,opacity:.55},
  security:{minHeight:72,borderRadius:23,borderWidth:1,paddingHorizontal:13,paddingVertical:11,flexDirection:'row-reverse',alignItems:'center',gap:11},securityIcon:{width:46,height:46,borderRadius:16,alignItems:'center',justifyContent:'center'},securityCopy:{flex:1,alignItems:'flex-end'},securityTitle:{fontSize:13,fontWeight:'900'},securitySub:{fontSize:9.5,marginTop:4,textAlign:'right'},
  signature:{alignItems:'center',paddingVertical:18},signatureTitle:{fontWeight:'900',letterSpacing:5},signatureSub:{fontSize:10,marginTop:7},press:{transform:[{scale:.98}],opacity:.84},
  welcomeBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,.72)',alignItems:'center',justifyContent:'center',padding:22},welcomeCard:{width:'100%',maxWidth:430,borderRadius:36,borderWidth:1,paddingHorizontal:25,paddingVertical:32,alignItems:'center',overflow:'hidden'},logoGlow:{padding:18,borderRadius:38,backgroundColor:'rgba(255,255,255,.035)'},welcomeEyebrow:{color:'#8BE0CC',fontSize:10,fontWeight:'900',letterSpacing:3,marginTop:18},welcomeTitle:{color:'#F7FAFC',fontSize:31,fontWeight:'900',marginTop:8},welcomeText:{color:'#AEB9C7',fontSize:13,lineHeight:22,textAlign:'center',marginTop:9,maxWidth:310},welcomePoints:{alignSelf:'stretch',gap:9,marginTop:22},point:{height:42,borderRadius:15,backgroundColor:'rgba(255,255,255,.045)',flexDirection:'row-reverse',alignItems:'center',gap:9,paddingHorizontal:12},pointText:{color:'#DCE5EC',fontSize:11,fontWeight:'800',textAlign:'right',flex:1},startButton:{height:54,alignSelf:'stretch',borderRadius:18,backgroundColor:'#8BE0CC',marginTop:24,flexDirection:'row-reverse',gap:8,alignItems:'center',justifyContent:'center'},startText:{color:'#071412',fontSize:14,fontWeight:'900'}
});