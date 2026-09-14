import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RaidLogo } from '@/components/RaidLogo';
import type { ThemePalette } from '@/lib/theme';

type HeaderProps={
  theme:ThemePalette;
  onMenu:()=>void;
  onTabs:()=>void;
  onDownloads:()=>void;
  onVpn:()=>void;
  vpnConnected:boolean;
  tabsCount:number;
  downloadsCount:number;
};

export function HomeHeader({theme,onMenu,onTabs,onDownloads,onVpn,vpnConnected,tabsCount,downloadsCount}:HeaderProps){
  const enter=useRef(new Animated.Value(0)).current;
  useEffect(()=>{
    Animated.timing(enter,{toValue:1,duration:220,useNativeDriver:true}).start();
  },[enter]);

  const Action=({label,icon,onPress,badge,active}:{label:string;icon:keyof typeof Ionicons.glyphMap;onPress:()=>void;badge?:number;active?:boolean})=>
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={({pressed})=>[s.action,{backgroundColor:active?'rgba(88,196,136,.12)':theme.surface2,borderColor:active?'rgba(88,196,136,.32)':theme.border},pressed&&s.press]}>
      <Ionicons name={icon} size={18} color={active?'#68D29B':theme.text}/>
      {!!badge&&<View style={s.badge}><Text style={s.badgeText}>{badge>9?'9+':badge}</Text></View>}
    </Pressable>;

  return <Animated.View style={[s.shell,{backgroundColor:theme.surface,borderColor:theme.border,opacity:enter,transform:[{translateY:enter.interpolate({inputRange:[0,1],outputRange:[-7,0]})}]}]}>
    <View style={s.brand}>
      <RaidLogo size={38}/>
      <View style={s.brandCopy}>
        <Text style={[s.title,{color:theme.text}]}>RAID</Text>
        <View style={s.statusRow}><View style={[s.statusDot,vpnConnected&&s.statusDotOn]}/><Text style={[s.statusText,{color:theme.muted}]}>{vpnConnected?'محمي':'جاهز'}</Text></View>
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
  shell:{height:72,borderRadius:22,borderWidth:1,flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',paddingHorizontal:10,marginTop:3,overflow:'visible'},
  brand:{flexDirection:'row-reverse',alignItems:'center',gap:8},
  brandCopy:{alignItems:'flex-end'},
  title:{fontSize:18,fontWeight:'900',letterSpacing:2},
  statusRow:{flexDirection:'row-reverse',alignItems:'center',gap:5,marginTop:1},
  statusDot:{width:6,height:6,borderRadius:3,backgroundColor:'#8A94A6'},
  statusDotOn:{backgroundColor:'#58C488'},
  statusText:{fontSize:8.5,fontWeight:'800'},
  actions:{flexDirection:'row-reverse',alignItems:'center',gap:6},
  action:{width:36,height:36,borderRadius:12,borderWidth:1,alignItems:'center',justifyContent:'center',position:'relative'},
  badge:{position:'absolute',top:-5,right:-5,minWidth:16,height:16,borderRadius:8,paddingHorizontal:3,alignItems:'center',justifyContent:'center',backgroundColor:'#B98465',borderWidth:1,borderColor:'rgba(255,255,255,.22)'},
  badgeText:{color:'#fff',fontSize:8,fontWeight:'900'},
  press:{transform:[{scale:.92}],opacity:.78}
});
