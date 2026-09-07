import { useCallback, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { clearHistory, getBookmarks, getHistory, removeBookmark } from '@/lib/db';

type Bookmark = { id:number; url:string; title:string; created_at:number };
type HistoryItem = { id:number; url:string; title:string; visited_at:number };

function host(url:string){try{return new URL(url).hostname.replace(/^www\./,'');}catch{return url;}}
function open(url:string){router.push({ pathname:'/browser', params:{ url } });}

export default function LibraryScreen(){
  const [bookmarks,setBookmarks]=useState<Bookmark[]>([]);
  const [history,setHistory]=useState<HistoryItem[]>([]);
  const [tab,setTab]=useState<'bookmarks'|'history'>('bookmarks');

  const load=useCallback(async()=>{
    const [b,h]=await Promise.all([getBookmarks(),getHistory(150)]);
    setBookmarks(b); setHistory(h);
  },[]);

  useFocusEffect(useCallback(()=>{load().catch(()=>{});},[load]));

  const deleteBookmark=(url:string)=>{
    Alert.alert('إزالة من المفضلة','هل تريد إزالة هذا الموقع؟',[
      {text:'إلغاء',style:'cancel'},
      {text:'إزالة',style:'destructive',onPress:()=>removeBookmark(url).then(load).catch(()=>{})},
    ]);
  };

  const wipeHistory=()=>{
    Alert.alert('مسح السجل','سيتم حذف سجل التصفح المحلي بالكامل.',[
      {text:'إلغاء',style:'cancel'},
      {text:'مسح',style:'destructive',onPress:()=>clearHistory().then(load).catch(()=>{})},
    ]);
  };

  const rows=tab==='bookmarks'?bookmarks:history;

  return <SafeAreaView style={styles.root}>
    <View style={styles.header}>
      <Pressable onPress={()=>router.back()} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
      <Text style={styles.title}>المكتبة</Text>
      <View style={styles.spacer}/>
    </View>

    <View style={styles.tabs}>
      <Pressable onPress={()=>setTab('bookmarks')} style={[styles.tab,tab==='bookmarks'&&styles.tabActive]}><Text style={[styles.tabText,tab==='bookmarks'&&styles.tabTextActive]}>المفضلة {bookmarks.length}</Text></Pressable>
      <Pressable onPress={()=>setTab('history')} style={[styles.tab,tab==='history'&&styles.tabActive]}><Text style={[styles.tabText,tab==='history'&&styles.tabTextActive]}>السجل {history.length}</Text></Pressable>
    </View>

    {tab==='history'&&history.length>0&&<Pressable onPress={wipeHistory} style={styles.clear}><Text style={styles.clearText}>مسح السجل</Text></Pressable>}

    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {rows.length===0?<View style={styles.empty}><Text style={styles.emptyTitle}>{tab==='bookmarks'?'لا توجد مواقع محفوظة':'السجل فارغ'}</Text><Text style={styles.emptyText}>{tab==='bookmarks'?'احفظ أي صفحة من زر النجمة داخل المتصفح.':'المواقع التي تزورها في الوضع العادي ستظهر هنا.'}</Text></View>:
      rows.map((item)=><Pressable key={`${tab}-${item.id}`} onPress={()=>open(item.url)} onLongPress={()=>tab==='bookmarks'&&deleteBookmark(item.url)} style={styles.row}>
        <View style={styles.badge}><Text style={styles.badgeText}>{host(item.url).slice(0,1).toUpperCase()}</Text></View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={1}>{item.title?.trim()||host(item.url)}</Text>
          <Text style={styles.rowHost} numberOfLines={1}>{host(item.url)}</Text>
          {tab==='bookmarks'&&<Text style={styles.hint}>ضغط مطوّل للإزالة</Text>}
        </View>
      </Pressable>)}
    </ScrollView>
  </SafeAreaView>;
}

const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:'#070B14'},header:{height:62,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:'#1E293B'},back:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#111827'},backText:{color:'#fff',fontSize:32,lineHeight:34},title:{color:'#F8FAFC',fontSize:20,fontWeight:'900'},spacer:{width:42},tabs:{flexDirection:'row',gap:8,padding:14},tab:{flex:1,height:44,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#111827',borderWidth:1,borderColor:'#1E293B'},tabActive:{backgroundColor:'#312E81',borderColor:'#7C3AED'},tabText:{color:'#94A3B8',fontWeight:'800'},tabTextActive:{color:'#F5F3FF'},clear:{alignSelf:'flex-start',marginHorizontal:14,marginBottom:4,paddingHorizontal:12,paddingVertical:8,borderRadius:10,backgroundColor:'#2A1020'},clearText:{color:'#FDA4AF',fontWeight:'800'},content:{padding:14,paddingBottom:32,gap:10},row:{minHeight:78,flexDirection:'row',alignItems:'center',gap:12,padding:13,borderRadius:18,backgroundColor:'#0F172A',borderWidth:1,borderColor:'#1E293B'},badge:{width:44,height:44,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#312E81'},badgeText:{color:'#EDE9FE',fontWeight:'900',fontSize:18},rowBody:{flex:1},rowTitle:{color:'#F8FAFC',fontSize:15,fontWeight:'800',textAlign:'right'},rowHost:{marginTop:3,color:'#64748B',fontSize:11,textAlign:'right'},hint:{marginTop:4,color:'#475569',fontSize:10,textAlign:'right'},empty:{marginTop:80,alignItems:'center',paddingHorizontal:26},emptyTitle:{color:'#F8FAFC',fontSize:18,fontWeight:'900'},emptyText:{marginTop:8,color:'#64748B',lineHeight:20,textAlign:'center'}
});
