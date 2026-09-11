import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { TabCard } from '@/components/TabCard';
import { SiteIcon } from '@/components/SiteIcon';
import { TabSortMode, TabViewControls, TabViewMode } from '@/components/TabViewControls';
import { getTheme, ThemeName } from '@/lib/theme';
import {
  BrowserTab, ClosedBrowserTab, clearRecentlyClosedTabs, closeAllBrowserTabs, closeBrowserTab,
  createBrowserTab, getBrowserTabs, getRecentlyClosedTabs, getSetting, restoreClosedBrowserTab, setSetting,
} from '@/lib/db';

function hostOf(value:string){try{return new URL(value).hostname.replace(/^www\./,'');}catch{return value;}}

export default function TabsScreen(){
  const [tabs,setTabs]=useState<BrowserTab[]>([]);
  const [closed,setClosed]=useState<ClosedBrowserTab[]>([]);
  const [busy,setBusy]=useState(false);
  const [query,setQuery]=useState('');
  const [viewMode,setViewMode]=useState<TabViewMode>('grid');
  const [sortMode,setSortMode]=useState<TabSortMode>('recent');
  const [themeName,setThemeName]=useState<ThemeName>('cinematic');
  const theme=useMemo(()=>getTheme(themeName),[themeName]);
  const version=Constants.expoConfig?.version || '—';

  const refresh=useCallback(async()=>{try{const [openItems,closedItems]=await Promise.all([getBrowserTabs(),getRecentlyClosedTabs(10)]);setTabs(openItems);setClosed(closedItems);}catch{setTabs([]);setClosed([]);}},[]);
  useFocusEffect(useCallback(()=>{void refresh();void getSetting<ThemeName>('theme','cinematic').then(v=>setThemeName(v));return()=>{};},[refresh]));
  useEffect(()=>{void Promise.all([getSetting<TabViewMode>('tabs_view_mode','grid'),getSetting<TabSortMode>('tabs_sort_mode','recent')]).then(([view,sort])=>{setViewMode(view);setSortMode(sort);});},[]);

  const orderedTabs=useMemo(()=>{const copy=[...tabs];if(sortMode==='oldest')copy.sort((a,b)=>a.created_at-b.created_at);else if(sortMode==='domain')copy.sort((a,b)=>hostOf(a.url).localeCompare(hostOf(b.url))||b.updated_at-a.updated_at);else copy.sort((a,b)=>b.updated_at-a.updated_at);return copy;},[tabs,sortMode]);
  const visibleTabs=useMemo(()=>{const value=query.trim().toLowerCase();return value?orderedTabs.filter(tab=>`${tab.title||''} ${hostOf(tab.url)} ${tab.url}`.toLowerCase().includes(value)):orderedTabs;},[query,orderedTabs]);
  const changeView=(mode:TabViewMode)=>{setViewMode(mode);void setSetting('tabs_view_mode',mode);};
  const changeSort=(mode:TabSortMode)=>{setSortMode(mode);void setSetting('tabs_sort_mode',mode);};
  const openTab=(tab:BrowserTab)=>{if(!busy)router.replace({pathname:'/browser',params:{url:tab.url,tabId:String(tab.id)}});};
  const newTab=async()=>{if(busy)return;setBusy(true);try{const url='https://www.google.com';const id=await createBrowserTab(url,'علامة تبويب جديدة');router.replace({pathname:'/browser',params:{url,tabId:String(id)}});}finally{setBusy(false);}};
  const newPrivate=()=>{if(!busy)router.replace({pathname:'/browser',params:{privateMode:'1'}});};
  const close=async(id:number)=>{if(busy)return;setBusy(true);try{await closeBrowserTab(id);await refresh();}finally{setBusy(false);}};
  const restore=async(item:ClosedBrowserTab)=>{if(busy)return;setBusy(true);try{const restored=await restoreClosedBrowserTab(item.id);if(restored)router.replace({pathname:'/browser',params:{url:restored.url,tabId:String(restored.id)}});else await refresh();}finally{setBusy(false);}};
  const duplicate=async(tab:BrowserTab)=>{if(busy)return;setBusy(true);try{await createBrowserTab(tab.url,tab.title||hostOf(tab.url));await refresh();}finally{setBusy(false);}};
  const shareTab=(tab:BrowserTab)=>{void Share.share({title:tab.title||hostOf(tab.url),message:`${tab.title||hostOf(tab.url)}\n${tab.url}`,url:tab.url});};
  const openExternal=(tab:BrowserTab)=>{if(/^https?:\/\//i.test(tab.url))void Linking.openURL(tab.url).catch(()=>Alert.alert('RAID Browser','تعذر فتح الرابط في تطبيق خارجي.'));};
  const closeOthers=(tab:BrowserTab)=>{if(busy||tabs.length<2)return;Alert.alert('إغلاق التبويبات الأخرى؟',`سيبقى «${tab.title||hostOf(tab.url)}» فقط.`,[{text:'إلغاء',style:'cancel'},{text:'إغلاق الأخرى',style:'destructive',onPress:async()=>{setBusy(true);try{for(const item of tabs){if(item.id!==tab.id)await closeBrowserTab(item.id);}setQuery('');await refresh();}finally{setBusy(false);}}}]);};
  const tabMenu=(tab:BrowserTab)=>Alert.alert(tab.title||hostOf(tab.url),hostOf(tab.url),[
    {text:'فتح',onPress:()=>openTab(tab)},{text:'تكرار',onPress:()=>duplicate(tab)},{text:'مشاركة الرابط',onPress:()=>shareTab(tab)},{text:'فتح خارجي',onPress:()=>openExternal(tab)},
    ...(tabs.length>1?[{text:'إغلاق التبويبات الأخرى',onPress:()=>closeOthers(tab)}]:[]),{text:'إغلاق',style:'destructive',onPress:()=>close(tab.id)},{text:'إلغاء',style:'cancel'},
  ]);
  const closeAll=()=>{if(busy||tabs.length===0)return;Alert.alert('إغلاق كل التبويبات؟','يمكن استعادة أحدث الصفحات من «المغلقة مؤخرًا».',[{text:'إلغاء',style:'cancel'},{text:'إغلاق الكل',style:'destructive',onPress:async()=>{setBusy(true);try{await closeAllBrowserTabs();setQuery('');await refresh();}finally{setBusy(false);}}}]);};
  const clearClosed=()=>{if(busy||closed.length===0)return;Alert.alert('مسح المغلقة مؤخرًا؟','سيتم حذف قائمة الاستعادة فقط.',[{text:'إلغاء',style:'cancel'},{text:'مسح',style:'destructive',onPress:async()=>{setBusy(true);try{await clearRecentlyClosedTabs();await refresh();}finally{setBusy(false);}}}]);};

  return <View style={[s.fill,{backgroundColor:theme.bg}]}><SafeAreaView edges={['top','bottom','left','right']} style={s.root}>
    <View style={[s.header,{borderBottomColor:theme.border}]}>
      <Pressable onPress={()=>router.back()} style={[s.icon,{backgroundColor:theme.surface,borderColor:theme.border}]}><Ionicons name="chevron-back" size={22} color={theme.text}/></Pressable>
      <View style={s.headText}><Text style={[s.title,{color:theme.text}]}>التبويبات</Text><Text style={[s.sub,{color:theme.muted}]}>{tabs.length} مفتوحة • RAID {version}</Text></View>
      <Pressable onPress={()=>void newTab()} disabled={busy} style={[s.add,{backgroundColor:theme.accent},busy&&s.disabled]}><Ionicons name="add" size={24} color="#fff"/></Pressable>
    </View>

    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={s.quickRow}>
        <Pressable onPress={()=>void newTab()} disabled={busy} style={[s.primary,{backgroundColor:theme.accent},busy&&s.disabled]}><Ionicons name="add-circle-outline" size={19} color="#fff"/><Text style={s.primaryText}>تبويب جديد</Text></Pressable>
        <Pressable onPress={newPrivate} disabled={busy} style={[s.secondary,{backgroundColor:theme.surface,borderColor:theme.border},busy&&s.disabled]}><Ionicons name="eye-off-outline" size={18} color={theme.text}/><Text style={[s.secondaryText,{color:theme.text}]}>خاص</Text></Pressable>
      </View>

      <View style={s.stats}>
        {[['albums-outline',String(tabs.length),'مفتوحة'],['refresh-outline',String(closed.length),'مغلقة مؤخرًا'],['globe-outline',String(new Set(tabs.map(t=>hostOf(t.url))).size),'مواقع']].map(([icon,value,label])=><View key={label} style={[s.stat,{backgroundColor:theme.surface,borderColor:theme.border}]}><Ionicons name={icon as any} size={16} color={theme.accent}/><Text style={[s.statNum,{color:theme.text}]}>{value}</Text><Text style={[s.statLabel,{color:theme.muted}]}>{label}</Text></View>)}
      </View>

      {tabs.length>1&&<View style={[s.searchWrap,{backgroundColor:theme.surface,borderColor:theme.border}]}><Ionicons name="search-outline" size={19} color={theme.accent}/><TextInput value={query} onChangeText={setQuery} placeholder="ابحث باسم التبويب أو الموقع" placeholderTextColor={theme.muted} autoCapitalize="none" autoCorrect={false} returnKeyType="search" style={[s.searchInput,{color:theme.text}]}/>{!!query&&<Pressable onPress={()=>setQuery('')} hitSlop={10}><Ionicons name="close-circle" size={19} color={theme.muted}/></Pressable>}</View>}

      {tabs.length>0&&<TabViewControls theme={theme} viewMode={viewMode} sortMode={sortMode} onViewMode={changeView} onSortMode={changeSort}/>} 
      <View style={s.sectionHead}><Text style={[s.sectionTitle,{color:theme.text}]}>التبويبات المفتوحة</Text><Text style={[s.sectionMeta,{color:theme.muted}]}>{query.trim()?`${visibleTabs.length} نتيجة`:`${sortMode==='recent'?'الأحدث أولًا':sortMode==='oldest'?'الأقدم أولًا':'حسب الموقع'}`}</Text></View>

      {tabs.length===0?<View style={[s.empty,{backgroundColor:theme.surface,borderColor:theme.border}]}><Ionicons name="albums-outline" size={28} color={theme.accent}/><Text style={[s.emptyTitle,{color:theme.text}]}>لا توجد تبويبات مفتوحة</Text><Text style={[s.emptyText,{color:theme.muted}]}>ابدأ بتبويب جديد أو استعد صفحة أغلقتها قبل قليل.</Text></View>:
       visibleTabs.length===0?<View style={[s.empty,{backgroundColor:theme.surface,borderColor:theme.border}]}><Ionicons name="search-outline" size={28} color={theme.accent}/><Text style={[s.emptyTitle,{color:theme.text}]}>لا توجد نتائج</Text><Text style={[s.emptyText,{color:theme.muted}]}>لم نجد تبويبًا يطابق «{query.trim()}».</Text><Pressable onPress={()=>setQuery('')}><Text style={[s.link,{color:theme.accent}]}>عرض الكل</Text></Pressable></View>:
       <View style={viewMode==='grid'?s.grid:s.list}>{visibleTabs.map(tab=><TabCard key={tab.id} tab={tab} viewMode={viewMode} theme={theme} busy={busy} onOpen={()=>openTab(tab)} onDuplicate={()=>void duplicate(tab)} onClose={()=>void close(tab.id)} onMenu={()=>tabMenu(tab)}/>)}</View>}

      {tabs.length>0&&<Pressable onPress={closeAll} disabled={busy} style={[s.closeAll,{backgroundColor:theme.surface,borderColor:theme.border},busy&&s.disabled]}><Ionicons name="close-circle-outline" size={18} color={theme.muted}/><Text style={[s.closeAllText,{color:theme.muted}]}>إغلاق كل التبويبات</Text></Pressable>}

      {closed.length>0&&<View style={[s.closedSection,{backgroundColor:theme.surface,borderColor:theme.border}]}><View style={s.closedHead}><View><Text style={[s.closedTitle,{color:theme.text}]}>المغلقة مؤخرًا</Text><Text style={[s.closedHint,{color:theme.muted}]}>اضغط على أي صفحة لاستعادتها</Text></View><Pressable onPress={clearClosed} disabled={busy}><Text style={[s.link,{color:theme.accent}]}>مسح</Text></Pressable></View>{closed.map(item=><Pressable key={item.id} onPress={()=>void restore(item)} disabled={busy} style={[s.closedRow,{borderTopColor:theme.border},busy&&s.disabled]}><SiteIcon url={item.url} size={36} radius={12}/><View style={s.closedCopy}><Text numberOfLines={1} style={[s.closedName,{color:theme.text}]}>{item.title||hostOf(item.url)}</Text><Text numberOfLines={1} style={[s.closedHost,{color:theme.muted}]}>{hostOf(item.url)}</Text></View><Ionicons name="return-up-back-outline" size={19} color={theme.accent}/></Pressable>)}</View>}
    </ScrollView>
  </SafeAreaView></View>;
}

const s=StyleSheet.create({fill:{flex:1},root:{flex:1},header:{minHeight:68,flexDirection:'row',alignItems:'center',paddingHorizontal:16,gap:12,borderBottomWidth:1},icon:{width:42,height:42,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},headText:{flex:1},title:{fontSize:21,fontWeight:'900',textAlign:'right'},sub:{fontSize:10,marginTop:2,textAlign:'right'},add:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center'},content:{padding:16,paddingBottom:42},quickRow:{flexDirection:'row-reverse',gap:9},primary:{flex:1,height:48,borderRadius:16,alignItems:'center',justifyContent:'center',flexDirection:'row-reverse',gap:7},primaryText:{color:'#fff',fontWeight:'900'},secondary:{flex:1,height:48,borderRadius:16,borderWidth:1,alignItems:'center',justifyContent:'center',flexDirection:'row-reverse',gap:7},secondaryText:{fontWeight:'900'},disabled:{opacity:.48},stats:{marginTop:12,flexDirection:'row-reverse',gap:8},stat:{flex:1,paddingVertical:10,borderRadius:16,borderWidth:1,alignItems:'center',gap:2},statNum:{fontSize:17,fontWeight:'900'},statLabel:{fontSize:9,fontWeight:'700'},searchWrap:{height:48,marginTop:12,borderRadius:16,borderWidth:1,flexDirection:'row-reverse',alignItems:'center',paddingHorizontal:12,gap:8},searchInput:{flex:1,fontSize:13,textAlign:'right',paddingVertical:0},sectionHead:{marginTop:17,marginBottom:9,flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'},sectionTitle:{fontSize:15,fontWeight:'900'},sectionMeta:{fontSize:10,fontWeight:'700'},grid:{flexDirection:'row-reverse',flexWrap:'wrap',gap:10},list:{gap:9},empty:{minHeight:160,borderRadius:22,borderWidth:1,alignItems:'center',justifyContent:'center',padding:24,gap:7},emptyTitle:{fontSize:15,fontWeight:'900',textAlign:'center'},emptyText:{fontSize:11,lineHeight:18,textAlign:'center'},link:{fontSize:11,fontWeight:'900'},closeAll:{marginTop:13,height:48,borderRadius:16,borderWidth:1,alignItems:'center',justifyContent:'center',flexDirection:'row-reverse',gap:7},closeAllText:{fontWeight:'800',fontSize:12},closedSection:{marginTop:18,borderRadius:22,borderWidth:1,padding:14},closedHead:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',paddingBottom:8},closedTitle:{fontSize:15,fontWeight:'900',textAlign:'right'},closedHint:{fontSize:10,marginTop:3,textAlign:'right'},closedRow:{minHeight:60,borderTopWidth:1,flexDirection:'row-reverse',alignItems:'center',gap:10},closedCopy:{flex:1},closedName:{fontSize:12,fontWeight:'800',textAlign:'right'},closedHost:{fontSize:10,marginTop:3,textAlign:'right'}});
