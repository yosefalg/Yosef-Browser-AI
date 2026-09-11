import { useCallback, useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { normalizeInput } from '@/lib/url';
import { getRecentSites, getSetting, setSetting } from '@/lib/db';
import { getTheme, type ThemeName } from '@/lib/theme';
import { HomeMenu, type HomeMenuItem } from '@/components/HomeMenu';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { SiteIcon } from '@/components/SiteIcon';
import { listDownloads } from '@/features/downloads/store';
import type { DownloadItem } from '@/features/downloads/types';
import { HomeHeader } from '@/components/home/HomeHeader';
import { HomeHero } from '@/components/home/HomeHero';
import { HomeShortcuts } from '@/components/home/HomeShortcuts';
import { HomeFeatureCards } from '@/components/home/HomeFeatureCards';

type RecentSite={url:string;title:string;visited_at:number};
function hostname(url:string){try{return new URL(url).hostname.replace(/^www\./,'')}catch{return url}}
function looksLikeAIQuery(value:string){const q=value.trim();return /[؟?]$/.test(q)||/^(يا\s+raid|اسأل|اشرح|لخص|قارن|ما |ماذا |كيف |لماذا |هل )/i.test(q)}

export default function HomeScreen(){
  const [query,setQuery]=useState('');
  const [recent,setRecent]=useState<RecentSite[]>([]);
  const [downloads,setDownloads]=useState<DownloadItem[]>([]);
  const [themeName,setThemeName]=useState<ThemeName>('cinematic');
  const [menuOpen,setMenuOpen]=useState(false);
  const theme=useMemo(()=>getTheme(themeName),[themeName]);

  useFocusEffect(useCallback(()=>{let alive=true;Promise.all([
    getRecentSites(8).catch(()=>[] as RecentSite[]),
    listDownloads(4).catch(()=>[] as DownloadItem[]),
    getSetting<ThemeName>('theme','cinematic').catch(()=>'cinematic' as ThemeName),
  ]).then(([sites,items,saved])=>{if(!alive)return;setRecent(sites);setDownloads(items);setThemeName(saved==='cinematic'||saved==='amoled'||saved==='light'?saved:'cinematic')});return()=>{alive=false};},[]));

  const openUrl=(value:string)=>{const clean=value.trim();if(!clean)return;Keyboard.dismiss();router.push({pathname:'/browser',params:{url:normalizeInput(clean)}})};
  const askAI=()=>{const prompt=query.trim();Keyboard.dismiss();router.push(prompt?{pathname:'/ai',params:{prompt}}:'/ai')};
  const submit=()=>looksLikeAIQuery(query)?askAI():openUrl(query);
  const go=(path:string)=>{setMenuOpen(false);router.push(path as never)};
  const chooseTheme=async(value:ThemeName)=>{setThemeName(value);await setSetting('theme',value)};

  const menuItems=useMemo<HomeMenuItem[]>(()=>[
    {label:'الرئيسية',icon:'⌂',hint:'الصفحة الرئيسية',onPress:()=>setMenuOpen(false)},
    {label:'علامة تبويب جديدة',icon:'＋',hint:'فتح تبويب جديد',onPress:()=>go('/browser')},
    {label:'علامة تبويب خاصة',icon:'◉',hint:'تصفح بخصوصية',onPress:()=>go('/browser?privateMode=1')},
    {label:'التبويبات',icon:'▣',hint:'إدارة التبويبات',onPress:()=>go('/tabs')},
    {label:'المكتبة والسجل',icon:'◷',hint:'المفضلة والسجل',onPress:()=>go('/library')},
    {label:'عمليات التنزيل',icon:'⇩',hint:'إدارة الملفات',onPress:()=>go('/downloads')},
    {label:'RAID AI',icon:'AI',hint:'مساعدك الذكي',onPress:()=>go('/ai')},
    {label:'RAID VPN',icon:'✓',hint:'حالة الاتصال والحماية',onPress:()=>go('/vpn')},
    {label:'الخصوصية',icon:'◇',hint:'مركز الحماية',onPress:()=>go('/privacy')},
    {label:'الحساب',icon:'●',hint:'إدارة الحساب',onPress:()=>go('/account')},
    {label:'الإعدادات',icon:'⚙',hint:'تخصيص التطبيق',onPress:()=>go('/settings')},
  ],[]);

  const shortcuts=[
    {label:'YouTube',url:'https://www.youtube.com',onPress:()=>openUrl('https://www.youtube.com')},
    {label:'Google',url:'https://www.google.com',onPress:()=>openUrl('https://www.google.com')},
    {label:'RAID AI',service:'ai' as const,onPress:askAI},
    {label:'RAID VPN',service:'vpn' as const,onPress:()=>router.push('/vpn')},
  ];

  return <LinearGradient colors={[...theme.gradient]} style={s.fill}><SafeAreaView edges={['top','bottom','left','right']} style={s.safe}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <HomeHeader theme={theme} onMenu={()=>setMenuOpen(true)} onTabs={()=>router.push('/tabs')} onDownloads={()=>router.push('/downloads')} onVpn={()=>router.push('/vpn')}/>

      <View style={[s.search,{backgroundColor:theme.surface,borderColor:theme.border}]}><Text style={[s.searchMark,{color:theme.accent}]}>⌕</Text><TextInput value={query} onChangeText={setQuery} onSubmitEditing={submit} returnKeyType="go" placeholder="ابحث أو اكتب عنوان موقع" placeholderTextColor={theme.muted} style={[s.input,{color:theme.text}]} autoCapitalize="none" autoCorrect={false}/><Pressable onPress={submit} style={({pressed})=>[s.go,{backgroundColor:theme.accent},pressed&&s.press]}><Text style={s.goText}>←</Text></Pressable></View>

      <HomeShortcuts theme={theme} items={shortcuts} onMore={()=>setMenuOpen(true)}/>
      <HomeHero onPress={()=>openUrl('https://www.google.com')}/>
      <HomeFeatureCards theme={theme} downloadsCount={downloads.length} onDownloads={()=>router.push('/downloads')} onLibrary={()=>router.push('/library')} onPrivacy={()=>router.push('/privacy')}/>

      {recent.length>0&&<View style={[s.panel,{backgroundColor:theme.surface,borderColor:theme.border}]}><View style={s.panelHead}><Text style={[s.panelTitle,{color:theme.text}]}>المواقع الأخيرة</Text><Pressable onPress={()=>router.push('/library')}><Text style={[s.panelLink,{color:theme.accent}]}>عرض الكل</Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.recentRow}>{recent.slice(0,6).map(site=><Pressable key={site.url} onPress={()=>openUrl(site.url)} style={({pressed})=>[s.recentCard,{backgroundColor:theme.surface2,borderColor:theme.border},pressed&&s.press]}><SiteIcon url={site.url} size={40} radius={12}/><Text numberOfLines={2} style={[s.recentTitle,{color:theme.text}]}>{site.title||hostname(site.url)}</Text><Text numberOfLines={1} style={[s.recentHost,{color:theme.muted}]}>{hostname(site.url)}</Text></Pressable>)}</ScrollView></View>}

      <View style={[s.panel,{backgroundColor:theme.surface,borderColor:theme.border}]}><View style={s.panelHead}><Text style={[s.panelTitle,{color:theme.text}]}>الأدوات الذكية</Text><Text style={[s.panelHint,{color:theme.muted}]}>وصول سريع</Text></View><View style={s.tools}><Pressable onPress={askAI} style={({pressed})=>[s.tool,{backgroundColor:theme.surface2},pressed&&s.press]}><Text style={[s.toolTitle,{color:theme.text}]}>RAID AI</Text><Text style={[s.toolSub,{color:theme.muted}]}>تلخيص وشرح وترجمة</Text></Pressable><Pressable onPress={()=>router.push('/vpn')} style={({pressed})=>[s.tool,{backgroundColor:theme.surface2},pressed&&s.press]}><Text style={[s.toolTitle,{color:theme.text}]}>RAID VPN</Text><Text style={[s.toolSub,{color:theme.muted}]}>إدارة اتصال WireGuard</Text></Pressable></View></View>

      <View style={[s.panel,{backgroundColor:theme.surface,borderColor:theme.border}]}><View style={s.panelHead}><Text style={[s.panelTitle,{color:theme.text}]}>المظهر</Text><Text style={[s.panelHint,{color:theme.muted}]}>3 ثيمات مريحة</Text></View><ThemeSwitcher value={themeName} onChange={value=>void chooseTheme(value)}/></View>
      <View style={s.signature}><Text style={[s.signatureTitle,{color:theme.text}]}>• R A I D •</Text><Text style={[s.signatureSub,{color:theme.muted}]}>Browse Smarter</Text></View>
    </ScrollView>
    <HomeMenu visible={menuOpen} onClose={()=>setMenuOpen(false)} theme={theme} items={menuItems}/>
  </SafeAreaView></LinearGradient>;
}

const s=StyleSheet.create({fill:{flex:1},safe:{flex:1},content:{paddingHorizontal:18,paddingBottom:38,gap:16},search:{height:62,borderRadius:24,borderWidth:1,flexDirection:'row-reverse',alignItems:'center',padding:7},searchMark:{fontSize:24,width:34,textAlign:'center'},input:{flex:1,fontSize:16,textAlign:'right',paddingHorizontal:8},go:{width:48,height:48,borderRadius:17,alignItems:'center',justifyContent:'center'},goText:{color:'#fff',fontSize:23,fontWeight:'900'},panel:{borderRadius:26,borderWidth:1,padding:16,gap:12},panelHead:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'},panelTitle:{fontSize:17,fontWeight:'900'},panelLink:{fontSize:11,fontWeight:'800'},panelHint:{fontSize:10},recentRow:{gap:10},recentCard:{width:142,padding:12,borderRadius:18,borderWidth:1,gap:8},recentTitle:{fontSize:12,fontWeight:'800',textAlign:'right',minHeight:32},recentHost:{fontSize:10,textAlign:'right'},tools:{flexDirection:'row-reverse',gap:10},tool:{flex:1,minHeight:78,borderRadius:18,padding:13,justifyContent:'center'},toolTitle:{fontSize:14,fontWeight:'900',textAlign:'right'},toolSub:{fontSize:10,marginTop:5,textAlign:'right'},signature:{alignItems:'center',paddingVertical:18},signatureTitle:{fontWeight:'900',letterSpacing:4},signatureSub:{fontSize:10,marginTop:7,letterSpacing:1.4},press:{transform:[{scale:.985}],opacity:.84}});
