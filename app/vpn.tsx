import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { connectVpn, disconnectVpn, getVpnProvisioningState, isVpnConnected } from '@/lib/vpn';
import { getCurrentSession } from '@/lib/auth';

export default function VpnScreen() {
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
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
      if (session && !profile.configured) {
        setStatusMessage('الحساب متصل، لكن لم يُخصص له خادم WireGuard بعد.');
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

  const toggle = async () => {
    if (!signedIn) {
      router.push('/login');
      return;
    }

    if (!ready && !connected) {
      await refresh();
      if (!ready) {
        Alert.alert(
          'RAID VPN',
          'تسجيل الدخول يعمل. المشكلة أن حسابك لا يملك ملف WireGuard فعليًا على الخادم حتى الآن.',
        );
      }
      return;
    }

    setBusy(true);
    setStatusMessage('');
    try {
      if (connected) {
        await disconnectVpn();
        setConnected(false);
      } else {
        await connectVpn();
        setConnected(true);
      }
    } catch (error) {
      Alert.alert('RAID VPN', error instanceof Error ? error.message : 'تعذر تنفيذ العملية.');
    } finally {
      setBusy(false);
    }
  };

  const stateLabel = connected ? 'متصل ومحمي' : !signedIn ? 'يلزم تسجيل الدخول' : ready ? 'جاهز للاتصال' : 'الحساب متصل • VPN غير مخصص';
  const mainTitle = connected ? 'RAID VPN يعمل الآن' : !signedIn ? 'دخول إلى حساب RAID' : ready ? 'اتصال WireGuard جاهز' : 'الخدمة تنتظر خادم VPN';
  const description = connected
    ? 'النفق يعمل عبر WireGuard الحقيقي على Android.'
    : !signedIn
      ? 'استخدم حساب RAID نفسه الذي يعمل معه الذكاء الاصطناعي.'
      : ready
        ? 'تم جلب إعداد WireGuard من بوابة RAID الآمنة ويمكن بدء الاتصال.'
        : 'لا توجد مشكلة في تسجيل الدخول. لا يوجد Profile VPN فعلي لهذا الحساب في الخادم حاليًا.';

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
              : <Text style={s.primaryText}>{connected ? 'قطع الاتصال' : !signedIn ? 'تسجيل الدخول' : ready ? 'تشغيل VPN' : 'إعادة فحص الخدمة'}</Text>}
          </Pressable>
        </View>

        <View style={s.row}>
          <View style={s.card}><Text style={s.cardLabel}>الحساب</Text><Text style={s.cardValue}>{signedIn ? 'متصل' : 'غير مسجّل'}</Text></View>
          <View style={s.card}><Text style={s.cardLabel}>ملف VPN</Text><Text style={s.cardValue}>{ready ? 'جاهز' : 'غير مخصص'}</Text></View>
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
  row:{flexDirection:'row',gap:12,marginTop:14},card:{flex:1,padding:16,borderRadius:18,backgroundColor:'#0E1524',borderWidth:1,borderColor:'#1E293B'},cardLabel:{color:'#64748B',fontSize:11,fontWeight:'800',textAlign:'right'},cardValue:{color:'#F8FAFC',fontSize:15,fontWeight:'900',textAlign:'right',marginTop:8},
  secondary:{height:50,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:'#151E2E',marginTop:14},secondaryText:{color:'#C4B5FD',fontWeight:'900'}
});
