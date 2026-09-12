import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getSetting } from '@/lib/db';
import { getTheme, isThemeName, type ThemeName } from '@/lib/theme';
import { DEFAULT_PERFORMANCE_SETTINGS, deriveBrowserPerformancePolicy, getPerformanceSettings, policySummary, profileDescription, profileLabel, savePerformanceSettings, type BrowsingProfile, type PerformanceSettings } from '@/lib/performance';

const PROFILES: Array<{id:BrowsingProfile;icon:keyof typeof Ionicons.glyphMap;title:string}> = [
  {id:'balanced',icon:'options-outline',title:'متوازن'},
  {id:'boost',icon:'flash-outline',title:'Boost'},
  {id:'video',icon:'play-circle-outline',title:'Video'},
  {id:'reading',icon:'reader-outline',title:'Reading'},
  {id:'downloads',icon:'download-outline',title:'Downloads'},
  {id:'low-data',icon:'cellular-outline',title:'Low Data'},
];

export default function PerformanceScreen(){
  const [themeName,setThemeName]=useState<ThemeName>('cinematic');
  const [settings,setSettings]=useState<PerformanceSettings>(DEFAULT_PERFORMANCE_SETTINGS);
  const theme=useMemo(()=>getTheme(themeName),[themeName]);
  const policy=useMemo(()=>deriveBrowserPerformancePolicy(settings),[settings]);

  useFocusEffect(useCallback(()=>{let alive=true;Promise.all([
    getSetting<ThemeName>('theme','cinematic').catch(()=>'cinematic' as ThemeName),
    getPerformanceSettings().catch(()=>DEFAULT_PERFORMANCE_SETTINGS),
  ]).then(([t,p])=>{if(!alive)return;setThemeName(isThemeName(t)?t:'cinematic');setSettings(p);});return()=>{alive=false};},[]));

  const patch=(value:Partial<PerformanceSettings>)=>{
    const next={...settings,...value};
    if(next.profile==='low-data')next.lowBandwidthImages=true;
    setSettings(next);
    void savePerformanceSettings(next);
  };

  const choose=(profile:BrowsingProfile)=>patch({profile,enabled:profile!=='balanced'||settings.enabled,lowBandwidthImages:profile==='low-data'?true:settings.lowBandwidthImages});
  const quickBoost=()=>patch({enabled:true,profile:'boost',prioritizeActiveTab:true,suspendBackgroundTabs:true,reduceBackgroundWork:true,aggressiveRetry:true});

  return <SafeAreaView style={[s.root,{backgroundColor:theme.bg}]} edges={['top','bottom','left','right']}>
    <View style={[s.head,{borderBottomColor:theme.border,backgroundColor:theme.surface}]}>
      <Pressable onPress={()=>router.back()} style={[s.iconBtn,{borderColor:theme.border,backgroundColor:theme.surface2}]}><Ionicons name="chevron-forward" size={24} color={theme.text}/></Pressable>
      <View style={s.headCopy}><Text style={[s.title,{color:theme.text}]}>RAID Performance</Text><Text style={[s.sub,{color:theme.muted}]}>أولوية ذكية لموارد المتصفح واتصالك الحالي</Text></View>
      <View style={[s.statusDot,{backgroundColor:settings.enabled?'#4CB884':theme.muted}]}/>
    </View>

    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={[s.hero,{backgroundColor:theme.surface,borderColor:theme.border}]}>
        <View style={[s.heroIcon,{backgroundColor:settings.enabled?'rgba(76,184,132,.13)':theme.surface2,borderColor:theme.border}]}><Ionicons name="speedometer-outline" size={32} color={settings.enabled?'#4CB884':theme.accent}/></View>
        <View style={s.heroCopy}><Text style={[s.kicker,{color:theme.accent}]}>INTERNET / APP BOOST</Text><Text style={[s.heroTitle,{color:theme.text}]}>{settings.enabled?'وضع التحسين شغال':'الوضع الطبيعي'}</Text><Text style={[s.heroText,{color:theme.muted}]}>RAID ما يزيد سرعة اشتراكك نفسها؛ لكنه يقلل المنافسة داخل التطبيق ويجهز الموارد حسب نوع التصفح.</Text></View>
        <Switch value={settings.enabled} onValueChange={value=>patch({enabled:value})} trackColor={{false:'#39434C',true:'#2B765E'}} thumbColor="#F4F7F8"/>
      </View>

      <Pressable onPress={quickBoost} style={({pressed})=>[s.boostNow,{backgroundColor:theme.accent,borderColor:theme.border},pressed&&s.pressed]}>
        <Ionicons name="flash" size={20} color="#071412"/>
        <View style={s.boostCopy}><Text style={s.boostTitle}>فعّل Boost هسه</Text><Text style={s.boostHint}>أولوية للصفحة الحالية + تعليق الخلفية + Retry ذكي</Text></View>
      </Pressable>

      <View style={[s.policyCard,{backgroundColor:theme.surface2,borderColor:theme.border}]}>
        <View style={s.policyHead}><Ionicons name="pulse-outline" size={19} color={theme.accent}/><Text style={[s.policyTitle,{color:theme.text}]}>سياسة RAID الحالية</Text></View>
        <Text style={[s.policyText,{color:theme.muted}]}>{policySummary(policy)}</Text>
        <View style={s.chips}>
          <Chip label={policy.activeTabPriority?'Active Priority':'Balanced Priority'} on={policy.activeTabPriority} theme={theme}/>
          <Chip label={policy.suspendBackgroundTabs?'Background Suspend':'Background On'} on={policy.suspendBackgroundTabs} theme={theme}/>
          <Chip label={policy.lowBandwidthImages?'Light Images':'Full Images'} on={policy.lowBandwidthImages} theme={theme}/>
        </View>
      </View>

      <View style={s.section}><Text style={[s.sectionTitle,{color:theme.accent}]}>اختيار المود</Text><View style={s.grid}>{PROFILES.map(item=>{
        const active=settings.profile===item.id;
        return <Pressable key={item.id} onPress={()=>choose(item.id)} style={({pressed})=>[s.profile,{backgroundColor:theme.surface,borderColor:active?theme.accent:theme.border},active&&s.profileActive,pressed&&s.pressed]}>
          <View style={[s.profileIcon,{backgroundColor:theme.surface2,borderColor:active?theme.accent:theme.border}]}><Ionicons name={item.icon} size={22} color={active?theme.accent:theme.text}/></View>
          <Text style={[s.profileTitle,{color:theme.text}]}>{item.title}</Text><Text numberOfLines={2} style={[s.profileHint,{color:theme.muted}]}>{profileDescription(item.id)}</Text>
        </Pressable>})}</View></View>

      <View style={[s.activeCard,{backgroundColor:theme.surface,borderColor:theme.border}]}><Text style={[s.activeLabel,{color:theme.muted}]}>المود الحالي</Text><Text style={[s.activeName,{color:theme.text}]}>{profileLabel(settings.profile)}</Text><Text style={[s.activeDesc,{color:theme.muted}]}>{profileDescription(settings.profile)}</Text></View>

      <View style={s.section}><Text style={[s.sectionTitle,{color:theme.accent}]}>تحكم دقيق</Text><View style={[s.group,{backgroundColor:theme.surface,borderColor:theme.border}]}>
        <Toggle title="تركيز الصفحة الحالية" hint="يعطي الأولوية للصفحة النشطة داخل RAID بدل توزيع الشغل بالتساوي." value={settings.prioritizeActiveTab} onChange={value=>patch({prioritizeActiveTab:value})} theme={theme}/>
        <Toggle title="تعليق التبويبات الخلفية" hint="يقلل الحمل من الصفحات غير النشطة بدل استهلاك RAM والشبكة بدون فائدة." value={settings.suspendBackgroundTabs} onChange={value=>patch({suspendBackgroundTabs:value})} theme={theme}/>
        <Toggle title="تقليل العمل الخلفي" hint="يخفف المؤثرات والمهام الثانوية أثناء الأوضاع السريعة." value={settings.reduceBackgroundWork} onChange={value=>patch({reduceBackgroundWork:value})} theme={theme}/>
        <Toggle title="صور أخف للشبكة الضعيفة" hint="مفيد للاتصال المتذبذب ويوفر بيانات بدون تغيير سرعة المزود نفسها." value={settings.lowBandwidthImages} onChange={value=>patch({lowBandwidthImages:value})} theme={theme}/>
        <Toggle title="إعادة محاولة ذكية" hint="يستخدم Retry متدرج بدل إعادة التحميل العشوائي والمزعج." value={settings.aggressiveRetry} onChange={value=>patch({aggressiveRetry:value})} theme={theme} last/>
      </View></View>

      <View style={[s.note,{backgroundColor:theme.surface2,borderColor:theme.border}]}><Ionicons name="information-circle-outline" size={19} color={theme.accent}/><Text style={[s.noteText,{color:theme.muted}]}>وضع Boost مصمم ليستفيد من خطك بأفضل شكل داخل RAID: تقليل المنافسة الخلفية، تحسين الأولويات، وتبديل سلوك التطبيق حسب Video أو Reading أو Downloads أو Low Data.</Text></View>
    </ScrollView>
  </SafeAreaView>;
}

function Chip({label,on,theme}:{label:string;on:boolean;theme:ReturnType<typeof getTheme>}){
  return <View style={[s.chip,{backgroundColor:on?'rgba(76,184,132,.12)':theme.surface,borderColor:on?'#4CB884':theme.border}]}><Text style={[s.chipText,{color:on?'#4CB884':theme.muted}]}>{label}</Text></View>;
}

function Toggle({title,hint,value,onChange,theme,last=false}:{title:string;hint:string;value:boolean;onChange:(v:boolean)=>void;theme:ReturnType<typeof getTheme>;last?:boolean}){
  return <View style={[s.toggle,!last&&{borderBottomWidth:1,borderBottomColor:theme.border}]}><View style={s.toggleCopy}><Text style={[s.toggleTitle,{color:theme.text}]}>{title}</Text><Text style={[s.toggleHint,{color:theme.muted}]}>{hint}</Text></View><Switch value={value} onValueChange={onChange} trackColor={{false:'#39434C',true:'#2B765E'}} thumbColor="#F4F7F8"/></View>;
}

const s=StyleSheet.create({root:{flex:1},head:{minHeight:68,paddingHorizontal:14,paddingVertical:8,borderBottomWidth:1,flexDirection:'row-reverse',alignItems:'center',gap:12},iconBtn:{width:42,height:42,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},headCopy:{flex:1,alignItems:'flex-end'},title:{fontSize:18,fontWeight:'900'},sub:{fontSize:9.5,marginTop:2,textAlign:'right'},statusDot:{width:10,height:10,borderRadius:5},content:{padding:16,paddingBottom:42,gap:17},hero:{borderRadius:25,borderWidth:1,padding:15,flexDirection:'row-reverse',alignItems:'center',gap:12},heroIcon:{width:60,height:60,borderRadius:20,borderWidth:1,alignItems:'center',justifyContent:'center'},heroCopy:{flex:1,alignItems:'flex-end'},kicker:{fontSize:9,fontWeight:'900',letterSpacing:1},heroTitle:{fontSize:18,fontWeight:'900',marginTop:3,textAlign:'right'},heroText:{fontSize:10.5,lineHeight:17,marginTop:5,textAlign:'right'},boostNow:{minHeight:64,borderRadius:20,borderWidth:1,paddingHorizontal:14,flexDirection:'row-reverse',alignItems:'center',gap:11},boostCopy:{flex:1,alignItems:'flex-end'},boostTitle:{color:'#071412',fontSize:13,fontWeight:'900'},boostHint:{color:'rgba(7,20,18,.72)',fontSize:9.5,marginTop:3,textAlign:'right'},policyCard:{borderRadius:22,borderWidth:1,padding:14,gap:10},policyHead:{flexDirection:'row-reverse',alignItems:'center',gap:8},policyTitle:{fontSize:13,fontWeight:'900'},policyText:{fontSize:10.5,lineHeight:17,textAlign:'right'},chips:{flexDirection:'row-reverse',flexWrap:'wrap',gap:7},chip:{minHeight:29,borderRadius:12,borderWidth:1,paddingHorizontal:9,alignItems:'center',justifyContent:'center'},chipText:{fontSize:8.8,fontWeight:'800'},section:{gap:9},sectionTitle:{fontSize:13,fontWeight:'900',textAlign:'right',paddingHorizontal:3},grid:{flexDirection:'row-reverse',flexWrap:'wrap',gap:8},profile:{width:'48.7%',minHeight:132,borderRadius:21,borderWidth:1,padding:12,alignItems:'flex-end'},profileActive:{borderWidth:1.5},profileIcon:{width:42,height:42,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center',marginBottom:9},profileTitle:{fontSize:13,fontWeight:'900'},profileHint:{fontSize:9.5,lineHeight:14,textAlign:'right',marginTop:4},activeCard:{borderRadius:22,borderWidth:1,padding:15,alignItems:'flex-end'},activeLabel:{fontSize:9,fontWeight:'800'},activeName:{fontSize:20,fontWeight:'900',marginTop:3},activeDesc:{fontSize:10.5,lineHeight:17,textAlign:'right',marginTop:5},group:{borderRadius:22,borderWidth:1,overflow:'hidden'},toggle:{minHeight:76,paddingHorizontal:13,paddingVertical:11,flexDirection:'row-reverse',alignItems:'center',gap:12},toggleCopy:{flex:1,alignItems:'flex-end'},toggleTitle:{fontSize:12.5,fontWeight:'900',textAlign:'right'},toggleHint:{fontSize:9.5,lineHeight:15,textAlign:'right',marginTop:4},note:{borderRadius:19,borderWidth:1,padding:13,flexDirection:'row-reverse',gap:9,alignItems:'flex-start'},noteText:{flex:1,fontSize:9.5,lineHeight:16,textAlign:'right'},pressed:{opacity:.76,transform:[{scale:.985}]}});
