import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authenticateAppLock, DEFAULT_APP_LOCK_SETTINGS, getAppLockCapability, getAppLockSettings, graceLabel, saveAppLockSettings, type AppLockSettings } from '@/lib/app-lock';
import { getSetting } from '@/lib/db';
import { getTheme, isThemeName, type ThemeName } from '@/lib/theme';

const GRACE = [0, 15, 60, 300] as const;

export default function AppLockScreen(){
  const [themeName,setThemeName]=useState<ThemeName>('cinematic');
  const [settings,setSettings]=useState<AppLockSettings>(DEFAULT_APP_LOCK_SETTINGS);
  const [available,setAvailable]=useState<boolean|null>(null);
  const [busy,setBusy]=useState(false);
  const theme=useMemo(()=>getTheme(themeName),[themeName]);

  const refresh=useCallback(async()=>{
    const [savedTheme,savedLock,capability]=await Promise.all([
      getSetting<ThemeName>('theme','cinematic').catch(()=>'cinematic' as ThemeName),
      getAppLockSettings().catch(()=>DEFAULT_APP_LOCK_SETTINGS),
      getAppLockCapability().catch(()=>({hardware:false,enrolled:false,types:[]})),
    ]);
    setThemeName(isThemeName(savedTheme)?savedTheme:'cinematic');
    setSettings(savedLock);
    setAvailable(capability.hardware&&capability.enrolled);
  },[]);

  useFocusEffect(useCallback(()=>{void refresh();return()=>{};},[refresh]));

  const persist=async(next:AppLockSettings)=>{setSettings(next);await saveAppLockSettings(next)};

  const toggleEnabled=async(value:boolean)=>{
    if(busy)return;
    if(!value){await persist({...settings,enabled:false});return;}
    if(!available){Alert.alert('قفل RAID','فعّل بصمة أو وجه على جهازك أولًا من إعدادات Android، وبعدها ارجع وفعل قفل RAID.');return;}
    setBusy(true);
    try{
      const ok=await authenticateAppLock('أكد تفعيل قفل RAID');
      if(!ok){Alert.alert('قفل RAID','لم يتم تفعيل القفل لأن التحقق لم ينجح.');return;}
      await persist({...settings,enabled:true});
    }finally{setBusy(false)}
  };

  const test=async()=>{
    if(busy)return;setBusy(true);
    try{const ok=await authenticateAppLock('اختبار قفل RAID');Alert.alert('قفل RAID',ok?'الحماية تعمل بشكل صحيح.':'لم ينجح التحقق.')}finally{setBusy(false)}
  };

  return <SafeAreaView edges={['top','bottom','left','right']} style={[s.root,{backgroundColor:theme.bg}]}>
    <View style={[s.head,{backgroundColor:theme.surface,borderBottomColor:theme.border}]}>
      <Pressable onPress={()=>router.back()} style={[s.icon,{backgroundColor:theme.surface2,borderColor:theme.border}]}><Ionicons name="chevron-forward" size={23} color={theme.text}/></Pressable>
      <View style={s.headCopy}><Text style={[s.title,{color:theme.text}]}>قفل RAID</Text><Text style={[s.sub,{color:theme.muted}]}>حماية المتصفح ببصمة أو وجه الجهاز</Text></View>
      <View style={[s.dot,{backgroundColor:settings.enabled?'#4CB884':theme.muted}]}/>
    </View>

    <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
      <View style={[s.hero,{backgroundColor:theme.surface,borderColor:theme.border}]}>
        <View style={[s.heroIcon,{backgroundColor:theme.surface2,borderColor:theme.border}]}><Ionicons name="shield-checkmark-outline" size={31} color={settings.enabled?'#4CB884':theme.accent}/></View>
        <View style={s.heroCopy}><Text style={[s.kicker,{color:theme.accent}]}>APP LOCK</Text><Text style={[s.heroTitle,{color:theme.text}]}>{settings.enabled?'الحماية شغالة':'الحماية مطفأة'}</Text><Text style={[s.heroText,{color:theme.muted}]}>يستخدم RAID نظام التحقق الموجود بجهازك بدل حفظ بصمة أو وجه داخل التطبيق.</Text></View>
        <Switch disabled={busy} value={settings.enabled} onValueChange={value=>void toggleEnabled(value)} trackColor={{false:'#3B4247',true:'#2B765E'}} thumbColor="#F4F7F8"/>
      </View>

      <View style={[s.status,{backgroundColor:theme.surface2,borderColor:theme.border}]}><Ionicons name={available?'finger-print':'alert-circle-outline'} size={20} color={available?'#4CB884':'#D8A56F'}/><View style={s.statusCopy}><Text style={[s.statusTitle,{color:theme.text}]}>{available?'حماية الجهاز جاهزة':'لا توجد بصمة/وجه مسجل'}</Text><Text style={[s.statusText,{color:theme.muted}]}>{available?'RAID يطلب التحقق عبر Android عند الحاجة.':'سجل وسيلة تحقق في إعدادات الجهاز حتى تستطيع تفعيل القفل.'}</Text></View></View>

      <View style={s.section}><Text style={[s.sectionTitle,{color:theme.accent}]}>متى يقفل؟</Text><View style={[s.group,{backgroundColor:theme.surface,borderColor:theme.border}]}>
        <View style={s.row}><View style={s.copy}><Text style={[s.rowTitle,{color:theme.text}]}>قفل بعد مغادرة التطبيق</Text><Text style={[s.rowHint,{color:theme.muted}]}>عند الرجوع إلى RAID بعد الانتقال لتطبيق آخر.</Text></View><Switch disabled={!settings.enabled} value={settings.lockOnBackground} onValueChange={value=>void persist({...settings,lockOnBackground:value})} trackColor={{false:'#3B4247',true:'#2B765E'}} thumbColor="#F4F7F8"/></View>
      </View></View>

      <View style={s.section}><Text style={[s.sectionTitle,{color:theme.accent}]}>مهلة القفل</Text><View style={s.graceGrid}>{GRACE.map(value=>{const active=settings.graceSeconds===value;return <Pressable key={value} disabled={!settings.enabled} onPress={()=>void persist({...settings,graceSeconds:value})} style={({pressed})=>[s.grace,{backgroundColor:active?theme.accent:theme.surface,borderColor:active?theme.accent:theme.border},(!settings.enabled)&&s.disabled,pressed&&s.pressed]}><Text style={[s.graceText,{color:active?'#fff':theme.text}]}>{graceLabel(value)}</Text></Pressable>})}</View></View>

      <Pressable disabled={!available||busy} onPress={()=>void test()} style={({pressed})=>[s.test,{backgroundColor:theme.surface,borderColor:theme.border},(!available||busy)&&s.disabled,pressed&&s.pressed]}><Ionicons name="finger-print" size={22} color={theme.accent}/><View style={s.testCopy}><Text style={[s.testTitle,{color:theme.text}]}>اختبر الحماية الآن</Text><Text style={[s.testHint,{color:theme.muted}]}>يشغل نافذة التحقق بدون تغيير إعداداتك.</Text></View><Ionicons name="chevron-back" size={21} color={theme.muted}/></Pressable>

      <View style={[s.note,{backgroundColor:theme.surface2,borderColor:theme.border}]}><Ionicons name="information-circle-outline" size={19} color={theme.accent}/><Text style={[s.noteText,{color:theme.muted}]}>RAID لا يخزن بيانات البصمة أو الوجه. التحقق يتم من خلال Android وعتاد الجهاز، ومع السماح بالنظام يمكن استخدام رمز قفل الجهاز كخيار احتياطي.</Text></View>
    </ScrollView>
  </SafeAreaView>;
}

const s=StyleSheet.create({root:{flex:1},head:{minHeight:68,paddingHorizontal:14,paddingVertical:8,borderBottomWidth:1,flexDirection:'row-reverse',alignItems:'center',gap:12},icon:{width:42,height:42,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},headCopy:{flex:1,alignItems:'flex-end'},title:{fontSize:18,fontWeight:'900'},sub:{fontSize:10,marginTop:2,textAlign:'right'},dot:{width:10,height:10,borderRadius:5},body:{padding:16,paddingBottom:42,gap:17},hero:{borderRadius:25,borderWidth:1,padding:15,flexDirection:'row-reverse',alignItems:'center',gap:12},heroIcon:{width:60,height:60,borderRadius:20,borderWidth:1,alignItems:'center',justifyContent:'center'},heroCopy:{flex:1,alignItems:'flex-end'},kicker:{fontSize:9,fontWeight:'900',letterSpacing:1},heroTitle:{fontSize:18,fontWeight:'900',marginTop:3,textAlign:'right'},heroText:{fontSize:10.5,lineHeight:17,marginTop:5,textAlign:'right'},status:{borderRadius:20,borderWidth:1,padding:13,flexDirection:'row-reverse',gap:10,alignItems:'center'},statusCopy:{flex:1,alignItems:'flex-end'},statusTitle:{fontSize:12.5,fontWeight:'900'},statusText:{fontSize:10,lineHeight:16,textAlign:'right',marginTop:3},section:{gap:9},sectionTitle:{fontSize:13,fontWeight:'900',textAlign:'right',paddingHorizontal:3},group:{borderRadius:22,borderWidth:1,overflow:'hidden'},row:{minHeight:78,paddingHorizontal:13,paddingVertical:11,flexDirection:'row-reverse',alignItems:'center',gap:12},copy:{flex:1,alignItems:'flex-end'},rowTitle:{fontSize:12.5,fontWeight:'900',textAlign:'right'},rowHint:{fontSize:9.5,lineHeight:15,textAlign:'right',marginTop:4},graceGrid:{flexDirection:'row-reverse',flexWrap:'wrap',gap:8},grace:{width:'48.7%',height:48,borderRadius:16,borderWidth:1,alignItems:'center',justifyContent:'center'},graceText:{fontSize:11.5,fontWeight:'900'},test:{minHeight:72,borderRadius:21,borderWidth:1,paddingHorizontal:13,flexDirection:'row-reverse',alignItems:'center',gap:10},testCopy:{flex:1,alignItems:'flex-end'},testTitle:{fontSize:12.5,fontWeight:'900'},testHint:{fontSize:9.5,marginTop:3,textAlign:'right'},note:{borderRadius:19,borderWidth:1,padding:13,flexDirection:'row-reverse',gap:9,alignItems:'flex-start'},noteText:{flex:1,fontSize:9.5,lineHeight:16,textAlign:'right'},disabled:{opacity:.4},pressed:{opacity:.72,transform:[{scale:.99}]}});
