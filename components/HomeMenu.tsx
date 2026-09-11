import type { ComponentProps } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

const STAGGER_MS = 40;

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
        Animated.timing(overlay,{toValue:1,duration:210,easing:Easing.out(Easing.quad),useNativeDriver:true}),
        Animated.spring(panel,{toValue:1,damping:24,stiffness:220,mass:.78,useNativeDriver:true}),
        Animated.stagger(STAGGER_MS,rows.current.map(v=>Animated.timing(v,{toValue:1,duration:250,easing:Easing.out(Easing.cubic),useNativeDriver:true})))
      ]).start();
    } else if(mounted){
      Animated.parallel([
        Animated.timing(overlay,{toValue:0,duration:140,useNativeDriver:true}),
        Animated.timing(panel,{toValue:0,duration:175,easing:Easing.in(Easing.cubic),useNativeDriver:true}),
        Animated.stagger(16,[...rows.current].reverse().map(v=>Animated.timing(v,{toValue:0,duration:110,useNativeDriver:true})))
      ]).start(({finished})=>{if(finished)setMounted(false);});
    }
  },[visible,mounted,overlay,panel]);

  if(!mounted)return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[s.overlay,{opacity:overlay}]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.border,opacity:panel,transform:[{translateX:panel.interpolate({inputRange:[0,1],outputRange:[46,0]})},{scale:panel.interpolate({inputRange:[0,1],outputRange:[.985,1]})}]}]}>
          <View style={s.header}>
            <View style={s.brandCopy}><Text style={[s.brand,{color:theme.text}]}>RAID Browser</Text><Text style={[s.brandHint,{color:theme.muted}]}>Browse Smarter</Text></View>
            <RaidLogo size={42}/>
          </View>
          <View style={[s.divider,{backgroundColor:theme.border}]} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
            {items.map((item,index)=>{
              const a=rows.current[index];
              return <Animated.View key={`${item.label}-${index}`} style={{opacity:a,transform:[{translateY:a.interpolate({inputRange:[0,1],outputRange:[12,0]})},{translateX:a.interpolate({inputRange:[0,1],outputRange:[10,0]})}]}}>
                <Pressable disabled={item.disabled} onPress={()=>{onClose();setTimeout(item.onPress,140);}} style={({pressed})=>[s.row,pressed&&!item.disabled?{backgroundColor:theme.surface2,transform:[{scale:.985}]}:null,item.disabled?s.disabled:null]}>
                  <View style={[s.iconBox,{backgroundColor:theme.bg,borderColor:theme.border}]}><Ionicons name={item.icon} size={20} color={theme.accent}/></View>
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
  overlay:{flex:1,backgroundColor:'rgba(10,9,8,.56)',justifyContent:'flex-start',alignItems:'flex-end',paddingTop:54,paddingRight:10,paddingLeft:10},
  card:{width:'84%',maxWidth:336,maxHeight:'90%',borderRadius:28,borderWidth:1,padding:10,shadowColor:'#000',shadowOpacity:.24,shadowRadius:28,elevation:16,overflow:'hidden'},
  header:{minHeight:68,paddingHorizontal:8,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},brandCopy:{alignItems:'flex-start'},brand:{fontSize:19,fontWeight:'900',textAlign:'right'},brandHint:{fontSize:10,fontWeight:'600',marginTop:3,textAlign:'right'},divider:{height:1,opacity:.7,marginHorizontal:5,marginBottom:5},content:{paddingBottom:8},
  row:{minHeight:56,borderRadius:17,paddingHorizontal:9,paddingVertical:7,flexDirection:'row',alignItems:'center',gap:10},disabled:{opacity:.42},iconBox:{width:40,height:40,borderRadius:13,borderWidth:1,alignItems:'center',justifyContent:'center'},copy:{flex:1},labelRow:{flexDirection:'row-reverse',alignItems:'center',gap:7},label:{fontSize:14,fontWeight:'800',textAlign:'right'},hint:{fontSize:10.5,fontWeight:'600',textAlign:'right',marginTop:2},badge:{minWidth:22,height:22,paddingHorizontal:6,borderRadius:11,alignItems:'center',justifyContent:'center'},badgeText:{color:'#fff',fontSize:10,fontWeight:'900'}
});
