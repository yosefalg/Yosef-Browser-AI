import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { getSetting } from '@/lib/db';
import { getTheme, isThemeName, type ThemeName } from '@/lib/theme';

const whatsapp='https://wa.me/9647887830501';
const instagram='https://www.instagram.com/_.k5w?stkn=MWtndWxkbnJhcGI5dg==';

function InstagramIcon(){return <View style={s.instagramIcon}><View style={s.instagramLens}/><View style={s.instagramDot}/></View>}

export default function ContactScreen(){
  const version=Constants.expoConfig?.version || '—';
  const openingRef=useRef(false);
  const [opening,setOpening]=useState(false);
  const [openError,setOpenError]=useState('');
  const [themeName,setThemeName]=useState<ThemeName>('cinematic');
  const theme=useMemo(()=>getTheme(themeName),[themeName]);

  useFocusEffect(useCallback(()=>{
    let active=true;
    void getSetting<ThemeName>('theme','cinematic')
      .then(value=>{if(active)setThemeName(isThemeName(value)?value:'cinematic');})
      .catch(()=>{if(active)setThemeName('cinematic');});
    return()=>{active=false;};
  },[]));

  const open=async(label:string,url:string)=>{
    if(openingRef.current)return;
    openingRef.current=true;
    setOpening(true);
    setOpenError('');
    try{
      await Linking.openURL(url);
    }catch{
      const message=`تعذر فتح ${label}. تأكد من وجود تطبيق مناسب أو حاول مرة أخرى.`;
      setOpenError(message);
      Alert.alert('تواصل مع RAID',message);
    }finally{
      openingRef.current=false;
      setOpening(false);
    }
  };

  return <SafeAreaView style={[s.root,{backgroundColor:theme.bg}]}>
    <View style={[s.head,{backgroundColor:theme.surface,borderBottomColor:theme.border}]}><Pressable onPress={()=>router.back()} style={[s.back,{backgroundColor:theme.surface2,borderColor:theme.border}]}><Text style={[s.backText,{color:theme.text}]}>‹</Text></Pressable><View style={{flex:1}}><Text style={[s.title,{color:theme.text}]}>تواصل مع RAID</Text><Text style={[s.sub,{color:theme.muted}]}>قنوات التواصل الرسمية</Text></View></View>
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={[s.hero,{backgroundColor:theme.surface2,borderColor:theme.border}]}><Text style={[s.heroTitle,{color:theme.text}]}>نحن قريبون منك</Text><Text style={[s.heroText,{color:theme.muted}]}>للملاحظات، اقتراحات المتصفح، ومشاكل الاستخدام يمكنك التواصل مباشرة عبر القنوات التالية.</Text></View>
      <Pressable disabled={opening} accessibilityRole="link" accessibilityLabel="فتح WhatsApp للتواصل مع RAID" accessibilityHint="يفتح رابط التواصل في تطبيق مناسب" accessibilityState={{disabled:opening,busy:opening}} onPress={()=>void open('WhatsApp',whatsapp)} style={({pressed})=>[s.card,{backgroundColor:theme.surface,borderColor:theme.border},(pressed||opening)&&s.pressed]}><View style={[s.icon,{backgroundColor:theme.accent}]}><Text style={s.iconText}>WA</Text></View><View style={s.info}><Text style={[s.name,{color:theme.text}]}>WhatsApp</Text><Text style={[s.value,{color:theme.muted}]}>07887830501</Text></View><Text style={[s.chev,{color:theme.muted}]}>‹</Text></Pressable>
      <Pressable disabled={opening} accessibilityRole="link" accessibilityLabel="فتح Instagram للتواصل مع RAID" accessibilityHint="يفتح رابط التواصل في تطبيق مناسب" accessibilityState={{disabled:opening,busy:opening}} onPress={()=>void open('Instagram',instagram)} style={({pressed})=>[s.card,{backgroundColor:theme.surface,borderColor:theme.border},(pressed||opening)&&s.pressed]}><View style={[s.icon,s.instagramWrap]}><InstagramIcon/></View><View style={s.info}><Text style={[s.name,{color:theme.text}]}>Instagram</Text><Text style={[s.value,{color:theme.muted}]}>تواصل معي على Instagram</Text></View><Text style={[s.chev,{color:theme.muted}]}>‹</Text></Pressable>
      {!!openError&&<Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.error}>{openError}</Text>}
      <View style={[s.note,{backgroundColor:theme.surface2}]}><Text style={[s.noteTitle,{color:theme.text}]}>RAID Browser {version}</Text><Text style={[s.noteText,{color:theme.muted}]}>هذه الصفحة لا تطلب كلمة مرور أو رمز تسجيل دخول ولا تصل إلى بيانات حسابك.</Text></View>
    </ScrollView>
  </SafeAreaView>;
}

const s=StyleSheet.create({root:{flex:1,backgroundColor:'#ECE9E4'},head:{minHeight:70,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:'#D7D1C9',backgroundColor:'rgba(246,243,238,.96)'},back:{width:42,height:42,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,.62)',borderWidth:1,borderColor:'#D8D2CB'},backText:{fontSize:31,color:'#4B4540',marginTop:-3},title:{fontSize:20,fontWeight:'900',color:'#2D2A27',textAlign:'right'},sub:{fontSize:11,color:'#817A73',textAlign:'right',marginTop:2},content:{padding:18,gap:12,paddingBottom:36},hero:{padding:22,borderRadius:26,backgroundColor:'#D8CEC2',borderWidth:1,borderColor:'#C9BBAA'},heroTitle:{fontSize:23,fontWeight:'900',color:'#3B312A',textAlign:'right'},heroText:{marginTop:8,color:'#655A52',lineHeight:22,textAlign:'right'},card:{minHeight:76,borderRadius:22,padding:14,backgroundColor:'rgba(255,255,255,.68)',borderWidth:1,borderColor:'#D8D2CB',flexDirection:'row-reverse',alignItems:'center',gap:12},pressed:{opacity:.58,transform:[{scale:.995}]},icon:{width:48,height:48,borderRadius:17,backgroundColor:'#B6A08F',alignItems:'center',justifyContent:'center'},iconText:{color:'#FFFDF9',fontWeight:'900'},instagramWrap:{backgroundColor:'#8E7464'},instagramIcon:{width:27,height:27,borderRadius:8,borderWidth:2.5,borderColor:'#FFFDF9',alignItems:'center',justifyContent:'center',position:'relative'},instagramLens:{width:10,height:10,borderRadius:5,borderWidth:2.2,borderColor:'#FFFDF9'},instagramDot:{position:'absolute',right:4,top:4,width:4,height:4,borderRadius:2,backgroundColor:'#FFFDF9'},info:{flex:1,alignItems:'flex-end'},name:{color:'#2F2B28',fontWeight:'900',fontSize:16},value:{color:'#7B736C',marginTop:4},chev:{fontSize:28,color:'#9B928B'},error:{color:'#8A4C42',fontSize:12,lineHeight:19,textAlign:'right',paddingHorizontal:4},note:{padding:18,borderRadius:20,backgroundColor:'#E3DED8'},noteTitle:{fontWeight:'900',color:'#4A433D',textAlign:'right'},noteText:{marginTop:6,color:'#766E67',lineHeight:20,textAlign:'right'}});
