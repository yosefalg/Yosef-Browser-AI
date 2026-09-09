import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { clearWireGuardConfig, connectVpn, disconnectVpn, getVpnProvisioningState, importLocalWireGuardConfig, isVpnConnected } from '@/lib/vpn';
import { getCurrentSession } from '@/lib/auth';

type VpnSource = 'service' | 'local' | 'cache' | 'none';

export default function VpnScreen() {
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [source, setSource] = useState<VpnSource>('none');
  const [busy, setBusy] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');
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
      if (session && profile.source === 'local') {
        setStatusMessage('إعداد WireGuard محفوظ محليًا على هذا الهاتف. التشغيل التالي يتم بضغطة واحدة.');
      } else if (session && !profile.configured) {
        setStatusMessage('أول تشغيل فقط: اضغط تشغيل VPN واختر ملف WireGuard الحقيقي من هاتفك.');
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'تعذر تحديث حالة VPN.');
    } finally {
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

  const openProtonFree = () => {
    Linking.openURL('https://account.protonvpn.com/downloads').catch(() => {
      Alert.alert('RAID VPN', 'تعذر فتح صفحة Proton VPN.');
    });
  };

  const provisionAndConnect = async () => {
    const profile = await importLocalWireGuardConfig();
    setReady(profile.configured);
    setSource(profile.source);
    setStatusMessage('تم حفظ إعداد WireGuard. جارٍ تشغيل النفق…');
    await connectVpn();
    const active = await isVpnConnected();
    setConnected(active);
    if (!active) throw new Error('تم حفظ الملف لكن Android لم يؤكد تشغيل النفق. حاول تشغيل VPN مرة أخرى.');
    setStatusMessage('RAID VPN متصل الآن. من الآن فصاعدًا التشغيل والإيقاف بضغطة واحدة.');
  };

  const replaceProfile = async () => {
    if (!signedIn || connected || busy || operationInFlight.current) return;
    operationInFlight.current = true;
    setBusy(true);
    setStatusMessage('اختر ملف WireGuard البديل. لن يُحذف الإعداد الحالي إلا بعد اختيار ملف جديد.');
    try {
      const profile = await importLocalWireGuardConfig();
      if (!profile.configured) throw new Error('لم يتم حفظ إعداد WireGuard الجديد.');
      setReady(true);
      setSource(profile.source);
      setStatusMessage('تم استبدال إعداد WireGuard بنجاح. اضغط تشغيل VPN للاتصال.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر استبدال إعداد WireGuard.';
      if (/cancel|canceled|cancelled|ألغ/i.test(message)) {
        setStatusMessage('لم يتم تغيير إعداد VPN الحالي.');
        return;
      }
      setStatusMessage(message);
      Alert.alert('RAID VPN', message);
    } finally {
      operationInFlight.current = false;
      setBusy(false);
    }
  };

  const resetProfile = async () => {
    if (!signedIn || connected || busy || operationInFlight.current) return;
    operationInFlight.current = true;
    setBusy(true);
    try {
      await clearWireGuardConfig();
      setReady(false);
      setSource('none');
      setStatusMessage('تم حذف إعداد VPN المحفوظ من هذا الهاتف. اضغط تشغيل VPN لاختيار ملف جديد.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر حذف إعداد VPN المحفوظ.';
      setStatusMessage(message);
      Alert.alert('RAID VPN', message);
    } finally {
      operationInFlight.current = false;
      setBusy(false);
    }
  };

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
        await disconnectVpn();
        const active = await isVpnConnected();
        setConnected(active);
        setStatusMessage(active
          ? 'طلب Android قطع الاتصال، لكن النفق ما زال فعالًا. حاول مرة أخرى.'
          : 'تم قطع اتصال VPN.');
        return;
      }

      if (!ready) {
        await provisionAndConnect();
        return;
      }

      await connectVpn();
      const active = await isVpnConnected();
      setConnected(active);
      setStatusMessage(active
        ? source === 'local'
          ? 'متصل عبر WireGuard المحفوظ محليًا.'
          : 'متصل عبر RAID WireGuard.'
        : 'لم يؤكد Android تشغيل النفق. تحقق من إذن VPN ثم حاول مجددًا.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر تنفيذ العملية.';
      if (/cancel|canceled|cancelled|ألغ/i.test(message)) return;
      const active = await isVpnConnected().catch(() => connected);
      setConnected(active);
      setStatusMessage(message);
      Alert.alert('RAID VPN', message);
    } finally {
      operationInFlight.current = false;
      setBusy(false);
    }
  };

  const stateLabel = connected
    ? 'متصل ومحمي'
    : !signedIn
      ? 'يلزم تسجيل الدخول'
      : ready
        ? 'جاهز للاتصال'
        : 'إعداد أول مرة';

  const mainTitle = connected
    ? 'RAID VPN يعمل الآن'
    : !signedIn
      ? 'دخول إلى حساب RAID'
      : ready
        ? 'WireGuard جاهز'
        : 'تشغيل RAID VPN';

  const description = connected
    ? 'النفق يعمل عبر WireGuard الحقيقي على Android.'
    : !signedIn
      ? 'استخدم حساب RAID نفسه المستخدم في بقية خدمات التطبيق.'
      : ready
        ? 'الإعداد محفوظ بأمان. اضغط الزر للاتصال مباشرة.'
        : 'اضغط تشغيل VPN. في أول مرة فقط سيطلب Android اختيار ملف WireGuard ثم سيحفظه التطبيق ويشغله فورًا.';

  const sourceLabel = source === 'local'
    ? 'محلي'
    : source === 'service'
      ? 'RAID Server'
      : source === 'cache'
        ? 'نسخة آمنة'
        : 'غير مهيأ';

  return (
    <SafeAreaView edges={['top', 'bottom']} style={s.root}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.back} accessibilityRole="button" accessibilityLabel="رجوع">
          <Text style={s.backText}>‹</Text>
        </Pressable>
        <View style={s.headText}>
          <Text style={s.title}>RAID VPN</Text>
          <Text style={s.sub}>WireGuard Secure Tunnel</Text>
        </View>
        <View style={[s.dot, connected && s.dotOn]} />
      </View>

      <View style={s.body}>
        <View style={[s.hero, connected && s.heroOn]}>
          <Text style={s.state}>{stateLabel}</Text>
          <View style={[s.circle, connected && s.circleOn]}>
            <Text style={s.symbol}>{connected ? '◆' : '◇'}</Text>
          </View>
          <Text style={s.mainTitle}>{mainTitle}</Text>
          <Text style={s.desc}>{description}</Text>
          {!!statusMessage && <Text style={s.statusMessage}>{statusMessage}</Text>}
          <Pressable disabled={busy} onPress={toggle} style={[s.primary, connected && s.stop, busy && s.disabled]} accessibilityRole="button" accessibilityLabel={connected ? 'قطع اتصال RAID VPN' : 'تشغيل RAID VPN'}>
            {busy
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.primaryText}>{connected ? 'قطع الاتصال' : !signedIn ? 'تسجيل الدخول' : 'تشغيل VPN'}</Text>}
          </Pressable>
          {!connected && !ready && signedIn ? (
            <Pressable onPress={openProtonFree} disabled={busy} style={s.setupLink} accessibilityRole="link">
              <Text style={s.setupLinkText}>ليس لديك ملف WireGuard؟ الحصول على إعداد مجاني</Text>
            </Pressable>
          ) : null}
          {!connected && ready && signedIn ? (
            <View style={s.profileActions}>
              <Pressable onPress={replaceProfile} disabled={busy} style={s.profileAction} accessibilityRole="button" accessibilityLabel="استبدال ملف WireGuard">
                <Text style={s.profileActionText}>استبدال ملف VPN</Text>
              </Pressable>
              <Pressable onPress={resetProfile} disabled={busy} style={s.profileAction} accessibilityRole="button" accessibilityLabel="حذف إعداد WireGuard المحفوظ">
                <Text style={s.profileActionDanger}>حذف الإعداد</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={s.row}>
          <View style={s.card}><Text style={s.cardLabel}>الحساب</Text><Text style={s.cardValue}>{signedIn ? 'متصل' : 'غير مسجّل'}</Text></View>
          <View style={s.card}><Text style={s.cardLabel}>مصدر VPN</Text><Text style={s.cardValue}>{sourceLabel}</Text></View>
        </View>

        <Pressable onPress={refresh} disabled={busy} style={[s.secondary, busy && s.disabled]}>
          <Text style={s.secondaryText}>تحديث حالة الخدمة</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:'#060910'},
  header:{minHeight:72,flexDirection:'row',alignItems:'center',paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:'#172033',gap:10},
  back:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#111827'},
  backText:{fontSize:32,color:'#fff',marginTop:-4},headText:{flex:1,alignItems:'center'},title:{color:'#fff',fontSize:20,fontWeight:'900'},sub:{color:'#8B5CF6',fontSize:11,fontWeight:'800',marginTop:2},
  dot:{width:11,height:11,borderRadius:6,backgroundColor:'#475569'},dotOn:{backgroundColor:'#34D399'},body:{padding:18},
  hero:{padding:24,borderRadius:28,alignItems:'center',backgroundColor:'#0E1524',borderWidth:1,borderColor:'#202A3D'},heroOn:{backgroundColor:'#0B1818',borderColor:'#225C4D'},
  state:{color:'#A78BFA',fontSize:12,fontWeight:'900',textAlign:'center'},circle:{width:112,height:112,borderRadius:56,alignItems:'center',justifyContent:'center',marginTop:22,backgroundColor:'#12182A',borderWidth:7,borderColor:'#0E1422'},circleOn:{backgroundColor:'#123B33',borderColor:'#0E2924'},symbol:{fontSize:48,color:'#C4B5FD'},
  mainTitle:{fontSize:24,fontWeight:'900',color:'#fff',marginTop:18,textAlign:'center'},desc:{color:'#94A3B8',lineHeight:21,marginTop:8,textAlign:'center'},statusMessage:{color:'#FBBF24',fontSize:12,lineHeight:18,textAlign:'center',marginTop:10},
  primary:{width:'100%',height:56,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:'#7C3AED',marginTop:22},stop:{backgroundColor:'#B4233D'},disabled:{opacity:.55},primaryText:{color:'#fff',fontSize:16,fontWeight:'900'},setupLink:{marginTop:14,paddingVertical:6,paddingHorizontal:8},setupLinkText:{color:'#A78BFA',fontSize:12,fontWeight:'800',textAlign:'center'},
  profileActions:{width:'100%',flexDirection:'row-reverse',gap:10,marginTop:12},profileAction:{flex:1,minHeight:42,borderRadius:13,alignItems:'center',justifyContent:'center',paddingHorizontal:10,backgroundColor:'#141C2C',borderWidth:1,borderColor:'#2A3750'},profileActionText:{color:'#C4B5FD',fontSize:12,fontWeight:'900'},profileActionDanger:{color:'#FDA4AF',fontSize:12,fontWeight:'900'},
  row:{flexDirection:'row',gap:12,marginTop:14},card:{flex:1,padding:16,borderRadius:18,backgroundColor:'#0E1524',borderWidth:1,borderColor:'#1E293B'},cardLabel:{color:'#64748B',fontSize:11,fontWeight:'800',textAlign:'right'},cardValue:{color:'#F8FAFC',fontSize:15,fontWeight:'900',textAlign:'right',marginTop:8},
  secondary:{height:50,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:'#151E2E',marginTop:14},secondaryText:{color:'#C4B5FD',fontWeight:'900'}
});