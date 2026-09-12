import { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { saveLocalWireGuardConfig } from '@/lib/vpn-import';
import { getSetting } from '@/lib/db';
import { getTheme, type ThemeName } from '@/lib/theme';

type Provider={name:string;note:string;url:string};
const providers:Provider[]=[
  {name:'Proton VPN',note:'افتح حسابك واستخرج إعداد WireGuard إذا كانت خطتك تتيحه.',url:'https://account.protonvpn.com/downloads'},
  {name:'Windscribe',note:'مزود بديل؛ استخدم إعداد WireGuard الرسمي المتاح لحسابك.',url:'https://windscribe.com/'},
  {name:'hide.me',note:'يمكن استخدام إعداد WireGuard صادر من حسابك لدى المزود.',url:'https://hide.me/'},
  {name:'PrivadoVPN',note:'خيار إضافي عند توفر إعداد WireGuard ضمن حسابك.',url:'https://privadovpn.com/'},
];

export default function VpnProviderScreen(){
  const [config,setConfig]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [themeName,setThemeName]=useState<ThemeName>('cinematic');
  const theme=useMemo(()=>getTheme(themeName),[themeName]);

  useFocusEffect(useCallback(()=>{let alive=true;getSetting<ThemeName>('theme','cinematic').then(value=>{if(alive)setThemeName(value==='cinematic'||value==='amoled'||value==='light'?value:'cinematic')}).catch(()=>{});return()=>{alive=false};},[]));

  const openProvider=(url:string)=>void Linking.openURL(url).catch(()=>setMessage('تعذر فتح موقع المزود الآن.'));
  const save=async()=>{
    if(busy)return;
    setBusy(true);setMessage('');
    try{
      await saveLocalWireGuardConfig(config);
      setMessage('تم التحقق من إعداد WireGuard وحفظه بأمان على هذا الجهاز.');
      setTimeout(()=>router.replace('/vpn'),450);
    }catch(error){setMessage(error instanceof Error?error.message:'تعذر حفظ إعداد VPN.');}
    finally{setBusy(false);}
  };

  return <SafeAreaView edges={['top','bottom','left','right']} style={[s.root,{backgroundColor:theme.bg}]}>
    <View style={[s.header,{backgroundColor:theme.surface,borderBottomColor:theme.border}]}>
      <Pressable onPress={()=>router.back()} style={({pressed})=>[s.iconButton,{backgroundColor:theme.surface2,borderColor:theme.border},pressed&&s.pressed]} accessibilityRole="button" accessibilityLabel="رجوع"><MaterialCommunityIcons name="chevron-right" size={25} color={theme.text}/></Pressable>
      <View style={s.headCopy}><Text style={[s.title,{color:theme.text}]}>إعداد RAID VPN</Text><Text style={[s.sub,{color:theme.muted}]}>WireGuard من مزود تختاره أنت</Text></View>
      <View style={[s.iconButton,{backgroundColor:theme.surface2,borderColor:theme.border}]}><MaterialCommunityIcons name="file-key-outline" size={21} color={theme.accent}/></View>
    </View>

    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={[s.hero,{backgroundColor:theme.surface,borderColor:theme.border}]}>
        <View style={[s.heroIcon,{backgroundColor:theme.surface2,borderColor:theme.border}]}><MaterialCommunityIcons name="shield-key-outline" size={30} color={theme.accent}/></View>
        <View style={s.heroCopy}><Text style={[s.kicker,{color:theme.accent}]}>إعداد محلي وآمن</Text><Text style={[s.heroTitle,{color:theme.text}]}>اربط ملف WireGuard حقيقي</Text><Text style={[s.heroText,{color:theme.muted}]}>RAID لا ينشئ نفقًا وهميًا ولا يطلب مفتاحك الخاص على الخادم. ألصق ملف WireGuard الصادر من مزودك وسيُحفظ محليًا على الجهاز بعد التحقق من بنيته.</Text></View>
      </View>

      <View style={s.sectionHead}><MaterialCommunityIcons name="web" size={18} color={theme.accent}/><Text style={[s.section,{color:theme.accent}]}>مزودات يمكن فتحها</Text></View>
      <View style={[s.providers,{backgroundColor:theme.surface,borderColor:theme.border}]}>{providers.map((provider,index)=><Pressable key={provider.name} onPress={()=>openProvider(provider.url)} style={({pressed})=>[s.provider,index<providers.length-1&&{borderBottomWidth:1,borderBottomColor:theme.border},pressed&&s.pressed]}>
        <View style={[s.providerIcon,{backgroundColor:theme.surface2,borderColor:theme.border}]}><MaterialCommunityIcons name="server-network" size={20} color={theme.accent}/></View>
        <View style={s.providerCopy}><Text style={[s.providerTitle,{color:theme.text}]}>{provider.name}</Text><Text style={[s.providerText,{color:theme.muted}]}>{provider.note}</Text></View>
        <MaterialCommunityIcons name="open-in-new" size={18} color={theme.muted}/>
      </Pressable>)}</View>

      <View style={s.sectionHead}><MaterialCommunityIcons name="text-box-outline" size={18} color={theme.accent}/><Text style={[s.section,{color:theme.accent}]}>إعداد WireGuard المخصص</Text></View>
      <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.border}]}>
        <Text style={[s.hint,{color:theme.muted}]}>ألصق ملف .conf كاملًا. يتم التحقق من Interface وPrivateKey وPeer وEndpoint وAllowedIPs قبل الحفظ.</Text>
        <TextInput value={config} onChangeText={setConfig} multiline autoCapitalize="none" autoCorrect={false} textAlign="left" placeholder={'[Interface]\nPrivateKey = ...\nAddress = ...\n\n[Peer]\nPublicKey = ...\nEndpoint = ...\nAllowedIPs = 0.0.0.0/0'} placeholderTextColor={theme.muted} style={[s.input,{backgroundColor:theme.surface2,borderColor:theme.border,color:theme.text}]} accessibilityLabel="إعداد WireGuard"/>
        <Pressable onPress={save} disabled={busy||!config.trim()} style={({pressed})=>[s.primary,{backgroundColor:theme.accent},(busy||!config.trim()||pressed)&&s.pressed]} accessibilityRole="button"><View style={s.buttonRow}><MaterialCommunityIcons name={busy?'progress-clock':'content-save'} size={19} color="#fff"/><Text style={s.primaryText}>{busy?'جارٍ التحقق والحفظ…':'تحقق واحفظ الإعداد'}</Text></View></Pressable>
        {!!message&&<View style={[s.messageBox,{backgroundColor:theme.surface2,borderColor:theme.border}]}><MaterialCommunityIcons name="information-outline" size={18} color={theme.accent}/><Text style={[s.message,{color:theme.text}]}>{message}</Text></View>}
      </View>

      <View style={[s.note,{backgroundColor:theme.surface,borderColor:theme.border}]}><MaterialCommunityIcons name="shield-lock-outline" size={21} color={theme.accent}/><View style={s.noteCopy}><Text style={[s.noteTitle,{color:theme.text}]}>خصوصية الإعداد</Text><Text style={[s.noteText,{color:theme.muted}]}>RAID لا يسجّل الدخول نيابةً عنك لدى أي مزود. الروابط تفتح مواقع المزودين فقط، والاتصال يعمل داخل RAID بعد حفظ ملف WireGuard صالح على جهازك.</Text></View></View>
    </ScrollView>
  </SafeAreaView>;
}

const s=StyleSheet.create({
  root:{flex:1},header:{minHeight:66,flexDirection:'row-reverse',alignItems:'center',gap:10,paddingHorizontal:14,paddingVertical:7,borderBottomWidth:1},iconButton:{width:42,height:42,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},headCopy:{flex:1,alignItems:'center'},title:{fontSize:18,fontWeight:'900'},sub:{fontSize:10,marginTop:2},content:{padding:16,paddingBottom:42,gap:12},
  hero:{padding:17,borderRadius:24,borderWidth:1,flexDirection:'row-reverse',gap:13,alignItems:'center'},heroIcon:{width:58,height:58,borderRadius:19,borderWidth:1,alignItems:'center',justifyContent:'center'},heroCopy:{flex:1,alignItems:'flex-end'},kicker:{fontSize:10,fontWeight:'900'},heroTitle:{fontSize:20,fontWeight:'900',textAlign:'right',marginTop:3},heroText:{fontSize:11,lineHeight:18,textAlign:'right',marginTop:6},sectionHead:{flexDirection:'row-reverse',alignItems:'center',gap:8,paddingHorizontal:3,marginTop:2},section:{fontWeight:'900',textAlign:'right'},
  providers:{borderRadius:22,borderWidth:1,overflow:'hidden'},provider:{minHeight:74,paddingHorizontal:12,paddingVertical:10,flexDirection:'row-reverse',alignItems:'center',gap:11},providerIcon:{width:42,height:42,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},providerCopy:{flex:1,alignItems:'flex-end'},providerTitle:{fontWeight:'900',fontSize:14},providerText:{fontSize:10,lineHeight:16,textAlign:'right',marginTop:3},
  card:{padding:15,borderRadius:22,borderWidth:1,gap:11},hint:{fontSize:11,lineHeight:18,textAlign:'right'},input:{minHeight:210,maxHeight:340,borderRadius:17,borderWidth:1,padding:14,fontSize:12,lineHeight:19,textAlignVertical:'top'},primary:{height:50,borderRadius:16,alignItems:'center',justifyContent:'center'},buttonRow:{flexDirection:'row-reverse',alignItems:'center',gap:8},primaryText:{color:'#fff',fontWeight:'900'},messageBox:{borderRadius:15,borderWidth:1,padding:11,flexDirection:'row-reverse',alignItems:'center',gap:8},message:{flex:1,textAlign:'right',lineHeight:19,fontSize:11},note:{padding:15,borderRadius:20,borderWidth:1,flexDirection:'row-reverse',alignItems:'flex-start',gap:10},noteCopy:{flex:1},noteTitle:{fontWeight:'900',textAlign:'right'},noteText:{marginTop:5,lineHeight:18,textAlign:'right',fontSize:11},pressed:{opacity:.7,transform:[{scale:.985}]}
});
