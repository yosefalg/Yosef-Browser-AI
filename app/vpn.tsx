import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { connectVpn, disconnectVpn, getVpnProvisioningState, isVpnConnected } from '@/lib/vpn';
import { getCurrentSession } from '@/lib/auth';

type VpnSource = 'service' | 'local' | 'cache' | 'none';
type ProvisioningIssue = 'none' | 'server-unconfigured' | 'temporary' | 'session' | 'unknown';

const VPN_STATE_RETRY_DELAYS = [0, 300, 700, 1200] as const;

async function waitForVpnState(expected: boolean) {
  let active = await isVpnConnected().catch(() => !expected);
  if (active === expected) return active;

  for (const delay of VPN_STATE_RETRY_DELAYS.slice(1)) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    active = await isVpnConnected().catch(() => active);
    if (active === expected) break;
  }

  return active;
}

function classifyVpnError(error: unknown): ProvisioningIssue {
  const raw = error instanceof Error ? error.message : '';
  if (/غير مربوط بخدمة التزويد|VPN_SERVICE_NOT_CONFIGURED|غير مهيأة على الخادم|NO_VPN_SERVER/i.test(raw)) return 'server-unconfigured';
  if (/PROVISIONING_UNAVAILABLE|غير متاحة مؤقت|تعذر الاتصال بخدمة RAID VPN|تعذر مزامنة إعداد VPN/i.test(raw)) return 'temporary';
  if (/انتهت جلسة الحساب|سجّل الدخول مجدد|UNAUTHORIZED/i.test(raw)) return 'session';
  return raw ? 'unknown' : 'none';
}

function friendlyVpnError(error: unknown) {
  const raw = error instanceof Error ? error.message : 'تعذر تنفيذ العملية.';
  const issue = classifyVpnError(error);
  if (issue === 'server-unconfigured') {
    return 'خادم RAID VPN غير مربوط بخدمة التزويد حاليًا. التطبيق سليم، لكن لا يمكن إنشاء نفق جديد قبل تجهيز الخادم.';
  }
  if (issue === 'temporary') {
    return 'خدمة RAID VPN غير متاحة مؤقتًا. يمكنك إعادة الفحص دون إعادة تسجيل الدخول أو اختيار ملف يدوي.';
  }
  if (/لا يوجد إعداد WireGuard|استورد ملف VPN/i.test(raw)) {
    return 'لم يصل إعداد WireGuard صالح لهذا الحساب بعد. لا تحتاج إلى اختيار ملف يدوي.';
  }
  return raw;
}

export default function VpnScreen() {
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [source, setSource] = useState<VpnSource>('none');
  const [busy, setBusy] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');
  const [provisioningIssue, setProvisioningIssue] = useState<ProvisioningIssue>('none');
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const operationInFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (operationInFlight.current) return;
    setBusy(true);
    setStatusMessage('');
    try {
      const session = await getCurrentSession().catch(() => null);
      setSignedIn(Boolean(session));
      const active = await isVpnConnected().catch(() => false);
      const profile = session
        ? await getVpnProvisioningState()
        : { configured: false as const, source: 'none' as const };

      setConnected(active);
      setReady(profile.configured);
      setSource(profile.source);
      setProvisioningIssue('none');

      if (session && profile.configured) {
        setStatusMessage(profile.source === 'service'
          ? 'RAID VPN جاهز لهذا الحساب. اضغط تشغيل للاتصال.'
          : 'إعداد VPN محفوظ وآمن على هذا الهاتف.');
      } else if (session) {
        setStatusMessage('لا يوجد ملف اتصال جاهز بعد. سيتم فحص خدمة RAID عند الضغط على تشغيل.');
      }
    } catch (error) {
      setProvisioningIssue(classifyVpnError(error));
      setReady(false);
      setSource('none');
      setStatusMessage(friendlyVpnError(error));
    } finally {
      setLastCheckedAt(new Date());
      setBusy(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void refresh();
    return () => {};
  }, [refresh]));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const toggle = async () => {
    if (!signedIn) {
      router.push('/login');
      return;
    }
    if (operationInFlight.current) return;

    operationInFlight.current = true;
    setBusy(true);
    setStatusMessage('');
    try {
      if (connected) {
        setStatusMessage('جارٍ قطع اتصال RAID VPN…');
        await disconnectVpn();
        const active = await waitForVpnState(false);
        setConnected(active);
        setStatusMessage(active
          ? 'طلب Android قطع الاتصال، لكن النفق ما زال فعالًا. حاول مرة أخرى.'
          : 'تم قطع اتصال RAID VPN.');
        return;
      }

      setProvisioningIssue('none');
      setStatusMessage(ready ? 'جارٍ تشغيل النفق الآمن…' : 'جارٍ فحص وتجهيز RAID VPN لهذا الحساب…');
      await connectVpn();
      const active = await waitForVpnState(true);
      setConnected(active);
      if (!active) throw new Error('لم يؤكد Android تشغيل النفق. تحقق من إذن VPN ثم حاول مجددًا.');

      const profile = await getVpnProvisioningState().catch(() => null);
      if (profile) {
        setReady(profile.configured);
        setSource(profile.source);
      }
      setProvisioningIssue('none');
      setStatusMessage('RAID VPN متصل الآن والنفق يعمل على Android.');
    } catch (error) {
      const issue = classifyVpnError(error);
      const message = friendlyVpnError(error);
      const active = await isVpnConnected().catch(() => connected);
      setConnected(active);
      setProvisioningIssue(issue);
      setStatusMessage(message);
      Alert.alert('RAID VPN', message);
    } finally {
      setLastCheckedAt(new Date());
      operationInFlight.current = false;
      setBusy(false);
    }
  };

  const serviceBlocked = provisioningIssue === 'server-unconfigured';
  const transientIssue = provisioningIssue === 'temporary';

  const stateLabel = connected
    ? 'متصل ومحمي'
    : !signedIn
      ? 'يلزم تسجيل الدخول'
      : serviceBlocked
        ? 'الخادم غير مجهز'
        : transientIssue
          ? 'الخدمة مؤقتًا غير متاحة'
          : ready
            ? 'جاهز للاتصال'
            : 'بانتظار التجهيز';

  const mainTitle = connected
    ? 'RAID VPN يعمل الآن'
    : !signedIn
      ? 'دخول إلى حساب RAID'
      : serviceBlocked
        ? 'RAID VPN يحتاج خادمًا فعليًا'
        : transientIssue
          ? 'إعادة فحص خدمة RAID'
          : ready
            ? 'RAID VPN جاهز'
            : 'تشغيل RAID VPN';

  const description = connected
    ? 'النفق يعمل عبر WireGuard الحقيقي على Android.'
    : !signedIn
      ? 'سجّل الدخول مرة واحدة لاستخدام خدمات RAID المرتبطة بحسابك.'
      : serviceBlocked
        ? 'التطبيق ووحدة WireGuard جاهزان، لكن خدمة التزويد على الخادم غير مربوطة بعد. لن يعرض RAID اتصالًا وهميًا.'
        : transientIssue
          ? 'الاتصال بالخدمة فشل مؤقتًا. أعد الفحص؛ لن يتم حذف إعداد محفوظ صالح من جهازك.'
          : ready
            ? 'الإعداد محفوظ بأمان. اضغط الزر للاتصال مباشرة.'
            : 'اضغط تشغيل. RAID سيفحص خدمة التزويد ثم يطلب إذن Android النظامي فقط عندما يصبح ملف الاتصال جاهزًا.';

  const sourceLabel = source === 'service'
    ? 'RAID Server'
    : source === 'cache'
      ? 'نسخة آمنة'
      : source === 'local'
        ? 'محفوظ على الجهاز'
        : serviceBlocked
          ? 'غير مربوط'
          : 'بانتظار الخدمة';

  const primaryText = connected
    ? 'قطع الاتصال'
    : !signedIn
      ? 'تسجيل الدخول'
      : serviceBlocked || transientIssue
        ? 'إعادة فحص الخدمة'
        : 'تشغيل VPN';

  const primaryAction = serviceBlocked || transientIssue ? refresh : toggle;
  const checkedText = lastCheckedAt
    ? `آخر فحص: ${lastCheckedAt.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}`
    : 'لم يتم الفحص بعد';

  return (
    <SafeAreaView edges={['top', 'bottom']} style={s.root}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.back} accessibilityRole="button" accessibilityLabel="رجوع">
          <Text style={s.backText}>‹</Text>
        </Pressable>
        <View style={s.headText}>
          <Text style={s.title}>RAID VPN</Text>
          <Text style={s.sub}>One-tap secure tunnel</Text>
        </View>
        <View style={[s.dot, connected && s.dotOn, serviceBlocked && s.dotWarn]} />
      </View>

      <View style={s.body}>
        <View style={[s.hero, connected && s.heroOn, serviceBlocked && s.heroWarn]}>
          <Text style={s.state}>{stateLabel}</Text>
          <View style={[s.circle, connected && s.circleOn]}>
            <Text style={s.symbol}>{connected ? '◆' : serviceBlocked ? '!' : '◇'}</Text>
          </View>
          <Text style={s.mainTitle}>{mainTitle}</Text>
          <Text style={s.desc}>{description}</Text>
          {!!statusMessage && <Text style={s.statusMessage}>{statusMessage}</Text>}
          <Text style={s.checked}>{checkedText}</Text>

          <Pressable
            disabled={busy}
            onPress={primaryAction}
            style={[s.primary, connected && s.stop, serviceBlocked && s.warningAction, busy && s.disabled]}
            accessibilityRole="button"
            accessibilityLabel={connected ? 'قطع اتصال RAID VPN' : primaryText}
          >
            {busy
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.primaryText}>{primaryText}</Text>}
          </Pressable>
        </View>

        <View style={s.row}>
          <View style={s.card}>
            <Text style={s.cardLabel}>الحساب</Text>
            <Text style={s.cardValue}>{signedIn ? 'متصل' : 'غير مسجّل'}</Text>
          </View>
          <View style={s.card}>
            <Text style={s.cardLabel}>مصدر VPN</Text>
            <Text style={s.cardValue}>{sourceLabel}</Text>
          </View>
        </View>

        <View style={s.infoCard}>
          <Text style={s.infoTitle}>{serviceBlocked ? 'حالة الخادم واضحة' : 'بدون ملفات يدوية'}</Text>
          <Text style={s.infoText}>{serviceBlocked
            ? 'RAID لن يدّعي أن VPN يعمل قبل وجود خادم WireGuard صالح. بعد ربط خدمة التزويد، يكفي إعادة الفحص.'
            : 'RAID يحاول ربط إعداد VPN بحسابك تلقائيًا. لا تحتاج إلى تنزيل أو اختيار ملف .conf داخل التطبيق.'}</Text>
        </View>

        <Pressable onPress={refresh} disabled={busy} style={[s.secondary, busy && s.disabled]}>
          <Text style={s.secondaryText}>تحديث حالة الخدمة</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:'#080A0C'},
  header:{minHeight:72,flexDirection:'row',alignItems:'center',paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:'#2A2927',gap:10,backgroundColor:'#0D0F11'},
  back:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,.06)',borderWidth:1,borderColor:'#373532'},
  backText:{fontSize:32,color:'#F4F1EC',marginTop:-4},
  headText:{flex:1,alignItems:'center'},
  title:{color:'#F5F2ED',fontSize:20,fontWeight:'900'},
  sub:{color:'#A99686',fontSize:11,fontWeight:'800',marginTop:2},
  dot:{width:11,height:11,borderRadius:6,backgroundColor:'#5F5A55'},
  dotOn:{backgroundColor:'#5FAF86'},
  dotWarn:{backgroundColor:'#C89554'},
  body:{padding:18,gap:14},
  hero:{padding:24,borderRadius:28,alignItems:'center',backgroundColor:'#151719',borderWidth:1,borderColor:'#343230'},
  heroOn:{backgroundColor:'#111B18',borderColor:'#315446'},
  heroWarn:{borderColor:'#5B4731'},
  state:{color:'#B6A291',fontSize:12,fontWeight:'900',textAlign:'center'},
  circle:{width:112,height:112,borderRadius:56,alignItems:'center',justifyContent:'center',marginTop:22,backgroundColor:'#1D1F21',borderWidth:7,borderColor:'#121416'},
  circleOn:{backgroundColor:'#163127',borderColor:'#10251E'},
  symbol:{fontSize:48,color:'#D8C9BC'},
  mainTitle:{fontSize:24,fontWeight:'900',color:'#F7F4EF',marginTop:18,textAlign:'center'},
  desc:{color:'#A7A19A',lineHeight:21,marginTop:8,textAlign:'center'},
  statusMessage:{color:'#D7B985',fontSize:12,lineHeight:18,textAlign:'center',marginTop:10},
  checked:{color:'#746F69',fontSize:11,marginTop:8,textAlign:'center'},
  primary:{width:'100%',height:56,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:'#806955',marginTop:22,borderWidth:1,borderColor:'#A58D78'},
  warningAction:{backgroundColor:'#6B5337',borderColor:'#9A774D'},
  stop:{backgroundColor:'#703B42',borderColor:'#9A5962'},
  disabled:{opacity:.55},
  primaryText:{color:'#fff',fontSize:16,fontWeight:'900'},
  row:{flexDirection:'row-reverse',gap:10},
  card:{flex:1,minHeight:84,borderRadius:20,padding:15,backgroundColor:'#141618',borderWidth:1,borderColor:'#302F2D'},
  cardLabel:{color:'#8D8781',fontSize:12,textAlign:'right'},
  cardValue:{color:'#F1EDE7',fontSize:15,fontWeight:'900',marginTop:7,textAlign:'right'},
  infoCard:{padding:16,borderRadius:20,backgroundColor:'#121416',borderWidth:1,borderColor:'#302E2B'},
  infoTitle:{color:'#D7C6B7',fontSize:14,fontWeight:'900',textAlign:'right'},
  infoText:{color:'#918B85',lineHeight:20,marginTop:6,textAlign:'right'},
  secondary:{height:48,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,.05)',borderWidth:1,borderColor:'#343230'},
  secondaryText:{color:'#C7BDB4',fontWeight:'900'},
});
