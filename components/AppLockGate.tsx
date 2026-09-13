import { PropsWithChildren, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';
import { getAppLockSettings, type AppLockSettings } from '@/lib/app-lock';

export function AppLockGate({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [privacyShield, setPrivacyShield] = useState(false);
  const [message, setMessage] = useState('');
  const settingsRef = useRef<AppLockSettings | null>(null);
  const backgroundAt = useRef<number | null>(null);
  const authenticating = useRef(false);

  const authenticate = useCallback(async (force = false) => {
    const settings = settingsRef.current;
    if (!settings?.enabled && !force) {
      setLocked(false);
      setPrivacyShield(false);
      return true;
    }
    if (authenticating.current) return false;
    authenticating.current = true;
    setMessage('');
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'فتح RAID Browser',
        promptSubtitle: 'أكد هويتك للمتابعة',
        cancelLabel: 'إلغاء',
        fallbackLabel: 'استخدام رمز الجهاز',
        disableDeviceFallback: false,
      });
      if (result.success) {
        setLocked(false);
        setPrivacyShield(false);
        return true;
      }
      setLocked(true);
      setPrivacyShield(true);
      setMessage('بقي المتصفح مقفولًا. اضغط فتح وحاول مرة ثانية.');
      return false;
    } catch {
      setLocked(true);
      setPrivacyShield(true);
      setMessage('تعذر تشغيل تحقق الجهاز الآن. حاول مرة ثانية.');
      return false;
    } finally {
      authenticating.current = false;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void getAppLockSettings()
      .then(async (settings) => {
        if (!alive) return;
        settingsRef.current = settings;
        if (settings.enabled) {
          setLocked(true);
          setPrivacyShield(true);
          setReady(true);
          await authenticate();
          return;
        }
        setLocked(false);
        setPrivacyShield(false);
        setReady(true);
      })
      .catch(() => {
        if (!alive) return;
        setLocked(false);
        setPrivacyShield(false);
        setReady(true);
      });
    return () => { alive = false; };
  }, [authenticate]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const settings = settingsRef.current;
      if (state === 'background' || state === 'inactive') {
        backgroundAt.current = Date.now();
        if (settings?.enabled) setPrivacyShield(true);
        return;
      }
      if (state !== 'active') return;
      void getAppLockSettings().then((latest) => {
        settingsRef.current = latest;
        if (!latest.enabled) {
          setLocked(false);
          setPrivacyShield(false);
          backgroundAt.current = null;
          return;
        }
        const leftAt = backgroundAt.current;
        backgroundAt.current = null;
        if (!latest.lockOnBackground || leftAt == null) {
          setPrivacyShield(false);
          return;
        }
        if (Date.now() - leftAt >= latest.gracePeriodMs) {
          setLocked(true);
          setPrivacyShield(true);
          void authenticate();
          return;
        }
        setPrivacyShield(false);
      }).catch(() => {
        if (settings?.enabled) {
          setLocked(true);
          setPrivacyShield(true);
        }
      });
    });
    return () => subscription.remove();
  }, [authenticate]);

  if (!ready) {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#D5AA88" /><Text style={styles.loadingText}>RAID Browser</Text></View>;
  }

  if (!locked && !privacyShield) return <>{children}</>;

  return <View style={styles.root}>
    <View style={styles.glowOne} />
    <View style={styles.glowTwo} />
    <View style={styles.card}>
      <View style={styles.iconWrap}><Ionicons name="lock-closed" size={30} color="#E7C7AA" /></View>
      <Text style={styles.kicker}>RAID APP LOCK</Text>
      <Text style={styles.title}>{locked ? 'المتصفح مقفول' : 'RAID محمي'}</Text>
      <Text style={styles.body}>{locked ? 'استخدم بصمة أو وجه الجهاز. إذا كان جهازك يسمح، يبقى رمز القفل كخيار احتياطي.' : 'تم إخفاء محتوى المتصفح أثناء وجود التطبيق في الخلفية لحماية خصوصيتك.'}</Text>
      {!!message && <Text style={styles.message}>{message}</Text>}
      {locked && <Pressable onPress={() => void authenticate(true)} style={({ pressed }) => [styles.button, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="فتح RAID Browser">
        <Ionicons name="finger-print" size={22} color="#0B1018" />
        <Text style={styles.buttonText}>فتح RAID</Text>
      </Pressable>}
      <Text style={styles.note}>التحقق يتم بواسطة Android ولا يرسل RAID بصمتك أو وجهك لأي خادم.</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  loading:{flex:1,backgroundColor:'#070B14',alignItems:'center',justifyContent:'center',gap:14},
  loadingText:{color:'#E9EEF5',fontSize:16,fontWeight:'900',letterSpacing:.8},
  root:{flex:1,backgroundColor:'#070B14',alignItems:'center',justifyContent:'center',padding:24,overflow:'hidden'},
  glowOne:{position:'absolute',width:260,height:260,borderRadius:130,backgroundColor:'rgba(213,170,136,.10)',top:-70,right:-90},
  glowTwo:{position:'absolute',width:220,height:220,borderRadius:110,backgroundColor:'rgba(79,118,150,.09)',bottom:-80,left:-70},
  card:{width:'100%',maxWidth:430,borderRadius:28,borderWidth:1,borderColor:'rgba(213,170,136,.22)',backgroundColor:'rgba(15,23,35,.96)',padding:24,alignItems:'center'},
  iconWrap:{width:66,height:66,borderRadius:22,borderWidth:1,borderColor:'rgba(213,170,136,.30)',backgroundColor:'rgba(213,170,136,.08)',alignItems:'center',justifyContent:'center',marginBottom:16},
  kicker:{fontSize:10,fontWeight:'900',letterSpacing:1.4,color:'#D5AA88'},
  title:{marginTop:6,fontSize:24,fontWeight:'900',color:'#F4F7FB',textAlign:'center'},
  body:{marginTop:10,fontSize:12,lineHeight:20,color:'#9AA8B8',textAlign:'center'},
  message:{marginTop:12,fontSize:11,lineHeight:18,color:'#E0A16F',textAlign:'center'},
  button:{marginTop:20,minHeight:52,width:'100%',borderRadius:17,backgroundColor:'#E3C09E',flexDirection:'row-reverse',gap:9,alignItems:'center',justifyContent:'center'},
  buttonText:{color:'#0B1018',fontSize:15,fontWeight:'900'},
  note:{marginTop:14,fontSize:9.5,lineHeight:16,color:'#728094',textAlign:'center'},
  pressed:{opacity:.8,transform:[{scale:.99}]},
});
