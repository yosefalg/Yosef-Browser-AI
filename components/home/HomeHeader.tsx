import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RaidLogo } from '@/components/RaidLogo';
import type { ThemePalette } from '@/lib/theme';

export function HomeHeader({theme,onMenu,onTabs,onDownloads,onVpn}:{theme:ThemePalette;onMenu:()=>void;onTabs:()=>void;onDownloads:()=>void;onVpn:()=>void}){
  return <View style={s.wrap}>
    <View style={s.brand}><RaidLogo size={44}/><View><Text style={[s.title,{color:theme.text}]}>RAID</Text><Text style={[s.sub,{color:theme.muted}]}>Browse Smarter</Text></View></View>
    <View style={s.actions}>
      <Pressable onPress={onVpn} style={({pressed})=>[s.vpn,{backgroundColor:theme.surface,borderColor:theme.border},pressed&&s.press]}><Text style={s.vpnDot}>●</Text><Text style={[s.vpnText,{color:theme.text}]}>VPN</Text></Pressable>
      <Pressable onPress={onDownloads} style={({pressed})=>[s.icon,{backgroundColor:theme.surface,borderColor:theme.border},pressed&&s.press]}><Text style={[s.iconText,{color:theme.text}]}>↓</Text></Pressable>
      <Pressable onPress={onTabs} style={({pressed})=>[s.icon,{backgroundColor:theme.surface,borderColor:theme.border},pressed&&s.press]}><Text style={[s.iconText,{color:theme.text}]}>□</Text></Pressable>
      <Pressable onPress={onMenu} style={({pressed})=>[s.icon,{backgroundColor:theme.surface,borderColor:theme.border},pressed&&s.press]}><Text style={[s.menu,{color:theme.text}]}>≡</Text></Pressable>
    </View>
  </View>;
}
const s=StyleSheet.create({wrap:{minHeight:72,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},brand:{flexDirection:'row',alignItems:'center',gap:11},title:{fontSize:21,fontWeight:'900',letterSpacing:2.4},sub:{fontSize:10,letterSpacing:.8,marginTop:1},actions:{flexDirection:'row',gap:7,alignItems:'center'},icon:{width:42,height:42,borderRadius:15,borderWidth:1,alignItems:'center',justifyContent:'center'},iconText:{fontSize:19,fontWeight:'900'},menu:{fontSize:23,fontWeight:'800',marginTop:-2},vpn:{height:42,borderRadius:15,borderWidth:1,paddingHorizontal:10,flexDirection:'row',gap:6,alignItems:'center'},vpnDot:{color:'#37C978',fontSize:10},vpnText:{fontWeight:'900',fontSize:11},press:{transform:[{scale:.97}],opacity:.82}});
