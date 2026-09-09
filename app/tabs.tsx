import { useCallback, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { BrowserTab, closeAllBrowserTabs, closeBrowserTab, createBrowserTab, getBrowserTabs } from '@/lib/db';

function hostOf(value:string){try{return new URL(value).hostname.replace(/^www\./,'');}catch{return value;}}

export default function TabsScreen(){
  const [tabs,setTabs]=useState<BrowserTab[]>([]);
  const [busy,setBusy]=useState(false);

  const refresh=useCallback(async()=>{try{setTabs(await getBrowserTabs());}catch{setTabs([]);}},[]);
  useFocusEffect(useCallback(()=>{refresh();return()=>{};},[refresh]));

  const openTab=(tab:BrowserTab)=>{if(!busy)router.replace({pathname:'/browser',params:{url:tab.url,tabId:String(tab.id)}});};
  const newTab=async()=>{if(busy)return;setBusy(true);try{const url='https://www.google.com';const id=await createBrowserTab(url,'علامة تبويب جديدة');router.replace({pathname:'/browser',params:{url,tabId:String(id)}});}finally{setBusy(false);}};
  const newPrivate=()=>{if(!busy)router.replace({pathname:'/browser',params:{privateMode:'1'}});};
  const close=async(id:number)=>{if(busy)return;setBusy(true);try{await closeBrowserTab(id);await refresh();}finally{setBusy(false);}};
  const duplicate=async(tab:BrowserTab)=>{if(busy)return;setBusy(true);try{await createBrowserTab(tab.url,tab.title||hostOf(tab.url));await refresh();}finally{setBusy(false);}};
  const closeAll=()=>{
    if(busy||tabs.length===0)return;
    Alert.alert('إغلاق كل التبويبات؟','سيتم إغلاق جميع التبويبات المفتوحة. لا يمكن التراجع عن هذه الخطوة.',[
      {text:'إلغاء',style:'cancel'},
      {text:'إغلاق الكل',style:'destructive',onPress:async()=>{setBusy(true);try{await closeAllBrowserTabs();await refresh();}finally{setBusy(false);}}},
    ]);
  };

  return <SafeAreaView style={styles.root}>
    <View style={styles.header}>
      <Pressable onPress={()=>router.back()} style={styles.icon} accessibilityRole="button" accessibilityLabel="رجوع"><Text style={styles.iconText}>‹</Text></Pressable>
      <View style={styles.headText}><Text style={styles.title}>التبويبات</Text><Text style={styles.sub}>{tabs.length} مفتوحة</Text></View>
      <Pressable onPress={newTab} disabled={busy} style={[styles.add,busy&&styles.disabledAction]} accessibilityRole="button" accessibilityLabel="إنشاء تبويب جديد"><Text style={styles.addText}>＋</Text></Pressable>
    </View>

    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.actions}>
        <Pressable onPress={newTab} disabled={busy} style={[styles.primary,busy&&styles.disabledAction]} accessibilityRole="button"><Text style={styles.primaryText}>تبويب جديد</Text></Pressable>
        <Pressable onPress={newPrivate} disabled={busy} style={[styles.private,busy&&styles.disabledAction]} accessibilityRole="button"><Text style={styles.privateText}>تبويب خاص</Text></Pressable>
      </View>

      {tabs.length===0?<View style={styles.empty}><Text style={styles.emptyTitle}>لا توجد تبويبات مفتوحة</Text><Text style={styles.emptyText}>أنشئ تبويبًا جديدًا وسيبقى محفوظًا حتى تغلقه.</Text></View>:
        <View style={styles.grid}>{tabs.map(tab=><Pressable key={tab.id} disabled={busy} onPress={()=>openTab(tab)} style={[styles.card,busy&&styles.disabledAction]} accessibilityRole="button" accessibilityLabel={`فتح ${tab.title||hostOf(tab.url)}`}>
          <View style={styles.cardTop}>
            <View style={styles.favicon}><Text style={styles.faviconText}>{hostOf(tab.url).slice(0,1).toUpperCase()}</Text></View>
            <View style={styles.cardActions}>
              <Pressable disabled={busy} onPress={(event)=>{event.stopPropagation();duplicate(tab);}} hitSlop={8} style={styles.duplicate} accessibilityRole="button" accessibilityLabel="تكرار التبويب"><Text style={styles.duplicateText}>⧉</Text></Pressable>
              <Pressable disabled={busy} onPress={(event)=>{event.stopPropagation();close(tab.id);}} hitSlop={12} style={styles.close} accessibilityRole="button" accessibilityLabel="إغلاق التبويب"><Text style={styles.closeText}>×</Text></Pressable>
            </View>
          </View>
          <Text numberOfLines={2} style={styles.cardTitle}>{tab.title||hostOf(tab.url)}</Text>
          <Text numberOfLines={1} style={styles.host}>{hostOf(tab.url)}</Text>
        </Pressable>)}</View>}

      {tabs.length>0&&<Pressable onPress={closeAll} disabled={busy} style={[styles.closeAll,busy&&styles.disabledAction]} accessibilityRole="button"><Text style={styles.closeAllText}>إغلاق كل التبويبات</Text></Pressable>}
    </ScrollView>
  </SafeAreaView>;
}

const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:'#070B14'},header:{height:68,flexDirection:'row',alignItems:'center',paddingHorizontal:14,gap:12,borderBottomWidth:1,borderBottomColor:'#172033'},icon:{width:42,height:42,borderRadius:14,backgroundColor:'#111827',alignItems:'center',justifyContent:'center'},iconText:{color:'#fff',fontSize:30,marginTop:-3},headText:{flex:1},title:{color:'#F8FAFC',fontSize:22,fontWeight:'900',textAlign:'right'},sub:{color:'#64748B',fontSize:11,marginTop:2,textAlign:'right'},add:{width:42,height:42,borderRadius:14,backgroundColor:'#7C3AED',alignItems:'center',justifyContent:'center'},addText:{color:'#fff',fontSize:25,fontWeight:'700'},content:{padding:18,paddingBottom:40},actions:{flexDirection:'row-reverse',gap:10},primary:{flex:1,height:48,borderRadius:15,backgroundColor:'#7C3AED',alignItems:'center',justifyContent:'center'},primaryText:{color:'#fff',fontWeight:'900'},private:{flex:1,height:48,borderRadius:15,backgroundColor:'#25134A',borderWidth:1,borderColor:'#4C1D95',alignItems:'center',justifyContent:'center'},privateText:{color:'#DDD6FE',fontWeight:'900'},grid:{marginTop:18,flexDirection:'row',flexWrap:'wrap',gap:12},card:{width:'48%',minHeight:155,borderRadius:22,padding:14,backgroundColor:'#101827',borderWidth:1,borderColor:'#27324A'},cardTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},cardActions:{flexDirection:'row',gap:6},favicon:{width:38,height:38,borderRadius:13,backgroundColor:'#312E81',alignItems:'center',justifyContent:'center'},faviconText:{color:'#EDE9FE',fontWeight:'900',fontSize:17},duplicate:{width:34,height:34,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#172033'},duplicateText:{color:'#C4B5FD',fontSize:18,fontWeight:'900'},close:{width:34,height:34,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#172033'},closeText:{color:'#94A3B8',fontSize:22},cardTitle:{marginTop:18,color:'#F8FAFC',fontWeight:'900',fontSize:14,textAlign:'right'},host:{marginTop:7,color:'#64748B',fontSize:10,textAlign:'right'},empty:{marginTop:70,padding:28,borderRadius:24,backgroundColor:'#101827',borderWidth:1,borderColor:'#27324A'},emptyTitle:{color:'#F8FAFC',fontSize:19,fontWeight:'900',textAlign:'center'},emptyText:{color:'#94A3B8',lineHeight:21,textAlign:'center',marginTop:8},closeAll:{marginTop:24,height:46,alignItems:'center',justifyContent:'center'},closeAllText:{color:'#F87171',fontWeight:'800'},disabledAction:{opacity:.5}
});