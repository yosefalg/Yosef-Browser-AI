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
    {label:'RAID AI',icon:'✦',onPress:()=>go('/ai')},
    {label:'RAID VPN',icon:'◇',onPress:()=>go('/vpn')},
    {label:'الخصوصية',icon:'◈',onPress:()=>go('/privacy')},
    {label:'الحساب',icon:'●',onPress:()=>go('/account')},
    {label:'الإعدادات',icon:'⚙',onPress:()=>go('/settings')},
  ],[]);

  const shortcuts=[
    {label:'Google',glyph:'G',action:()=>openUrl('https://www.google.com')},
    {label:'YouTube',glyph:'▶',action:()=>openUrl('https://www.youtube.com')},
    {label:'RAID AI',glyph:'AI',action:askAI},
    {label:'RAID VPN',glyph:'◇',action:()=>router.push('/vpn')},
  ];

  return <LinearGradient colors={[...theme.gradient]} style={s.fill}>
    <SafeAreaView edges={['top','bottom','left','right']} style={s.safe}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={s.topbar}>
          <View style={s.brandRow}><RaidLogo size={46}/><View><Text style={[s.brandText,{color:theme.text}]}>RAID</Text><Text style={[s.brandSub,{color:theme.muted}]}>Browser</Text></View></View>
          <View style={s.topActions}>
            <Pressable onPress={()=>router.push('/downloads')} style={[s.topButton,{backgroundColor:theme.surface,borderColor:theme.border}]}><Text style={[s.topGlyph,{color:theme.text}]}>⇩</Text></Pressable>
            <Pressable onPress={()=>router.push('/tabs')} style={[s.topButton,{backgroundColor:theme.surface,borderColor:theme.border}]}><Text style={[s.topGlyph,{color:theme.text}]}>▣</Text></Pressable>
            <Pressable onPress={()=>setMenuOpen(true)} style={[s.topButton,{backgroundColor:theme.surface,borderColor:theme.border}]}><Text style={[s.dots,{color:theme.text}]}>⋮</Text></Pressable>
          </View>
        </View>

        <View style={[s.search,{backgroundColor:theme.surface,borderColor:theme.border}]}>
          <Text style={s.searchMark}>⌕</Text>
          <TextInput value={query} onChangeText={setQuery} onSubmitEditing={submit} returnKeyType="go" placeholder="ابحث أو اكتب عنوان موقع" placeholderTextColor={theme.muted} style={[s.input,{color:theme.text}]} autoCapitalize="none" autoCorrect={false}/>
          <Pressable onPress={submit} style={[s.go,{backgroundColor:theme.accent}]}><Text style={s.goText}>←</Text></Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.shortcuts}>
          {shortcuts.map(item=><Pressable key={item.label} onPress={item.action} style={s.shortcutWrap}><View style={[s.shortcut,{backgroundColor:theme.surface,borderColor:theme.border}]}><Text style={[s.shortcutGlyph,{color:theme.accent}]}>{item.glyph}</Text></View><Text style={[s.shortcutLabel,{color:theme.text}]}>{item.label}</Text></Pressable>)}
          <Pressable onPress={()=>setMenuOpen(true)} style={s.shortcutWrap}><View style={[s.shortcut,{backgroundColor:theme.surface,borderColor:theme.border}]}><Text style={[s.shortcutGlyph,{color:theme.muted}]}>＋</Text></View><Text style={[s.shortcutLabel,{color:theme.text}]}>المزيد</Text></Pressable>
        </ScrollView>

        {recent.length>0&&<View style={[s.panel,{backgroundColor:theme.surface,borderColor:theme.border}]}>
          <View style={s.panelHead}><Text style={[s.panelTitle,{color:theme.text}]}>الأخيرة</Text><Pressable onPress={()=>router.push('/library')}><Text style={[s.panelLink,{color:theme.accent}]}>عرض الكل</Text></Pressable></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.recentRow}>
            {recent.slice(0,6).map(site=><Pressable key={site.url} onPress={()=>openUrl(site.url)} style={[s.recentCard,{backgroundColor:theme.surface2,borderColor:theme.border}]}><View style={[s.favicon,{backgroundColor:theme.surface}]}><Text style={[s.faviconText,{color:theme.accent}]}>{hostname(site.url).slice(0,1).toUpperCase()}</Text></View><Text numberOfLines={1} style={[s.recentTitle,{color:theme.text}]}>{site.title||hostname(site.url)}</Text><Text numberOfLines={1} style={[s.recentHost,{color:theme.muted}]}>{hostname(site.url)}</Text></Pressable>)}
          </ScrollView>
        </View>}

        <Pressable onPress={()=>router.push('/downloads')} style={[s.panel,{backgroundColor:theme.surface,borderColor:theme.border}]}>
          <View style={s.panelHead}><Text style={[s.panelTitle,{color:theme.text}]}>التنزيلات</Text><Text style={[s.panelLink,{color:theme.accent}]}>فتح المركز ‹</Text></View>
          {downloads.length===0?<Text style={[s.emptyText,{color:theme.muted}]}>التنزيلات التي تبدأ من RAID ستظهر هنا.</Text>:downloads.map(item=><View key={item.id} style={s.downloadRow}><View style={[s.downloadIcon,{backgroundColor:theme.surface2}]}><Text style={{color:theme.accent}}>⇩</Text></View><View style={s.downloadCopy}><Text numberOfLines={1} style={[s.downloadName,{color:theme.text}]}>{item.file_name}</Text><Text style={[s.downloadMeta,{color:theme.muted}]}>{item.state==='completed'?'مكتمل':item.state==='downloading'?`${Math.round(item.progress*100)}%`:item.state==='failed'?'فشل':item.state==='cancelled'?'ملغي':'بالانتظار'}</Text></View></View>)}
        </Pressable>

        <View style={[s.panel,{backgroundColor:theme.surface,borderColor:theme.border}]}>
          <View style={s.panelHead}><Text style={[s.panelTitle,{color:theme.text}]}>المظهر</Text><Text style={[s.panelHint,{color:theme.muted}]}>3 ثيمات فقط</Text></View>
          <ThemeSwitcher value={themeName} onChange={value=>void chooseTheme(value)}/>
        </View>

        <View style={s.signature}><Text style={[s.signatureTitle,{color:theme.text}]}>•  R A I D  •</Text><Text style={[s.signatureSub,{color:theme.muted}]}>خصوصيتك أولًا</Text></View>
      </ScrollView>
      <HomeMenu visible={menuOpen} onClose={()=>setMenuOpen(false)} theme={theme} items={menuItems}/>
    </SafeAreaView>
  </LinearGradient>;
}

const s=StyleSheet.create({
  fill:{flex:1},safe:{flex:1},content:{paddingHorizontal:18,paddingBottom:42,gap:18},topbar:{minHeight:74,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},brandRow:{flexDirection:'row',alignItems:'center',gap:11},brandText:{fontSize:20,fontWeight:'900',letterSpacing:2},brandSub:{fontSize:10,letterSpacing:1},topActions:{flexDirection:'row',gap:8},topButton:{width:44,height:44,borderRadius:15,borderWidth:1,alignItems:'center',justifyContent:'center'},topGlyph:{fontSize:21,fontWeight:'800'},dots:{fontSize:26,fontWeight:'900',marginTop:-4},
  search:{height:64,borderRadius:24,borderWidth:1,flexDirection:'row-reverse',alignItems:'center',padding:7},searchMark:{fontSize:24,color:'#8B5CF6',width:34,textAlign:'center'},input:{flex:1,fontSize:16,textAlign:'right',paddingHorizontal:8},go:{width:49,height:49,borderRadius:17,alignItems:'center',justifyContent:'center'},goText:{color:'#fff',fontSize:23,fontWeight:'900'},
  shortcuts:{gap:13,paddingVertical:2},shortcutWrap:{width:82,alignItems:'center',gap:7},shortcut:{width:68,height:68,borderRadius:21,borderWidth:1,alignItems:'center',justifyContent:'center'},shortcutGlyph:{fontSize:20,fontWeight:'900'},shortcutLabel:{fontSize:11,fontWeight:'800',textAlign:'center'},
  panel:{borderRadius:26,borderWidth:1,padding:16,gap:12},panelHead:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'},panelTitle:{fontSize:17,fontWeight:'900'},panelLink:{fontSize:11,fontWeight:'800'},panelHint:{fontSize:10},recentRow:{gap:10},recentCard:{width:132,padding:12,borderRadius:18,borderWidth:1},favicon:{width:34,height:34,borderRadius:12,alignItems:'center',justifyContent:'center',marginBottom:10},faviconText:{fontSize:15,fontWeight:'900'},recentTitle:{fontSize:12,fontWeight:'800',textAlign:'right'},recentHost:{fontSize:10,marginTop:4,textAlign:'right'},emptyText:{fontSize:12,textAlign:'right'},downloadRow:{flexDirection:'row-reverse',alignItems:'center',gap:10},downloadIcon:{width:38,height:38,borderRadius:12,alignItems:'center',justifyContent:'center'},downloadCopy:{flex:1},downloadName:{fontSize:12,fontWeight:'800',textAlign:'right'},downloadMeta:{fontSize:10,marginTop:3,textAlign:'right'},signature:{alignItems:'center',paddingVertical:20},signatureTitle:{fontWeight:'900',letterSpacing:4},signatureSub:{fontSize:10,marginTop:7}
});
