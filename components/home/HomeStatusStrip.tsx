import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ThemePalette } from '@/lib/theme';

export function HomeStatusStrip({theme,vpnConnected,tabsCount,activeDownloads,onVpn,onTabs,onDownloads}:{theme:ThemePalette;vpnConnected:boolean;tabsCount:number;activeDownloads:number;onVpn:()=>void;onTabs:()=>void;onDownloads:()=>void}){
  const item=(label:string,value:string,icon:keyof typeof Ionicons.glyphMap,onPress:()=>void,ok=false)=><Pressable accessibilityRole="button" accessibilityLabel={`${label} ${value}`} onPress={onPress} style={({pressed})=>[s.item,{backgroundColor:theme.surface,borderColor:theme.border},pressed&&s.press]}><View style={[s.icon,{backgroundColor:theme.surface2}]}><Ionicons name={icon} size={17} color={ok?'#62C48A':theme.accent}/></View><View style={s.copy}><Text style={[s.value,{color:theme.text}]}>{value}</Text><Text style={[s.label,{color:theme.muted}]}>{label}</Text></View></Pressable>;
  return <View style={s.row}>
    {item('VPN',vpnConnected?'متصل':'غير متصل',vpnConnected?'shield-checkmark-outline':'shield-outline',onVpn,vpnConnected)}
    {item('التبويبات',String(tabsCount),'albums-outline',onTabs)}
    {item('تنزيل نشط',String(activeDownloads),activeDownloads?'download-outline':'checkmark-done-outline',onDownloads,activeDownloads===0)}
  </View>;
}

const s=StyleSheet.create({row:{flexDirection:'row-reverse',gap:8},item:{flex:1,minHeight:64,borderRadius:18,borderWidth:1,paddingHorizontal:9,paddingVertical:8,flexDirection:'row-reverse',alignItems:'center',gap:8},icon:{width:34,height:34,borderRadius:11,alignItems:'center',justifyContent:'center'},copy:{flex:1},value:{fontSize:11,fontWeight:'900',textAlign:'right'},label:{fontSize:8.5,fontWeight:'700',marginTop:2,textAlign:'right'},press:{transform:[{scale:.975}],opacity:.84}});
