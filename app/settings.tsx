import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { getSetting, setSetting } from '@/lib/db';
import { useEffect, useState } from 'react';
import type { ThemeName } from '@/lib/theme';

const themeNames: ThemeName[]=['cinematic','amoled','light','cyber'];
const themeLabels: Record<ThemeName,string> = { cinematic:'سينمائي', amoled:'أسود AMOLED', light:'فاتح', cyber:'سايبر' };

export default function SettingsScreen(){
  const [theme,setTheme]=useState<ThemeName>('cinematic');
  useEffect(()=>{getSetting<ThemeName>('theme','cinematic').then(setTheme)},[]);
  const choose=async(t:ThemeName)=>{setTheme(t);await setSetting('theme',t)};

  return <SafeAreaView edges={['top','bottom','left','right']} style={s.root}>
    <View style={s.head}>
      <Pressable onPress={()=>router.back()} style={s.backButton} accessibilityRole="button" accessibilityLabel="رجوع"><Text style={s.back}>‹</Text></Pressable>
      <View style={s.headText}><Text style={s.title}>الإعدادات</Text><Text style={s.subtitle}>كل أدوات RAID في مكان واحد</Text></View>
      <View style={{width:40}}/>
    </View>
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.hero}>
        <Text style={s.heroKicker}>RAID Browser</Text>
        <Text style={s.heroTitle}>تجربة أهدأ، أسرع، وأسهل</Text>
        <Text style={s.heroText}>وصول منظم إلى التصفح والحساب والذكاء الاصطناعي والـVPN والخصوصية بدون ازدحام.</Text>
      </View>

      <Text style={s.section}>التصفح والبيانات</Text>
      <Row title="المكتبة والمفضلة والسجل" hint="إدارة المحتوى المحفوظ" onPress={()=>router.push('/library')}/>
      <Row title="التبويبات المفتوحة" hint="إدارة الجلسات والتبويبات" onPress={()=>router.push('/tabs')}/>

      <Text style={s.section}>الحساب والخدمات</Text>
      <Row title="حسابي" hint="الملف الشخصي وحالة الجلسة" onPress={()=>router.push('/account')}/>
      <Row title="تسجيل الدخول أو إنشاء حساب جديد" hint="Google أو البريد الإلكتروني" onPress={()=>router.push('/login')}/>
      <Row title="RAID AI" hint="المساعد الذكي داخل المتصفح" onPress={()=>router.push('/ai')}/>
      <Row title="RAID VPN" hint="حالة الاتصال والنفق الآمن" onPress={()=>router.push('/vpn')}/>
      <Row title="مزودات VPN المجانية" hint="Proton وWindscribe وhide.me وPrivadoVPN وWireGuard مخصص" onPress={()=>router.push('/vpn-provider')}/>
      <Row title="مركز الخصوصية" hint="الحماية وإعدادات البيانات" onPress={()=>router.push('/privacy')}/>
      <Row title="مدير كلمات المرور الآمن" hint="إدارة بيانات الدخول المحفوظة" onPress={()=>router.push('/passwords')}/>

      <Text style={s.section}>RAID Center</Text>
      <Row title="مركز التنبيهات" hint="حالة التطبيق وVPN والتحديثات المهمة" onPress={()=>router.push('/notifications')}/>
      <Row title="تواصل مع RAID" hint="القنوات الرسمية" onPress={()=>router.push('/contact')}/>

      <Text style={s.section}>المظهر</Text>
      <View style={s.card}>{themeNames.map(t=><Pressable key={t} onPress={()=>choose(t)} style={({pressed})=>[s.theme,theme===t&&s.active,pressed&&s.rowPressed]}><Text style={s.themeText}>{themeLabels[t]}</Text><Text style={s.themeDot}>{theme===t?'●':'○'}</Text></Pressable>)}</View>

      <View style={s.noteCard}>
        <Text style={s.noteTitle}>حالة الخدمات</Text>
        <Text style={s.note}>RAID AI وVPN يستخدمان جلسة الحساب نفسها. إعداد WireGuard المحلي يُحفظ على الجهاز ولا يُرفع إلى قاعدة البيانات.</Text>
      </View>
    </ScrollView>
  </SafeAreaView>
}

function Row({title,hint,onPress}:{title:string;hint:string;onPress:()=>void}){return <Pressable onPress={onPress} style={({pressed})=>[s.row,pressed&&s.rowPressed]}><View style={s.rowCopy}><Text style={s.rowText}>{title}</Text><Text style={s.rowHint}>{hint}</Text></View><Text style={s.chev}>‹</Text></Pressable>}

const s=StyleSheet.create({
  root:{flex:1,backgroundColor:'#ECE9E4'},
  head:{minHeight:62,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:14,paddingVertical:5,borderBottomWidth:1,borderBottomColor:'#D8D2CB',backgroundColor:'rgba(246,243,238,.98)'},
  backButton:{width:40,height:40,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,.72)',borderWidth:1,borderColor:'#D8D2CB'},back:{fontSize:29,color:'#4A433D',marginTop:-3},headText:{alignItems:'center'},title:{fontSize:18,fontWeight:'900',color:'#2D2A27'},subtitle:{marginTop:1,fontSize:10,color:'#8A8179'},
  content:{padding:16,gap:10,paddingBottom:40},hero:{padding:20,borderRadius:26,backgroundColor:'#D8CEC2',borderWidth:1,borderColor:'#C8BBAF'},heroKicker:{fontSize:10,fontWeight:'900',color:'#765F4E',textAlign:'right'},heroTitle:{fontSize:22,fontWeight:'900',color:'#342E29',textAlign:'right',marginTop:5},heroText:{marginTop:7,color:'#665D55',lineHeight:20,textAlign:'right',fontSize:12},
  section:{marginTop:10,color:'#705B4B',fontWeight:'900',textAlign:'right'},row:{minHeight:64,borderRadius:19,backgroundColor:'rgba(255,255,255,.70)',borderWidth:1,borderColor:'#D8D2CB',paddingHorizontal:15,paddingVertical:10,flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'},rowPressed:{opacity:.72,transform:[{scale:.995}]},rowCopy:{flex:1,alignItems:'flex-end'},rowText:{color:'#312D29',fontWeight:'900',textAlign:'right'},rowHint:{marginTop:3,color:'#8B8179',fontSize:10,textAlign:'right'},chev:{color:'#9A9189',fontSize:27,marginLeft:8},
  card:{padding:11,borderRadius:20,backgroundColor:'rgba(255,255,255,.64)',borderWidth:1,borderColor:'#D8D2CB',gap:7},theme:{minHeight:46,paddingHorizontal:13,borderRadius:14,backgroundColor:'#EEE9E3',flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'},active:{backgroundColor:'#D9CEC3',borderWidth:1,borderColor:'#A99482'},themeText:{color:'#3D3732',fontWeight:'800',textAlign:'right'},themeDot:{color:'#8D7562',fontWeight:'900'},noteCard:{padding:16,borderRadius:20,backgroundColor:'#E2DDD7',marginTop:3},noteTitle:{fontWeight:'900',color:'#4A433D',textAlign:'right'},note:{marginTop:5,color:'#766E67',lineHeight:20,textAlign:'right',fontSize:12}
});