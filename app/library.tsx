import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { clearHistory, getBookmarks, getHistory, getSetting, removeBookmark, removeHistoryEntry } from '@/lib/db';
import { getTheme, isThemeName, ThemeName } from '@/lib/theme';

type Bookmark = { id:number; url:string; title:string; created_at:number };
type HistoryItem = { id:number; url:string; title:string; visited_at:number };

function host(url:string){try{return new URL(url).hostname.replace(/^www\./,'');}catch{return url;}}
function open(url:string){router.push({ pathname:'/browser', params:{ url } });}

export default function LibraryScreen(){
  const params=useLocalSearchParams<{tab?:string}>();
  const requestedTab=params.tab==='history'?'history':'bookmarks';
  const [bookmarks,setBookmarks]=useState<Bookmark[]>([]);
  const [history,setHistory]=useState<HistoryItem[]>([]);
  const [tab,setTab]=useState<'bookmarks'|'history'>(requestedTab);
  const [themeName,setThemeName]=useState<ThemeName>('cinematic');
  const [loading,setLoading]=useState(true);
  const [refreshError,setRefreshError]=useState(false);
  const loadInFlight=useRef(false);
  const mutationInFlight=useRef(false);
  const [mutating,setMutating]=useState(false);
  const theme=useMemo(()=>getTheme(themeName),[themeName]);

  const load=useCallback(async()=>{
    if(loadInFlight.current)return;
    loadInFlight.current=true;
    try{
      const [b,h]=await Promise.all([getBookmarks(),getHistory(150)]);
      setBookmarks(b); setHistory(h); setRefreshError(false);
    }catch{
      setRefreshError(true);
    }finally{
      loadInFlight.current=false;
      setLoading(false);
    }
  },[]);

  useEffect(()=>setTab(requestedTab),[requestedTab]);
  useFocusEffect(useCallback(()=>{
    void load();
    void getSetting<ThemeName>('theme','cinematic').then(value=>setThemeName(isThemeName(value)?value:'cinematic')).catch(()=>setThemeName('cinematic'));
  },[load]));

  const runMutation=async(operation:()=>Promise<void>,applyResult:()=>void,failureMessage:string)=>{
    if(mutationInFlight.current)return;
    mutationInFlight.current=true;
    setMutating(true);
    try{
      await operation();
      applyResult();
    }catch{
      Alert.alert('تعذر تعديل المكتبة',failureMessage);
    }finally{
      mutationInFlight.current=false;
      setMutating(false);
    }
  };

  const deleteBookmark=(url:string)=>{
    Alert.alert('إزالة من المفضلة','هل تريد إزالة هذا الموقع؟',[
      {text:'إلغاء',style:'cancel'},
      {text:'إزالة',style:'destructive',onPress:()=>void runMutation(
        ()=>removeBookmark(url),
        ()=>setBookmarks(items=>items.filter(item=>item.url!==url)),
        'لم تتم إزالة الموقع من المفضلة. حاول مرة أخرى.',
      )},
    ]);
  };

  const wipeHistory=()=>{
    Alert.alert('مسح السجل','سيتم حذف سجل التصفح المحلي بالكامل.',[
      {text:'إلغاء',style:'cancel'},
      {text:'مسح',style:'destructive',onPress:()=>void runMutation(
        clearHistory,
        ()=>setHistory([]),
        'لم يتم مسح سجل التصفح. حاول مرة أخرى.',
      )},
    ]);
  };

  const deleteHistoryEntry=(id:number)=>{
    Alert.alert('حذف من السجل','هل تريد حذف هذه الزيارة فقط؟',[
      {text:'إلغاء',style:'cancel'},
      {text:'حذف',style:'destructive',onPress:()=>void runMutation(
        ()=>removeHistoryEntry(id),
        ()=>setHistory(items=>items.filter(item=>item.id!==id)),
        'لم تُحذف الزيارة من السجل. حاول مرة أخرى.',
      )},
    ]);
  };

  const rows=tab==='bookmarks'?bookmarks:history;

  return <SafeAreaView edges={['top','bottom','left','right']} style={[styles.root,{backgroundColor:theme.bg}]}>
    <View style={[styles.header,{borderBottomColor:theme.border}]}>
      <Pressable onPress={()=>router.back()} accessibilityRole="button" accessibilityLabel="رجوع" style={[styles.back,{backgroundColor:theme.surface}]}><Text style={[styles.backText,{color:theme.text}]}>‹</Text></Pressable>
      <Text style={[styles.title,{color:theme.text}]}>المكتبة</Text>
      <View style={styles.spacer}/>
    </View>

    <View style={styles.tabs}>
      <Pressable onPress={()=>setTab('bookmarks')} accessibilityRole="tab" accessibilityState={{selected:tab==='bookmarks'}} style={[styles.tab,{backgroundColor:tab==='bookmarks'?theme.surface2:theme.surface,borderColor:tab==='bookmarks'?theme.accent:theme.border}]}><Text style={[styles.tabText,{color:tab==='bookmarks'?theme.text:theme.muted}]}>المفضلة {bookmarks.length}</Text></Pressable>
      <Pressable onPress={()=>setTab('history')} accessibilityRole="tab" accessibilityState={{selected:tab==='history'}} style={[styles.tab,{backgroundColor:tab==='history'?theme.surface2:theme.surface,borderColor:tab==='history'?theme.accent:theme.border}]}><Text style={[styles.tabText,{color:tab==='history'?theme.text:theme.muted}]}>السجل {history.length}</Text></Pressable>
    </View>

    {refreshError&&<View style={[styles.refreshError,{backgroundColor:theme.surface,borderColor:theme.border}]}>
      <Text style={[styles.refreshErrorText,{color:theme.text}]}>{bookmarks.length||history.length?'تعذر تحديث المكتبة. البيانات الظاهرة محفوظة وقد تكون أقدم قليلًا.':'تعذر قراءة المفضلة والسجل الآن.'}</Text>
      <Pressable onPress={()=>void load()} accessibilityRole="button" accessibilityLabel="إعادة محاولة تحديث المكتبة" style={[styles.retry,{backgroundColor:theme.surface2,borderColor:theme.border}]}><Text style={[styles.retryText,{color:theme.accent}]}>إعادة المحاولة</Text></Pressable>
    </View>}

    {tab==='history'&&history.length>0&&<Pressable disabled={mutating} onPress={wipeHistory} accessibilityRole="button" accessibilityLabel="مسح سجل التصفح بالكامل" accessibilityState={{disabled:mutating}} style={[styles.clear,mutating&&styles.disabled]}><Text style={styles.clearText}>مسح السجل</Text></Pressable>}

    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {loading&&rows.length===0?<View style={styles.empty}><ActivityIndicator color={theme.accent}/><Text style={[styles.emptyText,{color:theme.muted}]}>جاري تحميل المكتبة…</Text></View>:rows.length===0&&!refreshError?<View style={styles.empty}><Text style={[styles.emptyTitle,{color:theme.text}]}>{tab==='bookmarks'?'لا توجد مواقع محفوظة':'السجل فارغ'}</Text><Text style={[styles.emptyText,{color:theme.muted}]}>{tab==='bookmarks'?'احفظ أي صفحة من زر النجمة داخل المتصفح.':'المواقع التي تزورها في الوضع العادي ستظهر هنا.'}</Text></View>:
      rows.map((item)=><Pressable key={`${tab}-${item.id}`} disabled={mutating} accessibilityRole="button" accessibilityState={{disabled:mutating}} accessibilityLabel={`${item.title?.trim()||host(item.url)}، ${tab==='bookmarks'?'ضغط مطوّل للإزالة من المفضلة':'ضغط مطوّل للحذف من السجل'}`} onPress={()=>open(item.url)} onLongPress={()=>tab==='bookmarks'?deleteBookmark(item.url):deleteHistoryEntry(item.id)} style={[styles.row,{backgroundColor:theme.surface,borderColor:theme.border},mutating&&styles.disabled]}>
        <View style={[styles.badge,{backgroundColor:theme.surface2}]}><Text style={[styles.badgeText,{color:theme.accent}]}>{host(item.url).slice(0,1).toUpperCase()}</Text></View>
        <View style={styles.rowBody}>
          <Text style={[styles.rowTitle,{color:theme.text}]} numberOfLines={1}>{item.title?.trim()||host(item.url)}</Text>
          <Text style={[styles.rowHost,{color:theme.muted}]} numberOfLines={1}>{host(item.url)}</Text>
          <Text style={[styles.hint,{color:theme.muted}]}>{tab==='bookmarks'?'ضغط مطوّل للإزالة':'ضغط مطوّل للحذف'}</Text>
        </View>
      </Pressable>)}
    </ScrollView>
  </SafeAreaView>;
}

const styles=StyleSheet.create({
  root:{flex:1},header:{height:62,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:14,borderBottomWidth:1},back:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center'},backText:{fontSize:32,lineHeight:34},title:{fontSize:20,fontWeight:'900'},spacer:{width:42},tabs:{flexDirection:'row',gap:8,padding:14},tab:{flex:1,height:44,borderRadius:14,alignItems:'center',justifyContent:'center',borderWidth:1},tabText:{fontWeight:'800'},refreshError:{marginHorizontal:14,marginBottom:10,minHeight:58,borderRadius:16,borderWidth:1,padding:10,flexDirection:'row-reverse',alignItems:'center',gap:10},refreshErrorText:{flex:1,fontSize:11,lineHeight:17,fontWeight:'700',textAlign:'right'},retry:{minHeight:38,paddingHorizontal:11,borderRadius:12,borderWidth:1,alignItems:'center',justifyContent:'center'},retryText:{fontSize:10,fontWeight:'900'},clear:{alignSelf:'flex-start',marginHorizontal:14,marginBottom:4,paddingHorizontal:12,paddingVertical:8,borderRadius:10,backgroundColor:'#2A1020'},clearText:{color:'#FDA4AF',fontWeight:'800'},disabled:{opacity:.45},content:{padding:14,paddingBottom:32,gap:10},row:{minHeight:78,flexDirection:'row',alignItems:'center',gap:12,padding:13,borderRadius:18,borderWidth:1},badge:{width:44,height:44,borderRadius:14,alignItems:'center',justifyContent:'center'},badgeText:{fontWeight:'900',fontSize:18},rowBody:{flex:1},rowTitle:{fontSize:15,fontWeight:'800',textAlign:'right'},rowHost:{marginTop:3,fontSize:11,textAlign:'right'},hint:{marginTop:4,fontSize:10,textAlign:'right',opacity:.72},empty:{marginTop:80,alignItems:'center',paddingHorizontal:26},emptyTitle:{fontSize:18,fontWeight:'900'},emptyText:{marginTop:8,lineHeight:20,textAlign:'center'}
});
