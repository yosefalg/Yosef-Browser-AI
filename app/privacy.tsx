import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import { clearHistory } from '@/lib/db';
import { useState } from 'react';

export default function PrivacyScreen(){
  const [msg,setMsg]=useState('');
  const auth=async()=>{const ok=await LocalAuthentication.hasHardwareAsync();if(!ok){setMsg('لا توجد مصادقة حيوية مدعومة على هذا الجهاز.');return;}const r=await LocalAuthentication.authenticateAsync({promptMessage:'RAID Browser Lock'});setMsg(r.success?'تم التحقق بنجاح.':'فشل التحقق.');};
  const clear=async()=>{await clearHistory();setMsg('تم مسح سجل التصفح المحلي.');};
  const rows=[
    ['Private Mode','متاح — لا يتم حفظ السجل ويُستخدم WebView incognito.'],
    ['AI Privacy','لا تُرسل الصفحة إلى AI إلا عند تنفيذ إجراء AI صريح. مفاتيح المزود تبقى على الخادم.'],
    ['VPN','غير مفعّل — لن يعرض التطبيق حالة Connected بدون نفق VPN حقيقي.'],
    ['Ad/Tracker Blocking','بحاجة إلى تنفيذ Native/Filter حقيقي قبل تفعيل الحالة.'],
    ['Secure Storage','الجلسات والأسرار تستخدم SecureStore؛ السجل والإشارات تستخدم SQLite.'],
  ];
  return <SafeAreaView style={s.root}><View style={s.head}><Pressable onPress={()=>router.back()}><Text style={s.back}>‹</Text></Pressable><Text style={s.title}>Privacy Center</Text><View style={{width:30}}/></View><ScrollView contentContainerStyle={s.content}>{rows.map(([a,b])=><View key={a} style={s.card}><Text style={s.cardTitle}>{a}</Text><Text style={s.text}>{b}</Text></View>)}<Pressable onPress={auth} style={s.action}><Text style={s.actionText}>اختبار قفل البصمة / الوجه</Text></Pressable><Pressable onPress={clear} style={[s.action,s.danger]}><Text style={s.actionText}>مسح سجل التصفح</Text></Pressable>{!!msg&&<Text style={s.msg}>{msg}</Text>}</ScrollView></SafeAreaView>
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:'#070B14'},head:{height:58,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:'#1E293B'},back:{fontSize:34,color:'#fff'},title:{fontSize:18,fontWeight:'900',color:'#fff'},content:{padding:16,gap:12},card:{padding:17,borderRadius:20,backgroundColor:'#111827',borderWidth:1,borderColor:'#27324A'},cardTitle:{color:'#fff',fontWeight:'900',fontSize:16,marginBottom:6},text:{color:'#94A3B8',lineHeight:20,textAlign:'right'},action:{height:52,borderRadius:16,backgroundColor:'#7C3AED',alignItems:'center',justifyContent:'center'},danger:{backgroundColor:'#7F1D1D'},actionText:{color:'#fff',fontWeight:'800'},msg:{color:'#CBD5E1',textAlign:'center',marginTop:4}});
