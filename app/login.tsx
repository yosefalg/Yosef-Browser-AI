import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { signIn, signUp } from '@/lib/auth';

export default function LoginScreen(){
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [confirm,setConfirm]=useState('');
  const [name,setName]=useState('');
  const [mode,setMode]=useState<'signin'|'signup'>('signin');
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);

  const choose=(next:'signin'|'signup')=>{setMode(next);setMsg('');};

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
    setBusy(true);setMsg('');
    try{
      if(mode==='signin') {
        await signIn(cleanEmail,password);
        router.replace('/account');
      } else {
        const data=await signUp(cleanEmail,password,name.trim());
        if (data.session) {
          setMsg('تم إنشاء حسابك وتسجيل الدخول بنجاح.');
          setTimeout(()=>router.replace('/account'),350);
        } else {
          setMsg('تم إنشاء الحساب الحقيقي. افتح رسالة التأكيد في بريدك ثم ارجع وسجّل الدخول.');
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
    }finally{setBusy(false)}
  };

  return <SafeAreaView style={s.root}>
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.box}>
          <View style={s.badge}><Text style={s.badgeText}>RAID</Text></View>
          <Text style={s.brand}>حساب RAID</Text>
          <Text style={s.desc}>حساب المستخدم هو الذي يملك ملفه وRAID AI وVPN والخدمات المرتبطة به. لا يوجد حساب متصفح مشترك بين المستخدمين.</Text>

          <View style={s.tabs}>
            <Pressable onPress={()=>choose('signin')} style={[s.tab,mode==='signin'&&s.tabOn]}><Text style={[s.tabText,mode==='signin'&&s.tabTextOn]}>تسجيل الدخول</Text></Pressable>
            <Pressable onPress={()=>choose('signup')} style={[s.tab,mode==='signup'&&s.tabOn]}><Text style={[s.tabText,mode==='signup'&&s.tabTextOn]}>إنشاء حساب جديد</Text></Pressable>
          </View>

          {mode==='signup'&&<TextInput value={name} onChangeText={setName} placeholder="الاسم" placeholderTextColor="#64748B" style={s.input} textContentType="name"/>}
          <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="البريد الإلكتروني" placeholderTextColor="#64748B" style={s.input} textContentType="emailAddress"/>
          <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="كلمة المرور" placeholderTextColor="#64748B" style={s.input} textContentType={mode==='signup'?'newPassword':'password'}/>
          {mode==='signup'&&<TextInput value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="تأكيد كلمة المرور" placeholderTextColor="#64748B" style={s.input} textContentType="newPassword"/>}

          {mode==='signup'&&<View style={s.info}><Text style={s.infoText}>بعد إنشاء الحساب تُربط خدماتك بهويته مباشرةً. إذا كان تأكيد البريد مفعّلًا، ستؤكد بريدك مرة واحدة فقط.</Text></View>}

          <Pressable onPress={submit} disabled={busy} style={[s.primary,busy&&s.disabled]}><Text style={s.primaryText}>{busy?'جارٍ التنفيذ...':mode==='signin'?'دخول إلى حسابي':'إنشاء حسابي'}</Text></Pressable>
          {!!msg&&<Text style={s.msg}>{msg}</Text>}
          <Pressable onPress={()=>router.back()}><Text style={s.back}>رجوع</Text></Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>
}

const s=StyleSheet.create({
  root:{flex:1,backgroundColor:'#070B14'},flex:{flex:1},content:{flexGrow:1,justifyContent:'center',padding:18},
  box:{backgroundColor:'#111827',borderWidth:1,borderColor:'#27324A',borderRadius:28,padding:20,gap:13},
  badge:{width:58,height:58,borderRadius:18,alignSelf:'flex-end',alignItems:'center',justifyContent:'center',backgroundColor:'#7C3AED'},badgeText:{color:'#fff',fontWeight:'900',fontSize:16},
  brand:{fontSize:28,fontWeight:'900',color:'#fff',textAlign:'right'},desc:{color:'#94A3B8',lineHeight:21,textAlign:'right'},
  tabs:{flexDirection:'row-reverse',gap:8,padding:5,borderRadius:16,backgroundColor:'#0B1220'},tab:{flex:1,minHeight:44,borderRadius:12,alignItems:'center',justifyContent:'center',paddingHorizontal:8},tabOn:{backgroundColor:'#7C3AED'},tabText:{color:'#94A3B8',fontWeight:'800',fontSize:12},tabTextOn:{color:'#fff'},
  input:{height:52,borderRadius:16,backgroundColor:'#0B1220',borderWidth:1,borderColor:'#27324A',paddingHorizontal:14,color:'#fff',textAlign:'right',fontSize:16},
  info:{padding:12,borderRadius:14,backgroundColor:'#0E172A',borderWidth:1,borderColor:'#243044'},infoText:{color:'#94A3B8',lineHeight:19,textAlign:'right',fontSize:12},
  primary:{height:54,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:'#7C3AED'},disabled:{opacity:.5},primaryText:{color:'#fff',fontWeight:'900',fontSize:16},
  msg:{color:'#CBD5E1',textAlign:'center',lineHeight:20},back:{color:'#94A3B8',textAlign:'center',fontWeight:'700'}
});
