import { useCallback, useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { normalizeInput } from '@/lib/url';
import { getRecentSites, getSetting, setSetting } from '@/lib/db';
import { getTheme, type ThemeName } from '@/lib/theme';
import { RaidLogo } from '@/components/RaidLogo';
import { HomeMenu, type HomeMenuItem } from '@/components/HomeMenu';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { RaidServiceIcon, SiteIcon } from '@/components/SiteIcon';
import { listDownloads } from '@/features/downloads/store';
import type { DownloadItem } from '@/features/downloads/types';

type RecentSite = { url: string; title: string; visited_at: number };

function hostname(url:string){try{return new URL(url).hostname.replace(/^www\./,'')}catch{return url}}
function looksLikeAIQuery(value:string){const q=value.trim();return /[؟?]$/.test(q)||/^(يا\s+raid|اسأل|اشرح|لخص|قارن|ما |ماذا |كيف |لماذا |هل )/i.test(q)}

export default function HomeScreen(){
  const [query,setQuery]=useState('');
  const [recent,setRecent]=useState<RecentSite[]>([]);
  const [downloads,setDownloads]=useState<DownloadItem[]>([]);
  const [themeName,setThemeName]=useState<ThemeName>('cinematic');
  const [menuOpen,setMenuOpen]=useState(false);
  const theme=useMemo(()=>getTheme(themeName),[themeName]);

  useFocusEffect(useCallback(()=>{
    let alive=true;
    Promise.all([
      getRecentSites(8).catch(()=>[] as RecentSite[]),
      listDownloads(3).catch(()=>[] as DownloadItem[]),
      getSetting<ThemeName>('theme','cinematic').catch(()=>'cinematic' as ThemeName),
    ]).then(([sites,items,saved])=>{if(!alive)return;setRecent(sites);setDownloads(items);setThemeName(saved==='cinematic'||saved==='amoled'||saved==='light'?saved:'cinematic')});
    return()=>{alive=false};
  },[]));

  const openUrl=(value:string)=>{const clean=value.trim();if(!clean)return;try{Keyboard.dismiss();router.push({pathname:'/browser',params:{url:normalizeInput(clean)}})}catch{}};
  const askAI=()=>{const prompt=query.trim();Keyboard.dismiss();router.push(prompt?{pathname:'/ai',params:{prompt}}:'/ai')};
  const submit=()=>looksLikeAIQuery(query)?askAI():openUrl(query);
  const go=(path:string)=>{setMenuOpen(false);router.push(path as never)};
  const chooseTheme=async(value:ThemeName)=>{setThemeName(value);await setSetting('theme',value)};

  const menuItems=useMemo<HomeMenuItem[]>(()=>[
    {label:'علامة تبويب جديدة',icon:'＋',onPress:()=>go('/browser')},
    {label:'علامة تبويب خاصة',icon:'◉',onPress:()=>go('/browser?privateMode=1')},
    {label:'التبويبات',icon:'▣',onPress:()=>go('/tabs')},
    {label:'المكتبة والسجل',icon:'◷',onPress:()=>go('/library')},
    {label:'عمليات التنزيل',icon:'⇩',onPress:()=>go('/downloads')},
    {label:'RAID AI',icon:'AI',onPress:()=>go('/ai')},
    {label:'RAID VPN',icon:'✓',onPress:()=>go('/vpn')},
    {label:'الخصوصية',icon:'◈',onPress:()=>go('/privacy')},
    {label:'الحساب',icon:'●',onPress:()=>go('/account')},
    {label:'الإعدادات',icon:'⚙',onPress:()=>go('/settings')},
  ],[]);

  const shortcuts=[
    {label:'Google',url:'https://www.google.com',action:()=>openUrl('https://www.google.com')},
    {label:'YouTube',url:'https://www.youtube.com',action:()=>openUrl('https://www.youtube.com')},
    {label:'RAID AI',service:'ai' as const,action:askAI},
    {label:'RAID VPN',service:'vpn' as const,action:()=>router.push('/vpn')},
  ];

  return <LinearGradient colors={[...theme.gradient]} style={s.fill}>
    <SafeAreaView edges={['top','bottom','left','right']} style={s.safe}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={s.topbar}>
          <View style={s.brandRow}><RaidLogo size={46}/><View><Text style={[s.brandText,{color:theme.text}]}>RAID</Text><Text style={[s.brandSub,{color:theme.muted}]}>Browse Smarter</Text></View></View>
          <View style={s.topActions}>
            <Pressable onPress={()=>router.push('/downloads')} style={[s.topButton,{backgroundColor:theme.surface,borderColor:theme.border}]} accessibilityLabel="التنزيلات"><Text style={[s.topGlyph,{color:theme.text}]}>⇩</Text></Pressable>
            <Pressable onPress={()=>router.push('/tabs')} style={[s.topButton,{backgroundColor:theme.surface,borderColor:theme.border}]} accessibilityLabel="التبويبات"><Text style={[s.topGlyph,{color:theme.text}]}>▣</Text></Pressable>
            <Pressable onPress={()=>setMenuOpen(true)} style={[s.topButton,{backgroundColor:theme.surface,borderColor:theme.border}]} accessibilityLabel="القائمة"><Text style={[s.dots,{color:theme.text}]}>⋮</Text></Pressable>
          </View>
        </View>

        <View style={[s.search,{backgroundColor:theme.surface,borderColor:theme.border}]}>
          <Text style={s.searchMark}>⌕</Text>
          <TextInput value={query} onChangeText={setQuery} onSubmitEditing={submit} returnKeyType="go" placeholder="ابحث أو اكتب عنوان موقع" placeholderTextColor={theme.muted} style={[s.input,{color:theme.text}]} autoCapitalize="none" autoCorrect={false}/>
          <Pressable onPress={submit} style={[s.go,{backgroundColor:theme.accent}]}><Text style={s.goText}>←</Text></Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.shortcuts}>
          {shortcuts.map(item=><Pressable key={item.label} onPress={item.action} style={s.shortcutWrap} accessibilityLabel={item.label}>
            <View style={[s.shortcut,{backgroundColor:theme.surface,borderColor:theme.border}]}>
              {'url' in item && item.url ? <SiteIcon url={item.url} size={52} radius={16}/> : <RaidServiceIcon kind={item.service!} size={52}/>} 
            </View>
            <Text style={[s.shortcutLabel,{color:theme.text}]}>{item.label}</Text>
          </Pressable>)}
          <Pressable onPress={()=>setMenuOpen(true)} style={s.shortcutWrap}><View style={[s.shortcut,{backgroundColor:theme.surface,borderColor:theme.border}]}><Text style={[s.shortcutGlyph,{color:theme.muted}]}>＋</Text></View><Text style={[s.shortcutLabel,{color:theme.text}]}>المزيد</Text></Pressable>
        </ScrollView>

        {recent.length>0&&<View style={[s.panel,{backgroundColor:theme.surface,borderColor:theme.border}]}>
          <View style={s.panelHead}><Text style={[s.panelTitle,{color:theme.text}]}>المواقع الأخيرة</Text><Pressable onPress={()=>router.push('/library')}><Text style={[s.panelLink,{color:theme.accent}]}>عرض الكل</Text></Pressable></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.recentRow}>
            {recent.slice(0,6).map(site=><Pressable key={site.url} onPress={()=>openUrl(site.url)} style={[s.recentCard,{backgroundColor:theme.surface2,borderColor:theme.border}]}>
              <SiteIcon url={site.url} size={40} radius={12}/>
              <Text numberOfLines={2} style={[s.recentTitle,{color:theme.text}]}>{site.title||hostname(site.url)}</Text>
              <Text numberOfLines={1} style={[s.recentHost,{color:theme.muted}]}>{hostname(site.url)}</Text>
            </Pressable>)}
          </ScrollView>
        </View>}

        <View style={s.featureRow}>
          <Pressable onPress={()=>router.push('/downloads')} style={[s.featureCard,{backgroundColor:'#10213A',borderColor:'#203D62'}]}>
            <View style={s.featureIcon}><Text style={s.featureIconText}>⇩</Text></View>
            <View style={s.featureCopy}><Text style={s.featureTitle}>التنزيلات</Text><Text style={s.featureSub}>{downloads.length?`${downloads.length} عناصر حديثة`:'إدارة ملفاتك'}</Text></View><Text style={s.featureArrow}>‹</Text>
          </Pressable>
          <Pressable onPress={()=>router.push('/library')} style={[s.featureCard,{backgroundColor:'#12342F',borderColor:'#285349'}]}>
            <View style={s.featureIcon}><Text style={s.featureIconText}>★</Text></View>
            <View style={s.featureCopy}><Text style={s.featureTitle}>المفضلة</Text><Text style={s.featureSub}>وصول سريع</Text></View><Text style={s.featureArrow}>‹</Text>
          </Pressable>
        </View>

        <Pressable onPress={()=>router.push('/privacy')} style={[s.panel,s.privacyPanel,{backgroundColor:theme.surface,borderColor:theme.border}]}>
          <View style={s.privacyBadge}><Text style={s.privacyBadgeText}>✓</Text></View>
          <View style={s.privacyCopy}><Text style={[s.panelTitle,{color:theme.text}]}>حماية الخصوصية</Text><Text style={[s.emptyText,{color:theme.muted}]}>حالة HTTPS وVPN وبيانات التصفح في مكان واحد</Text></View>
          <Text style={[s.featureArrow,{color:theme.muted}]}>‹</Text>
        </Pressable>

        <View style={[s.panel,{backgroundColor:theme.surface,borderColor:theme.border}]}>
          <View style={s.panelHead}><Text style={[s.panelTitle,{color:theme.text}]}>المظهر</Text><Text style={[s.panelHint,{color:theme.muted}]}>3 ثيمات مريحة</Text></View>
          <ThemeSwitcher value={themeName} onChange={value=>void chooseTheme(value)}/>
        </View>

        <View style={s.signature}><Text style={[s.signatureTitle,{color:theme.text}]}>•  R A I D  •</Text><Text style={[s.signatureSub,{color:theme.muted}]}>خصوصيتك أولًا</Text></View>
      </ScrollView>
      <HomeMenu visible={menuOpen} onClose={()=>setMenuOpen(false)} theme={theme} items={menuItems}/>
    </SafeAreaView>
  </LinearGradient>;
}

const s=StyleSheet.create({
  fill:{flex:1},safe:{flex:1},content:{paddingHorizontal:18,paddingBottom:42,gap:18},topbar:{minHeight:74,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},brandRow:{flexDirection:'row',alignItems:'center',gap:11},brandText:{fontSize:20,fontWeight:'900',letterSpacing:2},brandSub:{fontSize:10,letterSpacing:.7},topActions:{flexDirection:'row',gap:8},topButton:{width:44,height:44,borderRadius:15,borderWidth:1,alignItems:'center',justifyContent:'center'},topGlyph:{fontSize:21,fontWeight:'800'},dots:{fontSize:26,fontWeight:'900',marginTop:-4},
  search:{height:64,borderRadius:24,borderWidth:1,flexDirection:'row-reverse',alignItems:'center',padding:7},searchMark:{fontSize:24,color:'#8B5CF6',width:34,textAlign:'center'},input:{flex:1,fontSize:16,textAlign:'right',paddingHorizontal:8},go:{width:49,height:49,borderRadius:17,alignItems:'center',justifyContent:'center'},goText:{color:'#fff',fontSize:23,fontWeight:'900'},
  shortcuts:{gap:13,paddingVertical:2},shortcutWrap:{width:82,alignItems:'center',gap:7},shortcut:{width:68,height:68,borderRadius:21,borderWidth:1,alignItems:'center',justifyContent:'center'},shortcutGlyph:{fontSize:20,fontWeight:'900'},shortcutLabel:{fontSize:11,fontWeight:'800',textAlign:'center'},
  panel:{borderRadius:26,borderWidth:1,padding:16,gap:12},panelHead:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'},panelTitle:{fontSize:17,fontWeight:'900'},panelLink:{fontSize:11,fontWeight:'800'},panelHint:{fontSize:10},recentRow:{gap:10},recentCard:{width:142,padding:12,borderRadius:18,borderWidth:1,gap:8},recentTitle:{fontSize:12,fontWeight:'800',textAlign:'right',minHeight:32},recentHost:{fontSize:10,textAlign:'right'},emptyText:{fontSize:12,textAlign:'right',lineHeight:18},
  featureRow:{flexDirection:'row-reverse',gap:10},featureCard:{flex:1,minHeight:104,borderRadius:24,borderWidth:1,padding:14,flexDirection:'row-reverse',alignItems:'center',gap:10},featureIcon:{width:45,height:45,borderRadius:15,backgroundColor:'rgba(255,255,255,.10)',alignItems:'center',justifyContent:'center'},featureIconText:{color:'#D7F7FF',fontSize:21,fontWeight:'900'},featureCopy:{flex:1},featureTitle:{color:'#fff',fontSize:14,fontWeight:'900',textAlign:'right'},featureSub:{color:'#B6C6D7',fontSize:10,marginTop:4,textAlign:'right'},featureArrow:{color:'#fff',fontSize:28,fontWeight:'300'},
  privacyPanel:{flexDirection:'row-reverse',alignItems:'center',gap:12},privacyBadge:{width:48,height:48,borderRadius:16,backgroundColor:'#DFF8E8',alignItems:'center',justifyContent:'center'},privacyBadgeText:{color:'#1F9D55',fontSize:21,fontWeight:'900'},privacyCopy:{flex:1},
  signature:{alignItems:'center',paddingVertical:20},signatureTitle:{fontWeight:'900',letterSpacing:4},signatureSub:{fontSize:10,marginTop:7}
});
