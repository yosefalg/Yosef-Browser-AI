import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import { clearHistory } from '@/lib/db';
import { useState } from 'react';

export default function PrivacyScreen(){
  const [msg,setMsg]=useState('');

  const auth=async()=>{
    const ok=await LocalAuthentication.hasHardwareAsync();
    if(!ok){setMsg('لا توجد مصادقة حيوية مدعومة على هذا الجهاز.');return;}
    const r=await LocalAuthentication.authenticateAsync({promptMessage:'تحقق من هوية مستخدم RAID',cancelLabel:'إلغاء'});
    setMsg(r.success?'تم التحقق بنجاح.':'فشل التحقق أو أُلغي.');
  };

  const clear=async()=>{await clearHistory();setMsg('تم مسح سجل التصفح المحلي.');};

  const rows=[
    ['الوضع الخاص','متاح — لا يتم حفظ سجل التصفح أو سياق RAID AI، ويعمل WebView بوضع التصفح الخفي.'],
    ['خصوصية RAID AI','لا يُرسل سياق الصفحة إلا عند استخدام RAID AI بشكل صريح. خدمة الذكاء الاصطناعي محمية بتسجيل الدخول ولا يوجد مفتاح مزود داخل التطبيق.'],
    ['RAID VPN','مدمج عبر خدمة Android أصلية ونفق WireGuard. ملف الاتصال يرتبط بالحساب ولا يظهر في واجهة المستخدم.'],
    ['حماية التتبع','يتم تقييد الوصول غير الآمن داخل WebView، وسيتم توسيع قوائم الحجب الفعلية تدريجيًا دون كسر المواقع.'],
    ['التخزين الآمن','جلسة الحساب وبيانات الاعتماد الحساسة تستخدم SecureStore، بينما السجل والمفضلة والتبويبات تستخدم SQLite محليًا.'],
  ];

  return <SafeAreaView style={s.root}>
    <View style={s.head}>
      <Pressable onPress={()=>router.back()} style={s.backButton}><Text style={s.back}>‹</Text></Pressable>
      <Text style={s.title}>مركز الخصوصية</Text>
      <View style={{width:40}}/>
    </View>
    <ScrollView contentContainerStyle={s.content}>
      {rows.map(([a,b])=><View key={a} style={s.card}><Text style={s.cardTitle}>{a}</Text><Text style={s.text}>{b}</Text></View>)}
      <Pressable onPress={auth} style={s.action}><Text style={s.actionText}>اختبار قفل البصمة أو الوجه</Text></Pressable>
      <Pressable onPress={clear} style={[s.action,s.danger]}><Text style={s.actionText}>مسح سجل التصفح</Text></Pressable>
      {!!msg&&<Text style={s.msg}>{msg}</Text>}
    </ScrollView>
  </SafeAreaView>
}

const s=StyleSheet.create({
  root:{flex:1,backgroundColor:'#070B14'},head:{height:62,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:'#1E293B'},backButton:{width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:'#111827'},back:{fontSize:30,color:'#fff',marginTop:-3},title:{fontSize:18,fontWeight:'900',color:'#fff'},content:{padding:16,gap:12,paddingBottom:34},card:{padding:17,borderRadius:20,backgroundColor:'#111827',borderWidth:1,borderColor:'#27324A'},cardTitle:{color:'#fff',fontWeight:'900',fontSize:16,marginBottom:6,textAlign:'right'},text:{color:'#94A3B8',lineHeight:20,textAlign:'right'},action:{height:52,borderRadius:16,backgroundColor:'#7C3AED',alignItems:'center',justifyContent:'center'},danger:{backgroundColor:'#7F1D1D'},actionText:{color:'#fff',fontWeight:'800'},msg:{color:'#CBD5E1',textAlign:'center',marginTop:4}
});
