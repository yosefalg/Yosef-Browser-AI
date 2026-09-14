import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { RaidLogo } from '@/components/RaidLogo';
import type { ThemePalette } from '@/lib/theme';

type HeaderProps={theme:ThemePalette;onMenu:()=>void;onTabs:()=>void;onDownloads:()=>void;onVpn:()=>void;vpnConnected:boolean;tabsCount:number;downloadsCount:number};

export function HomeHeader({theme,onMenu,onTabs,onDownloads,onVpn,vpnConnected,tabsCount,downloadsCount}:HeaderProps){
  const enter=useRef(new Animated.Value(0)).current;
  useEffect(()=>{Animated.timing(enter,{toValue:1,duration:260,useNativeDriver:true}).start()},[enter]);

  const Action=({label,icon,onPress,badge,active}:{label:string;icon:keyof typeof Ionicons.glyphMap;onPress:()=>void;badge?:number;active?:boolean})=>
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={({pressed})=>[s.action,{backgroundColor:active?'rgba(74,199,142,.14)':'rgba(255,255,255,.055)',borderColor:active?'rgba(86,219,158,.30)':'rgba(255,255,255,.09)'},pressed&&s.press]}>
      <Ionicons name={icon} size={18} color={active?'#74E0AA':'#F2F5F7'}/>
      {!!badge&&<View style={s.badge}><Text style={s.badgeText}>{badge>9?'9+':badge}</Text></View>}
    </Pressable>;

  return <Animated.View style={[s.shell,{opacity:enter,transform:[{translateY:enter.interpolate({inputRange:[0,1],outputRange:[-8,0]})}]}]}>
    <LinearGradient colors={['rgba(30,42,49,.98)','rgba(24,29,39,.98)','rgba(38,29,44,.98)']} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFill}/>
    <View pointerEvents="none" style={s.highlight}/>
    <View style={s.brand}>
      <View style={s.logoRing}><RaidLogo size={39}/></View>
      <View style={s.brandCopy}>
        <Text style={s.title}>RAID</Text>
        <View style={s.statusRow}><View style={[s.statusDot,vpnConnected&&s.statusDotOn]}/><Text style={s.statusText}>{vpnConnected?'محمي ومتصل':'جاهز للتصفح'}</Text></View>
      </View>
    </View>
    <View style={s.actions}>
      <Action label="VPN" icon={vpnConnected?'shield-checkmark':'shield-outline'} onPress={onVpn} active={vpnConnected}/>
      <Action label="التنزيلات" icon="download-outline" onPress={onDownloads} badge={downloadsCount}/>
      <Action label="التبويبات" icon="albums-outline" onPress={onTabs} badge={tabsCount}/>
      <Action label="القائمة" icon="menu-outline" onPress={onMenu}/>
    </View>
  </Animated.View>;
}

const s=StyleSheet.create({
  shell:{height:78,borderRadius:24,borderWidth:1,borderColor:'rgba(255,255,255,.12)',flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',paddingHorizontal:10,marginTop:3,overflow:'hidden',boxShadow:'0 8px 24px rgba(0,0,0,.18)'},
  highlight:{position:'absolute',top:0,left:24,right:24,height:1,backgroundColor:'rgba(255,255,255,.28)'},
  brand:{flexDirection:'row-reverse',alignItems:'center',gap:9},
  logoRing:{width:46,height:46,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,.055)',borderWidth:1,borderColor:'rgba(126,224,207,.16)'},
  brandCopy:{alignItems:'flex-end'},title:{fontSize:19,fontWeight:'900',letterSpacing:2.4,color:'#F7FAFC'},
  statusRow:{flexDirection:'row-reverse',alignItems:'center',gap:5,marginTop:2},statusDot:{width:6,height:6,borderRadius:3,backgroundColor:'#8B97A5'},statusDotOn:{backgroundColor:'#64D7A5'},statusText:{fontSize:8.3,fontWeight:'800',color:'#AEBBC7'},
  actions:{flexDirection:'row-reverse',alignItems:'center',gap:6},action:{width:36,height:36,borderRadius:12,borderWidth:1,alignItems:'center',justifyContent:'center',position:'relative'},
  badge:{position:'absolute',top:-5,right:-5,minWidth:16,height:16,borderRadius:8,paddingHorizontal:3,alignItems:'center',justifyContent:'center',backgroundColor:'#C18468',borderWidth:1,borderColor:'rgba(255,255,255,.25)'},badgeText:{color:'#fff',fontSize:8,fontWeight:'900'},press:{transform:[{scale:.92}],opacity:.78}
});
