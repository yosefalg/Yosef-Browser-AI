import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { listDownloads } from '@/features/downloads/store';
import { cancelDownload, openDownload, pauseDownload, removeDownload, resumeDownload, retryDownload } from '@/features/downloads/download-manager';
import type { DownloadItem } from '@/features/downloads/types';

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

  const refresh = useCallback(async () => {
    try { setItems(await listDownloads()); } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { void refresh(); return () => {}; }, [refresh]));
  useEffect(() => {
    const id = setInterval(() => void refresh(), 800);
    return () => clearInterval(id);
  }, [refresh]);

  const summary = useMemo(() => {
    const active = items.filter(item => item.state === 'downloading' || item.state === 'paused').length;
    const completed = items.filter(item => item.state === 'completed').length;
    const failed = items.filter(item => item.state === 'failed').length;
    const written = items.reduce((sum,item) => sum + (item.written_bytes || 0), 0);
    return { active, completed, failed, written };
  }, [items]);

  const perform = async (fn: () => Promise<unknown>) => {
    try { await fn(); await refresh(); }
    catch (error) { Alert.alert('التنزيلات', error instanceof Error ? error.message : 'تعذر تنفيذ العملية.'); }
  };

  return (
    <SafeAreaView edges={['top','bottom','left','right']} style={s.root}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.headerButton}><Ionicons name="chevron-back" size={22} color="#F7F2EC" /></Pressable>
        <View style={s.headerCopy}><Text style={s.title}>التنزيلات</Text><Text style={s.sub}>سرعة، وقت متبقٍ واستكمال بعد إعادة فتح التطبيق</Text></View>
        <Pressable onPress={() => void refresh()} style={s.headerButton}><Ionicons name="refresh" size={20} color="#D5AA88" /></Pressable>
      </View>

      {loading ? <View style={s.center}><ActivityIndicator color="#D5AA88" /></View> : (
        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          <View style={s.summary}>
            <View style={s.summaryItem}><Ionicons name="pulse" size={18} color="#D5AA88" /><Text style={s.summaryValue}>{summary.active}</Text><Text style={s.summaryLabel}>نشط</Text></View>
            <View style={s.summaryItem}><Ionicons name="checkmark-done" size={18} color="#7FB890" /><Text style={s.summaryValue}>{summary.completed}</Text><Text style={s.summaryLabel}>مكتمل</Text></View>
            <View style={s.summaryItem}><Ionicons name="alert-circle-outline" size={18} color="#D69080" /><Text style={s.summaryValue}>{summary.failed}</Text><Text style={s.summaryLabel}>فشل</Text></View>
            <View style={s.summaryItem}><Ionicons name="server-outline" size={18} color="#C6B7A8" /><Text numberOfLines={1} style={s.summaryValueSmall}>{bytes(summary.written)}</Text><Text style={s.summaryLabel}>بيانات</Text></View>
          </View>

          {items.length === 0 ? (
            <View style={s.empty}><View style={s.emptyIcon}><Ionicons name="cloud-download-outline" size={34} color="#D5AA88" /></View><Text style={s.emptyTitle}>لا توجد تنزيلات بعد</Text><Text style={s.emptyText}>عندما يبدأ RAID تنزيل ملف سيظهر هنا مع السرعة والوقت المتبقي والتحكم الكامل.</Text></View>
          ) : items.map((item) => {
            const remaining = eta(item.eta_seconds);
            const liveMeta = item.state === 'downloading' && item.speed_bps > 0
              ? `${bytes(item.speed_bps)}/ث${remaining ? ` • متبقٍ ${remaining}` : ''}`
              : stateText(item);
            return <View key={item.id} style={s.card}>
              <View style={s.cardTop}>
                <View style={s.fileIcon}><Ionicons name={stateIcon(item)} size={25} color={item.state === 'completed' ? '#7FB890' : item.state === 'failed' ? '#D69080' : '#D5AA88'} /></View>
                <View style={s.fileText}>
                  <Text numberOfLines={1} style={s.fileName}>{item.file_name}</Text>
                  <Text numberOfLines={1} style={s.meta}>{liveMeta}</Text>
                  <Text numberOfLines={1} style={s.sizeMeta}>{bytes(item.written_bytes)}{item.total_bytes ? ` من ${bytes(item.total_bytes)}` : ''}</Text>
                </View>
                <Text style={s.percent}>{item.state === 'completed' ? '100%' : `${Math.round(item.progress * 100)}%`}</Text>
              </View>
              <View style={s.track}><View style={[s.progress,{width:`${Math.max(item.state === 'completed' ? 100 : 2, Math.round(item.progress * 100))}%`}]} /></View>
              {!!item.error && <View style={s.errorRow}><Ionicons name="warning-outline" size={15} color="#E1A091" /><Text style={s.error} numberOfLines={2}>{item.error}</Text></View>}
              <View style={s.actions}>
                {item.state === 'completed' && <Pressable onPress={() => void perform(() => openDownload(item.id))} style={s.action}><Ionicons name="open-outline" size={16} color="#F7F2EC" /><Text style={s.actionText}>فتح</Text></Pressable>}
                {item.state === 'downloading' && <Pressable onPress={() => void perform(() => pauseDownload(item.id))} style={s.action}><Ionicons name="pause" size={16} color="#F7F2EC" /><Text style={s.actionText}>إيقاف</Text></Pressable>}
                {item.state === 'paused' && <Pressable onPress={() => void perform(() => resumeDownload(item.id))} style={[s.action,s.primary]}><Ionicons name="play" size={16} color="#201C18" /><Text style={s.primaryText}>استكمال</Text></Pressable>}
                {(item.state === 'failed' || item.state === 'cancelled') && <Pressable onPress={() => void perform(() => retryDownload(item.id))} style={[s.action,s.primary]}><Ionicons name="refresh" size={16} color="#201C18" /><Text style={s.primaryText}>إعادة</Text></Pressable>}
                {(item.state === 'downloading' || item.state === 'paused') && <Pressable onPress={() => void perform(() => cancelDownload(item.id))} style={s.action}><Ionicons name="close" size={17} color="#F7F2EC" /><Text style={s.actionText}>إلغاء</Text></Pressable>}
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
  root:{flex:1,backgroundColor:'#1D201F'},header:{minHeight:72,paddingHorizontal:16,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1,borderBottomColor:'#4B4D48',backgroundColor:'#252826'},headerButton:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#343735',borderWidth:1,borderColor:'#555750'},headerCopy:{flex:1},title:{color:'#F7F2EC',fontSize:21,fontWeight:'900',textAlign:'right'},sub:{color:'#BFB6AC',fontSize:10,textAlign:'right',marginTop:3},body:{padding:16,gap:12,paddingBottom:42},center:{flex:1,alignItems:'center',justifyContent:'center'},summary:{flexDirection:'row-reverse',gap:8},summaryItem:{flex:1,minHeight:86,borderRadius:20,backgroundColor:'#303330',borderWidth:1,borderColor:'#50524D',alignItems:'center',justifyContent:'center',paddingHorizontal:5,gap:2},summaryValue:{color:'#F7F2EC',fontWeight:'900',fontSize:17,textAlign:'center'},summaryValueSmall:{color:'#F7F2EC',fontWeight:'900',fontSize:11,textAlign:'center'},summaryLabel:{color:'#AFA79E',fontSize:9,textAlign:'center'},empty:{marginTop:36,padding:30,borderRadius:28,backgroundColor:'#303330',borderWidth:1,borderColor:'#50524D',alignItems:'center'},emptyIcon:{width:66,height:66,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:'#3D3F3B'},emptyTitle:{marginTop:14,color:'#F7F2EC',fontSize:20,fontWeight:'900'},emptyText:{marginTop:8,color:'#B9B0A7',textAlign:'center',lineHeight:21},card:{padding:16,borderRadius:24,backgroundColor:'#303330',borderWidth:1,borderColor:'#50524D'},cardTop:{flexDirection:'row-reverse',gap:12,alignItems:'center'},fileIcon:{width:48,height:48,borderRadius:16,backgroundColor:'#3D3F3B',alignItems:'center',justifyContent:'center'},fileText:{flex:1},fileName:{color:'#F7F2EC',fontWeight:'900',fontSize:14,textAlign:'right'},meta:{marginTop:4,color:'#D5AA88',fontSize:11,fontWeight:'800',textAlign:'right'},sizeMeta:{marginTop:3,color:'#AFA79E',fontSize:10,textAlign:'right'},percent:{color:'#E7DDD3',fontWeight:'900',fontSize:12},track:{height:6,borderRadius:99,backgroundColor:'#444741',marginTop:14,overflow:'hidden'},progress:{height:'100%',borderRadius:99,backgroundColor:'#D5AA88'},errorRow:{marginTop:10,flexDirection:'row-reverse',gap:6,alignItems:'center'},error:{flex:1,color:'#E1A091',fontSize:11,textAlign:'right'},actions:{flexDirection:'row-reverse',flexWrap:'wrap',gap:8,marginTop:14},action:{height:39,paddingHorizontal:14,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:'#40433F',borderWidth:1,borderColor:'#575952',flexDirection:'row-reverse',gap:6},primary:{backgroundColor:'#D5AA88',borderColor:'#D5AA88'},danger:{backgroundColor:'#4A3230',borderColor:'#67423E'},actionText:{color:'#F7F2EC',fontWeight:'800',fontSize:11},primaryText:{color:'#201C18',fontWeight:'900',fontSize:11},dangerText:{color:'#F2D2CB',fontWeight:'800',fontSize:11}
});
