import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { getCurrentSession, getSupabase, syncCurrentUserProfileBestEffort } from '@/lib/auth';

WebBrowser.maybeCompleteAuthSession();

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{
    code?: string | string[];
    error?: string | string[];
    error_description?: string | string[];
  }>();
  const [message, setMessage] = useState('جارٍ إكمال تسجيل الدخول…');
  const [failed, setFailed] = useState(false);
  const completedCode = useRef<string | null>(null);

  const errorText = useMemo(() => {
    const value = params.error_description ?? params.error;
    return Array.isArray(value) ? value[0] : value;
  }, [params.error, params.error_description]);

  useEffect(() => {
    let alive = true;
    const complete = async () => {
      try {
        if (errorText) throw new Error(decodeURIComponent(String(errorText).replace(/\+/g, ' ')));

        let session = await getCurrentSession().catch(() => null);
        const codeValue = params.code;
        const code = Array.isArray(codeValue) ? codeValue[0] : codeValue;

        if (!session && code && completedCode.current !== code) {
          completedCode.current = code;
          const { data, error } = await getSupabase().auth.exchangeCodeForSession(code);
          if (error) throw error;
          session = data.session;
        }

        if (!session?.user) throw new Error('لم تُنشأ جلسة Google صالحة. أعد المحاولة.');
        await syncCurrentUserProfileBestEffort();
        if (alive) router.replace('/');
      } catch (error) {
        if (!alive) return;
        const raw = error instanceof Error ? error.message : 'تعذر إكمال تسجيل الدخول.';
        setMessage(/unable to exchange external code/i.test(raw)
          ? 'تعذر على خادم Google/Supabase إكمال المصادقة. إعدادات OAuth الخارجية تحتاج تصحيحًا.'
          : raw);
        setFailed(true);
      }
    };
    void complete();
    return () => { alive = false; };
  }, [errorText, params.code]);

  return <SafeAreaView style={s.root}>
    <View style={s.card}>
      {!failed ? <ActivityIndicator size="large" color="#8E7A6A" /> : <Text style={s.mark}>!</Text>}
      <Text style={s.title}>{failed ? 'تعذر تسجيل الدخول' : 'RAID Account'}</Text>
      <Text style={s.text}>{message}</Text>
      {failed ? <Pressable onPress={() => router.replace('/login')} style={s.button}><Text style={s.buttonText}>العودة لتسجيل الدخول</Text></Pressable> : null}
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
