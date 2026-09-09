import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { BrowserTab, closeAllBrowserTabs, closeBrowserTab, createBrowserTab, getBrowserTabs } from '@/lib/db';

function hostOf(value:string){try{return new URL(value).hostname.replace(/^www\./,'');}catch{return value;}}

export default function TabsScreen(){
  const [tabs,setTabs]=useState<BrowserTab[]>([]);
  const [busy,setBusy]=useState(false);
  const [query,setQuery]=useState('');

  const refresh=useCallback(async()=>{try{setTabs(await getBrowserTabs());}catch{setTabs([]);}},[]);
  useFocusEffect(useCallback(()=>{refresh();return()=>{};},[refresh]));

  const visibleTabs=useMemo(()=>{
    const value=query.trim().toLowerCase();
    if(!value)return tabs;
    return tabs.filter(tab=>`${tab.title||''} ${hostOf(tab.url)} ${tab.url}`.toLowerCase().includes(value));
  },[query,tabs]);

  const openTab=(tab:BrowserTab)=>{if(!busy)router.replace({pathname:'/browser',params:{url:tab.url,tabId:String(tab.id)}});};
  const newTab=async()=>{if(busy)return;setBusy(true);try{const url='https://www.google.com';const id=await createBrowserTab(url,'علامة تبويب جديدة');router.replace({pathname:'/browser',params:{url,tabId:String(id)}});}finally{setBusy(false);}};
  const newPrivate=()=>{if(!busy)router.replace({pathname:'/browser',params:{privateMode:'1'}});};
  const close=async(id:number)=>{if(busy)return;setBusy(true);try{await closeBrowserTab(id);await refresh();}finally{setBusy(false);}};
  const duplicate=async(tab:BrowserTab)=>{if(busy)return;setBusy(true);try{await createBrowserTab(tab.url,tab.title||hostOf(tab.url));await refresh();}finally{setBusy(false);}};
  const duplicateAndOpen=async(tab:BrowserTab)=>{if(busy)return;setBusy(true);try{const id=await createBrowserTab(tab.url,tab.title||hostOf(tab.url));router.replace({pathname:'/browser',params:{url:tab.url,tabId:String(id)}});}finally{setBusy(false);}};
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
    ...(tabs.length>1?[{text:'إغلاق التبويبات الأخرى',onPress:()=>closeOthers(tab)}]:[]),
    {text:'إغلاق',style:'destructive',onPress:()=>close(tab.id)},
    {text:'إلغاء',style:'cancel'},
  ]);
  const closeAll=()=>{
    if(busy||tabs.length===0)return;
    Alert.alert('إغلاق كل التبويبات؟','سيتم إغلاق جميع التبويبات المفتوحة. لا يمكن التراجع عن هذه الخطوة.',[
      {text:'إلغاء',style:'cancel'},
      {text:'إغلاق الكل',style:'destructive',onPress:async()=>{setBusy(true);try{await closeAllBrowserTabs();setQuery('');await refresh();}finally{setBusy(false);}}},
    ]);
  };

  return <SafeAreaView style={styles.root}>
    <View style={styles.header}>
      <Pressable onPress={()=>router.back()} style={styles.icon} accessibilityRole="button" accessibilityLabel="رجوع"><Text style={styles.iconText}>‹</Text></Pressable>
      <View style={styles.headText}><Text style={styles.title}>التبويبات</Text><Text style={styles.sub}>{tabs.length} مفتوحة • RAID 1.3</Text></View>
      <Pressable onPress={newTab} disabled={busy} style={[styles.add,busy&&styles.disabledAction]} accessibilityRole="button" accessibilityLabel="إنشاء تبويب جديد"><Text style={styles.addText}>＋</Text></Pressable>
    </View>

    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.actions}>
        <Pressable onPress={newTab} disabled={busy} style={[styles.primary,busy&&styles.disabledAction]} accessibilityRole="button"><Text style={styles.primaryText}>تبويب جديد</Text></Pressable>
        <Pressable onPress={newPrivate} disabled={busy} style={[styles.private,busy&&styles.disabledAction]} accessibilityRole="button"><Text style={styles.privateText}>تبويب خاص</Text></Pressable>
      </View>

      {tabs.length>1&&<View style={styles.searchWrap}>
        <Text style={styles.searchGlyph}>⌕</Text>
        <TextInput value={query} onChangeText={setQuery} placeholder="ابحث في التبويبات المفتوحة" placeholderTextColor="#64748B" autoCapitalize="none" autoCorrect={false} returnKeyType="search" style={styles.searchInput} accessibilityLabel="البحث في التبويبات المفتوحة" />
        {!!query&&<Pressable onPress={()=>setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="مسح البحث"><Text style={styles.clearSearch}>×</Text></Pressable>}
      </View>}
      {!!query&&<Text style={styles.resultCount}>عرض {visibleTabs.length} من {tabs.length} تبويب</Text>}

      {tabs.length===0?<View style={styles.empty}><Text style={styles.emptyTitle}>لا توجد تبويبات مفتوحة</Text><Text style={styles.emptyText}>أنشئ تبويبًا جديدًا وسيبقى محفوظًا حتى تغلقه.</Text></View>:
       visibleTabs.length===0?<View style={styles.empty}><Text style={styles.emptyTitle}>لا توجد نتائج</Text><Text style={styles.emptyText}>لم يتم العثور على تبويب يطابق «{query.trim()}».</Text><Pressable onPress={()=>setQuery('')} style={styles.resetSearch}><Text style={styles.resetSearchText}>عرض كل التبويبات</Text></Pressable></View>:
        <View style={styles.grid}>{visibleTabs.map(tab=><Pressable key={tab.id} disabled={busy} onPress={()=>openTab(tab)} onLongPress={()=>tabMenu(tab)} delayLongPress={350} style={({pressed})=>[styles.card,pressed&&styles.cardPressed,busy&&styles.disabledAction]} accessibilityRole="button" accessibilityHint="اضغط مطولًا لفتح خيارات التبويب" accessibilityLabel={`فتح ${tab.title||hostOf(tab.url)}`}>
          <View style={styles.cardTop}>
            <View style={styles.favicon}><Text style={styles.faviconText}>{hostOf(tab.url).slice(0,1).toUpperCase()}</Text></View>
            <View style={styles.cardActions}>
              <Pressable disabled={busy} onPress={(event)=>{event.stopPropagation();duplicate(tab);}} hitSlop={8} style={styles.duplicate} accessibilityRole="button" accessibilityLabel="تكرار التبويب"><Text style={styles.duplicateText}>⧉</Text></Pressable>
              <Pressable disabled={busy} onPress={(event)=>{event.stopPropagation();close(tab.id);}} hitSlop={12} style={styles.close} accessibilityRole="button" accessibilityLabel="إغلاق التبويب"><Text style={styles.closeText}>×</Text></Pressable>
            </View>
          </View>
          <Text numberOfLines={2} style={styles.cardTitle}>{tab.title||hostOf(tab.url)}</Text>
          <Text numberOfLines={1} style={styles.host}>{hostOf(tab.url)}</Text>
          <Text style={styles.hint}>ضغط مطوّل • خيارات متقدمة</Text>
        </Pressable>)}</View>}

      {tabs.length>0&&<Pressable onPress={closeAll} disabled={busy} style={[styles.closeAll,busy&&styles.disabledAction]} accessibilityRole="button"><Text style={styles.closeAllText}>إغلاق كل التبويبات</Text></Pressable>}
    </ScrollView>
  </SafeAreaView>;
}

const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:'#070B14'},header:{height:68,flexDirection:'row',alignItems:'center',paddingHorizontal:14,gap:12,borderBottomWidth:1,borderBottomColor:'#172033'},icon:{width:42,height:42,borderRadius:14,backgroundColor:'#111827',alignItems:'center',justifyContent:'center'},iconText:{color:'#fff',fontSize:30,marginTop:-3},headText:{flex:1},title:{color:'#F8FAFC',fontSize:22,fontWeight:'900',textAlign:'right'},sub:{color:'#64748B',fontSize:11,marginTop:2,textAlign:'right'},add:{width:42,height:42,borderRadius:14,backgroundColor:'#7C3AED',alignItems:'center',justifyContent:'center'},addText:{color:'#fff',fontSize:25,fontWeight:'700'},content:{padding:18,paddingBottom:40},actions:{flexDirection:'row-reverse',gap:10},primary:{flex:1,height:48,borderRadius:15,backgroundColor:'#7C3AED',alignItems:'center',justifyContent:'center'},primaryText:{color:'#fff',fontWeight:'900'},private:{flex:1,height:48,borderRadius:15,backgroundColor:'#25134A',borderWidth:1,borderColor:'#4C1D95',alignItems:'center',justifyContent:'center'},privateText:{color:'#DDD6FE',fontWeight:'900'},searchWrap:{height:48,marginTop:14,borderRadius:16,backgroundColor:'#101827',borderWidth:1,borderColor:'#27324A',flexDirection:'row',alignItems:'center',paddingHorizontal:12,gap:8},searchGlyph:{color:'#A78BFA',fontSize:20,fontWeight:'900'},searchInput:{flex:1,color:'#F8FAFC',fontSize:13,textAlign:'right',paddingVertical:0},clearSearch:{color:'#CBD5E1',fontSize:24,fontWeight:'700',paddingHorizontal:4},resultCount:{color:'#64748B',fontSize:10,textAlign:'right',marginTop:8},grid:{marginTop:18,flexDirection:'row',flexWrap:'wrap',gap:12},card:{width:'48%',minHeight:174,borderRadius:22,padding:14,backgroundColor:'#101827',borderWidth:1,borderColor:'#27324A'},cardPressed:{transform:[{scale:.98}],borderColor:'#7C3AED'},cardTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},cardActions:{flexDirection:'row',gap:6},favicon:{width:38,height:38,borderRadius:13,backgroundColor:'#312E81',alignItems:'center',justifyContent:'center'},faviconText:{color:'#EDE9FE',fontWeight:'900',fontSize:17},duplicate:{width:34,height:34,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#172033'},duplicateText:{color:'#C4B5FD',fontSize:18,fontWeight:'900'},close:{width:34,height:34,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#172033'},closeText:{color:'#94A3B8',fontSize:22},cardTitle:{marginTop:18,color:'#F8FAFC',fontWeight:'900',fontSize:14,textAlign:'right'},host:{marginTop:7,color:'#64748B',fontSize:10,textAlign:'right'},hint:{marginTop:10,color:'#8B5CF6',fontSize:9,fontWeight:'800',textAlign:'right'},empty:{marginTop:50,padding:28,borderRadius:24,backgroundColor:'#101827',borderWidth:1,borderColor:'#27324A'},emptyTitle:{color:'#F8FAFC',fontSize:19,fontWeight:'900',textAlign:'center'},emptyText:{color:'#94A3B8',lineHeight:21,textAlign:'center',marginTop:8},resetSearch:{marginTop:18,height:42,borderRadius:13,backgroundColor:'#25134A',alignItems:'center',justifyContent:'center'},resetSearchText:{color:'#DDD6FE',fontWeight:'900'},closeAll:{marginTop:24,height:46,alignItems:'center',justifyContent:'center'},closeAllText:{color:'#F87171',fontWeight:'800'},disabledAction:{opacity:.5}
});
