import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

export function RaidLogo({ size = 72 }: { size?: number }) {
  const radius = Math.round(size * 0.3);
  return (
    <LinearGradient colors={['#08131B', '#0F766E', '#5B35B5']} start={{x:0,y:0}} end={{x:1,y:1}} style={[s.box,{width:size,height:size,borderRadius:radius}]}>
      <View style={[s.orbit,{width:size*.72,height:size*.72,borderRadius:size*.36}]} />
      <View style={[s.beam,{width:size*.62,height:Math.max(2,size*.045)}]} />
      <Text style={[s.r,{fontSize:Math.round(size*.43)}]}>R</Text>
      <View style={[s.dot,{width:Math.max(5,size*.09),height:Math.max(5,size*.09),borderRadius:size*.045,right:size*.17,top:size*.17}]} />
    </LinearGradient>
  );
}

const s=StyleSheet.create({
  box:{alignItems:'center',justifyContent:'center',overflow:'hidden',shadowColor:'#43D5BE',shadowOpacity:.22,shadowRadius:18,elevation:7,borderWidth:1,borderColor:'rgba(255,255,255,.14)'},
  orbit:{position:'absolute',borderWidth:1.5,borderColor:'rgba(139,224,204,.42)',transform:[{rotate:'-18deg'}]},
  beam:{position:'absolute',borderRadius:99,backgroundColor:'rgba(255,255,255,.2)',transform:[{rotate:'-38deg'}]},
  r:{color:'#F8FAFC',fontWeight:'900',letterSpacing:-2,textShadowColor:'rgba(0,0,0,.25)',textShadowRadius:5},
  dot:{position:'absolute',backgroundColor:'#8BE0CC',shadowColor:'#8BE0CC',shadowOpacity:.7,shadowRadius:7,elevation:4},
});
