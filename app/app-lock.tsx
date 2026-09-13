import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { getSetting } from '@/lib/db';
import { getTheme, isThemeName, type ThemeName } from '@/lib/theme';
import { APP_LOCK_GRACE_OPTIONS, DEFAULT_APP_LOCK_SETTINGS, appLockGraceLabel, getAppLockSettings, saveAppLockSettings, type AppLockSettings } from '@/lib/app-lock';

export default function AppLockScreen(){
  const [themeName,setThemeName]=useState<ThemeName>('cinematic');
  const [settings,setSettings]=useState<AppLockSettings>(DEFAULT_APP_LOCK_SETTINGS);
  const [supported,setSupported]=useState(false);
  const [enrolled,setEnrolled]=useState(false);
  const [busy,setBusy]=useState(false);
  const theme=useMemo(()=>getTheme(themeName),[themeName]);

  const refresh=useCallback(async()=>{
    const [savedTheme,current,hardware,hasEnrollment]=await Promise.all([
      getSetting<ThemeName>('theme','cinematic').catch(()=>'cinematic' as ThemeName),
      getAppLockSettings().catch(()=>DEFAULT_APP_LOCK_SETTINGS),
      LocalAuthentication.hasHardwareAsync().catch(()=>false),
      LocalAuthentication.isEnrolledAsync().catch(()=>false),
    ]);
    setThemeName(isThemeName(savedTheme)?savedTheme:'cinematic');
    setSettings(current);
    setSupported(hardware);
    setEnrolled(hasEnrollment);
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
    if(value&&(!supported||!enrolled)){
      Alert.alert('قفل RAID','فعّل بصمة أو وجه الجهاز من إعدادات Android أولًا، وبعدها ارجع وفعّل القفل.');
      return;
    }
    setBusy(true);
    try{
      const ok=await verify();
      if(!ok)return;
      const next={...settings,enabled:value};
      setSettings(next);
      await saveAppLockSettings(next);
      Alert.alert('RAID',value?'تم تفعيل قفل التطبيق.':'تم إيقاف قفل التطبيق.');
    }catch{
      Alert.alert('RAID','تعذر تغيير إعداد القفل الآن. حاول مرة ثانية.');
    }finally{setBusy(false)}
  };

  const patch=async(value:Partial<AppLockSettings>)=>{
    const next={...settings,...value};
    setSettings(next);
    await saveAppLockSettings(next).catch(()=>{});
  };

  return <SafeAreaView style={[s.root,{backgroundColor:theme.bg}]} edges={['top','bottom','left','right']}>
    <View style={[s.head,{backgroundColor:theme.surface,borderBottomColor:theme.border}]}>
      <Pressable onPress={()=>router.back()} style={[s.iconButton,{backgroundColor:theme.surface2,borderColor:theme.border}]} accessibilityLabel="رجوع"><MaterialCommunityIcons name="chevron-right" size={25} color={theme.text}/></Pressable>
      <View style={s.headCopy}><Text style={[s.title,{color:theme.text}]}>قفل RAID</Text><Text style={[s.sub,{color:theme.muted}]}>بصمة أو وجه الجهاز</Text></View>
      <View style={[s.stateDot,{backgroundColor:settings.enabled?'#4CB884':theme.muted}]}/>
    </View>

    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={[s.hero,{backgroundColor:theme.surface,borderColor:theme.border}]}>
        <View style={[s.heroIcon,{backgroundColor:theme.surface2,borderColor:theme.border}]}><MaterialCommunityIcons name="shield-lock-outline" size={31} color={theme.accent}/></View>
        <View style={s.heroCopy}><Text style={[s.kicker,{color:theme.accent}]}>APP LOCK</Text><Text style={[s.heroTitle,{color:theme.text}]}>{settings.enabled?'الحماية مفعلة':'الحماية اختيارية'}</Text><Text style={[s.heroText,{color:theme.muted}]}>يستخدم RAID نظام التحقق الموجود في Android نفسه. لا يحفظ التطبيق بصمتك أو صورة وجهك.</Text></View>
      </View>

      <View style={[s.statusCard,{backgroundColor:theme.surface,borderColor:theme.border}]}>
        <Status icon="fingerprint" title="دعم التحقق" value={supported?'متوفر':'غير متوفر'} ok={supported} theme={theme}/>
        <Status icon="account-lock-outline" title="هوية مسجلة بالجهاز" value={enrolled?'جاهزة':'غير مسجلة'} ok={enrolled} theme={theme}/>
      </View>

      <View style={[s.group,{backgroundColor:theme.surface,borderColor:theme.border}]}>
        <View style={s.row}><View style={s.rowCopy}><Text style={[s.rowTitle,{color:theme.text}]}>قفل التطبيق</Text><Text style={[s.rowHint,{color:theme.muted}]}>اطلب تحقق الجهاز قبل فتح محتوى RAID.</Text></View><Switch value={settings.enabled} disabled={busy} onValueChange={value=>void toggleEnabled(value)} trackColor={{false:'#39434C',true:'#2B765E'}} thumbColor="#F4F7F8"/></View>
        <View style={[s.row,{borderTopWidth:1,borderTopColor:theme.border}]}><View style={s.rowCopy}><Text style={[s.rowTitle,{color:theme.text}]}>القفل بعد مغادرة التطبيق</Text><Text style={[s.rowHint,{color:theme.muted}]}>يعيد القفل عند الرجوع بعد المدة المحددة.</Text></View><Switch value={settings.lockOnBackground} disabled={!settings.enabled} onValueChange={value=>void patch({lockOnBackground:value})} trackColor={{false:'#39434C',true:'#2B765E'}} thumbColor="#F4F7F8"/></View>
      </View>

      <View style={s.section}><Text style={[s.sectionTitle,{color:theme.accent}]}>مهلة الرجوع</Text><View style={s.graceGrid}>{APP_LOCK_GRACE_OPTIONS.map(ms=>{
        const active=settings.gracePeriodMs===ms;
        return <Pressable key={ms} disabled={!settings.enabled||!settings.lockOnBackground} onPress={()=>void patch({gracePeriodMs:ms})} style={({pressed})=>[s.grace,{backgroundColor:theme.surface,borderColor:active?theme.accent:theme.border},(!settings.enabled||!settings.lockOnBackground)&&s.disabled,pressed&&s.pressed]}><MaterialCommunityIcons name={active?'check-circle':'clock-outline'} size={19} color={active?theme.accent:theme.muted}/><Text style={[s.graceText,{color:theme.text}]}>{appLockGraceLabel(ms)}</Text></Pressable>})}</View></View>

      <View style={[s.note,{backgroundColor:theme.surface2,borderColor:theme.border}]}><MaterialCommunityIcons name="information-outline" size={20} color={theme.accent}/><Text style={[s.noteText,{color:theme.muted}]}>إذا ألغيت نافذة التحقق يبقى RAID مقفولًا. ويمكن لـAndroid إظهار رمز الجهاز كخيار احتياطي حسب إعدادات هاتفك.</Text></View>
    </ScrollView>
  </SafeAreaView>;
}

function Status({icon,title,value,ok,theme}:{icon:string;title:string;value:string;ok:boolean;theme:ReturnType<typeof getTheme>}){
  return <View style={s.statusRow}><View style={[s.statusIcon,{backgroundColor:theme.surface2,borderColor:theme.border}]}><MaterialCommunityIcons name={icon as never} size={20} color={ok?'#4CB884':theme.muted}/></View><View style={s.statusCopy}><Text style={[s.statusTitle,{color:theme.text}]}>{title}</Text><Text style={[s.statusValue,{color:ok?'#4CB884':theme.muted}]}>{value}</Text></View></View>
}

const s=StyleSheet.create({
  root:{flex:1},head:{minHeight:66,paddingHorizontal:14,paddingVertical:7,borderBottomWidth:1,flexDirection:'row-reverse',alignItems:'center',gap:12},iconButton:{width:42,height:42,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},headCopy:{flex:1,alignItems:'flex-end'},title:{fontSize:18,fontWeight:'900'},sub:{fontSize:9.5,marginTop:2},stateDot:{width:10,height:10,borderRadius:5},content:{padding:16,paddingBottom:42,gap:16},hero:{borderRadius:25,borderWidth:1,padding:16,flexDirection:'row-reverse',alignItems:'center',gap:13},heroIcon:{width:60,height:60,borderRadius:20,borderWidth:1,alignItems:'center',justifyContent:'center'},heroCopy:{flex:1,alignItems:'flex-end'},kicker:{fontSize:9,fontWeight:'900',letterSpacing:1},heroTitle:{fontSize:19,fontWeight:'900',marginTop:3,textAlign:'right'},heroText:{fontSize:10.5,lineHeight:17,marginTop:5,textAlign:'right'},statusCard:{borderRadius:22,borderWidth:1,padding:10,gap:8},statusRow:{minHeight:58,flexDirection:'row-reverse',alignItems:'center',gap:10},statusIcon:{width:42,height:42,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},statusCopy:{flex:1,alignItems:'flex-end'},statusTitle:{fontSize:12,fontWeight:'900'},statusValue:{fontSize:10,fontWeight:'800',marginTop:3},group:{borderRadius:22,borderWidth:1,overflow:'hidden'},row:{minHeight:80,paddingHorizontal:13,paddingVertical:11,flexDirection:'row-reverse',alignItems:'center',gap:12},rowCopy:{flex:1,alignItems:'flex-end'},rowTitle:{fontSize:12.5,fontWeight:'900'},rowHint:{fontSize:9.5,lineHeight:15,textAlign:'right',marginTop:4},section:{gap:9},sectionTitle:{fontSize:13,fontWeight:'900',textAlign:'right',paddingHorizontal:3},graceGrid:{flexDirection:'row-reverse',flexWrap:'wrap',gap:8},grace:{width:'48.7%',minHeight:58,borderRadius:18,borderWidth:1,paddingHorizontal:12,flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:8},graceText:{fontSize:11,fontWeight:'900'},note:{borderRadius:19,borderWidth:1,padding:13,flexDirection:'row-reverse',gap:9,alignItems:'flex-start'},noteText:{flex:1,fontSize:9.5,lineHeight:16,textAlign:'right'},disabled:{opacity:.45},pressed:{opacity:.75,transform:[{scale:.99}]}
});
