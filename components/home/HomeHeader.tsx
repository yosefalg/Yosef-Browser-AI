import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RaidLogo } from '@/components/RaidLogo';
import type { ThemePalette } from '@/lib/theme';

export function HomeHeader({theme,onMenu,onTabs,onDownloads,onVpn,vpnConnected,tabsCount,downloadsCount}:{theme:ThemePalette;onMenu:()=>void;onTabs:()=>void;onDownloads:()=>void;onVpn:()=>void;vpnConnected:boolean;tabsCount:number;downloadsCount:number}){
  const badge=(value:number)=>value>0?<View style={s.badge}><Text style={s.badgeText}>{value>99?'99+':value}</Text></View>:null;
  return <View style={s.wrap}>
    <View style={s.brand}><RaidLogo size={46}/><View><Text style={[s.title,{color:theme.text}]}>RAID</Text><Text style={[s.sub,{color:theme.muted}]}>Browse Smarter</Text></View></View>
    <View style={s.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel={vpnConnected?'RAID VPN متصل':'RAID VPN غير متصل'} onPress={onVpn} style={({pressed})=>[s.vpn,{backgroundColor:theme.surface,borderColor:theme.border},vpnConnected&&s.vpnOn,pressed&&s.press]}><Ionicons name={vpnConnected?'shield-checkmark':'shield-outline'} size={18} color={vpnConnected?'#58C488':theme.muted}/><Text style={[s.vpnText,{color:theme.text}]}>{vpnConnected?'آمن':'VPN'}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`التنزيلات ${downloadsCount}`} onPress={onDownloads} style={({pressed})=>[s.icon,{backgroundColor:theme.surface,borderColor:theme.border},pressed&&s.press]}><Ionicons name="download-outline" size={20} color={theme.text}/>{badge(downloadsCount)}</Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`التبويبات ${tabsCount}`} onPress={onTabs} style={({pressed})=>[s.icon,{backgroundColor:theme.surface,borderColor:theme.border},pressed&&s.press]}><Ionicons name="albums-outline" size={20} color={theme.text}/>{badge(tabsCount)}</Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="القائمة" onPress={onMenu} style={({pressed})=>[s.icon,{backgroundColor:theme.surface,borderColor:theme.border},pressed&&s.press]}><Ionicons name="menu-outline" size={24} color={theme.text}/></Pressable>
    </View>
  </View>;
}
const s=StyleSheet.create({wrap:{minHeight:74,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},brand:{flexDirection:'row',alignItems:'center',gap:11},title:{fontSize:22,fontWeight:'900',letterSpacing:2.5},sub:{fontSize:10,letterSpacing:.8,marginTop:1},actions:{flexDirection:'row',gap:7,alignItems:'center'},icon:{width:42,height:42,borderRadius:15,borderWidth:1,alignItems:'center',justifyContent:'center',position:'relative'},vpn:{height:42,borderRadius:15,borderWidth:1,paddingHorizontal:10,flexDirection:'row',gap:6,alignItems:'center'},vpnOn:{borderColor:'rgba(88,196,136,.55)'},vpnText:{fontWeight:'900',fontSize:10},badge:{position:'absolute',top:-5,right:-5,minWidth:18,height:18,borderRadius:9,paddingHorizontal:4,alignItems:'center',justifyContent:'center',backgroundColor:'#B98465',borderWidth:2,borderColor:'#232625'},badgeText:{color:'#fff',fontSize:9,fontWeight:'900'},press:{transform:[{scale:.96}],opacity:.82}});
