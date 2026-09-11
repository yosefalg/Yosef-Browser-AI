import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { SiteIcon } from '@/components/SiteIcon';
import { TabSortMode, TabViewControls, TabViewMode } from '@/components/TabViewControls';
import {
  BrowserTab,
  ClosedBrowserTab,
  clearRecentlyClosedTabs,
  closeAllBrowserTabs,
  closeBrowserTab,
  createBrowserTab,
  getBrowserTabs,
  getRecentlyClosedTabs,
  getSetting,
  restoreClosedBrowserTab,
  setSetting,
} from '@/lib/db';

function hostOf(value:string){try{return new URL(value).hostname.replace(/^www\./,'');}catch{return value;}}
function ago(ts:number){const diff=Math.max(0,Date.now()-ts);const min=Math.floor(diff/60000);if(min<1)return 'الآن';if(min<60)return `منذ ${min} د`;const hr=Math.floor(min/60);if(hr<24)return `منذ ${hr} س`;const day=Math.floor(hr/24);return `منذ ${day} ي`;}

export default function TabsScreen(){
  const [tabs,setTabs]=useState<BrowserTab[]>([]);
  const [closed,setClosed]=useState<ClosedBrowserTab[]>([]);
  const [busy,setBusy]=useState(false);
  const [query,setQuery]=useState('');
  const [viewMode,setViewMode]=useState<TabViewMode>('grid');
  const [sortMode,setSortMode]=useState<TabSortMode>('recent');
  const version=Constants.expoConfig?.version || '—';

  const refresh=useCallback(async()=>{try{const [openItems,closedItems]=await Promise.all([getBrowserTabs(),getRecentlyClosedTabs(10)]);setTabs(openItems);setClosed(closedItems);}catch{setTabs([]);setClosed([]);}},[]);
  useFocusEffect(useCallback(()=>{void refresh();return()=>{};},[refresh]));
  useEffect(()=>{void Promise.all([getSetting<TabViewMode>('tabs_view_mode','grid'),getSetting<TabSortMode>('tabs_sort_mode','recent')]).then(([view,sort])=>{setViewMode(view);setSortMode(sort);});},[]);

  const orderedTabs=useMemo(()=>{
    const copy=[...tabs];
    if(sortMode==='oldest')copy.sort((a,b)=>a.created_at-b.created_at);
    else if(sortMode==='domain')copy.sort((a,b)=>hostOf(a.url).localeCompare(hostOf(b.url)) || b.updated_at-a.updated_at);
    else copy.sort((a,b)=>b.updated_at-a.updated_at);
    return copy;
  },[tabs,sortMode]);

  const visibleTabs=useMemo(()=>{
    const value=query.trim().toLowerCase();
    if(!value)return orderedTabs;
    return orderedTabs.filter(tab=>`${tab.title||''} ${hostOf(tab.url)} ${tab.url}`.toLowerCase().includes(value));
  },[query,orderedTabs]);

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
    {text:'فتح',onPress:()=>openTab(tab)},
    {text:'تكرار',onPress:()=>duplicate(tab)},
    {text:'مشاركة الرابط',onPress:()=>shareTab(tab)},
    {text:'فتح خارجي',onPress:()=>openExternal(tab)},
    ...(tabs.length>1?[{text:'إغلاق التبويبات الأخرى',onPress:()=>closeOthers(tab)}]:[]),
    {text:'إغلاق',style:'destructive',onPress:()=>close(tab.id)},
    {text:'إلغاء',style:'cancel'},
  ]);
  const closeAll=()=>{if(busy||tabs.length===0)return;Alert.alert('إغلاق كل التبويبات؟','يمكنك استعادة أحدثها من قسم «المغلقة مؤخرًا».',[{text:'إلغاء',style:'cancel'},{text:'إغلاق الكل',style:'destructive',onPress:async()=>{setBusy(true);try{await closeAllBrowserTabs();setQuery('');await refresh();}finally{setBusy(false);}}}]);};
  const clearClosed=()=>{if(busy||closed.length===0)return;Alert.alert('مسح المغلقة مؤخرًا؟','سيتم حذف قائمة الاستعادة فقط.',[{text:'إلغاء',style:'cancel'},{text:'مسح',style:'destructive',onPress:async()=>{setBusy(true);try{await clearRecentlyClosedTabs();await refresh();}finally{setBusy(false);}}}]);};

  return <SafeAreaView edges={['top','bottom','left','right']} style={s.root}>
    <View style={s.header}>
      <Pressable onPress={()=>router.back()} style={s.icon}><Text style={s.iconText}>‹</Text></Pressable>
      <View style={s.headText}><Text style={s.title}>التبويبات</Text><Text style={s.sub}>{tabs.length} مفتوحة • RAID {version}</Text></View>
      <Pressable onPress={newTab} disabled={busy} style={[s.add,busy&&s.disabled]}><Text style={s.addText}>＋</Text></Pressable>
    </View>

    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={s.quickRow}>
        <Pressable onPress={newTab} disabled={busy} style={[s.primary,busy&&s.disabled]}><Text style={s.primaryText}>＋ تبويب جديد</Text></Pressable>
        <Pressable onPress={newPrivate} disabled={busy} style={[s.private,busy&&s.disabled]}><Text style={s.privateText}>◈ خاص</Text></Pressable>
      </View>

      <View style={s.stats}>
        <View style={s.stat}><Text style={s.statNum}>{tabs.length}</Text><Text style={s.statLabel}>مفتوحة</Text></View>
        <View style={s.stat}><Text style={s.statNum}>{closed.length}</Text><Text style={s.statLabel}>مغلقة مؤخرًا</Text></View>
        <View style={s.stat}><Text style={s.statNum}>{new Set(tabs.map(t=>hostOf(t.url))).size}</Text><Text style={s.statLabel}>مواقع</Text></View>
      </View>

      {tabs.length>1&&<View style={s.searchWrap}>
        <Text style={s.searchGlyph}>⌕</Text>
        <TextInput value={query} onChangeText={setQuery} placeholder="ابحث باسم التبويب أو الموقع" placeholderTextColor="#64748B" autoCapitalize="none" autoCorrect={false} returnKeyType="search" style={s.searchInput}/>
        {!!query&&<Pressable onPress={()=>setQuery('')} hitSlop={10}><Text style={s.clearSearch}>×</Text></Pressable>}
      </View>}

      {tabs.length>0&&<TabViewControls viewMode={viewMode} sortMode={sortMode} onViewMode={changeView} onSortMode={changeSort}/>} 
      <View style={s.sectionHead}><Text style={s.sectionTitle}>التبويبات المفتوحة</Text><Text style={s.sectionMeta}>{query.trim()?`${visibleTabs.length} نتيجة`:`مرتبة: ${sortMode==='recent'?'الأحدث':sortMode==='oldest'?'الأقدم':'الموقع'}`}</Text></View>

      {tabs.length===0?<View style={s.empty}><Text style={s.emptyTitle}>لا توجد تبويبات مفتوحة</Text><Text style={s.emptyText}>ابدأ بتبويب جديد أو استعد صفحة أغلقتها قبل قليل.</Text></View>:
       visibleTabs.length===0?<View style={s.empty}><Text style={s.emptyTitle}>لا توجد نتائج</Text><Text style={s.emptyText}>لم نجد تبويبًا يطابق «{query.trim()}».</Text><Pressable onPress={()=>setQuery('')} style={s.reset}><Text style={s.resetText}>عرض الكل</Text></Pressable></View>:
       <View style={viewMode==='grid'?s.grid:s.list}>{visibleTabs.map(tab=><Pressable key={tab.id} disabled={busy} onPress={()=>openTab(tab)} onLongPress={()=>tabMenu(tab)} delayLongPress={350} style={({pressed})=>[viewMode==='grid'?s.cardGrid:s.cardList,pressed&&s.cardPressed,busy&&s.disabled]}>
          <View style={s.cardTop}>
            <SiteIcon url={tab.url} size={viewMode==='grid'?38:42} radius={13}/>
            <View style={s.cardActions}>
              <Pressable disabled={busy} onPress={(event)=>{event.stopPropagation();void duplicate(tab);}} hitSlop={8} style={s.smallAction}><Text style={s.smallActionText}>⧉</Text></Pressable>
              <Pressable disabled={busy} onPress={(event)=>{event.stopPropagation();void close(tab.id);}} hitSlop={10} style={s.smallAction}><Text style={s.closeText}>×</Text></Pressable>
            </View>
          </View>
          <View style={viewMode==='list'?s.listCopy:undefined}>
            <Text numberOfLines={viewMode==='grid'?2:1} style={s.cardTitle}>{tab.title||hostOf(tab.url)}</Text>
            <Text numberOfLines={1} style={s.host}>{hostOf(tab.url)}</Text>
            <Text style={s.time}>{ago(tab.updated_at)}</Text>
          </View>
        </Pressable>)}</View>}

      {tabs.length>0&&<Pressable onPress={closeAll} disabled={busy} style={[s.closeAll,busy&&s.disabled]}><Text style={s.closeAllText}>إغلاق كل التبويبات</Text></Pressable>}

      {closed.length>0&&<View style={s.closedSection}>
        <View style={s.closedHead}><View><Text style={s.closedTitle}>المغلقة مؤخرًا</Text><Text style={s.closedHint}>اضغط على أي صفحة لاستعادتها</Text></View><Pressable onPress={clearClosed} disabled={busy}><Text style={s.clearClosed}>مسح</Text></Pressable></View>
        {closed.map(item=><Pressable key={item.id} onPress={()=>restore(item)} disabled={busy} style={[s.closedRow,busy&&s.disabled]}>
          <SiteIcon url={item.url} size={36} radius={12}/>
          <View style={s.closedCopy}><Text numberOfLines={1} style={s.closedName}>{item.title||hostOf(item.url)}</Text><Text numberOfLines={1} style={s.closedHost}>{hostOf(item.url)}</Text></View>
          <Text style={s.restore}>↺</Text>
        </Pressable>)}
      </View>}
    </ScrollView>
  </SafeAreaView>;
}

const s=StyleSheet.create({
  root:{flex:1,backgroundColor:'#080A0F'},header:{minHeight:66,flexDirection:'row',alignItems:'center',paddingHorizontal:14,gap:12,borderBottomWidth:1,borderBottomColor:'#1C2230',backgroundColor:'#0B0E14'},icon:{width:42,height:42,borderRadius:14,backgroundColor:'#121723',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#252E40'},iconText:{color:'#fff',fontSize:30,marginTop:-3},headText:{flex:1},title:{color:'#F7F4EF',fontSize:21,fontWeight:'900',textAlign:'right'},sub:{color:'#7A8496',fontSize:10,marginTop:2,textAlign:'right'},add:{width:42,height:42,borderRadius:14,backgroundColor:'#7252C7',alignItems:'center',justifyContent:'center'},addText:{color:'#fff',fontSize:24,fontWeight:'700'},content:{padding:16,paddingBottom:42},quickRow:{flexDirection:'row-reverse',gap:9},primary:{flex:1,height:48,borderRadius:16,backgroundColor:'#7252C7',alignItems:'center',justifyContent:'center'},primaryText:{color:'#fff',fontWeight:'900'},private:{flex:1,height:48,borderRadius:16,backgroundColor:'#1A1526',borderWidth:1,borderColor:'#4A396F',alignItems:'center',justifyContent:'center'},privateText:{color:'#DCD2F4',fontWeight:'900'},disabled:{opacity:.48},stats:{marginTop:12,flexDirection:'row-reverse',gap:8},stat:{flex:1,paddingVertical:10,borderRadius:15,backgroundColor:'#10141D',borderWidth:1,borderColor:'#242B39',alignItems:'center'},statNum:{color:'#F3EEF9',fontSize:17,fontWeight:'900'},statLabel:{marginTop:2,color:'#727D8D',fontSize:9,fontWeight:'700'},searchWrap:{height:48,marginTop:12,borderRadius:16,backgroundColor:'#10141D',borderWidth:1,borderColor:'#273042',flexDirection:'row',alignItems:'center',paddingHorizontal:12,gap:8},searchGlyph:{color:'#A78BFA',fontSize:20,fontWeight:'900'},searchInput:{flex:1,color:'#F8FAFC',fontSize:13,textAlign:'right',paddingVertical:0},clearSearch:{color:'#CBD5E1',fontSize:23,fontWeight:'700'},sectionHead:{marginTop:17,marginBottom:9,flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center'},sectionTitle:{color:'#EEEAF3',fontSize:15,fontWeight:'900'},sectionMeta:{color:'#6F7A8D',fontSize:9,fontWeight:'700'},grid:{flexDirection:'row',flexWrap:'wrap',gap:10},list:{gap:9},cardGrid:{width:'48.5%',minHeight:160,borderRadius:21,padding:13,backgroundColor:'#10141D',borderWidth:1,borderColor:'#273042'},cardList:{minHeight:96,borderRadius:19,padding:12,backgroundColor:'#10141D',borderWidth:1,borderColor:'#273042',flexDirection:'row-reverse',alignItems:'center',gap:11},cardPressed:{transform:[{scale:.985}],borderColor:'#7252C7'},cardTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},cardActions:{flexDirection:'row',gap:5},smallAction:{width:32,height:32,borderRadius:11,alignItems:'center',justifyContent:'center',backgroundColor:'#171D29'},smallActionText:{color:'#BBA7EA',fontSize:17,fontWeight:'900'},closeText:{color:'#9AA5B5',fontSize:21},listCopy:{flex:1},cardTitle:{marginTop:14,color:'#F6F3F8',fontWeight:'900',fontSize:13,textAlign:'right'},host:{marginTop:5,color:'#778397',fontSize:10,textAlign:'right'},time:{marginTop:8,color:'#8F79C8',fontSize:9,fontWeight:'800',textAlign:'right'},empty:{marginTop:8,padding:28,borderRadius:23,backgroundColor:'#10141D',borderWidth:1,borderColor:'#273042'},emptyTitle:{color:'#F8FAFC',fontSize:18,fontWeight:'900',textAlign:'center'},emptyText:{color:'#94A3B8',lineHeight:21,textAlign:'center',marginTop:8},reset:{marginTop:17,height:42,borderRadius:13,backgroundColor:'#211832',alignItems:'center',justifyContent:'center'},resetText:{color:'#DDD6FE',fontWeight:'900'},closeAll:{marginTop:20,height:42,alignItems:'center',justifyContent:'center'},closeAllText:{color:'#DF7777',fontWeight:'800'},closedSection:{marginTop:20,gap:8},closedHead:{flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center'},closedTitle:{color:'#F0ECF4',fontSize:15,fontWeight:'900',textAlign:'right'},closedHint:{color:'#697487',fontSize:9,marginTop:2,textAlign:'right'},clearClosed:{color:'#C98E8E',fontSize:10,fontWeight:'900'},closedRow:{minHeight:62,borderRadius:17,padding:10,backgroundColor:'#0F131B',borderWidth:1,borderColor:'#222A38',flexDirection:'row-reverse',alignItems:'center',gap:10},closedCopy:{flex:1},closedName:{color:'#E8E3EC',fontWeight:'800',textAlign:'right',fontSize:12},closedHost:{color:'#707C8F',fontSize:9,textAlign:'right',marginTop:3},restore:{color:'#A78BFA',fontSize:18,fontWeight:'900'},
});
