import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { getSetting, setSetting } from '@/lib/db';
import { useEffect, useState } from 'react';
import type { ThemeName } from '@/lib/theme';

const themeNames: ThemeName[]=['cinematic','amoled','light','cyber'];
const themeLabels: Record<ThemeName,string> = {
  cinematic:'سينمائي',
  amoled:'أسود AMOLED',
  light:'فاتح',
  cyber:'سايبر',
};

export default function SettingsScreen(){
  const [theme,setTheme]=useState<ThemeName>('cinematic');
  useEffect(()=>{getSetting<ThemeName>('theme','cinematic').then(setTheme)},[]);
  const choose=async(t:ThemeName)=>{setTheme(t);await setSetting('theme',t)};

  return <SafeAreaView style={s.root}>
    <View style={s.head}>
      <Pressable onPress={()=>router.back()} style={s.backButton}><Text style={s.back}>‹</Text></Pressable>
      <Text style={s.title}>الإعدادات</Text>
      <View style={{width:40}}/>
    </View>
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.section}>التصفح والبيانات</Text>
      <Row title="المكتبة والمفضلة والسجل" onPress={()=>router.push('/library')}/>
      <Row title="التبويبات المفتوحة" onPress={()=>router.push('/tabs')}/>

      <Text style={s.section}>الحساب والخدمات الذكية</Text>
      <Row title="حسابي" onPress={()=>router.push('/account')}/>
      <Row title="تسجيل الدخول أو إنشاء حساب جديد" onPress={()=>router.push('/login')}/>
      <Row title="RAID AI" onPress={()=>router.push('/ai')}/>
      <Row title="RAID VPN" onPress={()=>router.push('/vpn')}/>
      <Row title="مركز الخصوصية" onPress={()=>router.push('/privacy')}/>
      <Row title="مدير كلمات المرور الآمن" onPress={()=>router.push('/passwords')}/>

      <Text style={s.section}>المظهر</Text>
      <View style={s.card}>{themeNames.map(t=><Pressable key={t} onPress={()=>choose(t)} style={[s.theme,theme===t&&s.active]}><Text style={s.themeText}>{themeLabels[t]}</Text></Pressable>)}</View>

      <Text style={s.section}>حالة الخدمات</Text>
      <View style={s.card}>
        <Text style={s.note}>RAID AI وVPN مرتبطان بهوية حساب المستخدم بعد تسجيل الدخول. بيانات الملف الشخصي تُحفظ في قاعدة البيانات مع سياسات وصول تمنع كل مستخدم من قراءة أو تعديل ملف مستخدم آخر.</Text>
      </View>
    </ScrollView>
  </SafeAreaView>
}

function Row({title,onPress}:{title:string;onPress:()=>void}){return <Pressable onPress={onPress} style={s.row}><Text style={s.rowText}>{title}</Text><Text style={s.chev}>‹</Text></Pressable>}

const s=StyleSheet.create({
  root:{flex:1,backgroundColor:'#070B14'},head:{height:62,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:'#1E293B'},backButton:{width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:'#111827'},back:{fontSize:30,color:'#fff',marginTop:-3},title:{fontSize:18,fontWeight:'900',color:'#fff'},
  content:{padding:16,gap:10,paddingBottom:36},section:{marginTop:10,color:'#A78BFA',fontWeight:'900',textAlign:'right'},row:{height:56,borderRadius:18,backgroundColor:'#111827',borderWidth:1,borderColor:'#27324A',paddingHorizontal:16,flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'},rowText:{color:'#fff',fontWeight:'700',textAlign:'right'},chev:{color:'#94A3B8',fontSize:28},card:{padding:14,borderRadius:20,backgroundColor:'#111827',borderWidth:1,borderColor:'#27324A',gap:8},theme:{padding:13,borderRadius:14,backgroundColor:'#0B1220'},active:{borderWidth:1,borderColor:'#8B5CF6'},themeText:{color:'#F8FAFC',fontWeight:'800',textAlign:'right'},note:{color:'#94A3B8',lineHeight:21,textAlign:'right'}
});
