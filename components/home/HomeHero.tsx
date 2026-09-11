import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export function HomeHero({onPress}:{onPress:()=>void}){
  return <Pressable onPress={onPress} style={({pressed})=>[s.shell,pressed&&s.press]}>
    <ImageBackground source={require('../../assets/images/raid-warm-hero.jpg')} resizeMode="cover" imageStyle={s.image} style={s.bg}>
      <LinearGradient colors={['rgba(13,14,16,.08)','rgba(20,18,17,.78)']} style={s.overlay}>
        <View style={s.copy}><Text style={s.kicker}>RAID Browser</Text><Text style={s.title}>تصفح بلا حدود</Text><Text style={s.sub}>وصول أسرع • واجهة أهدأ • أدوات ذكية</Text></View><Text style={s.arrow}>‹</Text>
      </LinearGradient>
    </ImageBackground>
  </Pressable>;
}
const s=StyleSheet.create({shell:{height:168,borderRadius:28,overflow:'hidden',borderWidth:1,borderColor:'rgba(234,220,207,.24)',backgroundColor:'#292A2A'},bg:{flex:1},image:{borderRadius:28},overlay:{flex:1,padding:20,flexDirection:'row-reverse',alignItems:'flex-end',justifyContent:'space-between'},copy:{flex:1},kicker:{color:'#E4C6AD',fontSize:10,fontWeight:'800',letterSpacing:1.1,textAlign:'right'},title:{color:'#FFF9F2',fontSize:25,fontWeight:'900',marginTop:4,textAlign:'right'},sub:{color:'#D9D2CB',fontSize:11,marginTop:6,textAlign:'right'},arrow:{color:'#FFF',fontSize:34,fontWeight:'300',paddingLeft:4},press:{transform:[{scale:.985}],opacity:.94}});
