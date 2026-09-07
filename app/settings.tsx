import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { getSetting, setSetting } from '@/lib/db';
import { useEffect, useState } from 'react';
import type { ThemeName } from '@/lib/theme';

const themeNames: ThemeName[]=['cinematic','amoled','light','cyber'];
export default function SettingsScreen(){
  const [theme,setTheme]=useState<ThemeName>('cinematic');
  useEffect(()=>{getSetting<ThemeName>('theme','cinematic').then(setTheme)},[]);
  const choose=async(t:ThemeName)=>{setTheme(t);await setSetting('theme',t)};
  return <SafeAreaView style={s.root}><View style={s.head}><Pressable onPress={()=>router.back()}><Text style={s.back}>‹</Text></Pressable><Text style={s.title}>Settings</Text><View style={{width:30}}/></View><ScrollView contentContainerStyle={s.content}>
    <Text style={s.section}>التصفح والبيانات</Text>
    <Row title="المكتبة: المفضلة والسجل" onPress={()=>router.push('/library')}/>
    <Text style={s.section}>الحساب والذكاء الاصطناعي</Text>
    <Row title="تسجيل الدخول / إنشاء حساب" onPress={()=>router.push('/login')}/>
    <Row title="RAID AI Agent" onPress={()=>router.push('/ai')}/>
    <Row title="مركز الخصوصية" onPress={()=>router.push('/privacy')}/>
    <Row title="مدير كلمات المرور الآمن" onPress={()=>router.push('/passwords')}/>
    <Text style={s.section}>المظهر</Text>
    <View style={s.card}>{themeNames.map(t=><Pressable key={t} onPress={()=>choose(t)} style={[s.theme,theme===t&&s.active]}><Text style={s.themeText}>{t.toUpperCase()}</Text></Pressable>)}</View>
    <Text style={s.section}>قدرات تحتاج مكوّناً أصلياً</Text>
    <View style={s.card}><Text style={s.note}>VPN وSOCKS5 وحجب مستوى النظام لا يتم تفعيلها شكلياً. سيتم ربطها فقط بعد إضافة Android native service/provider حقيقي واختباره.</Text></View>
  </ScrollView></SafeAreaView>
}
function Row({title,onPress}:{title:string;onPress:()=>void}){return <Pressable onPress={onPress} style={s.row}><Text style={s.rowText}>{title}</Text><Text style={s.chev}>‹</Text></Pressable>}
const s=StyleSheet.create({root:{flex:1,backgroundColor:'#070B14'},head:{height:58,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:'#1E293B'},back:{fontSize:34,color:'#fff'},title:{fontSize:18,fontWeight:'900',color:'#fff'},content:{padding:16,gap:10},section:{marginTop:10,color:'#A78BFA',fontWeight:'900'},row:{height:56,borderRadius:18,backgroundColor:'#111827',borderWidth:1,borderColor:'#27324A',paddingHorizontal:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},rowText:{color:'#fff',fontWeight:'700'},chev:{color:'#94A3B8',fontSize:28},card:{padding:14,borderRadius:20,backgroundColor:'#111827',borderWidth:1,borderColor:'#27324A',gap:8},theme:{padding:13,borderRadius:14,backgroundColor:'#0B1220'},active:{borderWidth:1,borderColor:'#8B5CF6'},themeText:{color:'#F8FAFC',fontWeight:'800'},note:{color:'#94A3B8',lineHeight:21,textAlign:'right'}});
