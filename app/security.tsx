import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getSetting } from '@/lib/db';
import { getTheme, isThemeName, type ThemeName } from '@/lib/theme';
import { assessSiteRisk, type SiteRiskAssessment } from '@/lib/site-risk';
import { normalizeInput, safeExternalUrl } from '@/lib/url';

type ScanState = { url: string; assessment: SiteRiskAssessment } | null;

function levelCopy(level: SiteRiskAssessment['level']) {
  if (level === 'danger') return { title: 'خطر مرتفع', icon: 'warning', tone: '#D97D6C' } as const;
  if (level === 'caution') return { title: 'يحتاج انتباه', icon: 'alert-circle', tone: '#D7A45C' } as const;
  return { title: 'لا توجد مؤشرات واضحة', icon: 'shield-checkmark', tone: '#65B887' } as const;
}

export default function SecurityScreen() {
  const [themeName, setThemeName] = useState<ThemeName>('cinematic');
  const [input, setInput] = useState('');
  const [scan, setScan] = useState<ScanState>(null);
  const [message, setMessage] = useState('');
  const theme = useMemo(() => getTheme(themeName), [themeName]);

  useFocusEffect(useCallback(() => {
    let alive = true;
    void getSetting<ThemeName>('theme', 'cinematic')
      .then(value => { if (alive) setThemeName(isThemeName(value) ? value : 'cinematic'); })
      .catch(() => {});
    return () => { alive = false; };
  }, []));

  const runScan = () => {
    setMessage('');
    try {
      const normalized = normalizeInput(input);
      if (!safeExternalUrl(normalized)) {
        setScan(null);
        setMessage('هذا الإدخال لا ينتج رابط ويب صالحًا وآمنًا للفحص.');
        return;
      }
      setScan({ url: normalized, assessment: assessSiteRisk(normalized) });
    } catch {
      setScan(null);
      setMessage('تعذر تحليل الرابط. تأكد من كتابته بدون محارف مخفية أو صيغة غير مدعومة.');
    }
  };

  const openScanned = () => {
    if (!scan) return;
    const open = () => router.push({ pathname: '/browser', params: { url: scan.url } });
    if (scan.assessment.level !== 'danger') {
      open();
      return;
    }
    Alert.alert(
      'RAID Security',
      'الرابط يحمل مؤشرات خطورة واضحة. افتحه فقط إذا كنت متأكدًا من مصدره.',
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'فتح رغم التحذير', style: 'destructive', onPress: open },
      ],
    );
  };

  const level = scan ? levelCopy(scan.assessment.level) : null;

  return <SafeAreaView style={[s.root, { backgroundColor: theme.bg }]} edges={['top','bottom','left','right']}>
    <View style={[s.head, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
      <Pressable onPress={() => router.back()} style={[s.iconBtn, { backgroundColor: theme.surface2, borderColor: theme.border }]} accessibilityRole="button" accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={23} color={theme.text}/></Pressable>
      <View style={s.headCopy}><Text style={[s.title, { color: theme.text }]}>RAID Security Center</Text><Text style={[s.sub, { color: theme.muted }]}>فحص محلي للرابط قبل فتحه</Text></View>
      <View style={[s.iconBtn, { backgroundColor: theme.surface2, borderColor: theme.border }]}><Ionicons name="shield-checkmark-outline" size={21} color={theme.accent}/></View>
    </View>

    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={[s.hero, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={[s.heroIcon, { backgroundColor: theme.surface2, borderColor: theme.border }]}><Ionicons name="scan-outline" size={31} color={theme.accent}/></View>
        <View style={s.heroCopy}><Text style={[s.kicker, { color: theme.accent }]}>URL RISK SCAN</Text><Text style={[s.heroTitle, { color: theme.text }]}>افحص الرابط قبل ما تفتحه</Text><Text style={[s.heroText, { color: theme.muted }]}>RAID يفحص HTTPS، Punycode، عناوين IP، تمويه أسماء الخدمات، بيانات الدخول المضمّنة ومحارف الاتجاه المخفية محليًا على جهازك.</Text></View>
      </View>

      <View style={[s.inputCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[s.inputLabel, { color: theme.text }]}>الرابط</Text>
        <TextInput
          value={input}
          onChangeText={setInput}
          onSubmitEditing={runScan}
          placeholder="مثال: https://example.com/login"
          placeholderTextColor={theme.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          style={[s.input, { color: theme.text, backgroundColor: theme.surface2, borderColor: theme.border }]}
          accessibilityLabel="الرابط المراد فحصه"
        />
        <Pressable onPress={runScan} disabled={!input.trim()} style={({pressed})=>[s.scanBtn,{backgroundColor:input.trim()?theme.accent:theme.surface2,borderColor:input.trim()?theme.accent:theme.border},pressed&&s.pressed]} accessibilityRole="button"><Ionicons name="shield-outline" size={18} color={input.trim()?'#fff':theme.muted}/><Text style={[s.scanBtnText,{color:input.trim()?'#fff':theme.muted}]}>فحص الرابط</Text></Pressable>
        {!!message && <Text style={s.error}>{message}</Text>}
      </View>

      {scan && level && <View style={[s.result, { backgroundColor: theme.surface, borderColor: level.tone }]}>
        <View style={s.resultHead}>
          <View style={[s.resultIcon, { backgroundColor: `${level.tone}20` }]}><Ionicons name={level.icon} size={26} color={level.tone}/></View>
          <View style={s.resultCopy}><Text style={[s.resultTitle, { color: level.tone }]}>{level.title}</Text><Text numberOfLines={1} style={[s.resultHost, { color: theme.text }]}>{scan.assessment.host}</Text><Text style={[s.score, { color: theme.muted }]}>درجة المؤشرات: {scan.assessment.score}</Text></View>
        </View>

        <Text numberOfLines={2} style={[s.url, { color: theme.muted }]}>{scan.url}</Text>

        <View style={s.reasons}>
          {scan.assessment.reasons.length ? scan.assessment.reasons.map((reason,index)=><View key={`${reason}-${index}`} style={s.reason}><Ionicons name="ellipse" size={7} color={level.tone}/><Text style={[s.reasonText,{color:theme.text}]}>{reason}</Text></View>) : <View style={s.reason}><Ionicons name="checkmark-circle" size={16} color={level.tone}/><Text style={[s.reasonText,{color:theme.text}]}>لم يكتشف RAID مؤشرات خطورة واضحة في بنية الرابط.</Text></View>}
        </View>

        <Pressable onPress={openScanned} style={({pressed})=>[s.openBtn,{backgroundColor:scan.assessment.level==='danger'?level.tone:theme.accent},pressed&&s.pressed]} accessibilityRole="button"><Ionicons name="open-outline" size={18} color="#fff"/><Text style={s.openText}>{scan.assessment.level==='danger'?'فتح رغم التحذير':'فتح داخل RAID'}</Text></Pressable>
      </View>}

      <View style={[s.note, { backgroundColor: theme.surface2, borderColor: theme.border }]}><Ionicons name="information-circle-outline" size={19} color={theme.accent}/><Text style={[s.noteText,{color:theme.muted}]}>الفحص محلي ومساعد لاتخاذ قرار أفضل، لكنه لا يضمن أن الموقع آمن 100%. لا تدخل كلمة مرور أو معلومات دفع إذا كان النطاق غير متوقع أو الاتصال غير مشفّر.</Text></View>
    </ScrollView>
  </SafeAreaView>;
}

const s=StyleSheet.create({
  root:{flex:1},head:{minHeight:68,paddingHorizontal:14,paddingVertical:8,borderBottomWidth:1,flexDirection:'row-reverse',alignItems:'center',gap:12},iconBtn:{width:42,height:42,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},headCopy:{flex:1,alignItems:'flex-end'},title:{fontSize:18,fontWeight:'900'},sub:{fontSize:9.5,marginTop:2},content:{padding:16,paddingBottom:42,gap:16},hero:{borderRadius:24,borderWidth:1,padding:15,flexDirection:'row-reverse',alignItems:'center',gap:12},heroIcon:{width:60,height:60,borderRadius:20,borderWidth:1,alignItems:'center',justifyContent:'center'},heroCopy:{flex:1,alignItems:'flex-end'},kicker:{fontSize:9,fontWeight:'900',letterSpacing:.8},heroTitle:{fontSize:18,fontWeight:'900',marginTop:3,textAlign:'right'},heroText:{fontSize:10.5,lineHeight:17,marginTop:5,textAlign:'right'},inputCard:{borderRadius:22,borderWidth:1,padding:14,gap:10},inputLabel:{fontSize:12,fontWeight:'900',textAlign:'right'},input:{minHeight:48,borderRadius:15,borderWidth:1,paddingHorizontal:13,fontSize:13,textAlign:'left'},scanBtn:{minHeight:46,borderRadius:15,borderWidth:1,flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:8},scanBtnText:{fontSize:12,fontWeight:'900'},error:{color:'#D97D6C',fontSize:10.5,lineHeight:16,textAlign:'right'},result:{borderRadius:24,borderWidth:1.5,padding:15,gap:13},resultHead:{flexDirection:'row-reverse',alignItems:'center',gap:12},resultIcon:{width:52,height:52,borderRadius:18,alignItems:'center',justifyContent:'center'},resultCopy:{flex:1,alignItems:'flex-end'},resultTitle:{fontSize:17,fontWeight:'900'},resultHost:{fontSize:12,fontWeight:'800',marginTop:3},score:{fontSize:9.5,marginTop:3},url:{fontSize:9.5,lineHeight:15,textAlign:'left'},reasons:{gap:8},reason:{flexDirection:'row-reverse',alignItems:'flex-start',gap:8},reasonText:{flex:1,fontSize:10.5,lineHeight:17,textAlign:'right'},openBtn:{minHeight:47,borderRadius:15,flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:8},openText:{color:'#fff',fontWeight:'900',fontSize:12},note:{borderRadius:19,borderWidth:1,padding:13,flexDirection:'row-reverse',alignItems:'flex-start',gap:9},noteText:{flex:1,fontSize:9.5,lineHeight:16,textAlign:'right'},pressed:{opacity:.78,transform:[{scale:.985}]}
});
