import { useEffect, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { RaidServiceIcon, SiteIcon } from '@/components/SiteIcon';
import type { ThemePalette } from '@/lib/theme';

type Shortcut={label:string;url?:string;service?:'ai'|'vpn';onPress:()=>void};
export function HomeShortcuts({theme,items,onMore}:{theme:ThemePalette;items:Shortcut[];onMore:()=>void}){
  const values=useRef<Animated.Value[]>([]);
  const total=items.length+1;
  if(values.current.length!==total) values.current=Array.from({length:total},(_,i)=>values.current[i]??new Animated.Value(0));
  useEffect(()=>{
    values.current.forEach(v=>v.setValue(0));
    Animated.stagger(55,values.current.map(v=>Animated.spring(v,{toValue:1,damping:17,stiffness:190,mass:.72,useNativeDriver:true}))).start();
  },[total]);
  const renderTile=(index:number,label:string,content:React.ReactNode,onPress:()=>void)=>{
    const a=values.current[index];
    return <Animated.View key={label} style={{opacity:a,transform:[{translateY:a.interpolate({inputRange:[0,1],outputRange:[15,0]})},{scale:a.interpolate({inputRange:[0,1],outputRange:[.9,1]})}]}}>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({pressed})=>[s.wrap,pressed&&s.press]}>
        <View style={[s.box,{borderColor:theme.border}]}>
          <BlurView intensity={32} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill}/>
          <LinearGradient colors={['rgba(255,255,255,.12)','rgba(255,255,255,.025)']} style={StyleSheet.absoluteFill}/>
          <View style={s.specular}/>{content}
        </View>
        <Text style={[s.label,{color:theme.text}]}>{label}</Text>
      </Pressable>
    </Animated.View>;
  };
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
    {items.map((item,index)=>renderTile(index,item.label,item.url?<SiteIcon url={item.url} size={50} radius={15}/>:<RaidServiceIcon kind={item.service!} size={50}/>,item.onPress))}
    {renderTile(items.length,'المزيد',<Ionicons name="add-outline" size={28} color={theme.text}/>,onMore)}
  </ScrollView>;
}
const s=StyleSheet.create({
  row:{gap:13,paddingVertical:5,paddingHorizontal:1},wrap:{width:82,alignItems:'center',gap:7},
  box:{width:68,height:68,borderRadius:22,borderWidth:1,alignItems:'center',justifyContent:'center',overflow:'hidden',backgroundColor:'rgba(255,255,255,.025)',shadowColor:'#000',shadowOpacity:.2,shadowRadius:14,shadowOffset:{width:0,height:8},elevation:8,transform:[{perspective:700},{rotateX:'2deg'}]},
  specular:{position:'absolute',top:0,left:12,right:12,height:1,backgroundColor:'rgba(255,255,255,.4)'},
  label:{fontSize:11,fontWeight:'800',textAlign:'center'},press:{transform:[{perspective:700},{scale:.92},{translateY:3}],opacity:.88}
});
