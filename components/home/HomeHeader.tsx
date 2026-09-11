import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RaidLogo } from '@/components/RaidLogo';
import type { ThemePalette } from '@/lib/theme';

export function HomeHeader({theme,onMenu,onTabs,onDownloads,onVpn,vpnConnected}:{theme:ThemePalette;onMenu:()=>void;onTabs:()=>void;onDownloads:()=>void;onVpn:()=>void;vpnConnected:boolean}){
  return <View style={s.wrap}>
    <View style={s.brand}><RaidLogo size={44}/><View><Text style={[s.title,{color:theme.text}]}>RAID</Text><Text style={[s.sub,{color:theme.muted}]}>Browse Smarter</Text></View></View>
    <View style={s.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel={vpnConnected?'RAID VPN متصل':'RAID VPN غير متصل'} onPress={onVpn} style={({pressed})=>[s.vpn,{backgroundColor:theme.surface,borderColor:theme.border},pressed&&s.press]}><Ionicons name={vpnConnected?'shield-checkmark-outline':'shield-outline'} size={18} color={vpnConnected?'#4DB47A':theme.muted}/><Text style={[s.vpnText,{color:theme.text}]}>VPN</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="التنزيلات" onPress={onDownloads} style={({pressed})=>[s.icon,{backgroundColor:theme.surface,borderColor:theme.border},pressed&&s.press]}><Ionicons name="download-outline" size={20} color={theme.text}/></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="التبويبات" onPress={onTabs} style={({pressed})=>[s.icon,{backgroundColor:theme.surface,borderColor:theme.border},pressed&&s.press]}><Ionicons name="albums-outline" size={20} color={theme.text}/></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="القائمة" onPress={onMenu} style={({pressed})=>[s.icon,{backgroundColor:theme.surface,borderColor:theme.border},pressed&&s.press]}><Ionicons name="menu-outline" size={23} color={theme.text}/></Pressable>
    </View>
  </View>;
}
const s=StyleSheet.create({wrap:{minHeight:72,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},brand:{flexDirection:'row',alignItems:'center',gap:11},title:{fontSize:21,fontWeight:'900',letterSpacing:2.4},sub:{fontSize:10,letterSpacing:.8,marginTop:1},actions:{flexDirection:'row',gap:7,alignItems:'center'},icon:{width:42,height:42,borderRadius:15,borderWidth:1,alignItems:'center',justifyContent:'center'},vpn:{height:42,borderRadius:15,borderWidth:1,paddingHorizontal:10,flexDirection:'row',gap:6,alignItems:'center'},vpnText:{fontWeight:'900',fontSize:11},press:{transform:[{scale:.97}],opacity:.82}});
