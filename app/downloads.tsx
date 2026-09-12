import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { listDownloads } from '@/features/downloads/store';
import { cancelDownload, openDownload, pauseDownload, reconcileInterruptedDownloads, removeDownload, resumeDownload, retryDownload, shareDownload } from '@/features/downloads/download-manager';
import type { DownloadItem } from '@/features/downloads/types';
import { getSetting } from '@/lib/db';
import { getTheme, type ThemeName } from '@/lib/theme';

type Filter = 'all' | 'active' | 'completed' | 'failed';

function bytes(value: number | null) {
  if (!value || value <= 0) return '—';
  const units = ['B','KB','MB','GB'];
  let n = value;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n >= 100 || i === 0 ? n.toFixed(0) : n.toFixed(1)} ${units[i]}`;
}

function eta(value: number | null) {
  if (!value || value <= 0) return '';
  if (value < 60) return `${value}ث`;
  const minutes = Math.ceil(value / 60);
  if (minutes < 60) return `${minutes}د`;
  return `${Math.floor(minutes / 60)}س ${minutes % 60}د`;
}

function hostOf(value:string){try{return new URL(value).hostname.replace(/^www\./,'');}catch{return 'ملف مباشر';}}

function stateText(item: DownloadItem) {
  if (item.state === 'completed') return 'مكتمل';
  if (item.state === 'downloading') return `${Math.round(item.progress * 100)}%`;
  if (item.state === 'paused') return 'متوقف مؤقتًا';
  if (item.state === 'failed') return 'فشل';
  if (item.state === 'cancelled') return 'ملغي';
  return 'بالانتظار';
}

function stateIcon(item: DownloadItem): keyof typeof Ionicons.glyphMap {
  if (item.state === 'completed') return 'checkmark-circle';
  if (item.state === 'paused') return 'pause-circle';
  if (item.state === 'failed') return 'alert-circle';
  if (item.state === 'cancelled') return 'close-circle';
  return 'arrow-down-circle';
}

export default function DownloadsScreen() {
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,setFilter] = useState<Filter>('all');
  const [themeName,setThemeName] = useState<ThemeName>('cinematic');
  const theme = useMemo(()=>getTheme(themeName),[themeName]);

  const refresh = useCallback(async () => {
    try { setItems(await listDownloads()); } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => {
    void Promise.all([
      reconcileInterruptedDownloads().catch(()=>0),
      getSetting<ThemeName>('theme','cinematic').catch(()=>'cinematic' as ThemeName),
    ]).then(([,saved])=>{setThemeName(saved);void refresh();});
    return () => {};
  }, [refresh]));

  useEffect(() => {
    const id = setInterval(() => void refresh(), 900);
    return () => clearInterval(id);
  }, [refresh]);

  const summary = useMemo(() => {
    const active = items.filter(item => item.state === 'downloading' || item.state === 'paused').length;
    const completed = items.filter(item => item.state === 'completed').length;
    const failed = items.filter(item => item.state === 'failed' || item.state === 'cancelled').length;
    const written = items.reduce((sum,item) => sum + (item.written_bytes || 0), 0);
    return { active, completed, failed, written };
  }, [items]);

  const visible = useMemo(()=>items.filter(item=>{
    if(filter==='active')return item.state==='downloading'||item.state==='paused'||item.state==='queued';
    if(filter==='completed')return item.state==='completed';
    if(filter==='failed')return item.state==='failed'||item.state==='cancelled';
    return true;
  }),[items,filter]);

  const perform = async (fn: () => Promise<unknown>) => {
    try { await fn(); await refresh(); }
    catch (error) { Alert.alert('التنزيلات', error instanceof Error ? error.message : 'تعذر تنفيذ العملية.'); }
  };

  const filters:Array<{key:Filter;label:string;count:number;icon:keyof typeof Ionicons.glyphMap}> = [
    {key:'all',label:'الكل',count:items.length,icon:'layers-outline'},
    {key:'active',label:'نشط',count:summary.active,icon:'pulse-outline'},
    {key:'completed',label:'مكتمل',count:summary.completed,icon:'checkmark-circle-outline'},
    {key:'failed',label:'متوقف',count:summary.failed,icon:'alert-circle-outline'},
  ];

  return (
    <SafeAreaView edges={['top','bottom','left','right']} style={[s.root,{backgroundColor:theme.bg}]}>
      <View style={[s.header,{backgroundColor:theme.surface,borderBottomColor:theme.border}]}>
        <Pressable onPress={() => router.back()} style={[s.headerButton,{backgroundColor:theme.surface2,borderColor:theme.border}]}><Ionicons name="chevron-back" size={22} color={theme.text} /></Pressable>
        <View style={s.headerCopy}><Text style={[s.title,{color:theme.text}]}>التنزيلات</Text><Text style={[s.sub,{color:theme.muted}]}>استكمال ذكي • سرعة مباشرة • استعادة بعد الإغلاق</Text></View>
        <Pressable onPress={() => void refresh()} style={[s.headerButton,{backgroundColor:theme.surface2,borderColor:theme.border}]}><Ionicons name="refresh" size={20} color={theme.accent} /></Pressable>
      </View>

      {loading ? <View style={s.center}><ActivityIndicator color={theme.accent} /></View> : (
        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          <View style={s.summary}>
            <View style={[s.summaryItem,{backgroundColor:theme.surface,borderColor:theme.border}]}><Ionicons name="pulse" size={18} color={theme.accent} /><Text style={[s.summaryValue,{color:theme.text}]}>{summary.active}</Text><Text style={[s.summaryLabel,{color:theme.muted}]}>نشط</Text></View>
            <View style={[s.summaryItem,{backgroundColor:theme.surface,borderColor:theme.border}]}><Ionicons name="checkmark-done" size={18} color="#7FB890" /><Text style={[s.summaryValue,{color:theme.text}]}>{summary.completed}</Text><Text style={[s.summaryLabel,{color:theme.muted}]}>مكتمل</Text></View>
            <View style={[s.summaryItem,{backgroundColor:theme.surface,borderColor:theme.border}]}><Ionicons name="alert-circle-outline" size={18} color="#D69080" /><Text style={[s.summaryValue,{color:theme.text}]}>{summary.failed}</Text><Text style={[s.summaryLabel,{color:theme.muted}]}>متوقف</Text></View>
            <View style={[s.summaryItem,{backgroundColor:theme.surface,borderColor:theme.border}]}><Ionicons name="server-outline" size={18} color={theme.muted} /><Text numberOfLines={1} style={[s.summaryValueSmall,{color:theme.text}]}>{bytes(summary.written)}</Text><Text style={[s.summaryLabel,{color:theme.muted}]}>بيانات</Text></View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
            {filters.map(item=>{const active=filter===item.key;return <Pressable key={item.key} onPress={()=>setFilter(item.key)} style={({pressed})=>[s.filter,{backgroundColor:active?theme.accent:theme.surface,borderColor:active?theme.accent:theme.border},pressed&&s.press]}><Ionicons name={item.icon} size={16} color={active?'#fff':theme.muted}/><Text style={[s.filterText,{color:active?'#fff':theme.text}]}>{item.label}</Text><View style={[s.badge,{backgroundColor:active?'rgba(255,255,255,.18)':theme.surface2}]}><Text style={[s.badgeText,{color:active?'#fff':theme.muted}]}>{item.count}</Text></View></Pressable>})}
          </ScrollView>

          {items.length === 0 ? (
            <View style={[s.empty,{backgroundColor:theme.surface,borderColor:theme.border}]}><View style={[s.emptyIcon,{backgroundColor:theme.surface2}]}><Ionicons name="cloud-download-outline" size={34} color={theme.accent} /></View><Text style={[s.emptyTitle,{color:theme.text}]}>لا توجد تنزيلات بعد</Text><Text style={[s.emptyText,{color:theme.muted}]}>عندما يبدأ RAID تنزيل ملف سيظهر هنا مع السرعة والوقت المتبقي والتحكم الكامل.</Text></View>
          ) : visible.length===0 ? (
            <View style={[s.empty,{backgroundColor:theme.surface,borderColor:theme.border}]}><Ionicons name="filter-outline" size={30} color={theme.accent}/><Text style={[s.emptyTitle,{color:theme.text}]}>لا توجد عناصر هنا</Text><Text style={[s.emptyText,{color:theme.muted}]}>غيّر الفلتر لعرض بقية التنزيلات.</Text></View>
          ) : visible.map((item) => {
            const remaining = eta(item.eta_seconds);
            const liveMeta = item.state === 'downloading' && item.speed_bps > 0
              ? `${bytes(item.speed_bps)}/ث${remaining ? ` • متبقٍ ${remaining}` : ''}`
              : stateText(item);
            return <View key={item.id} style={[s.card,{backgroundColor:theme.surface,borderColor:theme.border}]}>
              <View style={s.cardTop}>
                <View style={[s.fileIcon,{backgroundColor:theme.surface2}]}><Ionicons name={stateIcon(item)} size={25} color={item.state === 'completed' ? '#7FB890' : item.state === 'failed' ? '#D69080' : theme.accent} /></View>
                <View style={s.fileText}>
                  <Text numberOfLines={1} style={[s.fileName,{color:theme.text}]}>{item.file_name}</Text>
                  <Text numberOfLines={1} style={[s.host,{color:theme.muted}]}>{hostOf(item.url)}</Text>
                  <Text numberOfLines={1} style={[s.meta,{color:theme.accent}]}>{liveMeta}</Text>
                  <Text numberOfLines={1} style={[s.sizeMeta,{color:theme.muted}]}>{bytes(item.written_bytes)}{item.total_bytes ? ` من ${bytes(item.total_bytes)}` : ''}</Text>
                </View>
                <Text style={[s.percent,{color:theme.text}]}>{item.state === 'completed' ? '100%' : `${Math.round(item.progress * 100)}%`}</Text>
              </View>
              <View style={[s.track,{backgroundColor:theme.surface2}]}><View style={[s.progress,{backgroundColor:theme.accent,width:`${Math.max(item.state === 'completed' ? 100 : 2, Math.round(item.progress * 100))}%`}]} /></View>
              {!!item.error && <View style={s.errorRow}><Ionicons name="warning-outline" size={15} color="#E1A091" /><Text style={s.error} numberOfLines={3}>{item.error}</Text></View>}
              <View style={s.actions}>
                {item.state === 'completed' && <Pressable onPress={() => void perform(() => openDownload(item.id))} style={[s.action,{backgroundColor:theme.surface2,borderColor:theme.border}]}><Ionicons name="open-outline" size={16} color={theme.text} /><Text style={[s.actionText,{color:theme.text}]}>فتح</Text></Pressable>}
                {item.state === 'completed' && <Pressable onPress={() => void perform(() => shareDownload(item.id))} style={[s.action,{backgroundColor:theme.surface2,borderColor:theme.border}]}><Ionicons name="share-social-outline" size={16} color={theme.text} /><Text style={[s.actionText,{color:theme.text}]}>مشاركة</Text></Pressable>}
                {item.state === 'downloading' && <Pressable onPress={() => void perform(() => pauseDownload(item.id))} style={[s.action,{backgroundColor:theme.surface2,borderColor:theme.border}]}><Ionicons name="pause" size={16} color={theme.text} /><Text style={[s.actionText,{color:theme.text}]}>إيقاف</Text></Pressable>}
                {item.state === 'paused' && <Pressable onPress={() => void perform(() => resumeDownload(item.id))} style={[s.action,{backgroundColor:theme.accent,borderColor:theme.accent}]}><Ionicons name="play" size={16} color="#fff" /><Text style={s.primaryText}>استكمال</Text></Pressable>}
                {(item.state === 'failed' || item.state === 'cancelled') && <Pressable onPress={() => void perform(() => retryDownload(item.id))} style={[s.action,{backgroundColor:theme.accent,borderColor:theme.accent}]}><Ionicons name="refresh" size={16} color="#fff" /><Text style={s.primaryText}>إعادة</Text></Pressable>}
                {(item.state === 'downloading' || item.state === 'paused') && <Pressable onPress={() => void perform(() => cancelDownload(item.id))} style={[s.action,{backgroundColor:theme.surface2,borderColor:theme.border}]}><Ionicons name="close" size={17} color={theme.text} /><Text style={[s.actionText,{color:theme.text}]}>إلغاء</Text></Pressable>}
                <Pressable onPress={() => void perform(() => removeDownload(item.id, item.state === 'completed'))} style={[s.action,s.danger]}><Ionicons name="trash-outline" size={16} color="#F2D2CB" /><Text style={s.dangerText}>حذف</Text></Pressable>
              </View>
            </View>;
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:{flex:1},header:{minHeight:72,paddingHorizontal:16,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1},headerButton:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',borderWidth:1},headerCopy:{flex:1},title:{fontSize:21,fontWeight:'900',textAlign:'right'},sub:{fontSize:10,textAlign:'right',marginTop:3},body:{padding:16,gap:12,paddingBottom:42},center:{flex:1,alignItems:'center',justifyContent:'center'},summary:{flexDirection:'row-reverse',gap:8},summaryItem:{flex:1,minHeight:86,borderRadius:20,borderWidth:1,alignItems:'center',justifyContent:'center',paddingHorizontal:5,gap:2},summaryValue:{fontWeight:'900',fontSize:17,textAlign:'center'},summaryValueSmall:{fontWeight:'900',fontSize:11,textAlign:'center'},summaryLabel:{fontSize:9,textAlign:'center'},filters:{gap:8,paddingVertical:2},filter:{height:40,borderRadius:14,borderWidth:1,paddingHorizontal:11,flexDirection:'row-reverse',alignItems:'center',gap:6},filterText:{fontWeight:'800',fontSize:11},badge:{minWidth:22,height:22,borderRadius:9,alignItems:'center',justifyContent:'center',paddingHorizontal:5},badgeText:{fontSize:9,fontWeight:'900'},empty:{marginTop:28,padding:30,borderRadius:28,borderWidth:1,alignItems:'center'},emptyIcon:{width:66,height:66,borderRadius:22,alignItems:'center',justifyContent:'center'},emptyTitle:{marginTop:14,fontSize:20,fontWeight:'900'},emptyText:{marginTop:8,textAlign:'center',lineHeight:21},card:{padding:16,borderRadius:24,borderWidth:1},cardTop:{flexDirection:'row-reverse',gap:12,alignItems:'center'},fileIcon:{width:48,height:48,borderRadius:16,alignItems:'center',justifyContent:'center'},fileText:{flex:1},fileName:{fontWeight:'900',fontSize:14,textAlign:'right'},host:{marginTop:2,fontSize:9,textAlign:'right'},meta:{marginTop:4,fontSize:11,fontWeight:'800',textAlign:'right'},sizeMeta:{marginTop:3,fontSize:10,textAlign:'right'},percent:{fontWeight:'900',fontSize:12},track:{height:6,borderRadius:99,marginTop:14,overflow:'hidden'},progress:{height:'100%',borderRadius:99},errorRow:{marginTop:10,flexDirection:'row-reverse',gap:6,alignItems:'center'},error:{flex:1,color:'#E1A091',fontSize:11,textAlign:'right'},actions:{flexDirection:'row-reverse',flexWrap:'wrap',gap:8,marginTop:14},action:{height:39,paddingHorizontal:14,borderRadius:13,alignItems:'center',justifyContent:'center',borderWidth:1,flexDirection:'row-reverse',gap:6},danger:{backgroundColor:'#4A3230',borderColor:'#67423E'},actionText:{fontWeight:'800',fontSize:11},primaryText:{color:'#fff',fontWeight:'900',fontSize:11},dangerText:{color:'#F2D2CB',fontWeight:'800',fontSize:11},press:{transform:[{scale:.985}],opacity:.86}
});
