import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export function HomeHero({onPress}:{onPress:()=>void}){
  return <Pressable onPress={onPress} style={({pressed})=>[s.shell,pressed&&s.press]}>
    <LinearGradient colors={['#5B4639','#2D2A28','#17191C']} start={{x:0,y:0}} end={{x:1,y:1}} style={s.bg}>
      <View pointerEvents="none" style={s.glowA}/>
      <View pointerEvents="none" style={s.glowB}/>
      <View pointerEvents="none" style={s.ridgeA}/>
      <View pointerEvents="none" style={s.ridgeB}/>
      <LinearGradient colors={['rgba(255,241,225,.03)','rgba(15,15,16,.55)']} style={s.overlay}>
        <View style={s.copy}>
          <Text style={s.kicker}>RAID Browser</Text>
          <Text style={s.title}>تصفح بلا حدود</Text>
          <Text style={s.sub}>وصول أسرع • واجهة أهدأ • أدوات ذكية</Text>
        </View>
        <View style={s.arrowBubble}><Text style={s.arrow}>‹</Text></View>
      </LinearGradient>
    </LinearGradient>
  </Pressable>;
}

const s=StyleSheet.create({
  shell:{height:168,borderRadius:28,overflow:'hidden',borderWidth:1,borderColor:'rgba(234,220,207,.24)',backgroundColor:'#292A2A'},
  bg:{flex:1,overflow:'hidden'},
  glowA:{position:'absolute',width:170,height:170,borderRadius:85,backgroundColor:'rgba(214,152,111,.18)',top:-78,right:-24},
  glowB:{position:'absolute',width:120,height:120,borderRadius:60,backgroundColor:'rgba(239,211,183,.09)',bottom:-58,left:18},
  ridgeA:{position:'absolute',width:260,height:120,backgroundColor:'rgba(49,42,37,.76)',transform:[{rotate:'-15deg'}],bottom:-72,right:-10,borderRadius:42},
  ridgeB:{position:'absolute',width:230,height:100,backgroundColor:'rgba(89,69,57,.40)',transform:[{rotate:'12deg'}],bottom:-65,left:-20,borderRadius:38},
  overlay:{flex:1,padding:20,flexDirection:'row-reverse',alignItems:'flex-end',justifyContent:'space-between'},
  copy:{flex:1},kicker:{color:'#E4C6AD',fontSize:10,fontWeight:'800',letterSpacing:1.1,textAlign:'right'},title:{color:'#FFF9F2',fontSize:25,fontWeight:'900',marginTop:4,textAlign:'right'},sub:{color:'#D9D2CB',fontSize:11,marginTop:6,textAlign:'right'},
  arrowBubble:{width:40,height:40,borderRadius:14,backgroundColor:'rgba(255,255,255,.10)',borderWidth:1,borderColor:'rgba(255,255,255,.12)',alignItems:'center',justifyContent:'center'},arrow:{color:'#FFF',fontSize:30,fontWeight:'300',marginTop:-2},
  press:{transform:[{scale:.985}],opacity:.94}
});
