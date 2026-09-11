import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { listDownloads } from '@/features/downloads/store';
import { cancelDownload, openDownload, removeDownload, retryDownload } from '@/features/downloads/download-manager';
import type { DownloadItem } from '@/features/downloads/types';

function bytes(value: number | null) {
  if (!value || value <= 0) return '—';
  const units = ['B','KB','MB','GB'];
  let n = value;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n >= 100 || i === 0 ? n.toFixed(0) : n.toFixed(1)} ${units[i]}`;
}

function stateText(item: DownloadItem) {
  if (item.state === 'completed') return 'مكتمل';
  if (item.state === 'downloading') return `${Math.round(item.progress * 100)}%`;
  if (item.state === 'failed') return 'فشل';
  if (item.state === 'cancelled') return 'ملغي';
  return 'بالانتظار';
}

export default function DownloadsScreen() {
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try { setItems(await listDownloads()); } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { void refresh(); return () => {}; }, [refresh]));
  useEffect(() => {
    const id = setInterval(() => void refresh(), 900);
    return () => clearInterval(id);
  }, [refresh]);

  const perform = async (fn: () => Promise<unknown>) => {
    try { await fn(); await refresh(); }
    catch (error) { Alert.alert('التنزيلات', error instanceof Error ? error.message : 'تعذر تنفيذ العملية.'); }
  };

  return (
    <SafeAreaView edges={['top','bottom','left','right']} style={s.root}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.back}><Text style={s.backText}>‹</Text></Pressable>
        <View><Text style={s.title}>التنزيلات</Text><Text style={s.sub}>مركز RAID للتنزيل</Text></View>
        <Pressable onPress={() => void refresh()} style={s.refresh}><Text style={s.refreshText}>↻</Text></Pressable>
      </View>

      {loading ? <View style={s.center}><ActivityIndicator color="#8B5CF6" /></View> : (
        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          {items.length === 0 ? (
            <View style={s.empty}><Text style={s.emptyIcon}>⇩</Text><Text style={s.emptyTitle}>لا توجد تنزيلات بعد</Text><Text style={s.emptyText}>أي ملف تنزّله من RAID Browser سيظهر هنا مع نسبة التقدم والحالة.</Text></View>
          ) : items.map((item) => (
            <View key={item.id} style={s.card}>
              <View style={s.cardTop}>
                <View style={s.fileIcon}><Text style={s.fileIconText}>↓</Text></View>
                <View style={s.fileText}>
                  <Text numberOfLines={1} style={s.fileName}>{item.file_name}</Text>
                  <Text numberOfLines={1} style={s.meta}>{stateText(item)} • {bytes(item.written_bytes)}{item.total_bytes ? ` / ${bytes(item.total_bytes)}` : ''}</Text>
                </View>
              </View>
              <View style={s.track}><View style={[s.progress,{width:`${Math.max(2, Math.round(item.progress * 100))}%`}]} /></View>
              {!!item.error && <Text style={s.error} numberOfLines={2}>{item.error}</Text>}
              <View style={s.actions}>
                {item.state === 'completed' && <Pressable onPress={() => void perform(() => openDownload(item.id))} style={s.action}><Text style={s.actionText}>فتح</Text></Pressable>}
                {item.state === 'downloading' && <Pressable onPress={() => void perform(() => cancelDownload(item.id))} style={s.action}><Text style={s.actionText}>إلغاء</Text></Pressable>}
                {(item.state === 'failed' || item.state === 'cancelled') && <Pressable onPress={() => void perform(() => retryDownload(item.id))} style={s.action}><Text style={s.actionText}>إعادة</Text></Pressable>}
                <Pressable onPress={() => void perform(() => removeDownload(item.id, item.state === 'completed'))} style={[s.action,s.danger]}><Text style={s.actionText}>حذف</Text></Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:'#070B14'},header:{minHeight:68,paddingHorizontal:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:'#1F2937'},back:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#111827'},backText:{fontSize:32,color:'#fff',marginTop:-4},refresh:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#111827'},refreshText:{fontSize:23,color:'#C4B5FD'},title:{color:'#fff',fontSize:21,fontWeight:'900',textAlign:'center'},sub:{color:'#7C8699',fontSize:11,textAlign:'center',marginTop:2},body:{padding:16,gap:12,paddingBottom:40},center:{flex:1,alignItems:'center',justifyContent:'center'},empty:{marginTop:80,padding:30,borderRadius:28,backgroundColor:'#101725',borderWidth:1,borderColor:'#26324A',alignItems:'center'},emptyIcon:{fontSize:42,color:'#8B5CF6'},emptyTitle:{marginTop:12,color:'#fff',fontSize:20,fontWeight:'900'},emptyText:{marginTop:8,color:'#94A3B8',textAlign:'center',lineHeight:21},card:{padding:16,borderRadius:22,backgroundColor:'#101725',borderWidth:1,borderColor:'#26324A'},cardTop:{flexDirection:'row-reverse',gap:12,alignItems:'center'},fileIcon:{width:46,height:46,borderRadius:15,backgroundColor:'#172033',alignItems:'center',justifyContent:'center'},fileIconText:{color:'#8B5CF6',fontSize:24,fontWeight:'900'},fileText:{flex:1},fileName:{color:'#F8FAFC',fontWeight:'900',fontSize:14,textAlign:'right'},meta:{marginTop:5,color:'#94A3B8',fontSize:11,textAlign:'right'},track:{height:5,borderRadius:99,backgroundColor:'#1F2937',marginTop:14,overflow:'hidden'},progress:{height:'100%',borderRadius:99,backgroundColor:'#8B5CF6'},error:{marginTop:9,color:'#FCA5A5',fontSize:11,textAlign:'right'},actions:{flexDirection:'row-reverse',gap:8,marginTop:13},action:{height:38,paddingHorizontal:16,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#222B3D'},danger:{backgroundColor:'#3A2027'},actionText:{color:'#F8FAFC',fontWeight:'800',fontSize:12}
});
