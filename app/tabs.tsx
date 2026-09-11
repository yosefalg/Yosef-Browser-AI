import { useCallback, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { BrowserTab, ClosedBrowserTab, closeAllBrowserTabs, closeBrowserTab, createBrowserTab, getBrowserTabs, getRecentlyClosedTabs, restoreClosedBrowserTab } from '@/lib/db';

function hostOf(value:string){try{return new URL(value).hostname.replace(/^www\./,'');}catch{return value;}}

export default function TabsScreen(){
  const [tabs,setTabs]=useState<BrowserTab[]>([]);
  const [closed,setClosed]=useState<ClosedBrowserTab[]>([]);
  const [busy,setBusy]=useState(false);
  const [query,setQuery]=useState('');
  const version=Constants.expoConfig?.version || '—';

  const refresh=useCallback(async()=>{try{const [openItems,closedItems]=await Promise.all([getBrowserTabs(),getRecentlyClosedTabs(8)]);setTabs(openItems);setClosed(closedItems);}catch{setTabs([]);setClosed([]);}},[]);
  useFocusEffect(useCallback(()=>{void refresh();return()=>{};},[refresh]));

  const visibleTabs=useMemo(()=>{
    const value=query.trim().toLowerCase();
    if(!value)return tabs;
    return tabs.filter(tab=>`${tab.title||''} ${hostOf(tab.url)} ${tab.url}`.toLowerCase().includes(value));
  },[query,tabs]);

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
    {text:'فتح في تطبيق خارجي',onPress:()=>openExternal(tab)},
    ...(tabs.length>1?[{text:'إغلاق التبويبات الأخرى',onPress:()=>closeOthers(tab)}]:[]),
    {text:'إغلاق',style:'destructive',onPress:()=>close(tab.id)},
    {text:'إلغاء',style:'cancel'},
  ]);
  const closeSearchResults=()=>{
    if(busy||!query.trim()||visibleTabs.length===0)return;
    Alert.alert('إغلاق نتائج البحث؟',`سيتم إغلاق ${visibleTabs.length} تبويب مطابق للبحث الحالي فقط.`,[
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

  return <SafeAreaView edges={['top','bottom','left','right']} style={styles.root}>
    <View style={styles.header}>
      <Pressable onPress={()=>router.back()} style={styles.icon}><Text style={styles.iconText}>‹</Text></Pressable>
      <View style={styles.headText}><Text style={styles.title}>التبويبات</Text><Text style={styles.sub}>{tabs.length} مفتوحة • RAID {version}</Text></View>
      <Pressable onPress={newTab} disabled={busy} style={[styles.add,busy&&styles.disabledAction]}><Text style={styles.addText}>＋</Text></Pressable>
    </View>

    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.actions}>
        <Pressable onPress={newTab} disabled={busy} style={[styles.primary,busy&&styles.disabledAction]}><Text style={styles.primaryText}>تبويب جديد</Text></Pressable>
        <Pressable onPress={newPrivate} disabled={busy} style={[styles.private,busy&&styles.disabledAction]}><Text style={styles.privateText}>تبويب خاص</Text></Pressable>
      </View>

      {tabs.length>1&&<View style={styles.searchWrap}>
        <Text style={styles.searchGlyph}>⌕</Text>
        <TextInput value={query} onChangeText={setQuery} placeholder="ابحث في التبويبات المفتوحة" placeholderTextColor="#64748B" autoCapitalize="none" autoCorrect={false} returnKeyType="search" style={styles.searchInput}/>
        {!!query&&<Pressable onPress={()=>setQuery('')} hitSlop={10}><Text style={styles.clearSearch}>×</Text></Pressable>}
      </View>}
      {!!query&&<View style={styles.searchSummary}><Text style={styles.resultCount}>عرض {visibleTabs.length} من {tabs.length} تبويب</Text>{visibleTabs.length>0&&visibleTabs.length<tabs.length?<Pressable onPress={closeSearchResults} disabled={busy}><Text style={styles.closeResults}>إغلاق النتائج</Text></Pressable>:null}</View>}

      {tabs.length===0?<View style={styles.empty}><Text style={styles.emptyTitle}>لا توجد تبويبات مفتوحة</Text><Text style={styles.emptyText}>أنشئ تبويبًا جديدًا أو استعد واحدًا من المغلقة مؤخرًا.</Text></View>:
       visibleTabs.length===0?<View style={styles.empty}><Text style={styles.emptyTitle}>لا توجد نتائج</Text><Text style={styles.emptyText}>لم يتم العثور على تبويب يطابق «{query.trim()}».</Text><Pressable onPress={()=>setQuery('')} style={styles.resetSearch}><Text style={styles.resetSearchText}>عرض كل التبويبات</Text></Pressable></View>:
        <View style={styles.grid}>{visibleTabs.map(tab=><Pressable key={tab.id} disabled={busy} onPress={()=>openTab(tab)} onLongPress={()=>tabMenu(tab)} delayLongPress={350} style={({pressed})=>[styles.card,pressed&&styles.cardPressed,busy&&styles.disabledAction]}>
          <View style={styles.cardTop}>
            <View style={styles.favicon}><Text style={styles.faviconText}>{hostOf(tab.url).slice(0,1).toUpperCase()}</Text></View>
            <View style={styles.cardActions}>
              <Pressable disabled={busy} onPress={(event)=>{event.stopPropagation();duplicate(tab);}} hitSlop={8} style={styles.duplicate}><Text style={styles.duplicateText}>⧉</Text></Pressable>
              <Pressable disabled={busy} onPress={(event)=>{event.stopPropagation();close(tab.id);}} hitSlop={12} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable>
            </View>
          </View>
          <Text numberOfLines={2} style={styles.cardTitle}>{tab.title||hostOf(tab.url)}</Text>
          <Text numberOfLines={1} style={styles.host}>{hostOf(tab.url)}</Text>
          <Text style={styles.hint}>ضغط مطوّل • مشاركة • فتح خارجي • المزيد</Text>
        </Pressable>)}</View>}

      {tabs.length>0&&<Pressable onPress={closeAll} disabled={busy} style={[styles.closeAll,busy&&styles.disabledAction]}><Text style={styles.closeAllText}>إغلاق كل التبويبات</Text></Pressable>}

      {closed.length>0&&<View style={styles.closedSection}>
        <View style={styles.closedHead}><Text style={styles.closedTitle}>المغلقة مؤخرًا</Text><Text style={styles.closedHint}>اضغط للاستعادة</Text></View>
        {closed.map(item=><Pressable key={item.id} onPress={()=>restore(item)} disabled={busy} style={[styles.closedRow,busy&&styles.disabledAction]}>
          <View style={styles.closedIcon}><Text style={styles.closedIconText}>↺</Text></View>
          <View style={styles.closedCopy}><Text numberOfLines={1} style={styles.closedName}>{item.title||hostOf(item.url)}</Text><Text numberOfLines={1} style={styles.closedHost}>{hostOf(item.url)}</Text></View>
        </Pressable>)}
      </View>}
    </ScrollView>
  </SafeAreaView>;
}

const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:'#070B14'},header:{minHeight:68,flexDirection:'row',alignItems:'center',paddingHorizontal:14,gap:12,borderBottomWidth:1,borderBottomColor:'#172033'},icon:{width:42,height:42,borderRadius:14,backgroundColor:'#111827',alignItems:'center',justifyContent:'center'},iconText:{color:'#fff',fontSize:30,marginTop:-3},headText:{flex:1},title:{color:'#F8FAFC',fontSize:22,fontWeight:'900',textAlign:'right'},sub:{color:'#64748B',fontSize:11,marginTop:2,textAlign:'right'},add:{width:42,height:42,borderRadius:14,backgroundColor:'#7C3AED',alignItems:'center',justifyContent:'center'},addText:{color:'#fff',fontSize:25,fontWeight:'700'},content:{padding:18,paddingBottom:40},actions:{flexDirection:'row-reverse',gap:10},primary:{flex:1,height:48,borderRadius:15,backgroundColor:'#7C3AED',alignItems:'center',justifyContent:'center'},primaryText:{color:'#fff',fontWeight:'900'},private:{flex:1,height:48,borderRadius:15,backgroundColor:'#25134A',borderWidth:1,borderColor:'#4C1D95',alignItems:'center',justifyContent:'center'},privateText:{color:'#DDD6FE',fontWeight:'900'},searchWrap:{height:48,marginTop:14,borderRadius:16,backgroundColor:'#101827',borderWidth:1,borderColor:'#27324A',flexDirection:'row',alignItems:'center',paddingHorizontal:12,gap:8},searchGlyph:{color:'#A78BFA',fontSize:20,fontWeight:'900'},searchInput:{flex:1,color:'#F8FAFC',fontSize:13,textAlign:'right',paddingVertical:0},clearSearch:{color:'#CBD5E1',fontSize:24,fontWeight:'700',paddingHorizontal:4},searchSummary:{marginTop:8,flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'},resultCount:{color:'#64748B',fontSize:10,textAlign:'right'},closeResults:{color:'#FCA5A5',fontSize:10,fontWeight:'900'},grid:{marginTop:18,flexDirection:'row',flexWrap:'wrap',gap:12},card:{width:'48%',minHeight:174,borderRadius:22,padding:14,backgroundColor:'#101827',borderWidth:1,borderColor:'#27324A'},cardPressed:{transform:[{scale:.98}],borderColor:'#7C3AED'},cardTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},cardActions:{flexDirection:'row',gap:6},favicon:{width:38,height:38,borderRadius:13,backgroundColor:'#312E81',alignItems:'center',justifyContent:'center'},faviconText:{color:'#EDE9FE',fontWeight:'900',fontSize:17},duplicate:{width:34,height:34,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#172033'},duplicateText:{color:'#C4B5FD',fontSize:18,fontWeight:'900'},close:{width:34,height:34,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#172033'},closeText:{color:'#94A3B8',fontSize:22},cardTitle:{marginTop:18,color:'#F8FAFC',fontWeight:'900',fontSize:14,textAlign:'right'},host:{marginTop:7,color:'#64748B',fontSize:10,textAlign:'right'},hint:{marginTop:10,color:'#8B5CF6',fontSize:9,fontWeight:'800',textAlign:'right'},empty:{marginTop:50,padding:28,borderRadius:24,backgroundColor:'#101827',borderWidth:1,borderColor:'#27324A'},emptyTitle:{color:'#F8FAFC',fontSize:19,fontWeight:'900',textAlign:'center'},emptyText:{color:'#94A3B8',lineHeight:21,textAlign:'center',marginTop:8},resetSearch:{marginTop:18,height:42,borderRadius:13,backgroundColor:'#25134A',alignItems:'center',justifyContent:'center'},resetSearchText:{color:'#DDD6FE',fontWeight:'900'},closeAll:{marginTop:24,height:46,alignItems:'center',justifyContent:'center'},closeAllText:{color:'#F87171',fontWeight:'800'},closedSection:{marginTop:22,gap:8},closedHead:{flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center'},closedTitle:{color:'#F8FAFC',fontSize:16,fontWeight:'900'},closedHint:{color:'#64748B',fontSize:10},closedRow:{minHeight:58,borderRadius:18,backgroundColor:'#101827',borderWidth:1,borderColor:'#27324A',flexDirection:'row-reverse',alignItems:'center',gap:10,paddingHorizontal:12},closedIcon:{width:38,height:38,borderRadius:12,backgroundColor:'#172033',alignItems:'center',justifyContent:'center'},closedIconText:{color:'#A78BFA',fontSize:20,fontWeight:'900'},closedCopy:{flex:1},closedName:{color:'#E5E7EB',fontWeight:'800',textAlign:'right'},closedHost:{color:'#64748B',fontSize:10,marginTop:3,textAlign:'right'},disabledAction:{opacity:.5}
});
