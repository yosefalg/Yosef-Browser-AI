import { useCallback, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { TabCard } from '@/components/TabCard';
import { SiteIcon } from '@/components/SiteIcon';
import { BrowserTab, ClosedBrowserTab, closeAllBrowserTabs, closeBrowserTab, createBrowserTab, getBrowserTabs, getRecentlyClosedTabs, restoreClosedBrowserTab } from '@/lib/db';

function hostOf(value:string){try{return new URL(value).hostname.replace(/^www\./,'');}catch{return value;}}

type ViewMode='grid'|'list';
type SortMode='default'|'name';

export default function TabsScreen(){
  const [tabs,setTabs]=useState<BrowserTab[]>([]);
  const [closed,setClosed]=useState<ClosedBrowserTab[]>([]);
  const [busy,setBusy]=useState(false);
  const [query,setQuery]=useState('');
  const [viewMode,setViewMode]=useState<ViewMode>('grid');
  const [sortMode,setSortMode]=useState<SortMode>('default');
  const version=Constants.expoConfig?.version || '—';

  const refresh=useCallback(async()=>{try{const [openItems,closedItems]=await Promise.all([getBrowserTabs(),getRecentlyClosedTabs(8)]);setTabs(openItems);setClosed(closedItems);}catch{setTabs([]);setClosed([]);}},[]);
  useFocusEffect(useCallback(()=>{void refresh();return()=>{};},[refresh]));

  const visibleTabs=useMemo(()=>{
    const value=query.trim().toLowerCase();
    let next=value?tabs.filter(tab=>`${tab.title||''} ${hostOf(tab.url)} ${tab.url}`.toLowerCase().includes(value)):tabs;
    if(sortMode==='name') next=[...next].sort((a,b)=>(a.title||hostOf(a.url)).localeCompare(b.title||hostOf(b.url),'ar'));
    return next;
  },[query,sortMode,tabs]);

  const openTab=(tab:BrowserTab)=>{if(!busy)router.replace({pathname:'/browser',params:{url:tab.url,tabId:String(tab.id)}});};
  const newTab=async()=>{if(busy)return;setBusy(true);try{const url='https://www.google.com';const id=await createBrowserTab(url,'علامة تبويب جديدة');router.replace({pathname:'/browser',params:{url,tabId:String(id)}});}finally{setBusy(false);}};
  const newPrivate=()=>{if(!busy)router.replace({pathname:'/browser',params:{privateMode:'1'}});};
  const close=async(id:number)=>{if(busy)return;setBusy(true);try{await closeBrowserTab(id);await refresh();}finally{setBusy(false);}};
  const restore=async(item:ClosedBrowserTab)=>{if(busy)return;setBusy(true);try{const restored=await restoreClosedBrowserTab(item.id);if(restored)router.replace({pathname:'/browser',params:{url:restored.url,tabId:String(restored.id)}});else await refresh();}finally{setBusy(false);}};
  const duplicate=async(tab:BrowserTab)=>{if(busy)return;setBusy(true);try{await createBrowserTab(tab.url,tab.title||hostOf(tab.url));await refresh();}finally{setBusy(false);}};
  const duplicateAndOpen=async(tab:BrowserTab)=>{if(busy)return;setBusy(true);try{const id=await createBrowserTab(tab.url,tab.title||hostOf(tab.url));router.replace({pathname:'/browser',params:{url:tab.url,tabId:String(id)}});}finally{setBusy(false);}};
  const shareTab=(tab:BrowserTab)=>{Share.share({title:tab.title||hostOf(tab.url),message:`${tab.title||hostOf(tab.url)}\n${tab.url}`,url:tab.url}).catch(()=>{});};
  const openExternal=(tab:BrowserTab)=>{if(/^https?:\/\//i.test(tab.url))Linking.openURL(tab.url).catch(()=>Alert.alert('RAID Browser','تعذر فتح الرابط في تطبيق خارجي.'));};

  const closeOthers=(tab:BrowserTab)=>{
    if(busy||tabs.length<2)return;
    Alert.alert('إغلاق التبويبات الأخرى؟',`سيبقى «${tab.title||hostOf(tab.url)}» مفتوحًا فقط.`,[
      {text:'إلغاء',style:'cancel'},
      {text:'إغلاق الأخرى',style:'destructive',onPress:async()=>{setBusy(true);try{for(const item of tabs){if(item.id!==tab.id)await closeBrowserTab(item.id);}setQuery('');await refresh();}finally{setBusy(false);}}},
    ]);
  };

  const tabMenu=(tab:BrowserTab)=>Alert.alert(tab.title||hostOf(tab.url),hostOf(tab.url),[
    {text:'فتح',onPress:()=>openTab(tab)},
    {text:'تكرار وفتح',onPress:()=>duplicateAndOpen(tab)},
    {text:'تكرار في الخلفية',onPress:()=>duplicate(tab)},
    {text:'مشاركة الرابط',onPress:()=>shareTab(tab)},
    {text:'فتح خارجيًا',onPress:()=>openExternal(tab)},
    ...(tabs.length>1?[{text:'إغلاق التبويبات الأخرى',onPress:()=>closeOthers(tab)}]:[]),
    {text:'إغلاق',style:'destructive',onPress:()=>close(tab.id)},
    {text:'إلغاء',style:'cancel'},
  ]);

  const closeSearchResults=()=>{
    if(busy||!query.trim()||visibleTabs.length===0)return;
    Alert.alert('إغلاق نتائج البحث؟',`سيتم إغلاق ${visibleTabs.length} تبويب مطابق فقط.`,[
      {text:'إلغاء',style:'cancel'},
      {text:'إغلاق النتائج',style:'destructive',onPress:async()=>{setBusy(true);try{for(const item of visibleTabs)await closeBrowserTab(item.id);setQuery('');await refresh();}finally{setBusy(false);}}},
    ]);
  };

  const closeAll=()=>{
    if(busy||tabs.length===0)return;
    Alert.alert('إغلاق كل التبويبات؟','ستنتقل أحدث التبويبات إلى «المغلقة مؤخرًا» ويمكن استعادتها.',[
      {text:'إلغاء',style:'cancel'},
      {text:'إغلاق الكل',style:'destructive',onPress:async()=>{setBusy(true);try{await closeAllBrowserTabs();setQuery('');await refresh();}finally{setBusy(false);}}},
    ]);
  };

  return <SafeAreaView edges={['top','bottom','left','right']} style={s.root}>
    <View style={s.header}>
      <Pressable onPress={()=>router.back()} style={s.headerBtn}><Text style={s.back}>‹</Text></Pressable>
      <View style={s.headText}><Text style={s.title}>التبويبات</Text><Text style={s.sub}>RAID {version} • إدارة أنظف وأسرع</Text></View>
      <Pressable onPress={newTab} disabled={busy} style={[s.add,busy&&s.disabled]}><Text style={s.addText}>＋</Text></Pressable>
    </View>

    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={s.overview}>
        <View style={s.stat}><Text style={s.statValue}>{tabs.length}</Text><Text style={s.statLabel}>مفتوحة</Text></View>
        <View style={s.statDivider}/>
        <View style={s.stat}><Text style={s.statValue}>{closed.length}</Text><Text style={s.statLabel}>مغلقة مؤخرًا</Text></View>
        <View style={s.overviewCopy}><Text style={s.overviewTitle}>مركز التبويبات</Text><Text style={s.overviewText}>رتّب، ابحث، كرّر أو استعد التبويبات من مكان واحد.</Text></View>
      </View>

      <View style={s.actions}>
        <Pressable onPress={newTab} disabled={busy} style={[s.primary,busy&&s.disabled]}><Text style={s.primaryText}>＋ تبويب جديد</Text></Pressable>
        <Pressable onPress={newPrivate} disabled={busy} style={[s.private,busy&&s.disabled]}><Text style={s.privateText}>◈ خاص</Text></Pressable>
      </View>

      <View style={s.toolbar}>
        <View style={s.segment}>
          <Pressable onPress={()=>setViewMode('grid')} style={[s.segmentBtn,viewMode==='grid'&&s.segmentBtnActive]}><Text style={[s.segmentText,viewMode==='grid'&&s.segmentTextActive]}>▦ شبكة</Text></Pressable>
          <Pressable onPress={()=>setViewMode('list')} style={[s.segmentBtn,viewMode==='list'&&s.segmentBtnActive]}><Text style={[s.segmentText,viewMode==='list'&&s.segmentTextActive]}>☷ قائمة</Text></Pressable>
        </View>
        <Pressable onPress={()=>setSortMode(v=>v==='default'?'name':'default')} style={[s.sortBtn,sortMode==='name'&&s.sortBtnActive]}><Text style={[s.sortText,sortMode==='name'&&s.sortTextActive]}>{sortMode==='name'?'أبجدي ✓':'ترتيب أبجدي'}</Text></Pressable>
      </View>

      {tabs.length>1&&<View style={s.searchWrap}>
        <Text style={s.searchGlyph}>⌕</Text>
        <TextInput value={query} onChangeText={setQuery} placeholder="ابحث بالعنوان أو الموقع" placeholderTextColor="#667085" autoCapitalize="none" autoCorrect={false} returnKeyType="search" style={s.searchInput}/>
        {!!query&&<Pressable onPress={()=>setQuery('')} hitSlop={10}><Text style={s.clearSearch}>×</Text></Pressable>}
      </View>}

      <View style={s.sectionHead}>
        <View><Text style={s.sectionTitle}>المفتوحة الآن</Text><Text style={s.sectionSub}>{query?`${visibleTabs.length} نتيجة من ${tabs.length}`:`${tabs.length} تبويب`}</Text></View>
        {!!query&&visibleTabs.length>0&&visibleTabs.length<tabs.length?<Pressable onPress={closeSearchResults} disabled={busy}><Text style={s.closeResults}>إغلاق النتائج</Text></Pressable>:null}
      </View>

      {tabs.length===0?<View style={s.empty}><Text style={s.emptyIcon}>▦</Text><Text style={s.emptyTitle}>لا توجد تبويبات مفتوحة</Text><Text style={s.emptyText}>ابدأ بتبويب جديد أو استعد صفحة من «المغلقة مؤخرًا».</Text></View>:
       visibleTabs.length===0?<View style={s.empty}><Text style={s.emptyIcon}>⌕</Text><Text style={s.emptyTitle}>لا توجد نتائج</Text><Text style={s.emptyText}>لم نعثر على تبويب يطابق «{query.trim()}».</Text><Pressable onPress={()=>setQuery('')} style={s.reset}><Text style={s.resetText}>عرض كل التبويبات</Text></Pressable></View>:
       <View style={viewMode==='grid'?s.grid:s.list}>{visibleTabs.map((tab,index)=><TabCard key={tab.id} tab={tab} index={index} compact={viewMode==='list'} disabled={busy} onOpen={()=>openTab(tab)} onClose={()=>close(tab.id)} onDuplicate={()=>duplicate(tab)} onMenu={()=>tabMenu(tab)}/>)}</View>}

      {tabs.length>0&&<Pressable onPress={closeAll} disabled={busy} style={[s.closeAll,busy&&s.disabled]}><Text style={s.closeAllText}>إغلاق جميع التبويبات</Text></Pressable>}

      {closed.length>0&&<View style={s.closedSection}>
        <View style={s.sectionHead}><View><Text style={s.sectionTitle}>المغلقة مؤخرًا</Text><Text style={s.sectionSub}>اضغط لاستعادة التبويب</Text></View></View>
        <View style={s.closedList}>{closed.map(item=><Pressable key={item.id} onPress={()=>restore(item)} disabled={busy} style={({pressed})=>[s.closedRow,pressed&&s.closedPressed,busy&&s.disabled]}>
          <SiteIcon url={item.url} size={38} radius={12}/>
          <View style={s.closedCopy}><Text numberOfLines={1} style={s.closedName}>{item.title||hostOf(item.url)}</Text><Text numberOfLines={1} style={s.closedHost}>{hostOf(item.url)}</Text></View>
          <View style={s.restoreBadge}><Text style={s.restoreText}>↺</Text></View>
        </Pressable>)}</View>
      </View>}
    </ScrollView>
  </SafeAreaView>;
}

const s=StyleSheet.create({
  root:{flex:1,backgroundColor:'#070B14'},header:{minHeight:68,flexDirection:'row',alignItems:'center',paddingHorizontal:14,gap:12,borderBottomWidth:1,borderBottomColor:'#172033',backgroundColor:'#090E19'},headerBtn:{width:42,height:42,borderRadius:14,backgroundColor:'#111827',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#202B40'},back:{color:'#fff',fontSize:30,marginTop:-3},headText:{flex:1,alignItems:'flex-end'},title:{color:'#F8FAFC',fontSize:22,fontWeight:'900',textAlign:'right'},sub:{color:'#778399',fontSize:10,marginTop:2,textAlign:'right'},add:{width:42,height:42,borderRadius:14,backgroundColor:'#7457E8',alignItems:'center',justifyContent:'center'},addText:{color:'#fff',fontSize:24,fontWeight:'800'},disabled:{opacity:.5},
  content:{padding:16,paddingBottom:42},overview:{minHeight:112,borderRadius:24,padding:16,backgroundColor:'#101827',borderWidth:1,borderColor:'#26334A',flexDirection:'row-reverse',alignItems:'center',gap:12},overviewCopy:{flex:1,alignItems:'flex-end'},overviewTitle:{color:'#F8FAFC',fontSize:18,fontWeight:'900'},overviewText:{color:'#8792A6',fontSize:10,lineHeight:16,textAlign:'right',marginTop:5},stat:{width:55,alignItems:'center'},statValue:{color:'#D8D2FF',fontSize:22,fontWeight:'900'},statLabel:{color:'#778399',fontSize:9,marginTop:2,textAlign:'center'},statDivider:{width:1,height:38,backgroundColor:'#2A3550'},
  actions:{flexDirection:'row-reverse',gap:10,marginTop:12},primary:{flex:1,height:48,borderRadius:15,backgroundColor:'#7457E8',alignItems:'center',justifyContent:'center'},primaryText:{color:'#fff',fontWeight:'900'},private:{flex:1,height:48,borderRadius:15,backgroundColor:'#211B39',borderWidth:1,borderColor:'#3E3269',alignItems:'center',justifyContent:'center'},privateText:{color:'#DDD6FE',fontWeight:'900'},
  toolbar:{marginTop:16,flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:10},segment:{flex:1,flexDirection:'row-reverse',padding:4,borderRadius:14,backgroundColor:'#0E1523',borderWidth:1,borderColor:'#202B40'},segmentBtn:{flex:1,height:34,borderRadius:10,alignItems:'center',justifyContent:'center'},segmentBtnActive:{backgroundColor:'#25213B'},segmentText:{color:'#758096',fontSize:10,fontWeight:'800'},segmentTextActive:{color:'#DAD3FF'},sortBtn:{height:42,paddingHorizontal:13,borderRadius:14,backgroundColor:'#0E1523',borderWidth:1,borderColor:'#202B40',alignItems:'center',justifyContent:'center'},sortBtnActive:{borderColor:'#5B4AC4',backgroundColor:'#1C1931'},sortText:{color:'#7D889C',fontSize:10,fontWeight:'900'},sortTextActive:{color:'#DAD3FF'},
  searchWrap:{height:48,marginTop:12,borderRadius:16,backgroundColor:'#0F1726',borderWidth:1,borderColor:'#26334A',flexDirection:'row',alignItems:'center',paddingHorizontal:12,gap:8},searchGlyph:{color:'#A78BFA',fontSize:20,fontWeight:'900'},searchInput:{flex:1,color:'#F8FAFC',fontSize:13,textAlign:'right',paddingVertical:0},clearSearch:{color:'#CBD5E1',fontSize:24,fontWeight:'700',paddingHorizontal:4},
  sectionHead:{marginTop:20,marginBottom:10,flexDirection:'row-reverse',alignItems:'flex-end',justifyContent:'space-between'},sectionTitle:{color:'#F8FAFC',fontSize:16,fontWeight:'900',textAlign:'right'},sectionSub:{color:'#657186',fontSize:9,marginTop:3,textAlign:'right'},closeResults:{color:'#FCA5A5',fontSize:10,fontWeight:'900'},grid:{flexDirection:'row',flexWrap:'wrap',gap:12},list:{gap:9},
  empty:{padding:28,borderRadius:24,backgroundColor:'#0F1726',borderWidth:1,borderColor:'#26334A',alignItems:'center'},emptyIcon:{fontSize:30,color:'#7565D8'},emptyTitle:{marginTop:10,color:'#F8FAFC',fontSize:18,fontWeight:'900',textAlign:'center'},emptyText:{color:'#8C98AA',lineHeight:20,textAlign:'center',marginTop:7,fontSize:11},reset:{marginTop:16,height:42,paddingHorizontal:18,borderRadius:13,backgroundColor:'#25213B',alignItems:'center',justifyContent:'center'},resetText:{color:'#DDD6FE',fontWeight:'900'},
  closeAll:{marginTop:18,height:46,borderRadius:15,borderWidth:1,borderColor:'#3B2630',backgroundColor:'#171118',alignItems:'center',justifyContent:'center'},closeAllText:{color:'#F08B91',fontWeight:'900'},closedSection:{marginTop:10},closedList:{gap:8},closedRow:{minHeight:64,padding:11,borderRadius:18,backgroundColor:'#0F1726',borderWidth:1,borderColor:'#202B40',flexDirection:'row-reverse',alignItems:'center',gap:10},closedPressed:{borderColor:'#5A4CC2',backgroundColor:'#141A2A'},closedCopy:{flex:1,alignItems:'flex-end'},closedName:{color:'#E7EAF0',fontSize:12,fontWeight:'900',textAlign:'right'},closedHost:{color:'#667287',fontSize:9,marginTop:4,textAlign:'right'},restoreBadge:{width:34,height:34,borderRadius:11,backgroundColor:'#1D2335',alignItems:'center',justifyContent:'center'},restoreText:{color:'#AFA2FF',fontSize:18,fontWeight:'900'},
});