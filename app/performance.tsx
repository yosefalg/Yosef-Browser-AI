import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getSetting } from '@/lib/db';
import { getTheme, isThemeName, type ThemeName } from '@/lib/theme';
import {
  DEFAULT_PERFORMANCE_SETTINGS,
  deriveBrowserPerformancePolicy,
  getPerformanceSettings,
  policySummary,
  profileDescription,
  profileLabel,
  savePerformanceSettings,
  type BrowsingProfile,
  type PerformanceSettings,
} from '@/lib/performance';

const PROFILES: Array<{id:BrowsingProfile;icon:keyof typeof Ionicons.glyphMap;title:string;accent:string;hint:string}> = [
  {id:'balanced',icon:'options-outline',title:'متوازن',accent:'#9AA6B2',hint:'استخدام يومي متوازن'},
  {id:'boost',icon:'flash-outline',title:'Boost',accent:'#F0B35A',hint:'تركيز أقصى على التبويب الحالي'},
  {id:'video',icon:'play-circle-outline',title:'Video',accent:'#D47B8A',hint:'مشاهدة بث وفيديو بأقل عمل خلفي'},
  {id:'reading',icon:'reader-outline',title:'Reading',accent:'#8CB7A5',hint:'صفحات أخف وقراءة هادئة'},
  {id:'downloads',icon:'download-outline',title:'Downloads',accent:'#73A9D8',hint:'تنزيلات مستقرة مع موارد خلفية أقل'},
  {id:'low-data',icon:'cellular-outline',title:'Low Data',accent:'#91B66B',hint:'توفير بيانات على الشبكات الضعيفة'},
];

const PROFILE_PRESETS: Record<BrowsingProfile, Partial<PerformanceSettings>> = {
  balanced:{profile:'balanced'},
  boost:{profile:'boost',enabled:true,prioritizeActiveTab:true,suspendBackgroundTabs:true,reduceBackgroundWork:true,aggressiveRetry:true},
  video:{profile:'video',enabled:true,prioritizeActiveTab:true,suspendBackgroundTabs:true,reduceBackgroundWork:true,lowBandwidthImages:false,aggressiveRetry:true},
  reading:{profile:'reading',enabled:true,prioritizeActiveTab:true,suspendBackgroundTabs:true,reduceBackgroundWork:true,aggressiveRetry:true},
  downloads:{profile:'downloads',enabled:true,prioritizeActiveTab:true,suspendBackgroundTabs:true,reduceBackgroundWork:true,aggressiveRetry:true},
  'low-data':{profile:'low-data',enabled:true,prioritizeActiveTab:true,suspendBackgroundTabs:true,reduceBackgroundWork:true,lowBandwidthImages:true,aggressiveRetry:true},
};

const IRAQ_RESILIENCE_PRESET: Partial<PerformanceSettings> = {
  enabled:true,
  profile:'balanced',
  adaptiveMode:true,
  prioritizeActiveTab:true,
  suspendBackgroundTabs:true,
  reduceBackgroundWork:true,
  aggressiveRetry:true,
};

export default function PerformanceScreen(){
  const { width } = useWindowDimensions();
  const compact = width < 390;
  const [themeName,setThemeName]=useState<ThemeName>('cinematic');
  const [settings,setSettings]=useState<PerformanceSettings>(DEFAULT_PERFORMANCE_SETTINGS);
  const [saving,setSaving]=useState(false);
  const savingRef=useRef(false);
  const theme=useMemo(()=>getTheme(themeName),[themeName]);
  const policy=useMemo(()=>deriveBrowserPerformancePolicy(settings),[settings]);
  const activeAccent=useMemo(()=>PROFILES.find(item=>item.id===settings.profile)?.accent||theme.accent,[settings.profile,theme.accent]);

  useFocusEffect(useCallback(()=>{let alive=true;Promise.all([
    getSetting<ThemeName>('theme','cinematic').catch(()=>'cinematic' as ThemeName),
    getPerformanceSettings().catch(()=>DEFAULT_PERFORMANCE_SETTINGS),
  ]).then(([t,p])=>{if(!alive)return;setThemeName(isThemeName(t)?t:'cinematic');setSettings(p);});return()=>{alive=false};},[]));

  const patch=async(value:Partial<PerformanceSettings>)=>{
    if(savingRef.current)return;
    const previous=settings;
    const next={...settings,...value};
    if(next.profile==='low-data')next.lowBandwidthImages=true;
    savingRef.current=true;
    setSaving(true);
    setSettings(next);
    try{await savePerformanceSettings(next);}
    catch{
      setSettings(previous);
      Alert.alert('RAID Performance','تعذر حفظ إعدادات الأداء. بقي الإعداد السابق فعالًا.');
    }finally{
      savingRef.current=false;
      setSaving(false);
    }
  };

  const choose=(profile:BrowsingProfile)=>void patch(PROFILE_PRESETS[profile]);
  const quickBoost=()=>void patch(PROFILE_PRESETS.boost);
  const applyIraqResilience=()=>void patch(IRAQ_RESILIENCE_PRESET);

  return <SafeAreaView style={[s.root,{backgroundColor:theme.bg}]} edges={['top','bottom','left','right']}>
    <View style={[s.head,{borderBottomColor:theme.border,backgroundColor:theme.surface,paddingHorizontal:compact?10:14}]}>
      <Pressable onPress={()=>router.back()} style={[s.iconBtn,{borderColor:theme.border,backgroundColor:theme.surface2}]} accessibilityRole="button" accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={24} color={theme.text}/></Pressable>
      <View style={s.headCopy}><Text numberOfLines={1} style={[s.title,{color:theme.text,fontSize:compact?16:18}]}>RAID Performance</Text><Text numberOfLines={2} style={[s.sub,{color:theme.muted}]}>تحسين موارد التطبيق للشبكة الحالية بدون ادعاء زيادة سرعة الاشتراك</Text></View>
      <View style={[s.statusDot,{backgroundColor:settings.enabled?activeAccent:theme.muted}]}/>
    </View>

    <ScrollView contentContainerStyle={[s.content,{paddingHorizontal:compact?10:16}]} showsVerticalScrollIndicator={false}>
      <View style={[s.hero,{backgroundColor:theme.surface,borderColor:theme.border,padding:compact?12:15}]}>
        <View style={[s.heroIcon,{backgroundColor:settings.enabled?`${activeAccent}20`:theme.surface2,borderColor:theme.border,width:compact?50:60,height:compact?50:60,borderRadius:compact?16:20}]}><Ionicons name="speedometer-outline" size={compact?27:32} color={settings.enabled?activeAccent:theme.accent}/></View>
        <View style={s.heroCopy}><Text style={[s.kicker,{color:activeAccent}]}>INTERNET / APP BOOST</Text><Text style={[s.heroTitle,{color:theme.text,fontSize:compact?16:18}]}>{settings.enabled?'وضع التحسين شغال':'الوضع الطبيعي'}</Text><Text style={[s.heroText,{color:theme.muted}]}>RAID يخفف المنافسة داخل التطبيق، يركز على التبويب النشط، ويقلل العمل الخلفي. لا يغيّر سرعة مزود الإنترنت نفسها.</Text></View>
        <Switch value={settings.enabled} disabled={saving} onValueChange={value=>void patch({enabled:value})} trackColor={{false:'#39434C',true:'#2B765E'}} thumbColor="#F4F7F8"/>
      </View>

      <View style={s.quickRow}>
        <Pressable disabled={saving} onPress={quickBoost} style={({pressed})=>[s.quickAction,{backgroundColor:theme.accent,borderColor:theme.border},pressed&&s.pressed,saving&&s.disabled]} accessibilityRole="button" accessibilityState={{disabled:saving}}>
          <Ionicons name="flash" size={20} color="#071412"/>
          <View style={s.quickCopy}><Text style={s.quickTitle}>Boost هسه</Text><Text style={s.quickHint}>أولوية للتبويب الحالي</Text></View>
        </Pressable>
        <Pressable disabled={saving} onPress={applyIraqResilience} style={({pressed})=>[s.quickAction,{backgroundColor:theme.surface,borderColor:theme.border},pressed&&s.pressed,saving&&s.disabled]} accessibilityRole="button" accessibilityState={{disabled:saving}}>
          <Ionicons name="cellular-outline" size={20} color={theme.accent}/>
          <View style={s.quickCopy}><Text style={[s.quickTitle,{color:theme.text}]}>اتصال متذبذب</Text><Text style={[s.quickHint,{color:theme.muted}]}>Preset مناسب للعراق/Earthlink</Text></View>
        </Pressable>
      </View>

      <View style={[s.policyCard,{backgroundColor:theme.surface2,borderColor:theme.border}]}>
        <View style={s.policyHead}><Ionicons name="pulse-outline" size={19} color={activeAccent}/><Text style={[s.policyTitle,{color:theme.text}]}>سياسة RAID الحالية</Text></View>
        <Text style={[s.policyText,{color:theme.muted}]}>{policySummary(policy)}</Text>
        <View style={s.chips}>
          <Chip label={profileLabel(policy.profile)} on theme={theme}/>
          <Chip label={policy.activeTabPriority?'Active Priority':'Balanced Priority'} on={policy.activeTabPriority} theme={theme}/>
          <Chip label={policy.suspendBackgroundTabs?'Background Suspend':'Background On'} on={policy.suspendBackgroundTabs} theme={theme}/>
          <Chip label={policy.lowBandwidthImages?'Light Images':'Full Images'} on={policy.lowBandwidthImages} theme={theme}/>
        </View>
      </View>

      <View style={[s.adaptiveCard,{backgroundColor:theme.surface,borderColor:theme.border}]}>
        <View style={[s.adaptiveIcon,{backgroundColor:theme.surface2,borderColor:theme.border}]}><Ionicons name="git-network-outline" size={22} color={theme.accent}/></View>
        <View style={s.adaptiveCopy}><Text style={[s.adaptiveTitle,{color:theme.text}]}>Adaptive Browsing</Text><Text style={[s.adaptiveHint,{color:theme.muted}]}>في الوضع المتوازن يكتشف RAID سياق الصفحة ويحوّل السياسة تلقائيًا إلى Video أو Reading أو Downloads أو Low Data عند الحاجة.</Text></View>
        <Switch value={settings.adaptiveMode} disabled={saving} onValueChange={value=>void patch({adaptiveMode:value})} trackColor={{false:'#39434C',true:'#2B765E'}} thumbColor="#F4F7F8"/>
      </View>

      <View style={s.section}>
        <Text style={[s.sectionTitle,{color:theme.accent}]}>الأوضاع التكيفية</Text>
        <View style={s.grid}>{PROFILES.map(item=>{
          const active=settings.profile===item.id;
          return <Pressable key={item.id} disabled={saving} onPress={()=>choose(item.id)} accessibilityState={{disabled:saving,selected:active}} style={({pressed})=>[s.profile,{width:compact?'100%':'48.5%',backgroundColor:theme.surface,borderColor:active?item.accent:theme.border},active&&s.profileActive,pressed&&s.pressed,saving&&s.disabled]}>
            <View style={s.profileTop}><View style={[s.profileIcon,{backgroundColor:active?`${item.accent}1F`:theme.surface2,borderColor:active?item.accent:theme.border}]}><Ionicons name={item.icon} size={22} color={active?item.accent:theme.text}/></View><Text style={[s.profileTitle,{color:active?item.accent:theme.text}]}>{item.title}</Text></View>
            <Text style={[s.profileHint,{color:theme.muted}]}>{item.hint}</Text>
            <Text numberOfLines={2} style={[s.profileDesc,{color:theme.muted}]}>{profileDescription(item.id)}</Text>
          </Pressable>})}</View>
      </View>

      <View style={[s.activeCard,{backgroundColor:theme.surface,borderColor:activeAccent}]}><Text style={[s.activeLabel,{color:theme.muted}]}>المود الحالي</Text><Text style={[s.activeName,{color:activeAccent}]}>{profileLabel(settings.profile)}</Text><Text style={[s.activeDesc,{color:theme.muted}]}>{profileDescription(settings.profile)}</Text></View>

      <View style={s.section}><Text style={[s.sectionTitle,{color:theme.accent}]}>تحكم دقيق</Text><View style={[s.group,{backgroundColor:theme.surface,borderColor:theme.border}]}>
        <Toggle title="تركيز الصفحة الحالية" hint="يعطي الأولوية للصفحة النشطة بدل توزيع الموارد بالتساوي." value={settings.prioritizeActiveTab} disabled={saving} onChange={value=>void patch({prioritizeActiveTab:value})} theme={theme}/>
        <Toggle title="تعليق التبويبات الخلفية" hint="يخفف استهلاك RAM والشبكة من الصفحات غير النشطة." value={settings.suspendBackgroundTabs} disabled={saving} onChange={value=>void patch({suspendBackgroundTabs:value})} theme={theme}/>
        <Toggle title="تقليل العمل الخلفي" hint="يخفض المهام الثانوية عندما تكون الأولوية للتحميل أو الفيديو." value={settings.reduceBackgroundWork} disabled={saving} onChange={value=>void patch({reduceBackgroundWork:value})} theme={theme}/>
        <Toggle title="صور أخف للشبكة الضعيفة" hint="يقلل استهلاك البيانات داخل RAID ولا يغيّر سرعة مزود الخدمة." value={settings.lowBandwidthImages} disabled={saving} onChange={value=>void patch({lowBandwidthImages:value})} theme={theme}/>
        <Toggle title="إعادة محاولة ذكية" hint="يستخدم Retry متدرج بدل إعادة التحميل المتكرر الذي يضغط الاتصال." value={settings.aggressiveRetry} disabled={saving} onChange={value=>void patch({aggressiveRetry:value})} theme={theme} last/>
      </View></View>

      <View style={[s.note,{backgroundColor:theme.surface2,borderColor:theme.border}]}><Ionicons name="information-circle-outline" size={19} color={theme.accent}/><Text style={[s.noteText,{color:theme.muted}]}>Video يحافظ على جودة الصور ويقلل الخلفية، Reading يخفف التشتيت، Downloads يعطي أولوية للاستقرار، وLow Data يوفر البيانات. كل الإعدادات اختيارية ويمكن تغييرها فورًا.</Text></View>
    </ScrollView>
  </SafeAreaView>;
}

function Chip({label,on,theme}:{label:string;on:boolean;theme:ReturnType<typeof getTheme>}){
  return <View style={[s.chip,{backgroundColor:on?'rgba(76,184,132,.12)':theme.surface,borderColor:on?'#4CB884':theme.border}]}><Text style={[s.chipText,{color:on?'#4CB884':theme.muted}]}>{label}</Text></View>;
}

function Toggle({title,hint,value,disabled,onChange,theme,last=false}:{title:string;hint:string;value:boolean;disabled:boolean;onChange:(v:boolean)=>void;theme:ReturnType<typeof getTheme>;last?:boolean}){
  return <View style={[s.toggle,!last&&{borderBottomWidth:1,borderBottomColor:theme.border},disabled&&s.disabled]}><View style={s.toggleCopy}><Text style={[s.toggleTitle,{color:theme.text}]}>{title}</Text><Text style={[s.toggleHint,{color:theme.muted}]}>{hint}</Text></View><Switch value={value} disabled={disabled} onValueChange={onChange} trackColor={{false:'#39434C',true:'#2B765E'}} thumbColor="#F4F7F8"/></View>;
}

const s=StyleSheet.create({
  root:{flex:1},
  head:{minHeight:68,paddingVertical:8,borderBottomWidth:1,flexDirection:'row-reverse',alignItems:'center',gap:10},
  iconBtn:{width:42,height:42,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},
  headCopy:{flex:1,alignItems:'flex-end'},
  title:{fontWeight:'900'},
  sub:{fontSize:9.5,marginTop:2,textAlign:'right',lineHeight:14},
  statusDot:{width:10,height:10,borderRadius:5},
  content:{paddingTop:14,paddingBottom:42,gap:14},
  hero:{borderRadius:24,borderWidth:1,flexDirection:'row-reverse',alignItems:'center',gap:10},
  heroIcon:{borderWidth:1,alignItems:'center',justifyContent:'center'},
  heroCopy:{flex:1,alignItems:'flex-end'},
  kicker:{fontSize:9,fontWeight:'900',letterSpacing:1},
  heroTitle:{fontWeight:'900',marginTop:3,textAlign:'right'},
  heroText:{fontSize:10.5,lineHeight:16,marginTop:5,textAlign:'right'},
  quickRow:{gap:9},
  quickAction:{minHeight:60,borderRadius:18,borderWidth:1,paddingHorizontal:13,paddingVertical:10,flexDirection:'row-reverse',alignItems:'center',gap:10},
  quickCopy:{flex:1,alignItems:'flex-end'},
  quickTitle:{color:'#071412',fontSize:13,fontWeight:'900'},
  quickHint:{color:'rgba(7,20,18,.72)',fontSize:9.5,marginTop:3,textAlign:'right'},
  policyCard:{borderRadius:21,borderWidth:1,padding:13,gap:9},
  policyHead:{flexDirection:'row-reverse',alignItems:'center',gap:8},
  policyTitle:{fontSize:13,fontWeight:'900'},
  policyText:{fontSize:10.5,lineHeight:17,textAlign:'right'},
  chips:{flexDirection:'row-reverse',flexWrap:'wrap',gap:7},
  chip:{minHeight:29,borderRadius:12,borderWidth:1,paddingHorizontal:9,alignItems:'center',justifyContent:'center'},
  chipText:{fontSize:8.8,fontWeight:'800'},
  adaptiveCard:{minHeight:92,borderRadius:21,borderWidth:1,padding:12,flexDirection:'row-reverse',alignItems:'center',gap:10},
  adaptiveIcon:{width:44,height:44,borderRadius:15,borderWidth:1,alignItems:'center',justifyContent:'center'},
  adaptiveCopy:{flex:1,alignItems:'flex-end'},
  adaptiveTitle:{fontSize:13,fontWeight:'900'},
  adaptiveHint:{fontSize:9.5,lineHeight:15,textAlign:'right',marginTop:4},
  section:{gap:9},
  sectionTitle:{fontSize:13,fontWeight:'900',textAlign:'right',paddingHorizontal:3},
  grid:{flexDirection:'row-reverse',flexWrap:'wrap',gap:9,justifyContent:'space-between'},
  profile:{minHeight:132,borderRadius:19,borderWidth:1,padding:12},
  profileActive:{borderWidth:1.5},
  profileTop:{flexDirection:'row-reverse',alignItems:'center',gap:8},
  profileIcon:{width:40,height:40,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},
  profileTitle:{fontSize:13,fontWeight:'900',flex:1,textAlign:'right'},
  profileHint:{fontSize:9.5,fontWeight:'800',marginTop:8,textAlign:'right'},
  profileDesc:{fontSize:9,lineHeight:14,marginTop:5,textAlign:'right'},
  activeCard:{borderRadius:20,borderWidth:1.5,padding:14,alignItems:'flex-end'},
  activeLabel:{fontSize:9,fontWeight:'800'},
  activeName:{fontSize:18,fontWeight:'900',marginTop:2},
  activeDesc:{fontSize:10,lineHeight:16,textAlign:'right',marginTop:4},
  group:{borderRadius:21,borderWidth:1,overflow:'hidden'},
  toggle:{minHeight:72,paddingHorizontal:13,paddingVertical:10,flexDirection:'row-reverse',alignItems:'center',gap:12},
  toggleCopy:{flex:1,alignItems:'flex-end'},
  toggleTitle:{fontSize:12.5,fontWeight:'900',textAlign:'right'},
  toggleHint:{fontSize:9.5,lineHeight:15,marginTop:3,textAlign:'right'},
  note:{borderRadius:19,borderWidth:1,padding:13,flexDirection:'row-reverse',alignItems:'flex-start',gap:9},
  noteText:{flex:1,fontSize:9.8,lineHeight:16,textAlign:'right'},
  disabled:{opacity:.58},
  pressed:{opacity:.78,transform:[{scale:.995}]},
});
