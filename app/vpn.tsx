import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { connectVpn, disconnectVpn, getVpnProvisioningState, importLocalWireGuardConfig, isVpnConnected } from '@/lib/vpn';
import { getCurrentSession } from '@/lib/auth';

type VpnSource = 'service' | 'local' | 'cache' | 'none';

export default function VpnScreen() {
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [source, setSource] = useState<VpnSource>('none');
  const [busy, setBusy] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');

  const refresh = useCallback(async () => {
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
        setStatusMessage('ملف WireGuard المجاني محفوظ محليًا على هذا الهاتف فقط، ولا يُرفع المفتاح الخاص إلى RAID.');
      } else if (session && !profile.configured) {
        setStatusMessage('لا يوجد خادم RAID VPN مجاني مخصص حاليًا. يمكنك استخدام Proton VPN Free أو أي ملف WireGuard مجاني.');
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

  const openProtonFree = () => {
    Linking.openURL('https://account.protonvpn.com/downloads').catch(() => {
      Alert.alert('RAID VPN', 'تعذر فتح صفحة Proton VPN.');
    });
  };

  const importFreeConfig = async () => {
    if (!signedIn) {
      router.push('/login');
      return;
    }

    setBusy(true);
    setStatusMessage('');
    try {
      const profile = await importLocalWireGuardConfig();
      setReady(profile.configured);
      setSource(profile.source);
      setStatusMessage('تم حفظ ملف WireGuard محليًا بشكل آمن. جارٍ تشغيل النفق…');
      const active = await connectVpn();
      setConnected(Boolean(active));
      setStatusMessage(active
        ? 'RAID VPN يعمل الآن باستخدام ملف WireGuard المجاني المحفوظ محليًا.'
        : 'تم استيراد الملف بنجاح. اضغط تشغيل VPN للمحاولة مرة أخرى.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر استيراد ملف WireGuard.';
      if (/cancel|canceled|cancelled|ألغ/i.test(message)) return;
      Alert.alert('RAID VPN', message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async () => {
    if (!signedIn) {
      router.push('/login');
      return;
    }

    if (!ready && !connected) {
      await importFreeConfig();
      return;
    }

    setBusy(true);
    setStatusMessage('');
    try {
      if (connected) {
        await disconnectVpn();
        setConnected(false);
        setStatusMessage('تم قطع اتصال VPN.');
      } else {
        await connectVpn();
        setConnected(true);
        setStatusMessage(source === 'local'
          ? 'متصل عبر WireGuard المجاني المحفوظ محليًا.'
          : 'متصل عبر RAID WireGuard.');
      }
    } catch (error) {
      Alert.alert('RAID VPN', error instanceof Error ? error.message : 'تعذر تنفيذ العملية.');
    } finally {
      setBusy(false);
    }
  };

  const stateLabel = connected
    ? 'متصل ومحمي'
    : !signedIn
      ? 'يلزم تسجيل الدخول'
      : ready && source === 'local'
        ? 'VPN مجاني جاهز'
        : ready
          ? 'جاهز للاتصال'
          : 'لا يوجد ملف VPN';

  const mainTitle = connected
    ? 'RAID VPN يعمل الآن'
    : !signedIn
      ? 'دخول إلى حساب RAID'
      : ready && source === 'local'
        ? 'WireGuard مجاني جاهز'
        : ready
          ? 'اتصال WireGuard جاهز'
          : 'استخدم VPN مجاني حقيقي';

  const description = connected
    ? 'النفق يعمل عبر WireGuard الحقيقي على Android.'
    : !signedIn
      ? 'استخدم حساب RAID نفسه الذي يعمل معه الذكاء الاصطناعي.'
      : ready && source === 'local'
        ? 'تم استيراد ملف WireGuard إلى هذا الهاتف وحفظه داخل التخزين الآمن للتطبيق.'
        : ready
          ? 'تم جلب إعداد WireGuard من بوابة RAID الآمنة ويمكن بدء الاتصال.'
          : 'لا تحتاج إلى VPS مدفوع. يمكنك إنشاء ملف WireGuard مجاني من Proton VPN Free ثم استيراده مرة واحدة.';

  const sourceLabel = source === 'local'
    ? 'محلي مجاني'
    : source === 'service'
      ? 'RAID Server'
      : source === 'cache'
        ? 'نسخة آمنة'
        : 'غير موجود';

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
          <Pressable disabled={busy} onPress={toggle} style={[s.primary, connected && s.stop, busy && s.disabled]}>
            {busy
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.primaryText}>{connected ? 'قطع الاتصال' : !signedIn ? 'تسجيل الدخول' : ready ? 'تشغيل VPN' : 'استيراد VPN مجاني'}</Text>}
          </Pressable>
        </View>

        {!connected && source === 'none' && signedIn ? (
          <View style={s.freeBox}>
            <Text style={s.freeTitle}>VPN مجاني بدون خادم مدفوع</Text>
            <Text style={s.freeText}>Proton VPN Free يسمح بإنشاء ملف WireGuard قياسي. أنشئ الملف ثم اختره من هاتفك؛ RAID سيخزنه محليًا ولن يرسل PrivateKey إلى قاعدة البيانات.</Text>
            <View style={s.freeActions}>
              <Pressable onPress={openProtonFree} style={s.freeSecondary} disabled={busy}>
                <Text style={s.freeSecondaryText}>فتح Proton Free</Text>
              </Pressable>
              <Pressable onPress={importFreeConfig} style={s.freePrimary} disabled={busy}>
                <Text style={s.freePrimaryText}>اختيار ملف .conf</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

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
  primary:{width:'100%',height:56,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:'#7C3AED',marginTop:22},stop:{backgroundColor:'#B4233D'},disabled:{opacity:.55},primaryText:{color:'#fff',fontSize:16,fontWeight:'900'},
  freeBox:{marginTop:14,padding:16,borderRadius:20,backgroundColor:'#0B1320',borderWidth:1,borderColor:'#24324A'},freeTitle:{color:'#F8FAFC',fontSize:16,fontWeight:'900',textAlign:'right'},freeText:{color:'#94A3B8',fontSize:12,lineHeight:20,textAlign:'right',marginTop:7},freeActions:{flexDirection:'row',gap:10,marginTop:14},freePrimary:{flex:1,minHeight:46,borderRadius:14,backgroundColor:'#7C3AED',alignItems:'center',justifyContent:'center',paddingHorizontal:10},freePrimaryText:{color:'#fff',fontWeight:'900',fontSize:12},freeSecondary:{flex:1,minHeight:46,borderRadius:14,backgroundColor:'#172033',borderWidth:1,borderColor:'#334155',alignItems:'center',justifyContent:'center',paddingHorizontal:10},freeSecondaryText:{color:'#C4B5FD',fontWeight:'900',fontSize:12},
  row:{flexDirection:'row',gap:12,marginTop:14},card:{flex:1,padding:16,borderRadius:18,backgroundColor:'#0E1524',borderWidth:1,borderColor:'#1E293B'},cardLabel:{color:'#64748B',fontSize:11,fontWeight:'800',textAlign:'right'},cardValue:{color:'#F8FAFC',fontSize:15,fontWeight:'900',textAlign:'right',marginTop:8},
  secondary:{height:50,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:'#151E2E',marginTop:14},secondaryText:{color:'#C4B5FD',fontWeight:'900'}
});
