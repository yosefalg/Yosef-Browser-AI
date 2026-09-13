import type { ComponentProps } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, InteractionManager, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

const STAGGER_MS = 28;

export function HomeMenu({ visible, onClose, theme, items }: { visible: boolean; onClose: () => void; theme: ThemePalette; items: HomeMenuItem[] }) {
  const [mounted,setMounted]=useState(visible);
  const panel=useRef(new Animated.Value(0)).current;
  const overlay=useRef(new Animated.Value(0)).current;
  const rows=useRef<Animated.Value[]>([]);
  const pendingAction=useRef<null | (() => void)>(null);
  const closing=useRef(false);
  if(rows.current.length!==items.length) rows.current=items.map((_,i)=>rows.current[i] ?? new Animated.Value(0));

  useEffect(()=>{
    if(visible){
      closing.current=false;
      pendingAction.current=null;
      setMounted(true);
      panel.setValue(0);
      overlay.setValue(0);
      rows.current.forEach(v=>v.setValue(0));
      Animated.parallel([
        Animated.timing(overlay,{toValue:1,duration:170,easing:Easing.out(Easing.quad),useNativeDriver:true}),
        Animated.spring(panel,{toValue:1,damping:24,stiffness:255,mass:.68,useNativeDriver:true}),
        Animated.stagger(STAGGER_MS,rows.current.map(v=>Animated.timing(v,{toValue:1,duration:210,easing:Easing.out(Easing.cubic),useNativeDriver:true})))
      ]).start();
      return;
    }

    if(mounted && !closing.current){
      closing.current=true;
      Animated.parallel([
        Animated.timing(overlay,{toValue:0,duration:110,useNativeDriver:true}),
        Animated.timing(panel,{toValue:0,duration:145,easing:Easing.inOut(Easing.cubic),useNativeDriver:true})
      ]).start(({finished})=>{
        if(!finished){closing.current=false;return;}
        setMounted(false);
        const action=pendingAction.current;
        pendingAction.current=null;
        InteractionManager.runAfterInteractions(()=>{
          requestAnimationFrame(()=>{
            closing.current=false;
            action?.();
          });
        });
      });
    }
  },[visible,mounted,overlay,panel]);

  const dismiss=()=>{
    if(closing.current)return;
    pendingAction.current=null;
    onClose();
  };

  const runAfterDismiss=(action:()=>void)=>{
    if(closing.current)return;
    pendingAction.current=action;
    onClose();
  };

  if(!mounted)return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={dismiss} statusBarTranslucent>
      <Animated.View style={[s.overlay,{opacity:overlay}]}>
        <BlurView intensity={12} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill}/>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
        <Animated.View style={[s.card,{borderColor:theme.border,opacity:panel,transform:[{translateX:panel.interpolate({inputRange:[0,1],outputRange:[30,0]})}]}]}>
          <View pointerEvents="none" style={[StyleSheet.absoluteFill,s.cardGlass]} />
          <LinearGradient colors={['rgba(255,255,255,.11)','rgba(255,255,255,.045)','rgba(255,255,255,.02)']} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFill}/>
          <View style={s.topShine}/>
          <View style={s.header}>
            <View style={s.brandCopy}><Text style={[s.brand,{color:theme.text}]}>RAID Browser</Text><Text style={[s.brandHint,{color:theme.muted}]}>سريع • مرتب • واضح</Text></View>
            <View style={s.logoDepth}><RaidLogo size={42}/></View>
          </View>
          <View style={s.divider} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
            {items.map((item,index)=>{
              const a=rows.current[index];
              return <Animated.View key={`${item.label}-${index}`} style={{opacity:a,transform:[{translateY:a.interpolate({inputRange:[0,1],outputRange:[10,0]})}]}}>
                <Pressable disabled={item.disabled || closing.current} onPress={()=>runAfterDismiss(item.onPress)} style={({pressed})=>[s.row,pressed&&!item.disabled?s.rowPressed:null,item.disabled?s.disabled:null]}>
                  <View style={[s.iconBox,{borderColor:theme.border}]}><LinearGradient colors={['rgba(255,255,255,.10)','rgba(255,255,255,.018)']} style={StyleSheet.absoluteFill}/><Ionicons name={item.icon} size={20} color={theme.accent}/></View>
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
  overlay:{flex:1,backgroundColor:'rgba(4,8,14,.40)',justifyContent:'flex-start',alignItems:'flex-end',paddingTop:54,paddingRight:10,paddingLeft:10},
  card:{width:'86%',maxWidth:346,maxHeight:'90%',borderRadius:30,borderWidth:1,padding:10,shadowColor:'#000',shadowOpacity:.28,shadowRadius:26,shadowOffset:{width:0,height:14},elevation:16,overflow:'hidden',backgroundColor:'rgba(15,20,28,.88)'},cardGlass:{backgroundColor:'rgba(255,255,255,.025)'},topShine:{position:'absolute',top:0,left:26,right:26,height:1,backgroundColor:'rgba(255,255,255,.30)'},
  header:{minHeight:66,paddingHorizontal:8,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},brandCopy:{alignItems:'flex-start'},brand:{fontSize:19,fontWeight:'900',textAlign:'right'},brandHint:{fontSize:10,fontWeight:'700',marginTop:3,textAlign:'right'},logoDepth:{shadowColor:'#8BE0CC',shadowOpacity:.16,shadowRadius:10,shadowOffset:{width:0,height:4},elevation:5},divider:{height:1,backgroundColor:'rgba(255,255,255,.10)',marginHorizontal:5,marginBottom:5},content:{paddingBottom:8},
  row:{minHeight:56,borderRadius:17,paddingHorizontal:9,paddingVertical:7,flexDirection:'row',alignItems:'center',gap:10,borderWidth:1,borderColor:'transparent'},rowPressed:{backgroundColor:'rgba(255,255,255,.065)',borderColor:'rgba(255,255,255,.07)',transform:[{scale:.985}]},disabled:{opacity:.42},iconBox:{width:40,height:40,borderRadius:13,borderWidth:1,alignItems:'center',justifyContent:'center',overflow:'hidden',backgroundColor:'rgba(255,255,255,.02)'},copy:{flex:1},labelRow:{flexDirection:'row-reverse',alignItems:'center',gap:7},label:{fontSize:14,fontWeight:'800',textAlign:'right'},hint:{fontSize:10.5,fontWeight:'600',textAlign:'right',marginTop:2},badge:{minWidth:22,height:22,paddingHorizontal:6,borderRadius:11,alignItems:'center',justifyContent:'center'},badgeText:{color:'#fff',fontSize:10,fontWeight:'900'}
});
