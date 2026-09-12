import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { getCurrentProfile, getCurrentSession, signOut, updateCurrentProfile } from '@/lib/auth';
import { syncAccountData } from '@/lib/sync';
import { disconnectVpn, isVpnConnected } from '@/lib/vpn';
import { getSetting } from '@/lib/db';
import { getTheme, type ThemeName } from '@/lib/theme';

type QuickItem={title:string;sub:string;icon:string;route:'/ai'|'/vpn'|'/library'|'/tabs'};

export default function AccountScreen(){
  const [email,setEmail]=useState('');
  const [name,setName]=useState('');
  const [userId,setUserId]=useState('');
  const [busy,setBusy]=useState(true);
  const [syncing,setSyncing]=useState(false);
  const [lastSync,setLastSync]=useState('');
  const [msg,setMsg]=useState('');
  const [vpnConnected,setVpnConnected]=useState(false);
  const [themeName,setThemeName]=useState<ThemeName>('cinematic');
  const theme=useMemo(()=>getTheme(themeName),[themeName]);

  const load=useCallback(async()=>{
    setBusy(true);setMsg('');
    try{
      const [session,vpn,savedTheme]=await Promise.all([
        getCurrentSession(),
        isVpnConnected().catch(()=>false),
        getSetting<ThemeName>('theme','cinematic').catch(()=>'cinematic' as ThemeName),
      ]);
      if(!session?.user){router.replace('/login');return;}
      setEmail(session.user.email||'');
      setUserId(session.user.id);
      setVpnConnected(vpn);
      setThemeName(savedTheme==='cinematic'||savedTheme==='amoled'||savedTheme==='light'?savedTheme:'cinematic');
      const profile=await getCurrentProfile();
      setName(profile?.display_name||String(session.user.user_metadata?.display_name||''));
    }catch(e){setMsg(e instanceof Error?e.message:'تعذر تحميل الحساب.');}
    finally{setBusy(false);}
  },[]);

  useFocusEffect(useCallback(()=>{void load();return()=>{};},[load]));

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
      // لا نمسح WireGuard المحلي هنا: يجب أن يبقى إعداد الجهاز متاحًا بعد تسجيل الخروج.
      await signOut();
      router.replace('/login');
    }catch(e){setMsg(e instanceof Error?e.message:'تعذر تسجيل الخروج الآن.');}
    finally{setBusy(false);}
  };

  const initial=(name||email||'R').slice(0,1).toUpperCase();
  const quick:QuickItem[]=[
    {title:'RAID AI',sub:'المساعد الذكي',icon:'creation',route:'/ai'},
    {title:'RAID VPN',sub:vpnConnected?'متصل الآن':'الحماية والاتصال',icon:vpnConnected?'shield-check':'shield-outline',route:'/vpn'},
    {title:'المكتبة',sub:'المفضلة والسجل',icon:'bookmark-multiple-outline',route:'/library'},
    {title:'التبويبات',sub:'جلسات التصفح',icon:'tab-multiple',route:'/tabs'},
  ];

  return <SafeAreaView edges={['top','bottom','left','right']} style={[s.root,{backgroundColor:theme.bg}]}>
    <View style={[s.header,{backgroundColor:theme.surface,borderBottomColor:theme.border}]}>
      <Pressable onPress={()=>router.back()} style={({pressed})=>[s.iconButton,{backgroundColor:theme.surface2,borderColor:theme.border},pressed&&s.pressed]} accessibilityLabel="رجوع"><MaterialCommunityIcons name="chevron-right" size={25} color={theme.text}/></Pressable>
      <View style={s.headerCopy}><Text style={[s.title,{color:theme.text}]}>حسابي</Text><Text style={[s.headerSub,{color:theme.muted}]}>RAID Account Center</Text></View>
      <Pressable onPress={()=>router.push('/notifications')} style={({pressed})=>[s.iconButton,{backgroundColor:theme.surface2,borderColor:theme.border},pressed&&s.pressed]} accessibilityLabel="مركز الحالة"><MaterialCommunityIcons name="pulse" size={21} color={theme.accent}/></Pressable>
    </View>

    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={[s.hero,{backgroundColor:theme.surface,borderColor:theme.border}]}>
        <View style={[s.avatar,{backgroundColor:theme.accent}]}><Text style={s.avatarText}>{initial}</Text></View>
        <View style={s.heroCopy}><Text style={[s.name,{color:theme.text}]} numberOfLines={1}>{name||'حساب RAID'}</Text><Text style={[s.email,{color:theme.muted}]} numberOfLines={1}>{email}</Text><View style={[s.badge,{backgroundColor:theme.surface2,borderColor:theme.border}]}><View style={s.badgeDot}/><Text style={[s.badgeText,{color:theme.text}]}>جلسة فعالة</Text></View></View>
      </View>

      <View style={s.quickGrid}>{quick.map(item=><Pressable key={item.title} onPress={()=>router.push(item.route)} style={({pressed})=>[s.quick,{backgroundColor:theme.surface,borderColor:theme.border},pressed&&s.pressed]}><View style={[s.quickIcon,{backgroundColor:theme.surface2,borderColor:theme.border}]}><MaterialCommunityIcons name={item.icon as never} size={22} color={theme.accent}/></View><View style={s.quickCopy}><Text style={[s.quickTitle,{color:theme.text}]}>{item.title}</Text><Text style={[s.quickSub,{color:theme.muted}]}>{item.sub}</Text></View></Pressable>)}</View>

      <Text style={[s.section,{color:theme.accent}]}>بيانات الحساب</Text>
      <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.border}]}>
        <Text style={[s.label,{color:theme.text}]}>الاسم</Text>
        <TextInput value={name} onChangeText={setName} placeholder="اسمك" placeholderTextColor={theme.muted} style={[s.input,{backgroundColor:theme.surface2,borderColor:theme.border,color:theme.text}]}/>
        <Text style={[s.label,{color:theme.text}]}>البريد الإلكتروني</Text>
        <View style={[s.readonly,{backgroundColor:theme.surface2,borderColor:theme.border}]}><Text style={[s.readonlyText,{color:theme.muted}]} numberOfLines={1}>{email||'—'}</Text></View>
        <Text style={[s.meta,{color:theme.muted}]}>معرّف الحساب: {userId?`${userId.slice(0,8)}…`:'—'}</Text>
        <Pressable onPress={save} disabled={busy} style={({pressed})=>[s.primary,{backgroundColor:theme.accent},(busy||pressed)&&s.pressed]}><Text style={s.primaryText}>{busy?'جارٍ الحفظ...':'حفظ بياناتي'}</Text></Pressable>
      </View>

      <Text style={[s.section,{color:theme.accent}]}>المزامنة</Text>
      <View style={[s.syncCard,{backgroundColor:theme.surface,borderColor:theme.border}]}>
        <View style={s.syncHead}><View style={[s.syncIcon,{backgroundColor:theme.surface2,borderColor:theme.border}]}><MaterialCommunityIcons name="cloud-sync-outline" size={24} color={theme.accent}/></View><View style={{flex:1}}><Text style={[s.syncTitle,{color:theme.text}]}>مزامنة آمنة</Text><Text style={[s.syncText,{color:theme.muted}]}>المفضلة وذاكرة RAID AI والمظهر مرتبطة بالحساب ويمكن استعادتها على جهاز آخر.</Text></View></View>
        <Pressable onPress={syncNow} disabled={syncing} style={({pressed})=>[s.syncButton,{backgroundColor:theme.surface2,borderColor:theme.border},(syncing||pressed)&&s.pressed]}><MaterialCommunityIcons name="sync" size={19} color={theme.accent}/><Text style={[s.syncButtonText,{color:theme.text}]}>{syncing?'جارٍ المزامنة...':'مزامنة الآن'}</Text></Pressable>
        {!!lastSync&&<Text style={[s.lastSync,{color:theme.muted}]}>آخر مزامنة: {lastSync}</Text>}
      </View>

      <View style={[s.localNote,{backgroundColor:theme.surface,borderColor:theme.border}]}><MaterialCommunityIcons name="shield-lock-outline" size={21} color={theme.accent}/><Text style={[s.localNoteText,{color:theme.muted}]}>إعداد WireGuard المحلي خاص بهذا الجهاز ولا يُحذف عند تسجيل الخروج من حساب RAID.</Text></View>
      {!!msg&&<Text style={[s.msg,{color:theme.text}]}>{msg}</Text>}
      <Pressable onPress={logout} disabled={busy} style={({pressed})=>[s.logout,{borderColor:'#8C5F56'},(busy||pressed)&&s.pressed]}><MaterialCommunityIcons name="logout" size={20} color="#C98D80"/><Text style={s.logoutText}>{busy?'جارٍ التنفيذ...':'تسجيل الخروج'}</Text></Pressable>
    </ScrollView>
  </SafeAreaView>;
}

const s=StyleSheet.create({
  root:{flex:1},header:{minHeight:66,flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',paddingHorizontal:14,paddingVertical:7,borderBottomWidth:1},iconButton:{width:42,height:42,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},headerCopy:{alignItems:'center'},title:{fontSize:18,fontWeight:'900'},headerSub:{fontSize:9,marginTop:2,letterSpacing:.6},content:{padding:16,paddingBottom:38,gap:12},
  hero:{flexDirection:'row-reverse',alignItems:'center',gap:14,padding:16,borderRadius:24,borderWidth:1},avatar:{width:66,height:66,borderRadius:22,alignItems:'center',justifyContent:'center'},avatarText:{color:'#fff',fontSize:27,fontWeight:'900'},heroCopy:{flex:1,alignItems:'flex-end'},name:{fontSize:21,fontWeight:'900',maxWidth:'100%'},email:{marginTop:4,maxWidth:'100%',fontSize:12},badge:{marginTop:9,flexDirection:'row-reverse',alignItems:'center',gap:6,paddingHorizontal:9,height:27,borderRadius:13,borderWidth:1},badgeDot:{width:7,height:7,borderRadius:4,backgroundColor:'#4CB884'},badgeText:{fontSize:11,fontWeight:'800'},
  quickGrid:{flexDirection:'row-reverse',flexWrap:'wrap',justifyContent:'space-between',rowGap:10},quick:{width:'48.5%',minHeight:88,borderRadius:20,borderWidth:1,padding:12,flexDirection:'row-reverse',alignItems:'center',gap:10},quickIcon:{width:42,height:42,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},quickCopy:{flex:1,alignItems:'flex-end'},quickTitle:{fontSize:14,fontWeight:'900',textAlign:'right'},quickSub:{marginTop:3,fontSize:10,textAlign:'right'},
  section:{marginTop:3,fontWeight:'900',textAlign:'right'},card:{padding:15,borderRadius:22,borderWidth:1,gap:9},label:{fontWeight:'800',textAlign:'right'},input:{height:48,borderRadius:15,borderWidth:1,paddingHorizontal:14,textAlign:'right'},readonly:{height:48,borderRadius:15,borderWidth:1,justifyContent:'center',paddingHorizontal:14},readonlyText:{textAlign:'right'},meta:{fontSize:10,textAlign:'right'},primary:{height:49,borderRadius:15,alignItems:'center',justifyContent:'center',marginTop:4},primaryText:{color:'#fff',fontWeight:'900'},
  syncCard:{padding:15,borderRadius:22,borderWidth:1,gap:12},syncHead:{flexDirection:'row-reverse',alignItems:'center',gap:11},syncIcon:{width:46,height:46,borderRadius:15,borderWidth:1,alignItems:'center',justifyContent:'center'},syncTitle:{fontWeight:'900',textAlign:'right'},syncText:{marginTop:5,lineHeight:18,textAlign:'right',fontSize:11},syncButton:{height:48,borderRadius:15,borderWidth:1,alignItems:'center',justifyContent:'center',flexDirection:'row-reverse',gap:8},syncButtonText:{fontWeight:'900'},lastSync:{fontSize:10,textAlign:'center'},localNote:{borderWidth:1,borderRadius:18,padding:13,flexDirection:'row-reverse',alignItems:'center',gap:10},localNoteText:{flex:1,fontSize:11,lineHeight:18,textAlign:'right'},msg:{textAlign:'center',lineHeight:20},logout:{height:50,borderRadius:15,borderWidth:1,backgroundColor:'rgba(90,44,39,.28)',alignItems:'center',justifyContent:'center',flexDirection:'row-reverse',gap:8},logoutText:{color:'#C98D80',fontWeight:'900'},pressed:{opacity:.72,transform:[{scale:.985}]}
});
