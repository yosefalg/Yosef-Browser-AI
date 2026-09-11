import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ThemePalette } from '@/lib/theme';

export type HomeMenuItem = {
  label: string;
  icon: string;
  onPress: () => void;
  hint?: string;
  disabled?: boolean;
};

const STAGGER_MS = 42;

export function HomeMenu({ visible, onClose, theme, items }: { visible: boolean; onClose: () => void; theme: ThemePalette; items: HomeMenuItem[] }) {
  const [mounted,setMounted]=useState(visible);
  const panel=useRef(new Animated.Value(0)).current;
  const overlay=useRef(new Animated.Value(0)).current;
  const rows=useRef<Animated.Value[]>([]);
  if(rows.current.length!==items.length) rows.current=items.map((_,i)=>rows.current[i] ?? new Animated.Value(0));

  useEffect(()=>{
    if(visible){
      setMounted(true);
      panel.setValue(0); overlay.setValue(0); rows.current.forEach(v=>v.setValue(0));
      Animated.parallel([
        Animated.timing(overlay,{toValue:1,duration:220,easing:Easing.out(Easing.quad),useNativeDriver:true}),
        Animated.spring(panel,{toValue:1,damping:22,stiffness:210,mass:.8,useNativeDriver:true}),
        Animated.stagger(STAGGER_MS,rows.current.map(v=>Animated.timing(v,{toValue:1,duration:260,easing:Easing.out(Easing.cubic),useNativeDriver:true})))
      ]).start();
    } else if(mounted){
      Animated.parallel([
        Animated.timing(overlay,{toValue:0,duration:150,useNativeDriver:true}),
        Animated.timing(panel,{toValue:0,duration:180,easing:Easing.in(Easing.cubic),useNativeDriver:true}),
        Animated.stagger(18,[...rows.current].reverse().map(v=>Animated.timing(v,{toValue:0,duration:120,useNativeDriver:true})))
      ]).start(({finished})=>{if(finished)setMounted(false);});
    }
  },[visible,mounted,overlay,panel]);

  if(!mounted)return null;
  const close=()=>onClose();
  return (
    <Modal visible transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View style={[s.overlay,{opacity:overlay}]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <Animated.View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.border,opacity:panel,transform:[{translateX:panel.interpolate({inputRange:[0,1],outputRange:[44,0]})},{scale:panel.interpolate({inputRange:[0,1],outputRange:[.985,1]})}]}]}>
          <View style={s.header}>
            <View><Text style={[s.brand,{color:theme.text}]}>RAID Browser</Text><Text style={[s.brandHint,{color:theme.muted}]}>Browse Smarter</Text></View>
            <View style={[s.brandMark,{backgroundColor:theme.accent}]}><Text style={s.brandR}>R</Text></View>
          </View>
          <View style={[s.divider,{backgroundColor:theme.border}]} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
            {items.map((item,index) => {
              const a=rows.current[index];
              return <Animated.View key={`${item.label}-${index}`} style={{opacity:a,transform:[{translateY:a.interpolate({inputRange:[0,1],outputRange:[14,0]})},{translateX:a.interpolate({inputRange:[0,1],outputRange:[10,0]})}]}}>
                <Pressable disabled={item.disabled} onPress={()=>{close();setTimeout(item.onPress,150);}} style={({pressed})=>[s.row,pressed&&!item.disabled?{backgroundColor:theme.border,transform:[{scale:.985}]}:null,item.disabled?s.disabled:null]}>
                  <View style={[s.iconBox,{backgroundColor:theme.bg,borderColor:theme.border}]}><Text style={[s.icon,{color:theme.accent}]}>{item.icon}</Text></View>
                  <View style={s.copy}><Text style={[s.label,{color:theme.text}]}>{item.label}</Text>{item.hint?<Text numberOfLines={1} style={[s.hint,{color:theme.muted}]}>{item.hint}</Text>:null}</View>
                  <Text style={[s.chevron,{color:theme.muted}]}>‹</Text>
                </Pressable>
              </Animated.View>;
            })}
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const s=StyleSheet.create({
  overlay:{flex:1,backgroundColor:'rgba(8,7,6,.58)',justifyContent:'flex-start',alignItems:'flex-end',paddingTop:56,paddingRight:10,paddingLeft:10},
  card:{width:'90%',maxWidth:370,maxHeight:'91%',borderRadius:30,borderWidth:1,padding:10,shadowColor:'#000',shadowOpacity:.28,shadowRadius:30,elevation:18,overflow:'hidden'},
  header:{minHeight:70,paddingHorizontal:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},brand:{fontSize:20,fontWeight:'900',textAlign:'right'},brandHint:{fontSize:11,fontWeight:'600',marginTop:3,textAlign:'right'},brandMark:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center'},brandR:{color:'#fff',fontSize:22,fontWeight:'900'},divider:{height:1,opacity:.7,marginHorizontal:5,marginBottom:5},content:{paddingBottom:10},
  row:{minHeight:58,borderRadius:18,paddingHorizontal:9,paddingVertical:7,flexDirection:'row',alignItems:'center',gap:11},disabled:{opacity:.42},iconBox:{width:40,height:40,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},icon:{textAlign:'center',fontSize:18,fontWeight:'900'},copy:{flex:1},label:{fontSize:14,fontWeight:'800',textAlign:'right'},hint:{fontSize:11,fontWeight:'600',textAlign:'right',marginTop:2},chevron:{fontSize:22,fontWeight:'700',opacity:.55}
});
