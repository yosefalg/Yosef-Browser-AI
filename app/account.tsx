import { useCallback, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { getCurrentProfile, getCurrentSession, signOut, updateCurrentProfile } from '@/lib/auth';
import { syncAccountData } from '@/lib/sync';

export default function AccountScreen(){
  const [email,setEmail]=useState('');
  const [name,setName]=useState('');
  const [userId,setUserId]=useState('');
  const [busy,setBusy]=useState(true);
  const [syncing,setSyncing]=useState(false);
  const [lastSync,setLastSync]=useState('');
  const [msg,setMsg]=useState('');

  const load=useCallback(async()=>{
    setBusy(true);setMsg('');
    try{
      const session=await getCurrentSession();
      if(!session?.user){router.replace('/login');return;}
      setEmail(session.user.email||'');
      setUserId(session.user.id);
      const profile=await getCurrentProfile();
      setName(profile?.display_name||String(session.user.user_metadata?.display_name||''));
    }catch(e){setMsg(e instanceof Error?e.message:'تعذر تحميل الحساب.');}
    finally{setBusy(false);}
  },[]);

  useFocusEffect(useCallback(()=>{load();return()=>{};},[load]));

  const save=async()=>{
    if(name.trim().length<2){setMsg('اكتب اسمًا صحيحًا.');return;}
    setBusy(true);setMsg('');
    try{await updateCurrentProfile(name.trim());setMsg('تم حفظ بيانات حسابك.');}
    catch(e){setMsg(e instanceof Error?e.message:'تعذر حفظ الحساب.');}
    finally{setBusy(false);}
  };

  const syncNow=async()=>{
    if(syncing)return;
    setSyncing(true);setMsg('');
    try{
      const result=await syncAccountData();
      setLastSync(new Date().toLocaleTimeString('ar-IQ',{hour:'2-digit',minute:'2-digit'}));
      setMsg(`اكتملت المزامنة: رفع ${result.uploaded} واستعادة ${result.downloaded}.`);
    }catch(e){setMsg(e instanceof Error?e.message:'تعذر إكمال المزامنة الآن.');}
    finally{setSyncing(false);}
  };

  const logout=async()=>{setBusy(true);try{await signOut();router.replace('/login');}finally{setBusy(false);}};

  return <SafeAreaView style={s.root}>
    <View style={s.header}><Pressable onPress={()=>router.back()} style={s.back}><Text style={s.backText}>‹</Text></Pressable><Text style={s.title}>حسابي</Text><View style={{width:42}}/></View>
    <ScrollView contentContainerStyle={s.content}>
      <View style={s.hero}><View style={s.avatar}><Text style={s.avatarText}>{(name||email||'R').slice(0,1).toUpperCase()}</Text></View><Text style={s.name}>{name||'حساب RAID'}</Text><Text style={s.email}>{email}</Text></View>

      <Text style={s.section}>بيانات الحساب</Text>
      <View style={s.card}>
        <Text style={s.label}>الاسم</Text>
        <TextInput value={name} onChangeText={setName} placeholder="اسمك" placeholderTextColor="#64748B" style={s.input}/>
        <Text style={s.label}>البريد الإلكتروني</Text>
        <View style={s.readonly}><Text style={s.readonlyText}>{email||'—'}</Text></View>
        <Text style={s.meta}>معرّف الحساب: {userId?`${userId.slice(0,8)}…`:'—'}</Text>
        <Pressable onPress={save} disabled={busy} style={[s.primary,busy&&s.disabled]}><Text style={s.primaryText}>{busy?'جارٍ الحفظ...':'حفظ بياناتي'}</Text></Pressable>
      </View>

      <Text style={s.section}>مزامنة الحساب</Text>
      <View style={s.syncCard}>
        <View style={s.syncHead}><View style={s.syncDot}/><View style={{flex:1}}><Text style={s.syncTitle}>مزامنة آمنة</Text><Text style={s.syncText}>المفضلة وذاكرة RAID AI والمظهر مرتبطة بحسابك ويمكن استعادتها على جهاز آخر.</Text></View></View>
        <Pressable onPress={syncNow} disabled={syncing} style={[s.syncButton,syncing&&s.disabled]}><Text style={s.syncButtonText}>{syncing?'جارٍ المزامنة...':'مزامنة الآن'}</Text></Pressable>
        {!!lastSync&&<Text style={s.lastSync}>آخر مزامنة: {lastSync}</Text>}
      </View>

      <Text style={s.section}>الخدمات المرتبطة بحسابك</Text>
      <View style={s.services}>
        <Pressable onPress={()=>router.push('/ai')} style={s.service}><Text style={s.serviceTitle}>RAID AI</Text><Text style={s.serviceText}>جلسة AI مرتبطة بهذا المستخدم فقط</Text></Pressable>
        <Pressable onPress={()=>router.push('/vpn')} style={s.service}><Text style={s.serviceTitle}>RAID VPN</Text><Text style={s.serviceText}>يستخدم ملف VPN المخصص لهوية الحساب</Text></Pressable>
        <Pressable onPress={()=>router.push('/library')} style={s.service}><Text style={s.serviceTitle}>المفضلة</Text><Text style={s.serviceText}>محلية مع دعم المزامنة بالحساب</Text></Pressable>
        <Pressable onPress={()=>router.push('/tabs')} style={s.service}><Text style={s.serviceTitle}>التبويبات</Text><Text style={s.serviceText}>تبقى محلية على الجهاز لحماية جلسات التصفح</Text></Pressable>
      </View>

      {!!msg&&<Text style={s.msg}>{msg}</Text>}
      <Pressable onPress={logout} disabled={busy} style={s.logout}><Text style={s.logoutText}>تسجيل الخروج</Text></Pressable>
    </ScrollView>
  </SafeAreaView>
}

const s=StyleSheet.create({
  root:{flex:1,backgroundColor:'#070B14'},header:{height:64,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:'#1E293B'},back:{width:42,height:42,borderRadius:14,backgroundColor:'#111827',alignItems:'center',justifyContent:'center'},backText:{color:'#fff',fontSize:30,marginTop:-3},title:{color:'#fff',fontSize:19,fontWeight:'900'},content:{padding:18,paddingBottom:40,gap:12},
  hero:{alignItems:'center',paddingVertical:20},avatar:{width:74,height:74,borderRadius:24,backgroundColor:'#7C3AED',alignItems:'center',justifyContent:'center'},avatarText:{color:'#fff',fontSize:28,fontWeight:'900'},name:{marginTop:12,color:'#fff',fontSize:22,fontWeight:'900'},email:{marginTop:4,color:'#94A3B8'},section:{marginTop:4,color:'#A78BFA',fontWeight:'900',textAlign:'right'},card:{padding:16,borderRadius:22,backgroundColor:'#111827',borderWidth:1,borderColor:'#27324A',gap:9},label:{color:'#CBD5E1',fontWeight:'800',textAlign:'right'},input:{height:50,borderRadius:15,backgroundColor:'#0B1220',borderWidth:1,borderColor:'#27324A',paddingHorizontal:14,color:'#fff',textAlign:'right'},readonly:{height:50,borderRadius:15,backgroundColor:'#0B1220',borderWidth:1,borderColor:'#1F2937',justifyContent:'center',paddingHorizontal:14},readonlyText:{color:'#94A3B8',textAlign:'right'},meta:{color:'#64748B',fontSize:11,textAlign:'right'},primary:{height:50,borderRadius:15,backgroundColor:'#7C3AED',alignItems:'center',justifyContent:'center',marginTop:4},primaryText:{color:'#fff',fontWeight:'900'},disabled:{opacity:.5},
  syncCard:{padding:16,borderRadius:22,backgroundColor:'#0D1628',borderWidth:1,borderColor:'#263653',gap:12},syncHead:{flexDirection:'row-reverse',alignItems:'flex-start',gap:10},syncDot:{width:10,height:10,borderRadius:5,backgroundColor:'#34D399',marginTop:5},syncTitle:{color:'#F8FAFC',fontWeight:'900',textAlign:'right'},syncText:{marginTop:5,color:'#94A3B8',lineHeight:20,textAlign:'right'},syncButton:{height:48,borderRadius:15,backgroundColor:'#2563EB',alignItems:'center',justifyContent:'center'},syncButtonText:{color:'#fff',fontWeight:'900'},lastSync:{color:'#64748B',fontSize:11,textAlign:'center'},
  services:{gap:10},service:{padding:16,borderRadius:18,backgroundColor:'#111827',borderWidth:1,borderColor:'#27324A'},serviceTitle:{color:'#fff',fontSize:16,fontWeight:'900',textAlign:'right'},serviceText:{marginTop:5,color:'#94A3B8',textAlign:'right'},msg:{color:'#CBD5E1',textAlign:'center',lineHeight:20},logout:{height:50,borderRadius:15,backgroundColor:'#3A1620',alignItems:'center',justifyContent:'center',marginTop:4},logoutText:{color:'#FCA5A5',fontWeight:'900'}
});
