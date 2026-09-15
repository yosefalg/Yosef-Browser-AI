import { useCallback, useMemo, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { normalizeInput, SEARCH_SHORTCUTS } from '@/lib/url';
import { getBrowserTabs, getRecentSites, getSetting, setSetting } from '@/lib/db';
import { getTheme, isThemeName, type ThemeName } from '@/lib/theme';
import { isVpnConnected } from '@/lib/vpn';
import { HomeMenu, type HomeMenuItem } from '@/components/HomeMenu';
import { listDownloads } from '@/features/downloads/store';
import type { DownloadItem } from '@/features/downloads/types';
import { HomeHeader } from '@/components/home/HomeHeader';
import { HomeShortcuts } from '@/components/home/HomeShortcuts';
import { HomeRecentSites, type RecentSite } from '@/components/home/HomeRecentSites';
import { RaidLogo } from '@/components/RaidLogo';

function looksLikeAIQuery(value:string){const q=value.trim();return /[؟?]$/.test(q)||/^(يا\s+raid|اسأل|اشرح|لخص|قارن|شنو |شكو |وين |ما |ماذا |كيف |لماذا |هل )/i.test(q)}

export default function HomeScreen(){
  const [query,setQuery]=useState('');
  const [downloads,setDownloads]=useState<DownloadItem[]>([]);
  const [tabsCount,setTabsCount]=useState(0);
  const [recentSites,setRecentSites]=useState<RecentSite[]>([]);
  const [themeName,setThemeName]=useState<ThemeName>('cinematic');
  const [menuOpen,setMenuOpen]=useState(false);
  const [vpnConnected,setVpnConnected]=useState(false);
  const [welcomeOpen,setWelcomeOpen]=useState(false);
  const theme=useMemo(()=>getTheme(themeName),[themeName]);

  useFocusEffect(useCallback(()=>{let alive=true;Promise.all([
    listDownloads(12).catch(()=>[] as DownloadItem[]),
    getBrowserTabs().catch(()=>[]),
    getRecentSites(6).catch(()=>[] as RecentSite[]),
    getSetting<ThemeName>('theme','cinematic').catch(()=>'cinematic' as ThemeName),
    isVpnConnected().catch(()=>false),
    getSetting<boolean>('raid_2_11_welcome_seen',false).catch(()=>false),
  ]).then(([items,tabs,recent,saved,connected,welcomeSeen])=>{if(!alive)return;setDownloads(items);setTabsCount(tabs.length);setRecentSites(recent);setThemeName(isThemeName(saved)?saved:'cinematic');setVpnConnected(Boolean(connected));setWelcomeOpen(!welcomeSeen);});return()=>{alive=false};},[]));

  const openUrl=(value:string)=>{const clean=value.trim();if(!clean)return;Keyboard.dismiss();router.push({pathname:'/browser',params:{url:normalizeInput(clean)}})};
  const askAI=()=>{const prompt=query.trim();Keyboard.dismiss();router.push(prompt?{pathname:'/ai',params:{prompt}}:'/ai')};
  const submit=()=>looksLikeAIQuery(query)?askAI():openUrl(query);
  const applySearchShortcut=(prefix:string)=>{const clean=query.trim();if(clean&&!clean.startsWith('!')){openUrl(`${prefix} ${clean}`);return;}setQuery(`${prefix} `)};
  const go=(path:string)=>{setMenuOpen(false);router.push(path as never)};
  const dismissWelcome=()=>{setWelcomeOpen(false);void setSetting('raid_2_11_welcome_seen',true)};
  const activeDownloads=useMemo(()=>downloads.filter(item=>item.state==='downloading'||item.state==='paused'||item.state==='queued').length,[downloads]);
  const lightSurface=themeName==='cinematic'||themeName==='light'||themeName==='ivory';
  const glass=lightSurface?'rgba(255,255,255,.78)':'rgba(255,255,255,.07)';
  const heroText=lightSurface?'#182126':'#F7FAFC';
  const heroMuted=lightSurface?'#66727A':'#AEBBC7';
  const searchChips=SEARCH_SHORTCUTS.slice(0,4);

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



  return <LinearGradient colors={[...theme.gradient]} style={s.fill}><SafeAreaView edges={['top','bottom','left','right']} style={s.safe}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <HomeHeader theme={theme} vpnConnected={vpnConnected} tabsCount={tabsCount} downloadsCount={activeDownloads} onMenu={()=>setMenuOpen(true)} onTabs={()=>router.push('/tabs')} onDownloads={()=>router.push('/downloads')} onVpn={()=>router.push('/vpn')}/>

      <LinearGradient
        colors={lightSurface?['rgba(255,252,245,.98)','rgba(226,237,223,.98)']:['rgba(25,55,62,.98)','rgba(28,37,53,.98)','rgba(48,34,57,.98)']}
        start={{x:0,y:0}}
        end={{x:1,y:1}}
        style={[s.hero,{borderColor:lightSurface?'rgba(30,70,75,.12)':'rgba(255,255,255,.12)'}]}>
        <View pointerEvents="none" style={s.heroGlowA}/>
        <View pointerEvents="none" style={s.heroGlowB}/>
        <View style={s.heroTop}>
          <View style={s.greeting}><Text style={[s.hello,{color:heroText}]}>هاي يولد 👋</Text><Text style={[s.question,{color:heroMuted}]}>وين تريد تروح اليوم؟</Text></View>
          <View style={[s.commandPill,{backgroundColor:lightSurface?'rgba(255,255,255,.64)':'rgba(255,255,255,.07)'}]}><View style={s.liveDot}/><Text style={[s.commandText,{color:heroMuted}]}>RAID READY</Text></View>
        </View>

        <View style={[s.search,{backgroundColor:lightSurface?'rgba(255,255,255,.82)':'rgba(4,10,18,.34)',borderColor:lightSurface?'rgba(25,70,75,.13)':'rgba(255,255,255,.13)'}]}>
          <View style={[s.searchIcon,{backgroundColor:lightSurface?'rgba(27,85,86,.08)':'rgba(255,255,255,.07)'}]}><Ionicons name="search-outline" size={20} color={theme.accent}/></View>
          <TextInput value={query} onChangeText={setQuery} onSubmitEditing={submit} returnKeyType="go" placeholder="ابحث أو اكتب موقعًا" placeholderTextColor={heroMuted} style={[s.input,{color:heroText}]} autoCapitalize="none" autoCorrect={false}/>
          <Pressable accessibilityRole="button" accessibilityLabel="اسأل RAID AI" onPress={askAI} style={({pressed})=>[s.aiQuick,{backgroundColor:lightSurface?'rgba(255,255,255,.68)':'rgba(255,255,255,.07)',borderColor:lightSurface?'rgba(25,70,75,.12)':'rgba(255,255,255,.11)'},pressed&&s.press]}><Ionicons name="sparkles" size={17} color={theme.accent}/></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="روح" onPress={submit} style={({pressed})=>[s.go,{backgroundColor:theme.accent},pressed&&s.press]}><Ionicons name="arrow-back" size={19} color="#fff"/></Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.searchShortcutRow}>
          {searchChips.map(item=><Pressable key={item.prefix} onPress={()=>applySearchShortcut(item.prefix)} accessibilityRole="button" accessibilityLabel={`بحث ${item.label}`} style={({pressed})=>[s.searchShortcut,{backgroundColor:lightSurface?'rgba(255,255,255,.55)':'rgba(255,255,255,.055)',borderColor:lightSurface?'rgba(25,70,75,.10)':'rgba(255,255,255,.09)'},pressed&&s.press]}><Text style={[s.shortcutPrefix,{color:theme.accent}]}>{item.prefix}</Text><Text style={[s.shortcutLabel,{color:heroText}]}>{item.label}</Text></Pressable>)}
        </ScrollView>
      </LinearGradient>

      <View style={s.sectionHead}><Text style={[s.sectionTitle,{color:theme.text}]}>اختصاراتك</Text><Pressable onPress={()=>setMenuOpen(true)} hitSlop={8}><Text style={[s.sectionAction,{color:theme.accent}]}>الكل</Text></Pressable></View>
      <HomeShortcuts theme={theme} items={shortcuts} onMore={()=>setMenuOpen(true)}/>

      <HomeRecentSites theme={theme} items={recentSites} onOpen={openUrl} onViewAll={()=>router.push('/library?section=history')}/>

      <Pressable onPress={()=>router.push('/privacy')} style={({pressed})=>[s.security,{backgroundColor:glass,borderColor:theme.border},pressed&&s.press]}><View style={[s.securityIcon,{backgroundColor:vpnConnected?'rgba(76,184,132,.14)':theme.surface2}]}><Ionicons name={vpnConnected?'shield-checkmark':'shield-checkmark-outline'} size={22} color={vpnConnected?'#4CB884':theme.accent}/></View><View style={s.securityCopy}><Text style={[s.securityTitle,{color:theme.text}]}>حماية RAID</Text><Text style={[s.securitySub,{color:theme.muted}]}>{vpnConnected?'VPN متصل • الحماية شغالة':'الحماية الأساسية شغالة • اضغط للتفاصيل'}</Text></View><Ionicons name="chevron-back" size={18} color={theme.muted}/></Pressable>
    </ScrollView>

    <HomeMenu visible={menuOpen} onClose={()=>setMenuOpen(false)} theme={theme} items={menuItems}/>

    <Modal visible={welcomeOpen} transparent animationType="fade" onRequestClose={dismissWelcome}>
      <View style={s.welcomeBackdrop}><LinearGradient colors={['rgba(8,12,20,.98)','rgba(16,25,35,.98)','rgba(24,20,42,.98)']} style={[s.welcomeCard,{borderColor:theme.border}]}><View style={s.logoGlow}><RaidLogo size={100}/></View><Text style={s.welcomeEyebrow}>RAID BROWSER</Text><Text style={s.welcomeTitle}>هلا بيك 👋</Text><Text style={s.welcomeText}>كلشي مرتب إلك: تصفح أسرع، واجهة أهدأ، وRAID AI أقرب لأوامرك داخل التطبيق.</Text><View style={s.welcomePoints}><View style={s.point}><Ionicons name="sparkles-outline" size={17} color="#8BE0CC"/><Text style={s.pointText}>تجربة أنظف وأخف</Text></View><View style={s.point}><Ionicons name="shield-checkmark-outline" size={17} color="#8BE0CC"/><Text style={s.pointText}>حماية بدون إزعاج</Text></View><View style={s.point}><Ionicons name="navigate-outline" size={17} color="#8BE0CC"/><Text style={s.pointText}>كله وين تريد وروح</Text></View></View><Pressable onPress={dismissWelcome} style={({pressed})=>[s.startButton,pressed&&s.press]}><Text style={s.startText}>يلا نبدأ</Text><Ionicons name="arrow-back" size={19} color="#071412"/></Pressable></LinearGradient></View>
    </Modal>
  </SafeAreaView></LinearGradient>;
}

const s=StyleSheet.create({
  fill:{flex:1},safe:{flex:1},content:{paddingHorizontal:15,paddingBottom:22,gap:12},
  hero:{minHeight:210,borderRadius:28,borderWidth:1,padding:15,gap:12,overflow:'hidden'},heroGlowA:{position:'absolute',width:170,height:170,borderRadius:85,backgroundColor:'rgba(78,123,97,.14)',top:-95,right:-35},heroGlowB:{position:'absolute',width:150,height:150,borderRadius:75,backgroundColor:'rgba(194,167,123,.15)',bottom:-100,left:-25},heroTop:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:12},greeting:{alignItems:'flex-end'},hello:{fontSize:24,fontWeight:'900',textAlign:'right'},question:{fontSize:11.5,fontWeight:'700',textAlign:'right',marginTop:3},commandPill:{height:28,borderRadius:14,paddingHorizontal:9,flexDirection:'row',alignItems:'center',gap:6,borderWidth:1,borderColor:'rgba(255,255,255,.08)'},liveDot:{width:6,height:6,borderRadius:3,backgroundColor:'#64D7A5'},commandText:{fontSize:8,fontWeight:'900',letterSpacing:.8},
  search:{minHeight:56,borderRadius:20,borderWidth:1,flexDirection:'row-reverse',alignItems:'center',paddingHorizontal:7,gap:6},searchIcon:{width:38,height:38,borderRadius:13,alignItems:'center',justifyContent:'center'},input:{flex:1,fontSize:14,textAlign:'right',paddingHorizontal:3,paddingVertical:0},aiQuick:{width:38,height:38,borderRadius:13,borderWidth:1,alignItems:'center',justifyContent:'center'},go:{width:42,height:42,borderRadius:15,alignItems:'center',justifyContent:'center'},
  searchShortcutRow:{gap:7,paddingHorizontal:1},searchShortcut:{height:30,borderRadius:11,borderWidth:1,paddingHorizontal:9,flexDirection:'row',alignItems:'center',gap:5},shortcutPrefix:{fontSize:9.5,fontWeight:'900'},shortcutLabel:{fontSize:9,fontWeight:'800'},sectionHead:{height:24,flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',paddingHorizontal:2},sectionTitle:{fontSize:13,fontWeight:'900'},sectionAction:{fontSize:10,fontWeight:'900'},
  quickRail:{minHeight:94,borderRadius:28,borderWidth:1,flexDirection:'row-reverse',alignItems:'stretch',padding:8,shadowColor:'#000',shadowOpacity:.10,shadowRadius:22,elevation:3,overflow:'hidden'},quickSlot:{flex:1,position:'relative',justifyContent:'center'},quickAction:{flex:1,minHeight:76,borderRadius:20,alignItems:'center',justifyContent:'center',paddingHorizontal:7,paddingVertical:7},quickPressed:{transform:[{scale:.965}],backgroundColor:'rgba(255,255,255,.055)'},quickIcon:{width:40,height:40,borderRadius:15,borderWidth:1,alignItems:'center',justifyContent:'center',marginBottom:7},quickTitle:{fontSize:11.5,fontWeight:'900',textAlign:'center'},quickSub:{fontSize:8.5,fontWeight:'600',textAlign:'center',marginTop:3,maxWidth:92},quickDivider:{position:'absolute',left:0,top:18,bottom:18,width:StyleSheet.hairlineWidth,opacity:.55},
  security:{minHeight:62,borderRadius:20,borderWidth:1,paddingHorizontal:12,paddingVertical:9,flexDirection:'row-reverse',alignItems:'center',gap:10},securityIcon:{width:40,height:40,borderRadius:14,alignItems:'center',justifyContent:'center'},securityCopy:{flex:1,alignItems:'flex-end'},securityTitle:{fontSize:12.5,fontWeight:'900'},securitySub:{fontSize:9,marginTop:3,textAlign:'right'},
  signature:{alignItems:'center',paddingVertical:18},signatureTitle:{fontWeight:'900',letterSpacing:5},signatureSub:{fontSize:10,marginTop:7},press:{transform:[{scale:.98}],opacity:.84},
  welcomeBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,.72)',alignItems:'center',justifyContent:'center',padding:22},welcomeCard:{width:'100%',maxWidth:430,borderRadius:36,borderWidth:1,paddingHorizontal:25,paddingVertical:32,alignItems:'center',overflow:'hidden'},logoGlow:{padding:18,borderRadius:38,backgroundColor:'rgba(255,255,255,.035)'},welcomeEyebrow:{color:'#8BE0CC',fontSize:10,fontWeight:'900',letterSpacing:3,marginTop:18},welcomeTitle:{color:'#F7FAFC',fontSize:31,fontWeight:'900',marginTop:8},welcomeText:{color:'#AEB9C7',fontSize:13,lineHeight:22,textAlign:'center',marginTop:9,maxWidth:310},welcomePoints:{alignSelf:'stretch',gap:9,marginTop:22},point:{height:42,borderRadius:15,backgroundColor:'rgba(255,255,255,.045)',flexDirection:'row-reverse',alignItems:'center',gap:9,paddingHorizontal:12},pointText:{color:'#DCE5EC',fontSize:11,fontWeight:'800',textAlign:'right',flex:1},startButton:{height:54,alignSelf:'stretch',borderRadius:18,backgroundColor:'#8BE0CC',marginTop:24,flexDirection:'row-reverse',gap:8,alignItems:'center',justifyContent:'center'},startText:{color:'#071412',fontSize:14,fontWeight:'900'}
});