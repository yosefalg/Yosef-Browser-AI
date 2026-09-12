import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { RaidLogo } from '@/components/RaidLogo';
import type { ThemePalette } from '@/lib/theme';

export function HomeHeader({theme,onMenu,onTabs,onDownloads,onVpn,vpnConnected,tabsCount,downloadsCount}:{theme:ThemePalette;onMenu:()=>void;onTabs:()=>void;onDownloads:()=>void;onVpn:()=>void;vpnConnected:boolean;tabsCount:number;downloadsCount:number}){
  const enter=useRef(new Animated.Value(0)).current;
  useEffect(()=>{
    Animated.spring(enter,{toValue:1,damping:18,stiffness:170,mass:.78,useNativeDriver:true}).start();
  },[enter]);
  const badge=(value:number)=>value>0?<View style={s.badge}><Text style={s.badgeText}>{value>99?'99+':value}</Text></View>:null;
  return <Animated.View style={[s.shell,{opacity:enter,transform:[{translateY:enter.interpolate({inputRange:[0,1],outputRange:[-14,0]})},{scale:enter.interpolate({inputRange:[0,1],outputRange:[.985,1]})}]}]}>
    <BlurView intensity={42} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill}/>
    <LinearGradient colors={['rgba(255,255,255,.115)','rgba(255,255,255,.035)','rgba(255,255,255,.018)']} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFill}/>
    <View style={s.highlight}/>
    <View style={s.wrap}>
      <View style={s.brand}><View style={s.logoDepth}><RaidLogo size={46}/></View><View><Text style={[s.title,{color:theme.text}]}>RAID</Text><Text style={[s.sub,{color:theme.muted}]}>Browse Smarter</Text></View></View>
      <View style={s.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={vpnConnected?'RAID VPN متصل':'RAID VPN غير متصل'} onPress={onVpn} style={({pressed})=>[s.vpn,{borderColor:theme.border},vpnConnected&&s.vpnOn,pressed&&s.press]}><View style={s.buttonGlass}/><Ionicons name={vpnConnected?'shield-checkmark':'shield-outline'} size={18} color={vpnConnected?'#58C488':theme.muted}/><Text style={[s.vpnText,{color:theme.text}]}>{vpnConnected?'آمن':'VPN'}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`التنزيلات ${downloadsCount}`} onPress={onDownloads} style={({pressed})=>[s.icon,{borderColor:theme.border},pressed&&s.press]}><View style={s.buttonGlass}/><Ionicons name="download-outline" size={20} color={theme.text}/>{badge(downloadsCount)}</Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`التبويبات ${tabsCount}`} onPress={onTabs} style={({pressed})=>[s.icon,{borderColor:theme.border},pressed&&s.press]}><View style={s.buttonGlass}/><Ionicons name="albums-outline" size={20} color={theme.text}/>{badge(tabsCount)}</Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="القائمة" onPress={onMenu} style={({pressed})=>[s.icon,{borderColor:theme.border},pressed&&s.press]}><View style={s.buttonGlass}/><Ionicons name="menu-outline" size={24} color={theme.text}/></Pressable>
      </View>
    </View>
  </Animated.View>;
}
const s=StyleSheet.create({
  shell:{minHeight:78,borderRadius:25,borderWidth:1,borderColor:'rgba(255,255,255,.13)',overflow:'hidden',shadowColor:'#000',shadowOpacity:.22,shadowRadius:24,shadowOffset:{width:0,height:10},elevation:10,marginTop:4},
  wrap:{minHeight:78,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:12},
  highlight:{position:'absolute',top:0,left:18,right:18,height:1,backgroundColor:'rgba(255,255,255,.34)'},
  brand:{flexDirection:'row',alignItems:'center',gap:11},logoDepth:{shadowColor:'#7DD3FC',shadowOpacity:.22,shadowRadius:12,shadowOffset:{width:0,height:5},elevation:6,transform:[{perspective:700},{rotateX:'3deg'}]},
  title:{fontSize:22,fontWeight:'900',letterSpacing:2.5},sub:{fontSize:10,letterSpacing:.8,marginTop:1},actions:{flexDirection:'row',gap:7,alignItems:'center'},
  icon:{width:42,height:42,borderRadius:15,borderWidth:1,alignItems:'center',justifyContent:'center',position:'relative',overflow:'hidden',backgroundColor:'rgba(255,255,255,.035)',shadowColor:'#000',shadowOpacity:.18,shadowRadius:8,shadowOffset:{width:0,height:4},elevation:4},
  vpn:{height:42,borderRadius:15,borderWidth:1,paddingHorizontal:10,flexDirection:'row',gap:6,alignItems:'center',overflow:'hidden',backgroundColor:'rgba(255,255,255,.035)',shadowColor:'#000',shadowOpacity:.18,shadowRadius:8,shadowOffset:{width:0,height:4},elevation:4},vpnOn:{borderColor:'rgba(88,196,136,.55)',backgroundColor:'rgba(88,196,136,.08)'},vpnText:{fontWeight:'900',fontSize:10},
  buttonGlass:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(255,255,255,.025)',borderTopWidth:1,borderTopColor:'rgba(255,255,255,.11)'},
  badge:{position:'absolute',top:-5,right:-5,minWidth:18,height:18,borderRadius:9,paddingHorizontal:4,alignItems:'center',justifyContent:'center',backgroundColor:'#B98465',borderWidth:2,borderColor:'#232625'},badgeText:{color:'#fff',fontSize:9,fontWeight:'900'},
  press:{transform:[{perspective:700},{scale:.93},{translateY:2}],opacity:.88}
});
