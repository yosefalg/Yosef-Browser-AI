import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { RaidLogo } from '@/components/RaidLogo';
import type { ThemePalette } from '@/lib/theme';

export function HomeHeader({theme,onMenu,onTabs,onDownloads,onVpn,vpnConnected,tabsCount,downloadsCount}:{theme:ThemePalette;onMenu:()=>void;onTabs:()=>void;onDownloads:()=>void;onVpn:()=>void;vpnConnected:boolean;tabsCount:number;downloadsCount:number}){
  const enter=useRef(new Animated.Value(0)).current;
  useEffect(()=>{
    Animated.spring(enter,{toValue:1,damping:20,stiffness:185,mass:.74,useNativeDriver:true}).start();
  },[enter]);

  const Action=({label,icon,onPress,badge,active}:{label:string;icon:any;onPress:()=>void;badge?:number;active?:boolean})=><Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({pressed})=>[s.action,active&&s.actionActive,pressed&&s.press]}>
    <View style={s.actionGloss}/>
    <Ionicons name={icon} size={20} color={active?'#7EE2B8':theme.text}/>
    <Text numberOfLines={1} style={[s.actionText,{color:theme.text}]}>{label}</Text>
    {!!badge&&<View style={s.badge}><Text style={s.badgeText}>{badge>99?'99+':badge}</Text></View>}
  </Pressable>;

  return <Animated.View style={[s.shell,{opacity:enter,transform:[{translateY:enter.interpolate({inputRange:[0,1],outputRange:[-12,0]})}]}]}>
    <BlurView intensity={36} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill}/>
    <LinearGradient colors={['rgba(255,255,255,.10)','rgba(255,255,255,.032)','rgba(255,255,255,.012)']} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFill}/>
    <View style={s.highlight}/>

    <View style={s.brandRow}>
      <View style={s.brand}><View style={s.logoDepth}><RaidLogo size={44}/></View><View><Text style={[s.title,{color:theme.text}]}>RAID</Text><Text style={[s.sub,{color:theme.muted}]}>Browse Smarter</Text></View></View>
      <View style={s.statusPill}><View style={[s.statusDot,vpnConnected&&s.statusDotOn]}/><Text style={[s.statusText,{color:theme.muted}]}>{vpnConnected?'محمي':'جاهز'}</Text></View>
    </View>

    <View style={s.rail}>
      <Action label="القائمة" icon="menu-outline" onPress={onMenu}/>
      <View style={s.sep}/>
      <Action label="التبويبات" icon="albums-outline" onPress={onTabs} badge={tabsCount}/>
      <View style={s.sep}/>
      <Action label="التنزيلات" icon="download-outline" onPress={onDownloads} badge={downloadsCount}/>
      <View style={s.sep}/>
      <Action label="VPN" icon={vpnConnected?'shield-checkmark':'shield-outline'} onPress={onVpn} active={vpnConnected}/>
    </View>
  </Animated.View>;
}

const s=StyleSheet.create({
  shell:{minHeight:140,borderRadius:27,borderWidth:1,borderColor:'rgba(255,255,255,.12)',overflow:'hidden',shadowColor:'#000',shadowOpacity:.18,shadowRadius:20,shadowOffset:{width:0,height:9},elevation:8,marginTop:4,paddingHorizontal:12,paddingTop:10,paddingBottom:11},
  highlight:{position:'absolute',top:0,left:22,right:22,height:1,backgroundColor:'rgba(255,255,255,.30)'},
  brandRow:{minHeight:58,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  brand:{flexDirection:'row',alignItems:'center',gap:10},logoDepth:{shadowColor:'#7DD3FC',shadowOpacity:.18,shadowRadius:10,shadowOffset:{width:0,height:4},elevation:5},title:{fontSize:21,fontWeight:'900',letterSpacing:2.4},sub:{fontSize:9.5,letterSpacing:.7,marginTop:1},
  statusPill:{height:30,borderRadius:15,paddingHorizontal:11,flexDirection:'row',alignItems:'center',gap:7,backgroundColor:'rgba(255,255,255,.04)',borderWidth:1,borderColor:'rgba(255,255,255,.08)'},statusDot:{width:7,height:7,borderRadius:4,backgroundColor:'#8A94A6'},statusDotOn:{backgroundColor:'#58C488'},statusText:{fontSize:9.5,fontWeight:'800'},
  rail:{height:54,borderRadius:18,borderWidth:1,borderColor:'rgba(255,255,255,.09)',backgroundColor:'rgba(5,10,16,.28)',flexDirection:'row',alignItems:'stretch',overflow:'hidden',marginTop:6},
  action:{flex:1,minWidth:0,alignItems:'center',justifyContent:'center',gap:2,position:'relative',backgroundColor:'rgba(255,255,255,.018)'},actionActive:{backgroundColor:'rgba(88,196,136,.06)'},actionGloss:{position:'absolute',left:0,right:0,top:0,height:'45%',backgroundColor:'rgba(255,255,255,.018)'},actionText:{fontSize:9.2,fontWeight:'800',maxWidth:'90%'},sep:{width:StyleSheet.hairlineWidth,backgroundColor:'rgba(255,255,255,.08)',marginVertical:8},
  badge:{position:'absolute',top:5,right:8,minWidth:17,height:17,borderRadius:9,paddingHorizontal:4,alignItems:'center',justifyContent:'center',backgroundColor:'#B98465',borderWidth:1,borderColor:'rgba(255,255,255,.18)'},badgeText:{color:'#fff',fontSize:8.5,fontWeight:'900'},
  press:{transform:[{scale:.965}],backgroundColor:'rgba(255,255,255,.055)'}
});
