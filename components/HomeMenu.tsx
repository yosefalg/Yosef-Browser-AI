import type { ComponentProps } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { RaidLogo } from '@/components/RaidLogo';
import type { ThemePalette } from '@/lib/theme';

export type HomeMenuItem = {
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  hint?: string;
  disabled?: boolean;
  badge?: number | string;
};

const STAGGER_MS = 36;

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
        Animated.spring(panel,{toValue:1,damping:21,stiffness:235,mass:.72,useNativeDriver:true}),
        Animated.stagger(STAGGER_MS,rows.current.map(v=>Animated.timing(v,{toValue:1,duration:260,easing:Easing.out(Easing.cubic),useNativeDriver:true})))
      ]).start();
    } else if(mounted){
      Animated.parallel([
        Animated.timing(overlay,{toValue:0,duration:145,useNativeDriver:true}),
        Animated.timing(panel,{toValue:0,duration:185,easing:Easing.in(Easing.cubic),useNativeDriver:true}),
        Animated.stagger(14,[...rows.current].reverse().map(v=>Animated.timing(v,{toValue:0,duration:105,useNativeDriver:true})))
      ]).start(({finished})=>{if(finished)setMounted(false);});
    }
  },[visible,mounted,overlay,panel]);

  if(!mounted)return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[s.overlay,{opacity:overlay}]}>
        <BlurView intensity={18} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill}/>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[s.card,{borderColor:theme.border,opacity:panel,transform:[{perspective:900},{translateX:panel.interpolate({inputRange:[0,1],outputRange:[54,0]})},{rotateY:panel.interpolate({inputRange:[0,1],outputRange:['-5deg','0deg']})},{scale:panel.interpolate({inputRange:[0,1],outputRange:[.97,1]})}]}]}>
          <BlurView intensity={58} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill}/>
          <LinearGradient colors={['rgba(255,255,255,.12)','rgba(255,255,255,.045)','rgba(255,255,255,.018)']} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFill}/>
          <View style={s.topShine}/>
          <View style={s.header}>
            <View style={s.brandCopy}><Text style={[s.brand,{color:theme.text}]}>RAID Browser</Text><Text style={[s.brandHint,{color:theme.muted}]}>Glass Motion • 3D UI</Text></View>
            <View style={s.logoDepth}><RaidLogo size={42}/></View>
          </View>
          <View style={[s.divider,{backgroundColor:'rgba(255,255,255,.12)'}]} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
            {items.map((item,index)=>{
              const a=rows.current[index];
              return <Animated.View key={`${item.label}-${index}`} style={{opacity:a,transform:[{translateY:a.interpolate({inputRange:[0,1],outputRange:[14,0]})},{translateX:a.interpolate({inputRange:[0,1],outputRange:[12,0]})},{scale:a.interpolate({inputRange:[0,1],outputRange:[.97,1]})}]}}>
                <Pressable disabled={item.disabled} onPress={()=>{onClose();setTimeout(item.onPress,140);}} style={({pressed})=>[s.row,pressed&&!item.disabled?s.rowPressed:null,item.disabled?s.disabled:null]}>
                  <View style={[s.iconBox,{borderColor:theme.border}]}><LinearGradient colors={['rgba(255,255,255,.12)','rgba(255,255,255,.025)']} style={StyleSheet.absoluteFill}/><Ionicons name={item.icon} size={20} color={theme.accent}/></View>
                  <View style={s.copy}><View style={s.labelRow}><Text style={[s.label,{color:theme.text}]}>{item.label}</Text>{item.badge!==undefined?<View style={[s.badge,{backgroundColor:theme.accent}]}><Text style={s.badgeText}>{item.badge}</Text></View>:null}</View>{item.hint?<Text numberOfLines={1} style={[s.hint,{color:theme.muted}]}>{item.hint}</Text>:null}</View>
                  <Ionicons name="chevron-back" size={18} color={theme.muted}/>
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
  overlay:{flex:1,backgroundColor:'rgba(4,8,14,.44)',justifyContent:'flex-start',alignItems:'flex-end',paddingTop:54,paddingRight:10,paddingLeft:10},
  card:{width:'86%',maxWidth:346,maxHeight:'90%',borderRadius:30,borderWidth:1,padding:10,shadowColor:'#000',shadowOpacity:.34,shadowRadius:34,shadowOffset:{width:0,height:18},elevation:20,overflow:'hidden',backgroundColor:'rgba(15,20,28,.56)'},topShine:{position:'absolute',top:0,left:26,right:26,height:1,backgroundColor:'rgba(255,255,255,.38)'},
  header:{minHeight:70,paddingHorizontal:8,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},brandCopy:{alignItems:'flex-start'},brand:{fontSize:19,fontWeight:'900',textAlign:'right'},brandHint:{fontSize:10,fontWeight:'600',marginTop:3,textAlign:'right'},logoDepth:{shadowColor:'#8BE0CC',shadowOpacity:.22,shadowRadius:14,shadowOffset:{width:0,height:5},elevation:7},divider:{height:1,opacity:.9,marginHorizontal:5,marginBottom:5},content:{paddingBottom:8},
  row:{minHeight:58,borderRadius:18,paddingHorizontal:9,paddingVertical:7,flexDirection:'row',alignItems:'center',gap:10,borderWidth:1,borderColor:'transparent'},rowPressed:{backgroundColor:'rgba(255,255,255,.07)',borderColor:'rgba(255,255,255,.08)',transform:[{perspective:700},{scale:.975},{translateY:1}]},disabled:{opacity:.42},iconBox:{width:41,height:41,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center',overflow:'hidden',backgroundColor:'rgba(255,255,255,.025)'},copy:{flex:1},labelRow:{flexDirection:'row-reverse',alignItems:'center',gap:7},label:{fontSize:14,fontWeight:'800',textAlign:'right'},hint:{fontSize:10.5,fontWeight:'600',textAlign:'right',marginTop:2},badge:{minWidth:22,height:22,paddingHorizontal:6,borderRadius:11,alignItems:'center',justifyContent:'center'},badgeText:{color:'#fff',fontSize:10,fontWeight:'900'}
});
