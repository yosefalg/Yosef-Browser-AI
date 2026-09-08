import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { connectVpn, disconnectVpn, getVpnProvisioningState, isVpnConnected } from '@/lib/vpn';
import { getCurrentSession } from '@/lib/auth';

export default function VpnScreen() {
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(true);

  const refresh = async () => {
    setBusy(true);
    try {
      const session = await getCurrentSession().catch(() => null);
      setSignedIn(Boolean(session));
      const active = await isVpnConnected().catch(() => false);
      const profile = session ? await getVpnProvisioningState() : { configured: false as const, source: 'none' as const };
      setConnected(active);
      setReady(profile.configured);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const toggle = async () => {
    if (!signedIn) {
      Alert.alert('RAID VPN', 'سجّل الدخول أولًا حتى نتحقق من ملف VPN المرتبط بحسابك.', [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'تسجيل الدخول', onPress: () => router.push('/login') },
      ]);
      return;
    }

    if (!ready && !connected) {
      Alert.alert(
        'RAID VPN غير مُجهّز بعد',
        'الحساب مسجّل بنجاح، لكن لا يوجد ملف WireGuard فعلي مخصص لهذا الحساب على الخادم. لن يعرض RAID اتصالًا وهميًا.',
      );
      return;
    }

    setBusy(true);
    try {
      if (connected) {
        await disconnectVpn();
        setConnected(false);
      } else {
        await connectVpn();
        setConnected(true);
      }
    } catch (e) {
      Alert.alert('RAID VPN', e instanceof Error ? e.message : 'تعذر تنفيذ العملية.');
    } finally {
      setBusy(false);
    }
  };

  const stateLabel = connected ? 'متصل ومحمي' : !signedIn ? 'يلزم تسجيل الدخول' : ready ? 'جاهز للاتصال' : 'الخادم غير مُجهّز';
  const mainTitle = connected ? 'RAID VPN يعمل الآن' : !signedIn ? 'سجّل الدخول أولًا' : ready ? 'اتصال حقيقي بنقرة واحدة' : 'لا يوجد نفق WireGuard لهذا الحساب';
  const description = connected
    ? 'الاتصال يعمل عبر نفق WireGuard الحقيقي.'
    : !signedIn
      ? 'بعد تسجيل الدخول سيتحقق RAID من ملف VPN الخاص بحسابك.'
      : ready
        ? 'ملف WireGuard موجود ومهيأ. يمكنك بدء الاتصال الآن.'
        : 'تسجيل الدخول يعمل، لكن الخادم لم يخصص بعد ملف VPN لهذا الحساب.';

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.back}><Text style={s.backText}>‹</Text></Pressable>
        <View style={s.headText}><Text style={s.title}>RAID VPN</Text><Text style={s.sub}>WireGuard</Text></View>
        <View style={[s.dot, connected && s.dotOn]} />
      </View>

      <View style={s.body}>
        <View style={[s.hero, connected && s.heroOn]}>
          <Text style={s.state}>{stateLabel}</Text>
          <View style={[s.circle, connected && s.circleOn]}><Text style={s.symbol}>{connected ? '◆' : '◇'}</Text></View>
          <Text style={s.mainTitle}>{mainTitle}</Text>
          <Text style={s.desc}>{description}</Text>
          <Pressable disabled={busy} onPress={toggle} style={[s.primary, connected && s.stop, busy && s.disabled]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>{connected ? 'قطع الاتصال' : !signedIn ? 'تسجيل الدخول' : ready ? 'تشغيل VPN' : 'فحص الإعداد'}</Text>}
          </Pressable>
        </View>

        <View style={s.row}>
          <View style={s.card}><Text style={s.cardLabel}>البروتوكول</Text><Text style={s.cardValue}>WireGuard</Text></View>
          <View style={s.card}><Text style={s.cardLabel}>الحساب</Text><Text style={s.cardValue}>{signedIn ? 'مسجّل' : 'غير مسجّل'}</Text></View>
        </View>

        <Pressable onPress={signedIn ? refresh : () => router.push('/login')} style={s.secondary}>
          <Text style={s.secondaryText}>{signedIn ? 'تحديث حالة الخدمة' : 'فتح تسجيل الدخول'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:'#070A12'},
  header:{height:68,flexDirection:'row',alignItems:'center',paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:'#182033'},
  back:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#111827'},
  backText:{fontSize:32,color:'#fff',marginTop:-4},headText:{flex:1,alignItems:'center'},title:{color:'#fff',fontSize:20,fontWeight:'900'},sub:{color:'#8B5CF6',fontSize:11,fontWeight:'800',marginTop:2},
  dot:{width:11,height:11,borderRadius:6,backgroundColor:'#475569'},dotOn:{backgroundColor:'#34D399'},body:{padding:18},
  hero:{padding:24,borderRadius:28,alignItems:'center',backgroundColor:'#0E1524',borderWidth:1,borderColor:'#202A3D'},heroOn:{backgroundColor:'#0B1818',borderColor:'#225C4D'},
  state:{color:'#A78BFA',fontSize:12,fontWeight:'900'},circle:{width:116,height:116,borderRadius:58,alignItems:'center',justifyContent:'center',marginTop:24,backgroundColor:'#181D35',borderWidth:8,borderColor:'#101626'},circleOn:{backgroundColor:'#123B33',borderColor:'#0E2924'},symbol:{fontSize:50,color:'#C4B5FD'},
  mainTitle:{fontSize:25,fontWeight:'900',color:'#fff',marginTop:20,textAlign:'center'},desc:{color:'#94A3B8',lineHeight:21,marginTop:8,textAlign:'center'},
  primary:{width:'100%',height:58,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'#7C3AED',marginTop:24},stop:{backgroundColor:'#B4233D'},disabled:{opacity:.55},primaryText:{color:'#fff',fontSize:16,fontWeight:'900'},
  row:{flexDirection:'row',gap:12,marginTop:14},card:{flex:1,padding:16,borderRadius:18,backgroundColor:'#0E1524',borderWidth:1,borderColor:'#1E293B'},cardLabel:{color:'#64748B',fontSize:11,fontWeight:'800',textAlign:'right'},cardValue:{color:'#F8FAFC',fontSize:15,fontWeight:'900',textAlign:'right',marginTop:8},
  secondary:{height:50,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:'#151E2E',marginTop:14},secondaryText:{color:'#C4B5FD',fontWeight:'900'}
});
