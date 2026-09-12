import { useCallback, useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { normalizeInput } from '@/lib/url';
import { getBrowserTabs, getRecentSites, getSetting, setSetting } from '@/lib/db';
import { getTheme, type ThemeName } from '@/lib/theme';
import { isVpnConnected } from '@/lib/vpn';
import { HomeMenu, type HomeMenuItem } from '@/components/HomeMenu';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { SiteIcon } from '@/components/SiteIcon';
import { listDownloads } from '@/features/downloads/store';
import type { DownloadItem } from '@/features/downloads/types';
import { HomeHeader } from '@/components/home/HomeHeader';
import { HomeHero } from '@/components/home/HomeHero';
import { HomeShortcuts } from '@/components/home/HomeShortcuts';
import { HomeFeatureCards } from '@/components/home/HomeFeatureCards';
import { HomeStatusStrip } from '@/components/home/HomeStatusStrip';

type RecentSite={url:string;title:string;visited_at:number};
function hostname(url:string){try{return new URL(url).hostname.replace(/^www\./,'')}catch{return url}}
function looksLikeAIQuery(value:string){const q=value.trim();return /[؟?]$/.test(q)||/^(يا\s+raid|اسأل|اشرح|لخص|قارن|ما |ماذا |كيف |لماذا |هل )/i.test(q)}

export default function HomeScreen(){
  const [query,setQuery]=useState('');
  const [recent,setRecent]=useState<RecentSite[]>([]);
  const [downloads,setDownloads]=useState<DownloadItem[]>([]);
  const [tabsCount,setTabsCount]=useState(0);
  const [themeName,setThemeName]=useState<ThemeName>('cinematic');
  const [menuOpen,setMenuOpen]=useState(false);
  const [vpnConnected,setVpnConnected]=useState(false);
  const theme=useMemo(()=>getTheme(themeName),[themeName]);

  useFocusEffect(useCallback(()=>{let alive=true;Promise.all([
    getRecentSites(8).catch(()=>[] as RecentSite[]),
    listDownloads(12).catch(()=>[] as DownloadItem[]),
    getBrowserTabs().catch(()=>[]),
    getSetting<ThemeName>('theme','cinematic').catch(()=>'cinematic' as ThemeName),
    isVpnConnected().catch(()=>false),
  ]).then(([sites,items,tabs,saved,connected])=>{if(!alive)return;setRecent(sites);setDownloads(items);setTabsCount(tabs.length);setThemeName(saved==='cinematic'||saved==='amoled'||saved==='light'?saved:'cinematic');setVpnConnected(Boolean(connected));});return()=>{alive=false};},[]));

  const openUrl=(value:string)=>{const clean=value.trim();if(!clean)return;Keyboard.dismiss();router.push({pathname:'/browser',params:{url:normalizeInput(clean)}})};
  const askAI=()=>{const prompt=query.trim();Keyboard.dismiss();router.push(prompt?{pathname:'/ai',params:{prompt}}:'/ai')};
  const submit=()=>looksLikeAIQuery(query)?askAI():openUrl(query);
  const go=(path:string)=>{setMenuOpen(false);router.push(path as never)};
  const chooseTheme=async(value:ThemeName)=>{setThemeName(value);await setSetting('theme',value)};
  const latestSite=recent[0];
  const activeDownloads=useMemo(()=>downloads.filter(item=>item.state==='downloading'||item.state==='paused'||item.state==='queued').length,[downloads]);
  const completedDownloads=useMemo(()=>downloads.filter(item=>item.state==='completed').length,[downloads]);

  const menuItems=useMemo<HomeMenuItem[]>(()=>[
    {label:'الرئيسية',icon:'home-outline',hint:'الصفحة الرئيسية',onPress:()=>setMenuOpen(false)},
    {label:'علامة تبويب جديدة',icon:'add-circle-outline',hint:'فتح تبويب جديد',onPress:()=>go('/browser')},
    {label:'علامة تبويب خاصة',icon:'eye-off-outline',hint:'تصفح بخصوصية',onPress:()=>go('/browser?privateMode=1')},
    {label:'التبويبات',icon:'albums-outline',hint:`${tabsCount} تبويب مفتوح`,badge:tabsCount||undefined,onPress:()=>go('/tabs')},
    {label:'المكتبة والسجل',icon:'library-outline',hint:'المفضلة والسجل',onPress:()=>go('/library')},
    {label:'عمليات التنزيل',icon:'download-outline',hint:activeDownloads?`${activeDownloads} تنزيل نشط`:'إدارة الملفات',badge:activeDownloads||undefined,onPress:()=>go('/downloads')},
    {label:'RAID AI',icon:'sparkles-outline',hint:'مساعدك الذكي',onPress:()=>go('/ai')},
    {label:'RAID VPN',icon:vpnConnected?'shield-checkmark-outline':'shield-outline',hint:vpnConnected?'متصل فعليًا':'غير متصل',onPress:()=>go('/vpn')},
    {label:'الخصوصية',icon:'lock-closed-outline',hint:'مركز الحماية',onPress:()=>go('/privacy')},
    {label:'الحساب',icon:'person-outline',hint:'إدارة الحساب',onPress:()=>go('/account')},
    {label:'الإعدادات',icon:'settings-outline',hint:'تخصيص التطبيق',onPress:()=>go('/settings')},
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

      <View style={[s.search,{backgroundColor:theme.surface,borderColor:theme.border}]}>
        <Ionicons name="search-outline" size={22} color={theme.accent}/>
        <TextInput value={query} onChangeText={setQuery} onSubmitEditing={submit} returnKeyType="go" placeholder="ابحث أو اكتب عنوان موقع" placeholderTextColor={theme.muted} style={[s.input,{color:theme.text}]} autoCapitalize="none" autoCorrect={false}/>
        <Pressable accessibilityRole="button" accessibilityLabel="اسأل RAID AI" onPress={askAI} style={({pressed})=>[s.aiQuick,{backgroundColor:theme.surface2,borderColor:theme.border},pressed&&s.press]}><Ionicons name="sparkles" size={18} color={theme.accent}/></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="فتح" onPress={submit} style={({pressed})=>[s.go,{backgroundColor:theme.accent},pressed&&s.press]}><Ionicons name="arrow-back" size={20} color="#fff"/></Pressable>
      </View>

      <HomeStatusStrip theme={theme} vpnConnected={vpnConnected} tabsCount={tabsCount} activeDownloads={activeDownloads} onVpn={()=>router.push('/vpn')} onTabs={()=>router.push('/tabs')} onDownloads={()=>router.push('/downloads')}/>
      <HomeShortcuts theme={theme} items={shortcuts} onMore={()=>setMenuOpen(true)}/>
      <HomeHero recent={latestSite} vpnConnected={vpnConnected} tabsCount={tabsCount} onPress={()=>openUrl(latestSite?.url||'https://www.google.com')}/>
      <HomeFeatureCards theme={theme} activeDownloads={activeDownloads} completedDownloads={completedDownloads} vpnConnected={vpnConnected} tabsCount={tabsCount} onDownloads={()=>router.push('/downloads')} onLibrary={()=>router.push('/library')} onPrivacy={()=>router.push('/privacy')}/>

      {recent.length>0&&<View style={[s.panel,{backgroundColor:theme.surface,borderColor:theme.border}]}><View style={s.panelHead}><Text style={[s.panelTitle,{color:theme.text}]}>المواقع الأخيرة</Text><Pressable onPress={()=>router.push('/library')}><Text style={[s.panelLink,{color:theme.accent}]}>عرض الكل</Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.recentRow}>{recent.slice(0,6).map(site=><Pressable key={site.url} onPress={()=>openUrl(site.url)} style={({pressed})=>[s.recentCard,{backgroundColor:theme.surface2,borderColor:theme.border},pressed&&s.press]}><SiteIcon url={site.url} size={40} radius={12}/><Text numberOfLines={2} style={[s.recentTitle,{color:theme.text}]}>{site.title||hostname(site.url)}</Text><Text numberOfLines={1} style={[s.recentHost,{color:theme.muted}]}>{hostname(site.url)}</Text></Pressable>)}</ScrollView></View>}

      <View style={[s.panel,{backgroundColor:theme.surface,borderColor:theme.border}]}><View style={s.panelHead}><Text style={[s.panelTitle,{color:theme.text}]}>الأدوات الذكية</Text><Text style={[s.panelHint,{color:theme.muted}]}>وصول سريع</Text></View><View style={s.tools}><Pressable onPress={askAI} style={({pressed})=>[s.tool,{backgroundColor:theme.surface2},pressed&&s.press]}><View style={s.toolIcon}><Ionicons name="sparkles-outline" size={20} color={theme.accent}/></View><View style={s.toolCopy}><Text style={[s.toolTitle,{color:theme.text}]}>RAID AI</Text><Text style={[s.toolSub,{color:theme.muted}]}>تلخيص وشرح وترجمة</Text></View></Pressable><Pressable onPress={()=>router.push('/vpn')} style={({pressed})=>[s.tool,{backgroundColor:theme.surface2},pressed&&s.press]}><View style={s.toolIcon}><Ionicons name={vpnConnected?'shield-checkmark-outline':'shield-outline'} size={20} color={vpnConnected?'#4DB47A':theme.accent}/></View><View style={s.toolCopy}><Text style={[s.toolTitle,{color:theme.text}]}>RAID VPN</Text><Text style={[s.toolSub,{color:theme.muted}]}>{vpnConnected?'متصل فعليًا':'إدارة اتصال WireGuard'}</Text></View></Pressable></View></View>

      <View style={[s.panel,{backgroundColor:theme.surface,borderColor:theme.border}]}><View style={s.panelHead}><Text style={[s.panelTitle,{color:theme.text}]}>المظهر</Text><Text style={[s.panelHint,{color:theme.muted}]}>3 ثيمات مريحة</Text></View><ThemeSwitcher value={themeName} onChange={value=>void chooseTheme(value)}/></View>
      <View style={s.signature}><Text style={[s.signatureTitle,{color:theme.text}]}>RAID</Text><Text style={[s.signatureSub,{color:theme.muted}]}>Browse Smarter</Text></View>
    </ScrollView>
    <HomeMenu visible={menuOpen} onClose={()=>setMenuOpen(false)} theme={theme} items={menuItems}/>
  </SafeAreaView></LinearGradient>;
}

const s=StyleSheet.create({fill:{flex:1},safe:{flex:1},content:{paddingHorizontal:18,paddingBottom:38,gap:14},search:{height:62,borderRadius:24,borderWidth:1,flexDirection:'row-reverse',alignItems:'center',paddingHorizontal:10,gap:7},input:{flex:1,fontSize:16,textAlign:'right',paddingHorizontal:4},aiQuick:{width:42,height:42,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},go:{width:46,height:46,borderRadius:16,alignItems:'center',justifyContent:'center'},panel:{borderRadius:26,borderWidth:1,padding:16,gap:12},panelHead:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'},panelTitle:{fontSize:17,fontWeight:'900'},panelLink:{fontSize:11,fontWeight:'800'},panelHint:{fontSize:10},recentRow:{gap:10},recentCard:{width:142,padding:12,borderRadius:18,borderWidth:1,gap:8},recentTitle:{fontSize:12,fontWeight:'800',textAlign:'right',minHeight:32},recentHost:{fontSize:10,textAlign:'right'},tools:{flexDirection:'row-reverse',gap:10},tool:{flex:1,minHeight:82,borderRadius:18,padding:12,flexDirection:'row-reverse',alignItems:'center',gap:10},toolIcon:{width:36,height:36,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,.05)'},toolCopy:{flex:1},toolTitle:{fontSize:14,fontWeight:'900',textAlign:'right'},toolSub:{fontSize:10,marginTop:4,textAlign:'right'},signature:{alignItems:'center',paddingVertical:18},signatureTitle:{fontWeight:'900',letterSpacing:5},signatureSub:{fontSize:10,marginTop:7,letterSpacing:1.4},press:{transform:[{scale:.985}],opacity:.84}});
