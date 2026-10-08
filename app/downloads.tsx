import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { listDownloads } from '@/features/downloads/store';
import { cancelDownload, openDownload, pauseDownload, reconcileInterruptedDownloads, removeDownload, renameDownload, resumeDownload, retryDownload, shareDownload } from '@/features/downloads/download-manager';
import type { DownloadItem } from '@/features/downloads/types';
import { getSetting } from '@/lib/db';
import { getTheme, isThemeName, type ThemeName } from '@/lib/theme';

type Filter = 'all' | 'active' | 'completed' | 'failed';
type KindFilter = 'all' | 'media' | 'documents' | 'apps' | 'archives' | 'other';

function downloadKind(item:DownloadItem):Exclude<KindFilter,'all'>{
  const mimeType=item.mime_type?.toLowerCase()||'';
  if(mimeType.startsWith('audio/')||mimeType.startsWith('video/')||mimeType.startsWith('image/'))return 'media';
  if(mimeType.startsWith('text/')||['application/pdf','application/json','application/xml','application/epub+zip'].includes(mimeType))return 'documents';
  if(['application/vnd.android.package-archive','application/x-msdownload'].includes(mimeType))return 'apps';
  if(['application/zip','application/x-rar-compressed','application/x-7z-compressed','application/gzip','application/x-tar'].includes(mimeType))return 'archives';
  const candidates=[item.file_name,item.url].flatMap((value)=>{
    const raw=String(value||'').toLowerCase();
    try {
      const parsed=new URL(raw);
      return [decodeURIComponent(parsed.pathname),raw.split(/[?#]/)[0]];
    } catch {
      try { return [decodeURIComponent(raw.split(/[?#]/)[0])]; } catch { return [raw.split(/[?#]/)[0]]; }
    }
  });
  const matches=(extensions:string[])=>candidates.some((value)=>extensions.some((extension)=>value.endsWith(`.${extension}`)));
  if(matches(['mp4','m4v','webm','mkv','mov','avi','mp3','wav','flac','ogg']))return 'media';
  if(matches(['pdf','epub','mobi','doc','docx','xls','xlsx','ppt','pptx','csv','txt']))return 'documents';
  if(matches(['apk','aab','xapk','apks','exe','msi','dmg','deb','rpm']))return 'apps';
  if(matches(['zip','rar','7z','tar','gz','tgz','bz2','xz','iso']))return 'archives';
  return 'other';
}

function raidViewerKind(item: DownloadItem):'text'|'image'|null {
  const name = String(item.file_name || '').toLowerCase().split(/[?#]/)[0];
  if(['.txt','.md','.json','.csv','.log','.xml','.html','.htm','.css','.js','.ts'].some(extension => name.endsWith(extension)))return 'text';
  if(['.jpg','.jpeg','.png','.webp'].some(extension => name.endsWith(extension)))return 'image';
  const mimeType=item.mime_type?.toLowerCase()||'';
  if(['image/jpeg','image/png','image/webp'].includes(mimeType))return 'image';
  if(mimeType.startsWith('text/')||['application/json','application/xml','application/xhtml+xml','application/javascript'].includes(mimeType))return 'text';
  return null;
}

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

function downloadExtension(fileName: string) {
  return fileName.match(/(\.[a-z0-9]{1,10})$/i)?.[1] || '';
}

function editableDownloadName(fileName: string) {
  const extension = downloadExtension(fileName);
  return extension ? fileName.slice(0, -extension.length) : fileName;
}

function searchableDownloadText(item: DownloadItem) {
  const rawUrl = String(item.url || '');
  let decodedUrl = rawUrl;
  try { decodedUrl = decodeURIComponent(rawUrl); } catch {}
  return `${item.file_name || ''} ${hostOf(rawUrl)} ${decodedUrl}`.toLocaleLowerCase('ar');
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
  const [refreshError, setRefreshError] = useState(false);
  const [filter,setFilter] = useState<Filter>('all');
  const [kindFilter,setKindFilter] = useState<KindFilter>('all');
  const [query,setQuery] = useState('');
  const [renameTarget,setRenameTarget] = useState<DownloadItem|null>(null);
  const [renameValue,setRenameValue] = useState('');
  const [themeName,setThemeName] = useState<ThemeName>('cinematic');
  const [operationBusy,setOperationBusy] = useState(false);
  const refreshInFlight = useRef(false);
  const operationInFlight = useRef(false);
  const hasRunningDownloads = useRef(false);
  const theme = useMemo(()=>getTheme(themeName),[themeName]);

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      const nextItems = await listDownloads();
      hasRunningDownloads.current = nextItems.some(item => item.state === 'downloading' || item.state === 'queued');
      setItems(nextItems);
      setRefreshError(false);
    } catch {
      setRefreshError(true);
    } finally {
      refreshInFlight.current = false;
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    let focused = true;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const clearPoll = () => {
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = null;
    };

    const schedulePoll = () => {
      clearPoll();
      if (!focused || AppState.currentState !== 'active') return;
      pollTimer = setTimeout(() => {
        pollTimer = null;
        void refresh().finally(schedulePoll);
      }, hasRunningDownloads.current ? 900 : 5000);
    };

    const refreshAndSchedule = () => {
      void refresh().finally(schedulePoll);
    };

    void Promise.all([
      reconcileInterruptedDownloads().catch(()=>0),
      getSetting<ThemeName>('theme','cinematic').catch(()=>'cinematic' as ThemeName),
    ]).then(([,saved])=>{
      if (!focused) return;
      setThemeName(isThemeName(saved)?saved:'cinematic');
      refreshAndSchedule();
    });

    const appStateSubscription = AppState.addEventListener('change', state => {
      clearPoll();
      if (focused && state === 'active') refreshAndSchedule();
    });

    return () => {
      focused = false;
      clearPoll();
      appStateSubscription.remove();
    };
  }, [refresh]));

  const summary = useMemo(() => {
    const running = items.filter(item => item.state === 'downloading');
    const paused = items.filter(item => item.state === 'paused');
    const active = running.length + paused.length;
    const completed = items.filter(item => item.state === 'completed').length;
    const failed = items.filter(item => item.state === 'failed' || item.state === 'cancelled').length;
    const written = items.reduce((sum,item) => sum + (item.written_bytes || 0), 0);
    const speed = running.reduce((sum,item) => sum + (item.speed_bps || 0), 0);
    const known = running.filter(item => (item.total_bytes || 0) > 0);
    const knownTotal = known.reduce((sum,item) => sum + (item.total_bytes || 0), 0);
    const knownWritten = known.reduce((sum,item) => sum + Math.min(item.written_bytes || 0, item.total_bytes || 0), 0);
    const remainingBytes = knownTotal > 0 ? Math.max(0, knownTotal - knownWritten) : null;
    const remainingSeconds = remainingBytes !== null && speed > 1 ? Math.ceil(remainingBytes / speed) : null;
    const aggregateProgress = knownTotal > 0 ? Math.min(1, knownWritten / knownTotal) : null;
    const unknownSize = running.length - known.length;
    return { active, running: running.length, paused: paused.length, completed, failed, written, speed, remainingBytes, remainingSeconds, aggregateProgress, unknownSize };
  }, [items]);

  const visible = useMemo(()=>{
    const searchQuery=query.trim().toLocaleLowerCase('ar');
    return items.filter(item=>{
      const stateMatches=filter==='active'?item.state==='downloading'||item.state==='paused'||item.state==='queued':filter==='completed'?item.state==='completed':filter==='failed'?item.state==='failed'||item.state==='cancelled':true;
      const typeMatches=kindFilter==='all'||downloadKind(item)===kindFilter;
      return stateMatches&&typeMatches&&(!searchQuery||searchableDownloadText(item).includes(searchQuery));
    });
  },[items,filter,kindFilter,query]);

  const beginOperation = () => {
    if (operationInFlight.current) return false;
    operationInFlight.current = true;
    setOperationBusy(true);
    return true;
  };

  const endOperation = () => {
    operationInFlight.current = false;
    setOperationBusy(false);
  };

  const perform = async (fn: () => Promise<unknown>) => {
    if (!beginOperation()) return;
    try { await fn(); await refresh(); }
    catch (error) { Alert.alert('التنزيلات', error instanceof Error ? error.message : 'تعذر تنفيذ العملية.'); }
    finally { endOperation(); }
  };

  const openRename = (item: DownloadItem) => {
    if (operationInFlight.current) return;
    setRenameValue(editableDownloadName(item.file_name));
    setRenameTarget(item);
  };

  const submitRename = async () => {
    const item = renameTarget;
    if (!item || !beginOperation()) return;
    try {
      await renameDownload(item.id, renameValue);
      setRenameTarget(null);
      setRenameValue('');
      await refresh();
    } catch (error) {
      Alert.alert('إعادة تسمية الملف', error instanceof Error ? error.message : 'تعذرت إعادة تسمية الملف.');
    } finally {
      endOperation();
    }
  };

  const pauseAll = async () => {
    const ids = items.filter(item => item.state === 'downloading').map(item => item.id);
    if (!ids.length || !beginOperation()) return;
    try {
      const results = await Promise.allSettled(ids.map(id => pauseDownload(id)));
      const failed = results.filter(result => result.status === 'rejected').length;
      await refresh();
      if (failed) Alert.alert('التنزيلات', `تم إيقاف ${ids.length - failed} تنزيل، وتعذر إيقاف ${failed}.`);
    } catch {
      Alert.alert('التنزيلات', 'تعذر إيقاف التنزيلات الآن.');
    } finally {
      endOperation();
    }
  };

  const resumeAll = async () => {
    const ids = items.filter(item => item.state === 'paused').map(item => item.id);
    if (!ids.length || !beginOperation()) return;
    try {
      const results = await Promise.allSettled(ids.map(id => resumeDownload(id)));
      const failed = results.filter(result => result.status === 'rejected').length;
      await refresh();
      if (failed) Alert.alert('التنزيلات', `تم استكمال ${ids.length - failed} تنزيل، وتعذر استكمال ${failed}.`);
    } catch {
      Alert.alert('التنزيلات', 'تعذر استكمال التنزيلات الآن.');
    } finally {
      endOperation();
    }
  };

  const retryAllFailed = async () => {
    const ids = items
      .filter(item => item.state === 'failed' || item.state === 'cancelled')
      .map(item => item.id);
    if (!ids.length || !beginOperation()) return;
    try {
      const results = await Promise.allSettled(ids.map(id => retryDownload(id)));
      const failed = results.filter(result => result.status === 'rejected').length;
      await refresh();
      if (failed) {
        Alert.alert('التنزيلات', `بدأت إعادة ${ids.length - failed} تنزيل، وتعذرت إعادة ${failed}.`);
      }
    } catch {
      Alert.alert('التنزيلات', 'تعذرت إعادة التنزيلات المتوقفة الآن.');
    } finally {
      endOperation();
    }
  };

  const confirmRemove = (item: DownloadItem) => {
    if (operationInFlight.current) return;
    const fileName = item.file_name || 'هذا الملف';
    const message = item.state === 'completed'
      ? `سيتم حذف «${fileName}» من الهاتف وإزالة سجل التنزيل. لا يمكن التراجع عن ذلك.`
      : `سيتم إيقاف «${fileName}» وحذف بياناته الجزئية وإزالة سجل التنزيل.`;
    Alert.alert('حذف التنزيل؟', message, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => void perform(() => removeDownload(item.id, true)) },
    ]);
  };

  const filters:Array<{key:Filter;label:string;count:number;icon:keyof typeof Ionicons.glyphMap}> = [
    {key:'all',label:'الكل',count:items.length,icon:'layers-outline'},
    {key:'active',label:'نشط',count:summary.active,icon:'pulse-outline'},
    {key:'completed',label:'مكتمل',count:summary.completed,icon:'checkmark-circle-outline'},
    {key:'failed',label:'متوقف',count:summary.failed,icon:'alert-circle-outline'},
  ];

  const kindFilters:Array<{key:KindFilter;label:string;icon:keyof typeof Ionicons.glyphMap}> = [
    {key:'all',label:'كل الأنواع',icon:'folder-open-outline'},
    {key:'media',label:'فيديو وصوت',icon:'play-circle-outline'},
    {key:'documents',label:'مستندات',icon:'document-text-outline'},
    {key:'apps',label:'تطبيقات',icon:'apps-outline'},
    {key:'archives',label:'مضغوطات',icon:'archive-outline'},
    {key:'other',label:'أخرى',icon:'ellipsis-horizontal-circle-outline'},
  ];

  const aggregateRemaining = eta(summary.remainingSeconds);

  return (
    <SafeAreaView edges={['top','bottom','left','right']} style={[s.root,{backgroundColor:theme.bg}]}>
      <View style={[s.header,{backgroundColor:theme.surface,borderBottomColor:theme.border}]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="رجوع" style={[s.headerButton,{backgroundColor:theme.surface2,borderColor:theme.border}]}><Ionicons name="chevron-forward" size={22} color={theme.text} /></Pressable>
        <View style={s.headerCopy}><Text style={[s.title,{color:theme.text}]}>التنزيلات</Text><Text style={[s.sub,{color:theme.muted}]}>استكمال ذكي • سرعة مباشرة • استعادة بعد الإغلاق</Text></View>
        <Pressable onPress={() => void refresh()} accessibilityRole="button" accessibilityLabel="تحديث قائمة التنزيلات" style={[s.headerButton,{backgroundColor:theme.surface2,borderColor:theme.border}]}><Ionicons name="refresh" size={20} color={theme.accent} /></Pressable>
      </View>

      {loading ? <View style={s.center}><ActivityIndicator color={theme.accent} /></View> : (
        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          {refreshError && <View style={[s.refreshError,{backgroundColor:theme.surface,borderColor:theme.border}]}>
            <Ionicons name="warning-outline" size={22} color="#E1A091" />
            <View style={s.refreshErrorCopy}><Text style={[s.refreshErrorTitle,{color:theme.text}]}>تعذر تحديث قائمة التنزيلات</Text><Text style={[s.refreshErrorText,{color:theme.muted}]}>{items.length ? 'التنزيلات الظاهرة محفوظة، ويمكنك المحاولة مجددًا.' : 'لم يتمكن RAID من قراءة التنزيلات الآن.'}</Text></View>
            <Pressable onPress={() => void refresh()} accessibilityRole="button" accessibilityLabel="إعادة محاولة تحديث التنزيلات" style={[s.retryRefresh,{backgroundColor:theme.surface2,borderColor:theme.border}]}><Ionicons name="refresh" size={18} color={theme.accent} /></Pressable>
          </View>}
          {summary.active > 0 && <View style={[s.livePanel,{backgroundColor:theme.surface,borderColor:theme.border}]}>
            <View style={s.liveTop}>
              <View style={[s.liveIcon,{backgroundColor:theme.surface2}]}><Ionicons name="speedometer-outline" size={24} color={theme.accent}/></View>
              <View style={s.liveCopy}>
                <Text style={[s.liveTitle,{color:theme.text}]}>حالة التنزيل الآن</Text>
                <Text style={[s.liveSpeed,{color:theme.accent}]}>{summary.speed > 0 ? `${bytes(summary.speed)}/ث` : 'بانتظار تدفق البيانات'}</Text>
              </View>
              <View style={s.liveNumbers}><Text style={[s.liveCount,{color:theme.text}]}>{summary.running}</Text><Text style={[s.liveLabel,{color:theme.muted}]}>يعمل</Text></View>
            </View>
            {summary.remainingBytes !== null && <Text style={[s.liveDetail,{color:theme.muted}]}>متبقٍ {bytes(summary.remainingBytes)}{aggregateRemaining ? ` • تقريبًا ${aggregateRemaining}` : ''}</Text>}
            {summary.unknownSize > 0 && <Text style={[s.liveHint,{color:theme.muted}]}>هناك {summary.unknownSize} تنزيل لا يرسل حجمه الكامل؛ لن يعرض RAID له وقتًا متبقيًا وهميًا.</Text>}
            {summary.aggregateProgress !== null && <View accessible accessibilityRole="progressbar" accessibilityLabel="التقدم الإجمالي للتنزيلات" accessibilityValue={{min:0,max:100,now:Math.round(summary.aggregateProgress*100)}} style={[s.liveTrack,{backgroundColor:theme.surface2}]}><View style={[s.liveProgress,{backgroundColor:theme.accent,width:`${Math.max(2,Math.round(summary.aggregateProgress*100))}%`}]} /></View>}
            <View style={s.bulkActions}>
              {summary.running > 0 && <Pressable disabled={operationBusy} accessibilityRole="button" accessibilityLabel={`إيقاف كل التنزيلات الجارية، ${summary.running}`} accessibilityState={{disabled:operationBusy,busy:operationBusy}} onPress={() => void pauseAll()} style={[s.bulkButton,{backgroundColor:theme.surface2,borderColor:theme.border},operationBusy&&s.disabled]}><Ionicons name="pause" size={16} color={theme.text}/><Text style={[s.bulkText,{color:theme.text}]}>إيقاف الكل</Text></Pressable>}
              {summary.paused > 0 && <Pressable disabled={operationBusy} accessibilityRole="button" accessibilityLabel={`استكمال كل التنزيلات المتوقفة مؤقتًا، ${summary.paused}`} accessibilityState={{disabled:operationBusy,busy:operationBusy}} onPress={() => void resumeAll()} style={[s.bulkButton,{backgroundColor:theme.accent,borderColor:theme.accent},operationBusy&&s.disabled]}><Ionicons name="play" size={16} color="#fff"/><Text style={s.bulkPrimary}>استكمال الكل</Text></Pressable>}
            </View>
          </View>}

          <View style={s.summary}>
            <View style={[s.summaryItem,{backgroundColor:theme.surface,borderColor:theme.border}]}><Ionicons name="pulse" size={18} color={theme.accent} /><Text style={[s.summaryValue,{color:theme.text}]}>{summary.active}</Text><Text style={[s.summaryLabel,{color:theme.muted}]}>نشط</Text></View>
            <View style={[s.summaryItem,{backgroundColor:theme.surface,borderColor:theme.border}]}><Ionicons name="checkmark-done" size={18} color="#7FB890" /><Text style={[s.summaryValue,{color:theme.text}]}>{summary.completed}</Text><Text style={[s.summaryLabel,{color:theme.muted}]}>مكتمل</Text></View>
            <View style={[s.summaryItem,{backgroundColor:theme.surface,borderColor:theme.border}]}><Ionicons name="alert-circle-outline" size={18} color="#D69080" /><Text style={[s.summaryValue,{color:theme.text}]}>{summary.failed}</Text><Text style={[s.summaryLabel,{color:theme.muted}]}>متوقف</Text></View>
            <View style={[s.summaryItem,{backgroundColor:theme.surface,borderColor:theme.border}]}><Ionicons name="server-outline" size={18} color={theme.muted} /><Text numberOfLines={1} style={[s.summaryValueSmall,{color:theme.text}]}>{bytes(summary.written)}</Text><Text style={[s.summaryLabel,{color:theme.muted}]}>بيانات</Text></View>
          </View>

          {items.length > 0 && <View style={[s.search,{backgroundColor:theme.surface,borderColor:theme.border}]}>
            <Ionicons name="search-outline" size={20} color={query?theme.accent:theme.muted}/>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="ابحث باسم الملف أو الموقع"
              placeholderTextColor={theme.muted}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel="البحث في التنزيلات"
              style={[s.searchInput,{color:theme.text}]}
            />
            {!!query && <Pressable onPress={()=>setQuery('')} accessibilityRole="button" accessibilityLabel="مسح بحث التنزيلات" hitSlop={10} style={[s.clearSearch,{backgroundColor:theme.surface2}]}><Ionicons name="close" size={17} color={theme.muted}/></Pressable>}
          </View>}
          {!!query.trim() && <Text accessibilityLiveRegion="polite" style={[s.searchResult,{color:theme.muted}]}>{visible.length ? `${visible.length} نتيجة مطابقة` : 'لا توجد نتيجة مطابقة'}</Text>}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
            {filters.map(item=>{const active=filter===item.key;return <Pressable key={item.key} onPress={()=>setFilter(item.key)} accessibilityRole="tab" accessibilityLabel={`${item.label}، ${item.count}`} accessibilityState={{selected:active}} style={({pressed})=>[s.filter,{backgroundColor:active?theme.accent:theme.surface,borderColor:active?theme.accent:theme.border},pressed&&s.press]}><Ionicons name={item.icon} size={16} color={active?'#fff':theme.muted}/><Text style={[s.filterText,{color:active?'#fff':theme.text}]}>{item.label}</Text><View style={[s.badge,{backgroundColor:active?'rgba(255,255,255,.18)':theme.surface2}]}><Text style={[s.badgeText,{color:active?'#fff':theme.muted}]}>{item.count}</Text></View></Pressable>})}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.kindFilters}>
            {kindFilters.map(item=>{const active=kindFilter===item.key;return <Pressable key={item.key} onPress={()=>setKindFilter(item.key)} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{selected:active}} style={({pressed})=>[s.kindFilter,{backgroundColor:active?theme.surface2:'transparent',borderColor:active?theme.accent:theme.border},pressed&&s.press]}><Ionicons name={item.icon} size={15} color={active?theme.accent:theme.muted}/><Text style={[s.kindFilterText,{color:active?theme.text:theme.muted}]}>{item.label}</Text></Pressable>})}
          </ScrollView>

          {summary.failed > 0 && <Pressable
            disabled={operationBusy}
            accessibilityRole="button"
            accessibilityLabel={`إعادة كل التنزيلات المتوقفة، ${summary.failed}`}
            accessibilityState={{disabled:operationBusy,busy:operationBusy}}
            onPress={() => void retryAllFailed()}
            style={({pressed})=>[s.retryAll,{backgroundColor:theme.surface,borderColor:theme.border},operationBusy&&s.disabled,pressed&&s.press]}
          >
            <View style={[s.retryAllIcon,{backgroundColor:theme.surface2}]}><Ionicons name="refresh-circle" size={22} color={theme.accent}/></View>
            <View style={s.retryAllCopy}><Text style={[s.retryAllTitle,{color:theme.text}]}>إعادة كل التنزيلات المتوقفة</Text><Text style={[s.retryAllText,{color:theme.muted}]}>محاولة استكمال {summary.failed} ملف مع إبقاء الملفات الناجحة تعمل</Text></View>
            <Ionicons name="chevron-back" size={18} color={theme.muted}/>
          </Pressable>}

          {items.length === 0 && !refreshError ? (
            <View style={[s.empty,{backgroundColor:theme.surface,borderColor:theme.border}]}><View style={[s.emptyIcon,{backgroundColor:theme.surface2}]}><Ionicons name="cloud-download-outline" size={34} color={theme.accent} /></View><Text style={[s.emptyTitle,{color:theme.text}]}>لا توجد تنزيلات بعد</Text><Text style={[s.emptyText,{color:theme.muted}]}>عندما يبدأ RAID تنزيل ملف سيظهر هنا مع السرعة والوقت المتبقي والتحكم الكامل.</Text></View>
          ) : items.length > 0 && visible.length===0 ? (
            <View style={[s.empty,{backgroundColor:theme.surface,borderColor:theme.border}]}><Ionicons name={query.trim()?'search-outline':'filter-outline'} size={30} color={theme.accent}/><Text style={[s.emptyTitle,{color:theme.text}]}>{query.trim()?'لم نجد هذا الملف':'لا توجد عناصر هنا'}</Text><Text style={[s.emptyText,{color:theme.muted}]}>{query.trim()?'جرّب جزءًا من اسم الملف أو اسم الموقع، أو امسح البحث.':'غيّر الفلتر لعرض بقية التنزيلات.'}</Text>{!!query.trim()&&<Pressable onPress={()=>setQuery('')} accessibilityRole="button" accessibilityLabel="مسح بحث التنزيلات" style={[s.emptyClear,{backgroundColor:theme.accent}]}><Text style={s.emptyClearText}>مسح البحث</Text></Pressable>}</View>
          ) : visible.map((item) => {
            const remaining = eta(item.eta_seconds);
            const liveMeta = item.state === 'downloading' && item.speed_bps > 0
              ? `${bytes(item.speed_bps)}/ث${remaining ? ` • متبقٍ ${remaining}` : ''}`
              : stateText(item);
            const viewerKind=raidViewerKind(item);
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
              <View accessible accessibilityRole="progressbar" accessibilityLabel={`تقدم تنزيل ${item.file_name}`} accessibilityValue={{min:0,max:100,now:item.state==='completed'?100:Math.round(item.progress*100)}} style={[s.track,{backgroundColor:theme.surface2}]}><View style={[s.progress,{backgroundColor:theme.accent,width:`${Math.max(item.state === 'completed' ? 100 : 2, Math.round(item.progress * 100))}%`}]} /></View>
              {!!item.error && <View style={s.errorRow}><Ionicons name="warning-outline" size={15} color="#E1A091" /><Text style={s.error} numberOfLines={3}>{item.error}</Text></View>}
              <View style={s.actions}>
                {item.state === 'completed' && <Pressable disabled={operationBusy} accessibilityRole="button" accessibilityLabel={`${viewerKind==='image'?'عرض':viewerKind==='text'?'قراءة':'فتح'} ${item.file_name}`} accessibilityState={{disabled:operationBusy,busy:operationBusy}} onPress={() => viewerKind ? router.push({ pathname: '/file-viewer', params: { id: String(item.id) } }) : void perform(() => openDownload(item.id))} style={[s.action,{backgroundColor:theme.surface2,borderColor:theme.border},operationBusy&&s.disabled]}><Ionicons name={viewerKind==='image'?'image-outline':viewerKind==='text'?'reader-outline':'open-outline'} size={16} color={theme.text} /><Text style={[s.actionText,{color:theme.text}]}>{viewerKind==='image'?'عرض':viewerKind==='text'?'قراءة':'فتح'}</Text></Pressable>}
                {item.state === 'completed' && <Pressable disabled={operationBusy} accessibilityRole="button" accessibilityLabel={`مشاركة ${item.file_name}`} accessibilityState={{disabled:operationBusy,busy:operationBusy}} onPress={() => void perform(() => shareDownload(item.id))} style={[s.action,{backgroundColor:theme.surface2,borderColor:theme.border},operationBusy&&s.disabled]}><Ionicons name="share-social-outline" size={16} color={theme.text} /><Text style={[s.actionText,{color:theme.text}]}>مشاركة</Text></Pressable>}
                {item.state === 'completed' && <Pressable disabled={operationBusy} accessibilityRole="button" accessibilityLabel={`إعادة تسمية ${item.file_name}`} accessibilityState={{disabled:operationBusy,busy:operationBusy}} onPress={() => openRename(item)} style={[s.action,{backgroundColor:theme.surface2,borderColor:theme.border},operationBusy&&s.disabled]}><Ionicons name="pencil-outline" size={16} color={theme.text} /><Text style={[s.actionText,{color:theme.text}]}>تسمية</Text></Pressable>}
                {item.state === 'downloading' && <Pressable disabled={operationBusy} accessibilityRole="button" accessibilityLabel={`إيقاف تنزيل ${item.file_name} مؤقتًا`} accessibilityState={{disabled:operationBusy,busy:operationBusy}} onPress={() => void perform(() => pauseDownload(item.id))} style={[s.action,{backgroundColor:theme.surface2,borderColor:theme.border},operationBusy&&s.disabled]}><Ionicons name="pause" size={16} color={theme.text} /><Text style={[s.actionText,{color:theme.text}]}>إيقاف</Text></Pressable>}
                {item.state === 'paused' && <Pressable disabled={operationBusy} accessibilityRole="button" accessibilityLabel={`استكمال تنزيل ${item.file_name}`} accessibilityState={{disabled:operationBusy,busy:operationBusy}} onPress={() => void perform(() => resumeDownload(item.id))} style={[s.action,{backgroundColor:theme.accent,borderColor:theme.accent},operationBusy&&s.disabled]}><Ionicons name="play" size={16} color="#fff" /><Text style={s.primaryText}>استكمال</Text></Pressable>}
                {(item.state === 'failed' || item.state === 'cancelled') && <Pressable disabled={operationBusy} accessibilityRole="button" accessibilityLabel={`إعادة تنزيل ${item.file_name}`} accessibilityState={{disabled:operationBusy,busy:operationBusy}} onPress={() => void perform(() => retryDownload(item.id))} style={[s.action,{backgroundColor:theme.accent,borderColor:theme.accent},operationBusy&&s.disabled]}><Ionicons name="refresh" size={16} color="#fff" /><Text style={s.primaryText}>إعادة</Text></Pressable>}
                {(item.state === 'downloading' || item.state === 'paused') && <Pressable disabled={operationBusy} accessibilityRole="button" accessibilityLabel={`إلغاء تنزيل ${item.file_name}`} accessibilityState={{disabled:operationBusy,busy:operationBusy}} onPress={() => void perform(() => cancelDownload(item.id))} style={[s.action,{backgroundColor:theme.surface2,borderColor:theme.border},operationBusy&&s.disabled]}><Ionicons name="close" size={17} color={theme.text} /><Text style={[s.actionText,{color:theme.text}]}>إلغاء</Text></Pressable>}
                <Pressable disabled={operationBusy} onPress={() => confirmRemove(item)} accessibilityRole="button" accessibilityLabel={`حذف التنزيل ${item.file_name}`} accessibilityState={{disabled:operationBusy,busy:operationBusy}} style={[s.action,s.danger,operationBusy&&s.disabled]}><Ionicons name="trash-outline" size={16} color="#F2D2CB" /><Text style={s.dangerText}>حذف</Text></Pressable>
              </View>
            </View>;
          })}
        </ScrollView>
      )}
      <Modal visible={Boolean(renameTarget)} transparent animationType="fade" onRequestClose={()=>{if(!operationBusy)setRenameTarget(null);}}>
        <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={s.renameOverlay}>
          <Pressable accessibilityRole="button" accessibilityLabel="إغلاق نافذة إعادة التسمية" disabled={operationBusy} onPress={()=>setRenameTarget(null)} style={s.renameBackdrop}/>
          <View style={[s.renameCard,{backgroundColor:theme.surface,borderColor:theme.border}]}>
            <View style={[s.renameIcon,{backgroundColor:theme.surface2}]}><Ionicons name="pencil-outline" size={24} color={theme.accent}/></View>
            <Text style={[s.renameTitle,{color:theme.text}]}>إعادة تسمية الملف</Text>
            <Text style={[s.renameHint,{color:theme.muted}]}>غيّر الاسم فقط؛ سيحافظ RAID على الامتداد {renameTarget?downloadExtension(renameTarget.file_name)||'الأصلي':''} حتى يبقى نوع الملف صحيحًا.</Text>
            <TextInput
              autoFocus
              value={renameValue}
              onChangeText={setRenameValue}
              onSubmitEditing={()=>void submitRename()}
              returnKeyType="done"
              selectTextOnFocus
              maxLength={110}
              accessibilityLabel="الاسم الجديد للملف"
              style={[s.renameInput,{backgroundColor:theme.surface2,borderColor:theme.border,color:theme.text}]}
            />
            <View style={s.renameActions}>
              <Pressable disabled={operationBusy} onPress={()=>setRenameTarget(null)} accessibilityRole="button" style={[s.renameButton,{borderColor:theme.border},operationBusy&&s.disabled]}><Text style={[s.renameButtonText,{color:theme.text}]}>إلغاء</Text></Pressable>
              <Pressable disabled={operationBusy||!renameValue.trim()} onPress={()=>void submitRename()} accessibilityRole="button" accessibilityState={{disabled:operationBusy||!renameValue.trim(),busy:operationBusy}} style={[s.renameButton,{backgroundColor:theme.accent,borderColor:theme.accent},(operationBusy||!renameValue.trim())&&s.disabled]}>{operationBusy?<ActivityIndicator size="small" color="#fff"/>:<Text style={s.renamePrimaryText}>حفظ الاسم</Text>}</Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:{flex:1},header:{minHeight:72,paddingHorizontal:16,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1},headerButton:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',borderWidth:1},headerCopy:{flex:1},title:{fontSize:21,fontWeight:'900',textAlign:'right'},sub:{fontSize:10,textAlign:'right',marginTop:3},body:{padding:16,gap:12,paddingBottom:42},center:{flex:1,alignItems:'center',justifyContent:'center'},
  refreshError:{minHeight:72,padding:12,borderRadius:18,borderWidth:1,flexDirection:'row-reverse',alignItems:'center',gap:10},refreshErrorCopy:{flex:1},refreshErrorTitle:{fontSize:13,fontWeight:'900',textAlign:'right'},refreshErrorText:{fontSize:10,lineHeight:16,textAlign:'right',marginTop:2},retryRefresh:{width:40,height:40,borderRadius:13,borderWidth:1,alignItems:'center',justifyContent:'center'},
  livePanel:{padding:16,borderRadius:24,borderWidth:1,gap:10},liveTop:{flexDirection:'row-reverse',alignItems:'center',gap:11},liveIcon:{width:48,height:48,borderRadius:16,alignItems:'center',justifyContent:'center'},liveCopy:{flex:1,alignItems:'flex-end'},liveTitle:{fontSize:14,fontWeight:'900',textAlign:'right'},liveSpeed:{marginTop:3,fontSize:18,fontWeight:'900',textAlign:'right'},liveNumbers:{alignItems:'center',minWidth:44},liveCount:{fontSize:18,fontWeight:'900'},liveLabel:{fontSize:9,marginTop:1},liveDetail:{fontSize:11,textAlign:'right',fontWeight:'700'},liveHint:{fontSize:10,lineHeight:17,textAlign:'right'},liveTrack:{height:7,borderRadius:99,overflow:'hidden'},liveProgress:{height:'100%',borderRadius:99},bulkActions:{flexDirection:'row-reverse',gap:8,flexWrap:'wrap'},bulkButton:{height:38,paddingHorizontal:13,borderRadius:13,borderWidth:1,flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:6},bulkText:{fontSize:11,fontWeight:'800'},bulkPrimary:{fontSize:11,fontWeight:'900',color:'#fff'},
  summary:{flexDirection:'row-reverse',gap:8},summaryItem:{flex:1,minHeight:86,borderRadius:20,borderWidth:1,alignItems:'center',justifyContent:'center',paddingHorizontal:5,gap:2},summaryValue:{fontWeight:'900',fontSize:17,textAlign:'center'},summaryValueSmall:{fontWeight:'900',fontSize:11,textAlign:'center'},summaryLabel:{fontSize:9,textAlign:'center'},filters:{gap:8,paddingVertical:2},kindFilters:{gap:7,paddingVertical:1},kindFilter:{height:34,borderRadius:12,borderWidth:1,paddingHorizontal:10,flexDirection:'row-reverse',alignItems:'center',gap:5},kindFilterText:{fontSize:9.5,fontWeight:'800'},filter:{height:40,borderRadius:14,borderWidth:1,paddingHorizontal:11,flexDirection:'row-reverse',alignItems:'center',gap:6},filterText:{fontWeight:'800',fontSize:11},badge:{minWidth:22,height:22,borderRadius:9,alignItems:'center',justifyContent:'center',paddingHorizontal:5},badgeText:{fontSize:9,fontWeight:'900'},empty:{marginTop:28,padding:30,borderRadius:28,borderWidth:1,alignItems:'center'},emptyIcon:{width:66,height:66,borderRadius:22,alignItems:'center',justifyContent:'center'},emptyTitle:{marginTop:14,fontSize:20,fontWeight:'900'},emptyText:{marginTop:8,textAlign:'center',lineHeight:21},card:{padding:16,borderRadius:24,borderWidth:1},cardTop:{flexDirection:'row-reverse',gap:12,alignItems:'center'},fileIcon:{width:48,height:48,borderRadius:16,alignItems:'center',justifyContent:'center'},fileText:{flex:1},fileName:{fontWeight:'900',fontSize:14,textAlign:'right'},host:{marginTop:2,fontSize:9,textAlign:'right'},meta:{marginTop:4,fontSize:11,fontWeight:'800',textAlign:'right'},sizeMeta:{marginTop:3,fontSize:10,textAlign:'right'},percent:{fontWeight:'900',fontSize:12},track:{height:6,borderRadius:99,marginTop:14,overflow:'hidden'},progress:{height:'100%',borderRadius:99},errorRow:{marginTop:10,flexDirection:'row-reverse',gap:6,alignItems:'center'},error:{flex:1,color:'#E1A091',fontSize:11,textAlign:'right'},actions:{flexDirection:'row-reverse',flexWrap:'wrap',gap:8,marginTop:14},action:{height:39,paddingHorizontal:14,borderRadius:13,alignItems:'center',justifyContent:'center',borderWidth:1,flexDirection:'row-reverse',gap:6},danger:{backgroundColor:'#4A3230',borderColor:'#67423E'},actionText:{fontWeight:'800',fontSize:11},primaryText:{color:'#fff',fontWeight:'900',fontSize:11},dangerText:{color:'#F2D2CB',fontWeight:'800',fontSize:11},disabled:{opacity:.45},press:{transform:[{scale:.985}],opacity:.86},
  search:{minHeight:48,borderRadius:16,borderWidth:1,paddingHorizontal:13,flexDirection:'row-reverse',alignItems:'center',gap:9},searchInput:{flex:1,minHeight:46,textAlign:'right',fontSize:12},clearSearch:{width:30,height:30,borderRadius:10,alignItems:'center',justifyContent:'center'},searchResult:{fontSize:10,fontWeight:'700',textAlign:'right',paddingHorizontal:4,marginTop:-4},emptyClear:{marginTop:16,minHeight:40,paddingHorizontal:18,borderRadius:13,alignItems:'center',justifyContent:'center'},emptyClearText:{color:'#fff',fontSize:11,fontWeight:'900'},
  renameOverlay:{flex:1,alignItems:'center',justifyContent:'center',padding:20},renameBackdrop:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(2,8,13,.76)'},renameCard:{width:'100%',maxWidth:420,borderRadius:26,borderWidth:1,padding:20,alignItems:'center'},renameIcon:{width:52,height:52,borderRadius:17,alignItems:'center',justifyContent:'center'},renameTitle:{fontSize:19,fontWeight:'900',marginTop:12},renameHint:{fontSize:10.5,lineHeight:17,textAlign:'center',marginTop:7},renameInput:{width:'100%',minHeight:50,borderRadius:15,borderWidth:1,paddingHorizontal:14,textAlign:'right',fontSize:14,fontWeight:'800',marginTop:16},renameActions:{width:'100%',flexDirection:'row-reverse',gap:9,marginTop:14},renameButton:{flex:1,minHeight:44,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},renameButtonText:{fontSize:12,fontWeight:'800'},renamePrimaryText:{color:'#fff',fontSize:12,fontWeight:'900'},
  retryAll:{minHeight:64,borderRadius:18,borderWidth:1,padding:11,flexDirection:'row-reverse',alignItems:'center',gap:10},retryAllIcon:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center'},retryAllCopy:{flex:1,alignItems:'flex-end'},retryAllTitle:{fontSize:12,fontWeight:'900',textAlign:'right'},retryAllText:{fontSize:9.5,lineHeight:15,textAlign:'right',marginTop:2},
});
