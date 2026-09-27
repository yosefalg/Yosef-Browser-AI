import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { signIn, signUp } from '@/lib/auth';
import { signInWithGoogle } from '@/lib/google-auth';

export default function LoginScreen(){
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [confirm,setConfirm]=useState('');
  const [name,setName]=useState('');
  const [mode,setMode]=useState<'signin'|'signup'>('signin');
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);
  const busyRef=useRef(false);
  const fade=useRef(new Animated.Value(0)).current;
  const lift=useRef(new Animated.Value(22)).current;

  useEffect(()=>{
    Animated.parallel([
      Animated.timing(fade,{toValue:1,duration:340,easing:Easing.out(Easing.cubic),useNativeDriver:true}),
      Animated.timing(lift,{toValue:0,duration:420,easing:Easing.out(Easing.cubic),useNativeDriver:true}),
    ]).start();
  },[fade,lift]);

  const beginAuth=()=>{
    if (busyRef.current) return false;
    busyRef.current=true;
    setBusy(true);
    setMsg('');
    return true;
  };

  const endAuth=()=>{
    busyRef.current=false;
    setBusy(false);
  };

  const choose=(next:'signin'|'signup')=>{
    if (busyRef.current) return;
    setMode(next);
    setMsg('');
  };

  const submit=async()=>{
    const cleanEmail=email.trim().toLowerCase();
    if (!cleanEmail.includes('@') || password.length < 6) {
      setMsg('أدخل بريدًا إلكترونيًا صحيحًا وكلمة مرور من 6 أحرف على الأقل.');
      return;
    }
    if (mode==='signup') {
      if (name.trim().length < 2) { setMsg('اكتب اسمك الذي سيظهر داخل حساب RAID.'); return; }
      if (password !== confirm) { setMsg('كلمتا المرور غير متطابقتين.'); return; }
    }

    if (!beginAuth()) return;
    try{
      if(mode==='signin') {
        const data=await signIn(cleanEmail,password);
        if (!data.session) throw new Error('تعذر إنشاء جلسة تسجيل دخول صالحة.');
        router.replace('/');
      } else {
        const data=await signUp(cleanEmail,password,name.trim());
        if (data.session) {
          router.replace('/');
        } else {
          setMsg('تم إنشاء الحساب. افتح رسالة التأكيد في بريدك، ثم ارجع وسجّل الدخول.');
          setMode('signin');
          setConfirm('');
        }
      }
    }catch(e){
      const raw=e instanceof Error?e.message:'';
      const lower=raw.toLowerCase();
      if(lower.includes('already registered')) setMsg('هذا البريد مسجل بالفعل. اختر تسجيل الدخول.');
      else if(lower.includes('invalid login')) setMsg('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
      else setMsg(raw||'تعذر إكمال العملية الآن.');
    }finally{endAuth()}
  };

  const googleSubmit=async()=>{
    if (!beginAuth()) return;
    try {
      const data=await signInWithGoogle();
      if (!data.session) throw new Error('تعذر إنشاء جلسة Google صالحة.');
      router.replace('/');
    } catch (e) {
      const raw=e instanceof Error?e.message:'';
      const lower=raw.toLowerCase();
      if (raw === 'GOOGLE_PROVIDER_DISABLED' || (lower.includes('provider') && lower.includes('enabled'))) {
        setMsg('تسجيل Google غير مفعّل على خادم RAID بعد.');
      } else if (raw === 'GOOGLE_EXTERNAL_CODE_EXCHANGE_FAILED' || lower.includes('unable to exchange external code')) {
        setMsg('مسار التطبيق جاهز، لكن Google OAuth على الخادم يرفض بيانات Client ID/Secret الحالية. يمكنك استخدام البريد وكلمة المرور إلى أن يتم تصحيح بيانات Google الخارجية.');
      } else if (lower.includes('cancel') || lower.includes('إلغاء')) {
        setMsg('تم إلغاء تسجيل الدخول بواسطة Google.');
      } else {
        setMsg(raw || 'تعذر تسجيل الدخول بواسطة Google.');
      }
    } finally { endAuth(); }
  };

  return <LinearGradient colors={['#040609','#0A0F19','#101628']} style={s.fill}>
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS==='ios'?'padding':'height'}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View style={[s.shell,{opacity:fade,transform:[{translateY:lift}]}]}>
            <View style={s.hero}>
              <LinearGradient colors={['#7C3AED','#4F46E5']} style={s.logo}><Text style={s.logoText}>R</Text></LinearGradient>
              <Text style={s.brand}>مرحبًا بك في RAID</Text>
              <Text style={s.desc}>دخول آمن إلى حساب RAID. إعداد VPN والاتصال به يتمان بشكل مستقل.</Text>
            </View>

            <Pressable onPress={googleSubmit} disabled={busy} style={[s.google,busy&&s.disabled]} accessibilityRole="button" accessibilityLabel="تسجيل الدخول بواسطة Google" accessibilityState={{disabled:busy,busy}}>
              <View style={s.googleMark}><Text style={s.googleMarkText}>G</Text></View>
              <Text style={s.googleText}>المتابعة باستخدام Google</Text>
            </Pressable>

            <View style={s.divider}><View style={s.line}/><Text style={s.or}>أو</Text><View style={s.line}/></View>

            <View style={s.tabs}>
              <Pressable onPress={()=>choose('signin')} disabled={busy} style={[s.tab,mode==='signin'&&s.tabOn]} accessibilityRole="tab" accessibilityState={{selected:mode==='signin',disabled:busy}}><Text style={[s.tabText,mode==='signin'&&s.tabTextOn]}>دخول</Text></Pressable>
              <Pressable onPress={()=>choose('signup')} disabled={busy} style={[s.tab,mode==='signup'&&s.tabOn]} accessibilityRole="tab" accessibilityState={{selected:mode==='signup',disabled:busy}}><Text style={[s.tabText,mode==='signup'&&s.tabTextOn]}>حساب جديد</Text></Pressable>
            </View>

            <View style={s.form}>
              {mode==='signup'&&<TextInput value={name} onChangeText={setName} editable={!busy} placeholder="الاسم" placeholderTextColor="#64748B" style={s.input} textContentType="name"/>}
              <TextInput value={email} onChangeText={setEmail} editable={!busy} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="البريد الإلكتروني" placeholderTextColor="#64748B" style={s.input} textContentType="emailAddress"/>
              <TextInput value={password} onChangeText={setPassword} editable={!busy} secureTextEntry placeholder="كلمة المرور" placeholderTextColor="#64748B" style={s.input} textContentType={mode==='signup'?'newPassword':'password'}/>
              {mode==='signup'&&<TextInput value={confirm} onChangeText={setConfirm} editable={!busy} secureTextEntry placeholder="تأكيد كلمة المرور" placeholderTextColor="#64748B" style={s.input} textContentType="newPassword"/>}
            </View>

            <Pressable onPress={submit} disabled={busy} style={[s.primary,busy&&s.disabled]} accessibilityRole="button" accessibilityState={{disabled:busy,busy}}>
              <Text style={s.primaryText}>{busy?'جارٍ التحقق...':mode==='signin'?'دخول إلى RAID':'إنشاء الحساب'}</Text>
            </Pressable>
            {!!msg&&<View style={s.messageBox} accessibilityLiveRegion="polite"><Text style={s.msg}>{msg}</Text></View>}
            <Pressable onPress={()=>router.back()} disabled={busy} style={[s.backButton,busy&&s.disabled]} accessibilityRole="button" accessibilityState={{disabled:busy}}><Text style={s.back}>رجوع</Text></Pressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </LinearGradient>
}

const s=StyleSheet.create({
  fill:{flex:1},root:{flex:1},flex:{flex:1},content:{flexGrow:1,justifyContent:'center',padding:20},shell:{width:'100%',maxWidth:520,alignSelf:'center'},hero:{alignItems:'center',marginBottom:24},logo:{width:72,height:72,borderRadius:24,alignItems:'center',justifyContent:'center',shadowColor:'#7C3AED',shadowOpacity:.3,shadowRadius:20,shadowOffset:{width:0,height:8},elevation:8},logoText:{color:'#fff',fontSize:34,fontWeight:'900'},brand:{marginTop:18,fontSize:28,fontWeight:'900',color:'#F8FAFC',textAlign:'center'},desc:{marginTop:8,maxWidth:350,color:'#8B98AD',lineHeight:20,textAlign:'center'},
  google:{height:56,borderRadius:18,backgroundColor:'#fff',flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:12,paddingHorizontal:18},googleMark:{width:28,height:28,borderRadius:14,borderWidth:1,borderColor:'#D1D5DB',alignItems:'center',justifyContent:'center'},googleMarkText:{fontSize:17,fontWeight:'900',color:'#4285F4'},googleText:{color:'#111827',fontWeight:'900',fontSize:15},divider:{flexDirection:'row',alignItems:'center',gap:10,marginVertical:16},line:{flex:1,height:1,backgroundColor:'#263247'},or:{color:'#64748B',fontWeight:'800'},
  tabs:{flexDirection:'row-reverse',gap:8,padding:5,borderRadius:18,backgroundColor:'rgba(15,23,42,.86)',borderWidth:1,borderColor:'#202B3D'},tab:{flex:1,minHeight:46,borderRadius:14,alignItems:'center',justifyContent:'center'},tabOn:{backgroundColor:'#20283A'},tabText:{color:'#7C889C',fontWeight:'800'},tabTextOn:{color:'#fff'},form:{gap:11,marginTop:14},input:{height:54,borderRadius:17,backgroundColor:'rgba(15,23,42,.9)',borderWidth:1,borderColor:'#263247',paddingHorizontal:15,color:'#fff',textAlign:'right',fontSize:16},
  primary:{height:56,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'#7C3AED',marginTop:16,shadowColor:'#7C3AED',shadowOpacity:.2,shadowRadius:16,shadowOffset:{width:0,height:6},elevation:5},disabled:{opacity:.5},primaryText:{color:'#fff',fontWeight:'900',fontSize:16},messageBox:{marginTop:12,padding:12,borderRadius:14,backgroundColor:'rgba(15,23,42,.8)',borderWidth:1,borderColor:'#263247'},msg:{color:'#CBD5E1',textAlign:'center',lineHeight:20},backButton:{height:44,alignItems:'center',justifyContent:'center',marginTop:6},back:{color:'#7C889C',fontWeight:'800'}
});
