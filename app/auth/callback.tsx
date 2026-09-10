import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { completeOAuthRedirect, normalizeOAuthError } from '@/lib/oauth-callback';

WebBrowser.maybeCompleteAuthSession();

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const [message, setMessage] = useState('جارٍ إكمال تسجيل الدخول…');
  const [failed, setFailed] = useState(false);

  const callbackUrl = useMemo(() => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      const resolved = Array.isArray(value) ? value[0] : value;
      if (resolved != null) query.set(key, String(resolved));
    }
    const suffix = query.toString();
    return `raidbrowser://auth/callback${suffix ? `?${suffix}` : ''}`;
  }, [params]);

  useEffect(() => {
    let alive = true;
    const complete = async () => {
      try {
        await completeOAuthRedirect(callbackUrl);
        if (alive) router.replace('/');
      } catch (error) {
        if (!alive) return;
        const normalized = error instanceof Error ? normalizeOAuthError(error.message) : new Error('تعذر إكمال تسجيل الدخول.');
        if (normalized.message === 'GOOGLE_EXTERNAL_CODE_EXCHANGE_FAILED') {
          setMessage('Google أكمل اختيار الحساب، لكن خادم Google رفض بيانات OAuth المرتبطة بـ Supabase. يلزم تصحيح Client ID/Secret الخارجي على الخادم قبل أن تنشأ جلسة RAID.');
        } else if (normalized.message === 'GOOGLE_PROVIDER_DISABLED') {
          setMessage('تسجيل Google غير مفعّل على خادم RAID.');
        } else if (normalized.message === 'GOOGLE_PKCE_SESSION_MISMATCH') {
          setMessage('انتهت محاولة تسجيل Google أو فُقدت جلسة التحقق الآمنة. أعد المحاولة من زر Google داخل RAID مرة واحدة فقط.');
        } else {
          setMessage(normalized.message);
        }
        setFailed(true);
      }
    };
    void complete();
    return () => { alive = false; };
  }, [callbackUrl]);

  return <SafeAreaView style={s.root}>
    <View style={s.card}>
      {!failed ? <ActivityIndicator size="large" color="#8E7A6A" /> : <Text style={s.mark}>!</Text>}
      <Text style={s.title}>{failed ? 'تعذر تسجيل الدخول' : 'RAID Account'}</Text>
      <Text style={s.text}>{message}</Text>
      {failed ? <Pressable onPress={() => router.replace('/login')} style={s.button}><Text style={s.buttonText}>إعادة المحاولة</Text></Pressable> : null}
    </View>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:'#EDE9E4',alignItems:'center',justifyContent:'center',padding:24},
  card:{width:'100%',maxWidth:480,borderRadius:28,padding:28,backgroundColor:'rgba(255,255,255,.76)',borderWidth:1,borderColor:'#D8D1CA',alignItems:'center'},
  mark:{width:54,height:54,borderRadius:27,textAlign:'center',textAlignVertical:'center',fontSize:31,fontWeight:'900',color:'#7A4E45',backgroundColor:'#F1E4DF'},
  title:{marginTop:18,fontSize:24,fontWeight:'900',color:'#302C29',textAlign:'center'},
  text:{marginTop:10,color:'#746D67',lineHeight:22,textAlign:'center'},
  button:{marginTop:22,minHeight:50,paddingHorizontal:20,borderRadius:17,backgroundColor:'#8E7A6A',alignItems:'center',justifyContent:'center'},
  buttonText:{color:'#FFFDF9',fontWeight:'900'}
});
