import { useEffect, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { clearWireGuardConfig, connectVpn, disconnectVpn, isVpnConnected, loadWireGuardConfig, saveWireGuardConfig } from '@/lib/vpn';

export default function VpnScreen() {
  const [config, setConfig] = useState('');
  const [hasSavedConfig, setHasSavedConfig] = useState(false);
  const [editing, setEditing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('غير متصل');

  const refresh = async () => {
    try {
      const active = await isVpnConnected();
      setConnected(active);
      setStatus(active ? 'متصل عبر WireGuard' : 'غير متصل');
    } catch {
      setConnected(false);
      setStatus('يتطلب إعادة بناء APK لدعم VPN');
    }
  };

  useEffect(() => {
    loadWireGuardConfig().then((value) => {
      if (value) {
        setConfig(value);
        setHasSavedConfig(true);
      } else {
        setEditing(true);
      }
    }).catch(() => setEditing(true));
    refresh();
  }, []);

  const save = async () => {
    try {
      await saveWireGuardConfig(config);
      setHasSavedConfig(true);
      setEditing(false);
      Alert.alert('RAID VPN', 'تم حفظ إعداد WireGuard بأمان. من الآن يكفي الضغط على اتصال VPN.');
    } catch (e) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذر حفظ الإعداد.');
    }
  };

  const connect = async () => {
    setBusy(true);
    setStatus('جارٍ الاتصال...');
    try {
      if (editing || !hasSavedConfig) {
        await saveWireGuardConfig(config);
        setHasSavedConfig(true);
        setEditing(false);
      }
      await connectVpn();
      setConnected(true);
      setStatus('متصل عبر WireGuard');
    } catch (e) {
      setConnected(false);
      setStatus('فشل الاتصال');
      Alert.alert('VPN', e instanceof Error ? e.message : 'تعذر الاتصال بالخادم.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await disconnectVpn();
      setConnected(false);
      setStatus('غير متصل');
    } catch (e) {
      Alert.alert('VPN', e instanceof Error ? e.message : 'تعذر قطع الاتصال.');
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (connected) await disconnectVpn().catch(() => {});
    await clearWireGuardConfig();
    setConfig('');
    setHasSavedConfig(false);
    setEditing(true);
    setConnected(false);
    setStatus('غير متصل');
  };

  const canConnect = hasSavedConfig || !!config.trim();

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>RAID VPN</Text>
          <Text style={styles.subtitle}>WireGuard Native Tunnel</Text>
        </View>
        <View style={[styles.dot, connected && styles.dotOn]} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>الحالة</Text>
          <Text style={[styles.statusValue, connected && styles.connected]}>{status}</Text>
          <Text style={styles.info}>{hasSavedConfig ? 'الإعداد محفوظ بأمان على هذا الجهاز. اضغط الزر أدناه للاتصال أو قطع الاتصال.' : 'أدخل إعداد WireGuard الحقيقي مرة واحدة فقط. بعد حفظه سيصبح الاتصال بنقرة واحدة.'}</Text>
        </View>

        {editing ? (
          <>
            <Text style={styles.section}>إعداد WireGuard</Text>
            <TextInput
              value={config}
              onChangeText={setConfig}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              textAlignVertical="top"
              placeholder={'[Interface]\nPrivateKey = ...\nAddress = ...\nDNS = ...\n\n[Peer]\nPublicKey = ...\nEndpoint = host:port\nAllowedIPs = 0.0.0.0/0, ::/0'}
              placeholderTextColor="#475569"
              style={styles.editor}
            />
            <Pressable disabled={busy || !config.trim()} onPress={save} style={[styles.secondaryWide, (busy || !config.trim()) && styles.disabled]}>
              <Text style={styles.secondaryText}>حفظ الإعداد على هذا الجهاز</Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.savedCard}>
            <Text style={styles.savedTitle}>✓ إعداد VPN محفوظ</Text>
            <Text style={styles.savedText}>المفتاح الخاص مخفي ولا يظهر في الشاشة.</Text>
            <Pressable disabled={busy || connected} onPress={() => setEditing(true)} style={styles.editButton}><Text style={styles.editText}>تغيير الإعداد</Text></Pressable>
          </View>
        )}

        <Pressable disabled={busy || (!connected && !canConnect)} onPress={connected ? disconnect : connect} style={[styles.primary, (busy || (!connected && !canConnect)) && styles.disabled, connected && styles.stop]}>
          <Text style={styles.primaryText}>{busy ? 'انتظر...' : connected ? 'قطع الاتصال' : 'اتصال VPN'}</Text>
        </Pressable>

        {hasSavedConfig && <Pressable disabled={busy} onPress={clear} style={styles.clear}><Text style={styles.clearText}>حذف إعداد VPN من الجهاز</Text></Pressable>}

        <View style={styles.note}>
          <Text style={styles.noteTitle}>الأمان</Text>
          <Text style={styles.noteText}>يُحفظ إعداد WireGuard محليًا عبر SecureStore ولا تتم إضافته إلى GitHub أو تضمينه داخل APK.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:'#070B14'},header:{height:68,flexDirection:'row',alignItems:'center',paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:'#1E293B',gap:12},back:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#111827'},backText:{fontSize:32,color:'#fff',marginTop:-3},headerText:{flex:1},title:{color:'#fff',fontWeight:'900',fontSize:21},subtitle:{color:'#8B5CF6',fontWeight:'700',fontSize:12,marginTop:2},dot:{width:13,height:13,borderRadius:8,backgroundColor:'#475569'},dotOn:{backgroundColor:'#22C55E'},content:{padding:18,paddingBottom:40},statusCard:{padding:18,borderRadius:22,backgroundColor:'#101827',borderWidth:1,borderColor:'#27324A'},statusLabel:{color:'#64748B',fontSize:12,fontWeight:'700'},statusValue:{color:'#E2E8F0',fontSize:25,fontWeight:'900',marginTop:5},connected:{color:'#4ADE80'},info:{color:'#94A3B8',lineHeight:21,marginTop:12,textAlign:'right'},section:{color:'#F8FAFC',fontWeight:'900',fontSize:17,marginTop:24,marginBottom:10,textAlign:'right'},editor:{minHeight:280,borderRadius:20,borderWidth:1,borderColor:'#27324A',backgroundColor:'#0B1220',color:'#E2E8F0',padding:15,fontFamily:'monospace',fontSize:12,lineHeight:18},primary:{marginTop:18,minHeight:58,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'#7C3AED'},primaryText:{color:'#fff',fontWeight:'900',fontSize:17},stop:{backgroundColor:'#B91C1C'},secondaryWide:{marginTop:12,minHeight:50,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:'#172033'},secondaryText:{color:'#fff',fontWeight:'800'},disabled:{opacity:.45},savedCard:{marginTop:20,padding:18,borderRadius:20,backgroundColor:'#0D1726',borderWidth:1,borderColor:'#1F3A2D'},savedTitle:{color:'#4ADE80',fontSize:17,fontWeight:'900',textAlign:'right'},savedText:{color:'#94A3B8',marginTop:6,textAlign:'right'},editButton:{marginTop:12,minHeight:42,alignItems:'center',justifyContent:'center',borderRadius:13,backgroundColor:'#172033'},editText:{color:'#C4B5FD',fontWeight:'800'},clear:{marginTop:12,minHeight:48,alignItems:'center',justifyContent:'center'},clearText:{color:'#F87171',fontWeight:'800'},note:{marginTop:20,padding:16,borderRadius:18,backgroundColor:'#0D1726'},noteTitle:{color:'#C4B5FD',fontWeight:'900',marginBottom:6,textAlign:'right'},noteText:{color:'#94A3B8',lineHeight:20,textAlign:'right'}
});
