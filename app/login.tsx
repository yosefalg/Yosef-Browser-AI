import { useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { signIn, signUp } from '@/lib/auth';

export default function LoginScreen(){
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [mode,setMode]=useState<'signin'|'signup'>('signin');
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);

  const submit=async()=>{
    if (!email.trim() || password.length < 6) {
      setMsg('أدخل بريدًا إلكترونيًا صحيحًا وكلمة مرور من 6 أحرف على الأقل.');
      return;
    }
    setBusy(true);setMsg('');
    try{
      if(mode==='signin') {
        await signIn(email.trim(),password);
        setMsg('تم تسجيل الدخول. RAID AI وVPN جاهزان لهذا الحساب.');
        setTimeout(()=>router.replace('/'),350);
      } else {
        await signUp(email.trim(),password);
        setMsg('تم إنشاء الحساب. تحقق من بريدك إذا كان تأكيد البريد مفعلاً، ثم سجّل الدخول.');
      }
    }catch(e){
      const raw=e instanceof Error?e.message:'';
      setMsg(raw.includes('Invalid login')?'البريد الإلكتروني أو كلمة المرور غير صحيحة.':raw||'تعذر إكمال تسجيل الدخول الآن.');
    }finally{setBusy(false)}
  };

  return <SafeAreaView style={s.root}>
    <View style={s.box}>
      <View style={s.badge}><Text style={s.badgeText}>RAID</Text></View>
      <Text style={s.brand}>{mode==='signin'?'تسجيل الدخول':'إنشاء حساب RAID'}</Text>
      <Text style={s.desc}>حساب واحد للمزامنة وRAID AI وVPN والإعدادات. بعد تسجيل الدخول تعمل الخدمات المرتبطة بحسابك مباشرةً.</Text>
      <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="البريد الإلكتروني" placeholderTextColor="#64748B" style={s.input}/>
      <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="كلمة المرور" placeholderTextColor="#64748B" style={s.input}/>
      <Pressable onPress={submit} disabled={busy} style={[s.primary,busy&&s.disabled]}><Text style={s.primaryText}>{busy?'جارٍ التنفيذ...':mode==='signin'?'دخول':'إنشاء الحساب'}</Text></Pressable>
      <Pressable onPress={()=>{setMode(mode==='signin'?'signup':'signin');setMsg('')}}><Text style={s.link}>{mode==='signin'?'ليس لديك حساب؟ أنشئ حسابًا جديدًا':'لديك حساب بالفعل؟ سجّل الدخول'}</Text></Pressable>
      {!!msg&&<Text style={s.msg}>{msg}</Text>}
      <Pressable onPress={()=>router.back()}><Text style={s.back}>رجوع</Text></Pressable>
    </View>
  </SafeAreaView>
}

const s=StyleSheet.create({
  root:{flex:1,backgroundColor:'#070B14',justifyContent:'center',padding:20},
  box:{backgroundColor:'#111827',borderWidth:1,borderColor:'#27324A',borderRadius:28,padding:22,gap:14},
  badge:{width:58,height:58,borderRadius:18,alignSelf:'flex-end',alignItems:'center',justifyContent:'center',backgroundColor:'#7C3AED'},badgeText:{color:'#fff',fontWeight:'900',fontSize:16},
  brand:{fontSize:27,fontWeight:'900',color:'#fff',textAlign:'right'},desc:{color:'#94A3B8',lineHeight:21,textAlign:'right'},
  input:{height:52,borderRadius:16,backgroundColor:'#0B1220',borderWidth:1,borderColor:'#27324A',paddingHorizontal:14,color:'#fff',textAlign:'right'},
  primary:{height:52,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:'#7C3AED'},disabled:{opacity:.5},primaryText:{color:'#fff',fontWeight:'900'},
  link:{color:'#A78BFA',textAlign:'center',fontWeight:'700'},msg:{color:'#CBD5E1',textAlign:'center',lineHeight:20},back:{color:'#94A3B8',textAlign:'center',fontWeight:'700'}
});
