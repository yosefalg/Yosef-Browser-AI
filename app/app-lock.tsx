import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { getSetting } from '@/lib/db';
import { getTheme, isThemeName, type ThemeName } from '@/lib/theme';
import { APP_LOCK_GRACE_OPTIONS, DEFAULT_APP_LOCK_SETTINGS, appLockGraceLabel, getAppLockSettings, requestAppLockNow, saveAppLockSettings, type AppLockSettings } from '@/lib/app-lock';

function securityLevelLabel(level: LocalAuthentication.SecurityLevel) {
  if (level >= LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG) return 'بصمة/وجه قوي';
  if (level >= LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK) return 'بصمة/وجه متوفر';
  if (level >= LocalAuthentication.SecurityLevel.SECRET) return 'رمز أو نمط الجهاز';
  return 'غير مهيأ';
}

export default function AppLockScreen(){
  const [themeName,setThemeName]=useState<ThemeName>('cinematic');
  const [settings,setSettings]=useState<AppLockSettings>(DEFAULT_APP_LOCK_SETTINGS);
  const [supported,setSupported]=useState(false);
  const [enrolled,setEnrolled]=useState(false);
  const [securityLevel,setSecurityLevel]=useState<LocalAuthentication.SecurityLevel>(LocalAuthentication.SecurityLevel.NONE);
  const [busy,setBusy]=useState(false);
  const theme=useMemo(()=>getTheme(themeName),[themeName]);
  const deviceLockReady=securityLevel>=LocalAuthentication.SecurityLevel.SECRET;

  const refresh=useCallback(async()=>{
    const [savedTheme,current,hardware,hasEnrollment,level]=await Promise.all([
      getSetting<ThemeName>('theme','cinematic').catch(()=>'cinematic' as ThemeName),
      getAppLockSettings().catch(()=>DEFAULT_APP_LOCK_SETTINGS),
      LocalAuthentication.hasHardwareAsync().catch(()=>false),
      LocalAuthentication.isEnrolledAsync().catch(()=>false),
      LocalAuthentication.getEnrolledLevelAsync().catch(()=>LocalAuthentication.SecurityLevel.NONE),
    ]);
    setThemeName(isThemeName(savedTheme)?savedTheme:'cinematic');
    setSettings(current);
    setSupported(hardware);
    setEnrolled(hasEnrollment);
    setSecurityLevel(level);
  },[]);

  useFocusEffect(useCallback(()=>{void refresh();return()=>{};},[refresh]));

  const verify=async()=>{
    const result=await LocalAuthentication.authenticateAsync({
      promptMessage:'تأكيد قفل RAID',
      promptSubtitle:'أكد هويتك لتغيير حماية التطبيق',
      cancelLabel:'إلغاء',
      fallbackLabel:'استخدام رمز الجهاز',
      disableDeviceFallback:false,
    });
    return result.success;
  };

  const toggleEnabled=async(value:boolean)=>{
    if(busy)return;
    if(value&&!deviceLockReady){
      Alert.alert('قفل RAID','فعّل قفل شاشة آمن في Android أولًا (رمز PIN أو نمط أو كلمة مرور أو بصمة/وجه)، ثم ارجع وفعّل القفل.');
      return;
    }
    const previous=settings;
    setBusy(true);
    try{
      const ok=await verify();
      if(!ok)return;
      const next={...settings,enabled:value};
      setSettings(next);
      const saved=await saveAppLockSettings(next);
      setSettings(saved);
      Alert.alert('RAID',value?'تم تفعيل قفل التطبيق باستخدام حماية الجهاز.':'تم إيقاف قفل التطبيق.');
    }catch{
      setSettings(previous);
      Alert.alert('قفل RAID','تعذر حفظ إعداد القفل. بقي الإعداد السابق فعالًا.');
    }finally{setBusy(false)}
  };

  const patch=async(value:Partial<AppLockSettings>)=>{
    if(busy)return;
    const previous=settings;
    const next={...settings,...value};
    setBusy(true);
    setSettings(next);
    try{
      const saved=await saveAppLockSettings(next);
      setSettings(saved);
    }catch{
      setSettings(previous);
      Alert.alert('قفل RAID','تعذر حفظ إعداد القفل. بقي الإعداد السابق فعالًا.');
    }finally{setBusy(false)}
  };

  const lockNow=()=>{
    if(!settings.enabled||busy)return;
    requestAppLockNow();
  };

  return <SafeAreaView style={[s.root,{backgroundColor:theme.bg}]} edges={['top','bottom','left','right']}>
    <View style={[s.head,{backgroundColor:theme.surface,borderBottomColor:theme.border}]}>
      <Pressable onPress={()=>router.back()} style={[s.iconButton,{backgroundColor:theme.surface2,borderColor:theme.border}]} accessibilityRole="button" accessibilityLabel="رجوع"><MaterialCommunityIcons name="chevron-right" size={25} color={theme.text}/></Pressable>
      <View style={s.headCopy}><Text style={[s.title,{color:theme.text}]}>قفل RAID</Text><Text style={[s.sub,{color:theme.muted}]}>بصمة، وجه، أو قفل الجهاز</Text></View>
      <View style={[s.stateDot,{backgroundColor:settings.enabled?'#4CB884':theme.muted}]}/>
    </View>

    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={[s.hero,{backgroundColor:theme.surface,borderColor:theme.border}]}>
        <View style={[s.heroIcon,{backgroundColor:theme.surface2,borderColor:theme.border}]}><MaterialCommunityIcons name="shield-lock-outline" size={31} color={theme.accent}/></View>
        <View style={s.heroCopy}><Text style={[s.kicker,{color:theme.accent}]}>APP LOCK</Text><Text style={[s.heroTitle,{color:theme.text}]}>{settings.enabled?'الحماية مفعلة':'الحماية اختيارية'}</Text><Text style={[s.heroText,{color:theme.muted}]}>يستخدم RAID التحقق الموجود في Android نفسه. يعمل مع PIN أو النمط أو كلمة المرور، ومع البصمة/الوجه عند توفرها. لا يحفظ RAID بياناتك البيومترية.</Text></View>
      </View>

      <View style={[s.statusCard,{backgroundColor:theme.surface,borderColor:theme.border}]}>
        <Status icon="shield-key-outline" title="قفل شاشة آمن" value={deviceLockReady?securityLevelLabel(securityLevel):'غير مهيأ'} ok={deviceLockReady} theme={theme}/>
        <Status icon="fingerprint" title="عتاد البصمة/الوجه" value={supported?'متوفر':'غير متوفر'} ok={supported} theme={theme}/>
        <Status icon="account-lock-outline" title="هوية بيومترية مسجلة" value={enrolled?'جاهزة':'اختيارية / غير مسجلة'} ok={enrolled||deviceLockReady} theme={theme}/>
      </View>

      <View style={[s.group,{backgroundColor:theme.surface,borderColor:theme.border}]}>
        <View style={s.row}><View style={s.rowCopy}><Text style={[s.rowTitle,{color:theme.text}]}>قفل التطبيق</Text><Text style={[s.rowHint,{color:theme.muted}]}>اطلب تحقق Android قبل فتح محتوى RAID.</Text></View><Switch value={settings.enabled} disabled={busy} onValueChange={value=>void toggleEnabled(value)} trackColor={{false:'#39434C',true:'#2B765E'}} thumbColor="#F4F7F8"/></View>
        <View style={[s.row,{borderTopWidth:1,borderTopColor:theme.border}]}><View style={s.rowCopy}><Text style={[s.rowTitle,{color:theme.text}]}>القفل بعد مغادرة التطبيق</Text><Text style={[s.rowHint,{color:theme.muted}]}>يعيد القفل عند الرجوع بعد المدة المحددة.</Text></View><Switch value={settings.lockOnBackground} disabled={!settings.enabled||busy} onValueChange={value=>void patch({lockOnBackground:value})} trackColor={{false:'#39434C',true:'#2B765E'}} thumbColor="#F4F7F8"/></View>
      </View>

      <Pressable disabled={!settings.enabled||busy} onPress={lockNow} style={({pressed})=>[s.lockNow,{backgroundColor:theme.surface2,borderColor:theme.border},(!settings.enabled||busy)&&s.disabled,pressed&&s.pressed]} accessibilityRole="button" accessibilityState={{disabled:!settings.enabled||busy}} accessibilityLabel="اقفل RAID الآن">
        <View style={[s.lockNowIcon,{backgroundColor:theme.surface,borderColor:theme.border}]}><MaterialCommunityIcons name="lock-check-outline" size={22} color={theme.accent}/></View>
        <View style={s.lockNowCopy}><Text style={[s.lockNowTitle,{color:theme.text}]}>اقفل RAID الآن</Text><Text style={[s.lockNowHint,{color:theme.muted}]}>يخفي المحتوى فورًا، والفتح التالي يستخدم تحقق Android الحقيقي.</Text></View>
      </Pressable>

      <View style={s.section}><Text style={[s.sectionTitle,{color:theme.accent}]}>مهلة الرجوع</Text><View style={s.graceGrid}>{APP_LOCK_GRACE_OPTIONS.map(ms=>{
        const active=settings.gracePeriodMs===ms;
        return <Pressable key={ms} disabled={!settings.enabled||!settings.lockOnBackground||busy} onPress={()=>void patch({gracePeriodMs:ms})} style={({pressed})=>[s.grace,{backgroundColor:theme.surface,borderColor:active?theme.accent:theme.border},(!settings.enabled||!settings.lockOnBackground||busy)&&s.disabled,pressed&&s.pressed]} accessibilityRole="button" accessibilityState={{disabled:!settings.enabled||!settings.lockOnBackground||busy,selected:active}} accessibilityLabel={`مهلة القفل ${appLockGraceLabel(ms)}`}><MaterialCommunityIcons name={active?'check-circle':'clock-outline'} size={19} color={active?theme.accent:theme.muted}/><Text style={[s.graceText,{color:theme.text}]}>{appLockGraceLabel(ms)}</Text></Pressable>})}</View></View>

      <View style={[s.note,{backgroundColor:theme.surface2,borderColor:theme.border}]}><MaterialCommunityIcons name="information-outline" size={20} color={theme.accent}/><Text style={[s.noteText,{color:theme.muted}]}>إذا لم يكن هاتفك يحتوي بصمة أو وجه، يمكن لقفل RAID الاعتماد على رمز PIN/النمط/كلمة مرور Android بدل رفض التفعيل. إذا ألغيت نافذة التحقق يبقى RAID مقفولًا.</Text></View>
    </ScrollView>
  </SafeAreaView>;
}

function Status({icon,title,value,ok,theme}:{icon:string;title:string;value:string;ok:boolean;theme:ReturnType<typeof getTheme>}){
  return <View style={s.statusRow}><View style={[s.statusIcon,{backgroundColor:theme.surface2,borderColor:theme.border}]}><MaterialCommunityIcons name={icon as never} size={20} color={ok?'#4CB884':theme.muted}/></View><View style={s.statusCopy}><Text style={[s.statusTitle,{color:theme.text}]}>{title}</Text><Text style={[s.statusValue,{color:ok?'#4CB884':theme.muted}]}>{value}</Text></View></View>
}

const s=StyleSheet.create({
  root:{flex:1},head:{minHeight:66,paddingHorizontal:14,paddingVertical:7,borderBottomWidth:1,flexDirection:'row-reverse',alignItems:'center',gap:12},iconButton:{width:42,height:42,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},headCopy:{flex:1,alignItems:'flex-end'},title:{fontSize:18,fontWeight:'900'},sub:{fontSize:9.5,marginTop:2},stateDot:{width:10,height:10,borderRadius:5},content:{padding:16,paddingBottom:42,gap:16},hero:{borderRadius:25,borderWidth:1,padding:16,flexDirection:'row-reverse',alignItems:'center',gap:13},heroIcon:{width:60,height:60,borderRadius:20,borderWidth:1,alignItems:'center',justifyContent:'center'},heroCopy:{flex:1,alignItems:'flex-end'},kicker:{fontSize:9,fontWeight:'900',letterSpacing:1},heroTitle:{fontSize:19,fontWeight:'900',marginTop:3,textAlign:'right'},heroText:{fontSize:10.5,lineHeight:17,marginTop:5,textAlign:'right'},statusCard:{borderRadius:22,borderWidth:1,padding:10,gap:8},statusRow:{minHeight:58,flexDirection:'row-reverse',alignItems:'center',gap:10},statusIcon:{width:42,height:42,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},statusCopy:{flex:1,alignItems:'flex-end'},statusTitle:{fontSize:12,fontWeight:'900'},statusValue:{fontSize:10,fontWeight:'800',marginTop:3},group:{borderRadius:22,borderWidth:1,overflow:'hidden'},row:{minHeight:80,paddingHorizontal:13,paddingVertical:11,flexDirection:'row-reverse',alignItems:'center',gap:12},rowCopy:{flex:1,alignItems:'flex-end'},rowTitle:{fontSize:12.5,fontWeight:'900'},rowHint:{fontSize:9.5,lineHeight:15,textAlign:'right',marginTop:4},lockNow:{minHeight:76,borderRadius:22,borderWidth:1,padding:12,flexDirection:'row-reverse',alignItems:'center',gap:12},lockNowIcon:{width:46,height:46,borderRadius:15,borderWidth:1,alignItems:'center',justifyContent:'center'},lockNowCopy:{flex:1,alignItems:'flex-end'},lockNowTitle:{fontSize:13,fontWeight:'900'},lockNowHint:{fontSize:9.5,lineHeight:15,textAlign:'right',marginTop:4},section:{gap:9},sectionTitle:{fontSize:13,fontWeight:'900',textAlign:'right',paddingHorizontal:3},graceGrid:{flexDirection:'row-reverse',flexWrap:'wrap',gap:8},grace:{width:'48.7%',minHeight:58,borderRadius:18,borderWidth:1,paddingHorizontal:12,flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:8},graceText:{fontSize:11,fontWeight:'900'},note:{borderRadius:19,borderWidth:1,padding:13,flexDirection:'row-reverse',gap:9,alignItems:'flex-start'},noteText:{flex:1,fontSize:9.5,lineHeight:16,textAlign:'right'},disabled:{opacity:.45},pressed:{opacity:.75,transform:[{scale:.99}]}
});
