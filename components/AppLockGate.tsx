import { PropsWithChildren, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authenticateAppLock, getAppLockSettings, type AppLockSettings } from '@/lib/app-lock';

export function AppLockGate({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState<AppLockSettings | null>(null);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const backgroundAt = useRef<number | null>(null);
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const authInProgress = useRef(false);

  const refreshSettings = useCallback(async () => {
    const next = await getAppLockSettings().catch(() => null);
    if (!mounted.current || !next) return null;
    setSettings(next);
    return next;
  }, []);

  const unlock = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    authInProgress.current = true;
    backgroundAt.current = null;
    if (mounted.current) {
      setBusy(true);
      setMessage('');
    }
    try {
      const success = await authenticateAppLock();
      if (!mounted.current) return;
      if (success) setLocked(false);
      else setMessage('لم يتم فتح RAID. جرّب مرة ثانية أو استخدم قفل الجهاز.');
    } catch {
      if (mounted.current) setMessage('تعذر تشغيل حماية الجهاز الآن.');
    } finally {
      authInProgress.current = false;
      busyRef.current = false;
      backgroundAt.current = null;
      if (mounted.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refreshSettings().then((next) => {
      if (!mounted.current || !next?.enabled) return;
      setLocked(true);
      setTimeout(() => { if (mounted.current) void unlock(); }, 120);
    });
    return () => { mounted.current = false; };
  }, [refreshSettings, unlock]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      // Android can briefly mark the app inactive while the biometric/device
      // credential prompt is on screen. That transition must not start a new
      // lock timer or a successful unlock could immediately prompt again.
      if (authInProgress.current) {
        backgroundAt.current = null;
        return;
      }
      if (state === 'inactive' || state === 'background') {
        backgroundAt.current = Date.now();
        return;
      }
      if (state !== 'active') return;
      void refreshSettings().then((next) => {
        if (!next?.enabled || !next.lockOnBackground) {
          backgroundAt.current = null;
          return;
        }
        const started = backgroundAt.current;
        backgroundAt.current = null;
        if (!started) return;
        const elapsed = (Date.now() - started) / 1000;
        if (elapsed < next.graceSeconds) return;
        setLocked(true);
        setTimeout(() => { if (mounted.current) void unlock(); }, 120);
      });
    });
    return () => sub.remove();
  }, [refreshSettings, unlock]);

  if (!settings) {
    return <View style={s.loading}><ActivityIndicator size="large" color="#D5AA88" /><Text style={s.loadingText}>RAID Browser</Text></View>;
  }

  return <View style={s.fill}>
    {children}
    {locked && <View style={s.lock} accessibilityViewIsModal accessibilityRole="summary">
      <View style={s.glowA}/><View style={s.glowB}/>
      <View style={s.card}>
        <View style={s.logo}><Ionicons name="shield-checkmark" size={34} color="#D5AA88"/></View>
        <Text style={s.kicker}>RAID PRIVACY</Text>
        <Text style={s.title}>المتصفح مقفول</Text>
        <Text style={s.body}>افتحه ببصمة أو وجه الجهاز. إذا ما متوفر، Android يقدر يستخدم رمز قفل الجهاز المدعوم.</Text>
        {!!message && <Text style={s.error}>{message}</Text>}
        <Pressable disabled={busy} onPress={() => void unlock()} style={({pressed})=>[s.button,(pressed||busy)&&s.pressed]} accessibilityRole="button" accessibilityLabel="فتح RAID Browser">
          {busy ? <ActivityIndicator color="#fff"/> : <><Ionicons name="finger-print" size={22} color="#fff"/><Text style={s.buttonText}>فتح RAID</Text></>}
        </Pressable>
      </View>
    </View>}
  </View>;
}

const s=StyleSheet.create({
  fill:{flex:1},loading:{flex:1,alignItems:'center',justifyContent:'center',gap:14,backgroundColor:'#070B14'},loadingText:{color:'#E7DED5',fontSize:13,fontWeight:'900',letterSpacing:.8},
  lock:{...StyleSheet.absoluteFillObject,zIndex:9999,alignItems:'center',justifyContent:'center',padding:22,backgroundColor:'#070B14',overflow:'hidden'},glowA:{position:'absolute',width:300,height:300,borderRadius:150,backgroundColor:'rgba(213,170,136,.10)',top:-90,right:-70},glowB:{position:'absolute',width:240,height:240,borderRadius:120,backgroundColor:'rgba(63,128,116,.12)',bottom:-70,left:-70},card:{width:'100%',maxWidth:390,borderRadius:28,borderWidth:1,borderColor:'#353B43',backgroundColor:'#121821',padding:24,alignItems:'center'},logo:{width:70,height:70,borderRadius:24,borderWidth:1,borderColor:'#4A423C',backgroundColor:'#211D1A',alignItems:'center',justifyContent:'center'},kicker:{marginTop:18,color:'#D5AA88',fontSize:10,fontWeight:'900',letterSpacing:1.6},title:{marginTop:6,color:'#F7F3EE',fontSize:25,fontWeight:'900',textAlign:'center'},body:{marginTop:10,color:'#AEB6C0',fontSize:12,lineHeight:20,textAlign:'center'},error:{marginTop:12,color:'#E4A096',fontSize:11,lineHeight:17,textAlign:'center'},button:{marginTop:20,minHeight:52,width:'100%',borderRadius:17,backgroundColor:'#9A6E50',flexDirection:'row-reverse',gap:9,alignItems:'center',justifyContent:'center'},buttonText:{color:'#fff',fontSize:14,fontWeight:'900'},pressed:{opacity:.72,transform:[{scale:.99}]}
});
