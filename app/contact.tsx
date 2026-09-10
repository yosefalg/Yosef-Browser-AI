import { Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';

const whatsapp='https://wa.me/9647887830501';
const instagram='https://www.instagram.com/_.k5w?stkn=MWtndWxkbnJhcGI5dg==';

function open(url:string){Linking.openURL(url).catch(()=>{});}

function InstagramIcon(){return <View style={s.instagramIcon}><View style={s.instagramLens}/><View style={s.instagramDot}/></View>}

export default function ContactScreen(){
  const version=Constants.expoConfig?.version || '—';
  return <SafeAreaView style={s.root}>
    <View style={s.head}><Pressable onPress={()=>router.back()} style={s.back}><Text style={s.backText}>‹</Text></Pressable><View style={{flex:1}}><Text style={s.title}>تواصل مع RAID</Text><Text style={s.sub}>قنوات التواصل الرسمية</Text></View></View>
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.hero}><Text style={s.heroTitle}>نحن قريبون منك</Text><Text style={s.heroText}>للملاحظات، اقتراحات المتصفح، ومشاكل الاستخدام يمكنك التواصل مباشرة عبر القنوات التالية.</Text></View>
      <Pressable onPress={()=>open(whatsapp)} style={({pressed})=>[s.card,pressed&&s.pressed]}><View style={s.icon}><Text style={s.iconText}>WA</Text></View><View style={s.info}><Text style={s.name}>WhatsApp</Text><Text style={s.value}>07887830501</Text></View><Text style={s.chev}>‹</Text></Pressable>
      <Pressable accessibilityRole="link" accessibilityLabel="تواصل معي على Instagram" onPress={()=>open(instagram)} style={({pressed})=>[s.card,pressed&&s.pressed]}><View style={[s.icon,s.instagramWrap]}><InstagramIcon/></View><View style={s.info}><Text style={s.name}>Instagram</Text><Text style={s.value}>تواصل معي على Instagram</Text></View><Text style={s.chev}>‹</Text></Pressable>
      <View style={s.note}><Text style={s.noteTitle}>RAID Browser {version}</Text><Text style={s.noteText}>هذه الصفحة لا تطلب كلمة مرور أو رمز تسجيل دخول ولا تصل إلى بيانات حسابك.</Text></View>
    </ScrollView>
  </SafeAreaView>;
}

const s=StyleSheet.create({root:{flex:1,backgroundColor:'#ECE9E4'},head:{minHeight:70,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:'#D7D1C9',backgroundColor:'rgba(246,243,238,.96)'},back:{width:42,height:42,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,.62)',borderWidth:1,borderColor:'#D8D2CB'},backText:{fontSize:31,color:'#4B4540',marginTop:-3},title:{fontSize:20,fontWeight:'900',color:'#2D2A27',textAlign:'right'},sub:{fontSize:11,color:'#817A73',textAlign:'right',marginTop:2},content:{padding:18,gap:12,paddingBottom:36},hero:{padding:22,borderRadius:26,backgroundColor:'#D8CEC2',borderWidth:1,borderColor:'#C9BBAA'},heroTitle:{fontSize:23,fontWeight:'900',color:'#3B312A',textAlign:'right'},heroText:{marginTop:8,color:'#655A52',lineHeight:22,textAlign:'right'},card:{minHeight:76,borderRadius:22,padding:14,backgroundColor:'rgba(255,255,255,.68)',borderWidth:1,borderColor:'#D8D2CB',flexDirection:'row-reverse',alignItems:'center',gap:12},pressed:{opacity:.72,transform:[{scale:.995}]},icon:{width:48,height:48,borderRadius:17,backgroundColor:'#B6A08F',alignItems:'center',justifyContent:'center'},iconText:{color:'#FFFDF9',fontWeight:'900'},instagramWrap:{backgroundColor:'#8E7464'},instagramIcon:{width:27,height:27,borderRadius:8,borderWidth:2.5,borderColor:'#FFFDF9',alignItems:'center',justifyContent:'center',position:'relative'},instagramLens:{width:10,height:10,borderRadius:5,borderWidth:2.2,borderColor:'#FFFDF9'},instagramDot:{position:'absolute',right:4,top:4,width:4,height:4,borderRadius:2,backgroundColor:'#FFFDF9'},info:{flex:1,alignItems:'flex-end'},name:{color:'#2F2B28',fontWeight:'900',fontSize:16},value:{color:'#7B736C',marginTop:4},chev:{fontSize:28,color:'#9B928B'},note:{padding:18,borderRadius:20,backgroundColor:'#E3DED8'},noteTitle:{fontWeight:'900',color:'#4A433D',textAlign:'right'},noteText:{marginTop:6,color:'#766E67',lineHeight:20,textAlign:'right'}});
