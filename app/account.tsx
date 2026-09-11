import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { getCurrentProfile, getCurrentSession, signOut, updateCurrentProfile } from '@/lib/auth';
import { syncAccountData } from '@/lib/sync';
import { clearWireGuardConfig, disconnectVpn } from '@/lib/vpn';

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

  const logout=async()=>{
    setBusy(true);setMsg('');
    try{
      await disconnectVpn().catch(()=>false);
      await clearWireGuardConfig().catch(()=>{});
      await signOut();
      router.replace('/login');
    }catch(e){setMsg(e instanceof Error?e.message:'تعذر تسجيل الخروج الآن.');}
    finally{setBusy(false);}
  };

  const initial=(name||email||'R').slice(0,1).toUpperCase();

  return <SafeAreaView edges={['top','bottom','left','right']} style={s.root}>
    <View style={s.header}><Pressable onPress={()=>router.back()} style={s.back}><Text style={s.backText}>‹</Text></Pressable><Text style={s.title}>حسابي</Text><Pressable onPress={()=>router.push('/notifications')} style={s.statusBtn}><Text style={s.statusBtnText}>الحالة</Text></Pressable></View>
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={s.hero}>
        <View style={s.avatar}><Text style={s.avatarText}>{initial}</Text></View>
        <View style={s.heroCopy}><Text style={s.name} numberOfLines={1}>{name||'حساب RAID'}</Text><Text style={s.email} numberOfLines={1}>{email}</Text><View style={s.badge}><View style={s.badgeDot}/><Text style={s.badgeText}>جلسة فعالة</Text></View></View>
      </View>

      <View style={s.quickGrid}>
        <Quick title="RAID AI" sub="المساعد" onPress={()=>router.push('/ai')}/>
        <Quick title="RAID VPN" sub="الحماية" onPress={()=>router.push('/vpn')}/>
        <Quick title="المفضلة" sub="المكتبة" onPress={()=>router.push('/library')}/>
        <Quick title="التبويبات" sub="الجلسات" onPress={()=>router.push('/tabs')}/>
      </View>

      <Text style={s.section}>بيانات الحساب</Text>
      <View style={s.card}>
        <Text style={s.label}>الاسم</Text>
        <TextInput value={name} onChangeText={setName} placeholder="اسمك" placeholderTextColor="#64748B" style={s.input}/>
        <Text style={s.label}>البريد الإلكتروني</Text>
        <View style={s.readonly}><Text style={s.readonlyText} numberOfLines={1}>{email||'—'}</Text></View>
        <Text style={s.meta}>معرّف الحساب: {userId?`${userId.slice(0,8)}…`:'—'}</Text>
        <Pressable onPress={save} disabled={busy} style={[s.primary,busy&&s.disabled]}><Text style={s.primaryText}>{busy?'جارٍ الحفظ...':'حفظ بياناتي'}</Text></Pressable>
      </View>

      <Text style={s.section}>المزامنة</Text>
      <View style={s.syncCard}>
        <View style={s.syncHead}><View style={s.syncDot}/><View style={{flex:1}}><Text style={s.syncTitle}>مزامنة آمنة</Text><Text style={s.syncText}>المفضلة وذاكرة RAID AI والمظهر مرتبطة بهذا الحساب ويمكن استعادتها على جهاز آخر.</Text></View></View>
        <Pressable onPress={syncNow} disabled={syncing} style={[s.syncButton,syncing&&s.disabled]}><Text style={s.syncButtonText}>{syncing?'جارٍ المزامنة...':'مزامنة الآن'}</Text></Pressable>
        {!!lastSync&&<Text style={s.lastSync}>آخر مزامنة: {lastSync}</Text>}
      </View>

      {!!msg&&<Text style={s.msg}>{msg}</Text>}
      <Pressable onPress={logout} disabled={busy} style={s.logout}><Text style={s.logoutText}>{busy?'جارٍ التنفيذ...':'تسجيل الخروج'}</Text></Pressable>
    </ScrollView>
  </SafeAreaView>;
}

function Quick({title,sub,onPress}:{title:string;sub:string;onPress:()=>void}){return <Pressable onPress={onPress} style={({pressed})=>[s.quick,pressed&&s.quickPressed]}><Text style={s.quickTitle}>{title}</Text><Text style={s.quickSub}>{sub}</Text></Pressable>}

const s=StyleSheet.create({
  root:{flex:1,backgroundColor:'#070B14'},header:{minHeight:60,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:14,paddingVertical:6,borderBottomWidth:1,borderBottomColor:'#1E293B'},back:{width:42,height:42,borderRadius:14,backgroundColor:'#111827',alignItems:'center',justifyContent:'center'},backText:{color:'#fff',fontSize:30,marginTop:-3},title:{color:'#fff',fontSize:19,fontWeight:'900'},statusBtn:{minWidth:58,height:36,paddingHorizontal:12,borderRadius:12,backgroundColor:'#111827',borderWidth:1,borderColor:'#27324A',alignItems:'center',justifyContent:'center'},statusBtnText:{color:'#C4B5FD',fontWeight:'900',fontSize:12},content:{padding:16,paddingBottom:36,gap:12},
  hero:{flexDirection:'row-reverse',alignItems:'center',gap:14,padding:16,borderRadius:22,backgroundColor:'#0D1628',borderWidth:1,borderColor:'#263653'},avatar:{width:64,height:64,borderRadius:21,backgroundColor:'#7C3AED',alignItems:'center',justifyContent:'center'},avatarText:{color:'#fff',fontSize:26,fontWeight:'900'},heroCopy:{flex:1,alignItems:'flex-end'},name:{color:'#fff',fontSize:21,fontWeight:'900',maxWidth:'100%'},email:{marginTop:4,color:'#94A3B8',maxWidth:'100%'},badge:{marginTop:9,flexDirection:'row-reverse',alignItems:'center',gap:6,paddingHorizontal:9,height:26,borderRadius:13,backgroundColor:'#0E2A23'},badgeDot:{width:7,height:7,borderRadius:4,backgroundColor:'#34D399'},badgeText:{color:'#A7F3D0',fontSize:11,fontWeight:'800'},
  quickGrid:{flexDirection:'row-reverse',flexWrap:'wrap',justifyContent:'space-between',rowGap:10},quick:{width:'48.5%',minHeight:76,borderRadius:18,backgroundColor:'#111827',borderWidth:1,borderColor:'#27324A',padding:14,alignItems:'flex-end',justifyContent:'center'},quickPressed:{opacity:.7,transform:[{scale:.99}]},quickTitle:{color:'#fff',fontSize:15,fontWeight:'900'},quickSub:{marginTop:4,color:'#7C8AA5',fontSize:11},
  section:{marginTop:2,color:'#A78BFA',fontWeight:'900',textAlign:'right'},card:{padding:15,borderRadius:22,backgroundColor:'#111827',borderWidth:1,borderColor:'#27324A',gap:9},label:{color:'#CBD5E1',fontWeight:'800',textAlign:'right'},input:{height:48,borderRadius:15,backgroundColor:'#0B1220',borderWidth:1,borderColor:'#27324A',paddingHorizontal:14,color:'#fff',textAlign:'right'},readonly:{height:48,borderRadius:15,backgroundColor:'#0B1220',borderWidth:1,borderColor:'#1F2937',justifyContent:'center',paddingHorizontal:14},readonlyText:{color:'#94A3B8',textAlign:'right'},meta:{color:'#64748B',fontSize:11,textAlign:'right'},primary:{height:48,borderRadius:15,backgroundColor:'#7C3AED',alignItems:'center',justifyContent:'center',marginTop:4},primaryText:{color:'#fff',fontWeight:'900'},disabled:{opacity:.5},
  syncCard:{padding:15,borderRadius:22,backgroundColor:'#0D1628',borderWidth:1,borderColor:'#263653',gap:12},syncHead:{flexDirection:'row-reverse',alignItems:'flex-start',gap:10},syncDot:{width:10,height:10,borderRadius:5,backgroundColor:'#34D399',marginTop:5},syncTitle:{color:'#F8FAFC',fontWeight:'900',textAlign:'right'},syncText:{marginTop:5,color:'#94A3B8',lineHeight:19,textAlign:'right',fontSize:12},syncButton:{height:48,borderRadius:15,backgroundColor:'#2563EB',alignItems:'center',justifyContent:'center'},syncButtonText:{color:'#fff',fontWeight:'900'},lastSync:{color:'#64748B',fontSize:11,textAlign:'center'},msg:{color:'#CBD5E1',textAlign:'center',lineHeight:20},logout:{height:50,borderRadius:15,backgroundColor:'#3A1620',alignItems:'center',justifyContent:'center',marginTop:2},logoutText:{color:'#FCA5A5',fontWeight:'900'}
});
