import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
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
function canonicalUrl(value:string){
  try{
    const parsed=new URL(value);
    parsed.hash='';
    const path=parsed.pathname.replace(/\/+$/,'')||'/';
    return `${parsed.protocol}//${parsed.host}${path}${parsed.search}`.toLowerCase();
  }catch{return value.trim().toLowerCase();}
}

export default function TabsScreen(){
  const [tabs,setTabs]=useState<BrowserTab[]>([]);
  const [closed,setClosed]=useState<ClosedBrowserTab[]>([]);
  const [busy,setBusy]=useState(false);
  const [query,setQuery]=useState('');
  const [viewMode,setViewMode]=useState<TabViewMode>('grid');
  const [sortMode,setSortMode]=useState<TabSortMode>('recent');
  const [themeName,setThemeName]=useState<ThemeName>('cinematic');
  const [selectionMode,setSelectionMode]=useState(false);
  const [selectedIds,setSelectedIds]=useState<number[]>([]);
  const [menuTab,setMenuTab]=useState<BrowserTab|null>(null);
  const [closedExpanded,setClosedExpanded]=useState(false);
  const theme=useMemo(()=>getTheme(themeName),[themeName]);
  const version=Constants.expoConfig?.version || '—';

  const refresh=useCallback(async()=>{
    try{
      const [openItems,closedItems]=await Promise.all([getBrowserTabs(),getRecentlyClosedTabs(10)]);
      setTabs(openItems);
      setClosed(closedItems);
      setSelectedIds(current=>current.filter(id=>openItems.some(tab=>tab.id===id)));
    }catch{
      setTabs([]);
      setClosed([]);
      setSelectedIds([]);
    }
  },[]);

  useFocusEffect(useCallback(()=>{
    void refresh();
    void getSetting<ThemeName>('theme','cinematic').then(value=>setThemeName(value==='cinematic'||value==='amoled'||value==='light'?value:'cinematic'));
    return()=>{};
  },[refresh]));

  useEffect(()=>{
    void Promise.all([
      getSetting<TabViewMode>('tabs_view_mode','grid'),
      getSetting<TabSortMode>('tabs_sort_mode','recent'),
    ]).then(([view,sort])=>{
      setViewMode(view==='grid'||view==='list'?view:'grid');
      setSortMode(sort==='recent'||sort==='oldest'||sort==='domain'||sort==='title'?sort:'recent');
    });
  },[]);

  const orderedTabs=useMemo(()=>{
    const copy=[...tabs];
    if(sortMode==='oldest')copy.sort((a,b)=>a.created_at-b.created_at);
    else if(sortMode==='domain')copy.sort((a,b)=>hostOf(a.url).localeCompare(hostOf(b.url))||b.updated_at-a.updated_at);
    else if(sortMode==='title')copy.sort((a,b)=>(a.title||hostOf(a.url)).localeCompare(b.title||hostOf(b.url),'ar'));
    else copy.sort((a,b)=>b.updated_at-a.updated_at);
    return copy;
  },[tabs,sortMode]);

  const visibleTabs=useMemo(()=>{
    const value=query.trim().toLowerCase();
    return value?orderedTabs.filter(tab=>`${tab.title||''} ${hostOf(tab.url)} ${tab.url}`.toLowerCase().includes(value)):orderedTabs;
  },[query,orderedTabs]);

  const newestId=useMemo(()=>tabs.reduce<number|null>((current,tab)=>{
    if(current===null)return tab.id;
    const currentTab=tabs.find(item=>item.id===current);
    return !currentTab||tab.updated_at>currentTab.updated_at?tab.id:current;
  },null),[tabs]);

  const duplicateCount=useMemo(()=>{
    const seen=new Set<string>();
    let duplicates=0;
    [...tabs].sort((a,b)=>b.updated_at-a.updated_at).forEach(tab=>{
      const key=canonicalUrl(tab.url);
      if(seen.has(key))duplicates+=1;else seen.add(key);
    });
    return duplicates;
  },[tabs]);

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

  const exitSelection=()=>{setSelectionMode(false);setSelectedIds([]);};
  const startSelection=(tab:BrowserTab)=>{if(busy)return;setMenuTab(null);setSelectionMode(true);setSelectedIds([tab.id]);};
  const toggleSelection=(id:number)=>{
    setSelectedIds(current=>{
      const next=current.includes(id)?current.filter(item=>item!==id):[...current,id];
      if(next.length===0)setSelectionMode(false);
      return next;
    });
  };
  const selectAllVisible=()=>{if(visibleTabs.length){setSelectionMode(true);setSelectedIds(visibleTabs.map(tab=>tab.id));}};
  const shareSelected=()=>{
    const selected=tabs.filter(tab=>selectedIds.includes(tab.id));
    if(!selected.length)return;
    void Share.share({message:selected.map(tab=>`${tab.title||hostOf(tab.url)}\n${tab.url}`).join('\n\n')});
  };
  const closeSelected=()=>{
    if(busy||selectedIds.length===0)return;
    Alert.alert('إغلاق التبويبات المحددة؟',`سيتم إغلاق ${selectedIds.length} تبويب ويمكن استعادتها من «المغلقة مؤخرًا».`,[
      {text:'إلغاء',style:'cancel'},
      {text:'إغلاق',style:'destructive',onPress:async()=>{setBusy(true);try{for(const id of selectedIds)await closeBrowserTab(id);exitSelection();await refresh();}finally{setBusy(false);}}},
    ]);
  };

  const closeOthers=(tab:BrowserTab)=>{
    setMenuTab(null);
    if(busy||tabs.length<2)return;
    Alert.alert('إغلاق التبويبات الأخرى؟',`سيبقى «${tab.title||hostOf(tab.url)}» فقط.`,[
      {text:'إلغاء',style:'cancel'},
      {text:'إغلاق الأخرى',style:'destructive',onPress:async()=>{setBusy(true);try{for(const item of tabs){if(item.id!==tab.id)await closeBrowserTab(item.id);}setQuery('');await refresh();}finally{setBusy(false);}}},
    ]);
  };

  const cleanDuplicates=()=>{
    if(busy)return;
    const seen=new Set<string>();
    const duplicates=[...tabs].sort((a,b)=>b.updated_at-a.updated_at).filter(tab=>{
      const key=canonicalUrl(tab.url);
      if(seen.has(key))return true;
      seen.add(key);
      return false;
    });
    if(!duplicates.length){Alert.alert('التبويبات مرتبة','لا توجد نسخ مكررة الآن.');return;}
    Alert.alert('تنظيف التبويبات المكررة؟',`سيتم الاحتفاظ بأحدث نسخة وإغلاق ${duplicates.length} تبويب مكرر.`,[
      {text:'إلغاء',style:'cancel'},
      {text:'تنظيف',onPress:async()=>{setBusy(true);try{for(const tab of duplicates)await closeBrowserTab(tab.id);await refresh();}finally{setBusy(false);}}},
    ]);
  };

  const closeAll=()=>{if(busy||tabs.length===0)return;Alert.alert('إغلاق كل التبويبات؟','يمكن استعادة أحدث الصفحات من «المغلقة مؤخرًا».',[{text:'إلغاء',style:'cancel'},{text:'إغلاق الكل',style:'destructive',onPress:async()=>{setBusy(true);try{await closeAllBrowserTabs();setQuery('');exitSelection();await refresh();}finally{setBusy(false);}}}]);};
  const clearClosed=()=>{if(busy||closed.length===0)return;Alert.alert('مسح المغلقة مؤخرًا؟','سيتم حذف قائمة الاستعادة فقط.',[{text:'إلغاء',style:'cancel'},{text:'مسح',style:'destructive',onPress:async()=>{setBusy(true);try{await clearRecentlyClosedTabs();await refresh();}finally{setBusy(false);}}}]);};

  const menuAction=(action:()=>void)=>{setMenuTab(null);setTimeout(action,80);};

  return <View style={[s.fill,{backgroundColor:theme.bg}]}><SafeAreaView edges={['top','bottom','left','right']} style={s.root}>
    <View style={[s.header,{borderBottomColor:theme.border}]}>
      <Pressable onPress={()=>selectionMode?exitSelection():router.back()} style={[s.icon,{backgroundColor:theme.surface,borderColor:theme.border}]} accessibilityLabel={selectionMode?'إلغاء التحديد':'رجوع'}><Ionicons name={selectionMode?'close':'chevron-forward'} size={22} color={theme.text}/></Pressable>
      <View style={s.headText}><Text style={[s.title,{color:theme.text}]}>{selectionMode?`${selectedIds.length} محدد`:'التبويبات'}</Text><Text style={[s.sub,{color:theme.muted}]}>{selectionMode?'اضغط على التبويبات لإضافتها أو إزالتها':`${tabs.length} مفتوحة • RAID ${version}`}</Text></View>
      {selectionMode?<Pressable onPress={selectAllVisible} style={[s.icon,{backgroundColor:theme.surface,borderColor:theme.border}]} accessibilityLabel="تحديد الكل"><Ionicons name="checkbox-outline" size={21} color={theme.accent}/></Pressable>:<Pressable onPress={()=>void newTab()} disabled={busy} style={[s.add,{backgroundColor:theme.accent},busy&&s.disabled]} accessibilityLabel="تبويب جديد"><Ionicons name="add" size={24} color="#fff"/></Pressable>}
    </View>

    {selectionMode&&<View style={[s.selectionBar,{backgroundColor:theme.surface,borderBottomColor:theme.border}]}>
      <Pressable onPress={shareSelected} disabled={!selectedIds.length} style={[s.selectionAction,!selectedIds.length&&s.disabled]}><Ionicons name="share-social-outline" size={18} color={theme.accent}/><Text style={[s.selectionText,{color:theme.text}]}>مشاركة</Text></Pressable>
      <Pressable onPress={closeSelected} disabled={!selectedIds.length||busy} style={[s.selectionAction,(!selectedIds.length||busy)&&s.disabled]}><Ionicons name="trash-outline" size={18} color="#D98C80"/><Text style={[s.selectionText,{color:'#D98C80'}]}>إغلاق</Text></Pressable>
    </View>}

    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {!selectionMode&&<View style={s.quickRow}>
        <Pressable onPress={()=>void newTab()} disabled={busy} style={[s.primary,{backgroundColor:theme.accent},busy&&s.disabled]}><Ionicons name="add-circle-outline" size={19} color="#fff"/><Text style={s.primaryText}>تبويب جديد</Text></Pressable>
        <Pressable onPress={newPrivate} disabled={busy} style={[s.secondary,{backgroundColor:theme.surface,borderColor:theme.border},busy&&s.disabled]}><Ionicons name="eye-off-outline" size={18} color={theme.text}/><Text style={[s.secondaryText,{color:theme.text}]}>خاص</Text></Pressable>
        <Pressable onPress={cleanDuplicates} disabled={busy||duplicateCount===0} style={[s.secondary,{backgroundColor:theme.surface,borderColor:theme.border},(busy||duplicateCount===0)&&s.disabled]}><Ionicons name="sparkles-outline" size={18} color={theme.accent}/><Text style={[s.secondaryText,{color:theme.text}]}>تنظيف</Text></Pressable>
      </View>}

      <View style={s.stats}>
        {[['albums-outline',String(tabs.length),'مفتوحة'],['globe-outline',String(new Set(tabs.map(t=>hostOf(t.url))).size),'مواقع'],['copy-outline',String(duplicateCount),'مكررة']].map(([icon,value,label])=><View key={label} style={[s.stat,{backgroundColor:theme.surface,borderColor:theme.border}]}><Ionicons name={icon as any} size={16} color={theme.accent}/><Text style={[s.statNum,{color:theme.text}]}>{value}</Text><Text style={[s.statLabel,{color:theme.muted}]}>{label}</Text></View>)}
      </View>

      {tabs.length>1&&<View style={[s.searchWrap,{backgroundColor:theme.surface,borderColor:theme.border}]}><Ionicons name="search-outline" size={19} color={theme.accent}/><TextInput value={query} onChangeText={setQuery} placeholder="ابحث باسم التبويب أو الموقع" placeholderTextColor={theme.muted} autoCapitalize="none" autoCorrect={false} returnKeyType="search" style={[s.searchInput,{color:theme.text}]}/>{!!query&&<Pressable onPress={()=>setQuery('')} hitSlop={10}><Ionicons name="close-circle" size={19} color={theme.muted}/></Pressable>}</View>}

      {tabs.length>0&&<TabViewControls theme={theme} viewMode={viewMode} sortMode={sortMode} onViewMode={changeView} onSortMode={changeSort}/>} 
      <View style={s.sectionHead}><Text style={[s.sectionTitle,{color:theme.text}]}>التبويبات المفتوحة</Text><Text style={[s.sectionMeta,{color:theme.muted}]}>{query.trim()?`${visibleTabs.length} نتيجة`:`${sortMode==='recent'?'الأحدث أولًا':sortMode==='oldest'?'الأقدم أولًا':sortMode==='domain'?'حسب الموقع':'حسب الاسم'}`}</Text></View>

      {tabs.length===0?<View style={[s.empty,{backgroundColor:theme.surface,borderColor:theme.border}]}><Ionicons name="albums-outline" size={30} color={theme.accent}/><Text style={[s.emptyTitle,{color:theme.text}]}>لا توجد تبويبات مفتوحة</Text><Text style={[s.emptyText,{color:theme.muted}]}>ابدأ بتبويب جديد أو استعد صفحة أغلقتها قبل قليل.</Text></View>:
       visibleTabs.length===0?<View style={[s.empty,{backgroundColor:theme.surface,borderColor:theme.border}]}><Ionicons name="search-outline" size={28} color={theme.accent}/><Text style={[s.emptyTitle,{color:theme.text}]}>لا توجد نتائج</Text><Text style={[s.emptyText,{color:theme.muted}]}>لم نجد تبويبًا يطابق «{query.trim()}».</Text><Pressable onPress={()=>setQuery('')}><Text style={[s.link,{color:theme.accent}]}>عرض الكل</Text></Pressable></View>:
       <View style={viewMode==='grid'?s.grid:s.list}>{visibleTabs.map(tab=><TabCard key={tab.id} tab={tab} viewMode={viewMode} theme={theme} busy={busy} selected={selectedIds.includes(tab.id)} selectionMode={selectionMode} recent={tab.id===newestId} onOpen={()=>selectionMode?toggleSelection(tab.id):openTab(tab)} onLongPress={()=>startSelection(tab)} onDuplicate={()=>void duplicate(tab)} onClose={()=>void close(tab.id)} onMenu={()=>setMenuTab(tab)}/>)}</View>}

      {tabs.length>0&&!selectionMode&&<View style={s.managementRow}>
        <Pressable onPress={selectAllVisible} disabled={busy} style={[s.manageBtn,{backgroundColor:theme.surface,borderColor:theme.border},busy&&s.disabled]}><Ionicons name="checkmark-circle-outline" size={18} color={theme.accent}/><Text style={[s.manageText,{color:theme.text}]}>تحديد متعدد</Text></Pressable>
        <Pressable onPress={closeAll} disabled={busy} style={[s.manageBtn,{backgroundColor:theme.surface,borderColor:theme.border},busy&&s.disabled]}><Ionicons name="close-circle-outline" size={18} color="#D98C80"/><Text style={[s.manageText,{color:'#D98C80'}]}>إغلاق الكل</Text></Pressable>
      </View>}

      {closed.length>0&&<View style={[s.closedSection,{backgroundColor:theme.surface,borderColor:theme.border}]}>
        <Pressable onPress={()=>setClosedExpanded(value=>!value)} style={s.closedHead}>
          <View style={s.closedHeadLeft}><View style={[s.closedCount,{backgroundColor:theme.surface2}]}><Text style={[s.closedCountText,{color:theme.accent}]}>{closed.length}</Text></View><Ionicons name={closedExpanded?'chevron-up':'chevron-down'} size={19} color={theme.muted}/></View>
          <View style={s.closedHeadCopy}><Text style={[s.closedTitle,{color:theme.text}]}>المغلقة مؤخرًا</Text><Text style={[s.closedHint,{color:theme.muted}]}>{closedExpanded?'اضغط على أي صفحة لاستعادتها':'محفوظة محليًا للاستعادة السريعة'}</Text></View>
        </Pressable>
        {closedExpanded&&<><View style={s.closedTools}><Pressable onPress={clearClosed} disabled={busy}><Text style={[s.link,{color:theme.accent}]}>مسح القائمة</Text></Pressable></View>{closed.map(item=><Pressable key={item.id} onPress={()=>void restore(item)} disabled={busy} style={[s.closedRow,{borderTopColor:theme.border},busy&&s.disabled]}><SiteIcon url={item.url} size={38} radius={13}/><View style={s.closedCopy}><Text numberOfLines={1} style={[s.closedName,{color:theme.text}]}>{item.title||hostOf(item.url)}</Text><Text numberOfLines={1} style={[s.closedHost,{color:theme.muted}]}>{hostOf(item.url)}</Text></View><Ionicons name="return-up-back-outline" size={19} color={theme.accent}/></Pressable>)}</>}
      </View>}
    </ScrollView>

    <Modal visible={!!menuTab} transparent animationType="fade" onRequestClose={()=>setMenuTab(null)}>
      <Pressable style={s.sheetBackdrop} onPress={()=>setMenuTab(null)}>
        <Pressable style={[s.sheet,{backgroundColor:theme.surface,borderColor:theme.border}]} onPress={()=>{}}>
          {menuTab&&<>
            <View style={s.sheetHandle}/>
            <View style={s.sheetHead}><SiteIcon url={menuTab.url} size={46} radius={15}/><View style={s.sheetCopy}><Text numberOfLines={1} style={[s.sheetTitle,{color:theme.text}]}>{menuTab.title||hostOf(menuTab.url)}</Text><Text numberOfLines={1} style={[s.sheetHost,{color:theme.muted}]}>{hostOf(menuTab.url)}</Text></View></View>
            <View style={s.sheetGrid}>
              <Pressable onPress={()=>menuAction(()=>openTab(menuTab))} style={[s.sheetAction,{backgroundColor:theme.surface2}]}><Ionicons name="open-outline" size={20} color={theme.accent}/><Text style={[s.sheetActionText,{color:theme.text}]}>فتح</Text></Pressable>
              <Pressable onPress={()=>menuAction(()=>void duplicate(menuTab))} style={[s.sheetAction,{backgroundColor:theme.surface2}]}><Ionicons name="copy-outline" size={20} color={theme.accent}/><Text style={[s.sheetActionText,{color:theme.text}]}>تكرار</Text></Pressable>
              <Pressable onPress={()=>menuAction(()=>shareTab(menuTab))} style={[s.sheetAction,{backgroundColor:theme.surface2}]}><Ionicons name="share-social-outline" size={20} color={theme.accent}/><Text style={[s.sheetActionText,{color:theme.text}]}>مشاركة</Text></Pressable>
              <Pressable onPress={()=>menuAction(()=>openExternal(menuTab))} style={[s.sheetAction,{backgroundColor:theme.surface2}]}><Ionicons name="globe-outline" size={20} color={theme.accent}/><Text style={[s.sheetActionText,{color:theme.text}]}>خارجي</Text></Pressable>
              {tabs.length>1&&<Pressable onPress={()=>closeOthers(menuTab)} style={[s.sheetAction,{backgroundColor:theme.surface2}]}><Ionicons name="albums-outline" size={20} color={theme.accent}/><Text style={[s.sheetActionText,{color:theme.text}]}>إغلاق البقية</Text></Pressable>}
              <Pressable onPress={()=>menuAction(()=>void close(menuTab.id))} style={[s.sheetAction,{backgroundColor:theme.surface2}]}><Ionicons name="trash-outline" size={20} color="#D98C80"/><Text style={[s.sheetActionText,{color:'#D98C80'}]}>إغلاق</Text></Pressable>
            </View>
            <Pressable onPress={()=>startSelection(menuTab)} style={[s.sheetSelect,{borderColor:theme.border}]}><Ionicons name="checkmark-circle-outline" size={19} color={theme.accent}/><Text style={[s.sheetSelectText,{color:theme.text}]}>بدء التحديد المتعدد من هذا التبويب</Text></Pressable>
          </>}
        </Pressable>
      </Pressable>
    </Modal>
  </SafeAreaView></View>;
}

const s=StyleSheet.create({
  fill:{flex:1},root:{flex:1},header:{minHeight:70,flexDirection:'row-reverse',alignItems:'center',paddingHorizontal:14,gap:12,borderBottomWidth:1},icon:{width:42,height:42,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},headText:{flex:1,alignItems:'flex-end'},title:{fontSize:21,fontWeight:'900',textAlign:'right'},sub:{fontSize:10,marginTop:2,textAlign:'right'},add:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center'},selectionBar:{minHeight:52,borderBottomWidth:1,flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:28,paddingHorizontal:16},selectionAction:{flexDirection:'row-reverse',alignItems:'center',gap:7,paddingHorizontal:10,paddingVertical:8},selectionText:{fontSize:12,fontWeight:'900'},content:{padding:16,paddingBottom:42},quickRow:{flexDirection:'row-reverse',gap:8},primary:{flex:1.2,height:48,borderRadius:16,alignItems:'center',justifyContent:'center',flexDirection:'row-reverse',gap:7},primaryText:{color:'#fff',fontWeight:'900',fontSize:12},secondary:{flex:.85,height:48,borderRadius:16,borderWidth:1,alignItems:'center',justifyContent:'center',flexDirection:'row-reverse',gap:6},secondaryText:{fontWeight:'900',fontSize:11},disabled:{opacity:.42},stats:{marginTop:12,flexDirection:'row-reverse',gap:8},stat:{flex:1,paddingVertical:10,borderRadius:17,borderWidth:1,alignItems:'center',gap:2},statNum:{fontSize:18,fontWeight:'900'},statLabel:{fontSize:9,fontWeight:'800'},searchWrap:{height:48,marginTop:12,borderRadius:16,borderWidth:1,flexDirection:'row-reverse',alignItems:'center',paddingHorizontal:12,gap:8},searchInput:{flex:1,fontSize:13,textAlign:'right',paddingVertical:0},sectionHead:{marginTop:17,marginBottom:9,flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'},sectionTitle:{fontSize:15,fontWeight:'900'},sectionMeta:{fontSize:10,fontWeight:'700'},grid:{flexDirection:'row-reverse',flexWrap:'wrap',gap:10},list:{gap:9},empty:{minHeight:170,borderRadius:24,borderWidth:1,alignItems:'center',justifyContent:'center',padding:24,gap:8},emptyTitle:{fontSize:15,fontWeight:'900',textAlign:'center'},emptyText:{fontSize:11,lineHeight:18,textAlign:'center'},link:{fontSize:11,fontWeight:'900'},managementRow:{marginTop:13,flexDirection:'row-reverse',gap:9},manageBtn:{flex:1,height:44,borderRadius:15,borderWidth:1,flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:7},manageText:{fontSize:11,fontWeight:'900'},closedSection:{marginTop:16,borderRadius:22,borderWidth:1,overflow:'hidden'},closedHead:{minHeight:68,paddingHorizontal:14,paddingVertical:11,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},closedHeadLeft:{flexDirection:'row',alignItems:'center',gap:7},closedCount:{minWidth:29,height:29,paddingHorizontal:8,borderRadius:10,alignItems:'center',justifyContent:'center'},closedCountText:{fontWeight:'900',fontSize:11},closedHeadCopy:{alignItems:'flex-end'},closedTitle:{fontSize:14,fontWeight:'900',textAlign:'right'},closedHint:{fontSize:9,marginTop:3,textAlign:'right'},closedTools:{paddingHorizontal:14,paddingBottom:8,alignItems:'flex-start'},closedRow:{minHeight:66,borderTopWidth:1,paddingHorizontal:13,paddingVertical:9,flexDirection:'row-reverse',alignItems:'center',gap:11},closedCopy:{flex:1,alignItems:'flex-end'},closedName:{fontSize:12,fontWeight:'900',textAlign:'right'},closedHost:{fontSize:9,marginTop:3,textAlign:'right'},sheetBackdrop:{flex:1,backgroundColor:'rgba(8,9,10,.62)',justifyContent:'flex-end'},sheet:{borderTopLeftRadius:28,borderTopRightRadius:28,borderWidth:1,borderBottomWidth:0,paddingHorizontal:16,paddingTop:9,paddingBottom:28},sheetHandle:{width:42,height:4,borderRadius:2,backgroundColor:'rgba(148,163,184,.35)',alignSelf:'center',marginBottom:14},sheetHead:{flexDirection:'row-reverse',alignItems:'center',gap:12,marginBottom:15},sheetCopy:{flex:1,alignItems:'flex-end'},sheetTitle:{fontSize:16,fontWeight:'900',textAlign:'right'},sheetHost:{fontSize:10,marginTop:4,textAlign:'right'},sheetGrid:{flexDirection:'row-reverse',flexWrap:'wrap',gap:9},sheetAction:{width:'31.5%',minHeight:70,borderRadius:18,alignItems:'center',justifyContent:'center',gap:7},sheetActionText:{fontSize:10,fontWeight:'900'},sheetSelect:{marginTop:12,minHeight:46,borderRadius:15,borderWidth:1,flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:8},sheetSelectText:{fontSize:11,fontWeight:'900'}
});
