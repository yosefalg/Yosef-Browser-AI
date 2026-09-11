import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RaidServiceIcon, SiteIcon } from '@/components/SiteIcon';
import type { ThemePalette } from '@/lib/theme';

type Shortcut={label:string;url?:string;service?:'ai'|'vpn';onPress:()=>void};
export function HomeShortcuts({theme,items,onMore}:{theme:ThemePalette;items:Shortcut[];onMore:()=>void}){
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
    {items.map(item=><Pressable accessibilityRole="button" accessibilityLabel={item.label} key={item.label} onPress={item.onPress} style={({pressed})=>[s.wrap,pressed&&s.press]}><View style={[s.box,{backgroundColor:theme.surface,borderColor:theme.border}]}>{item.url?<SiteIcon url={item.url} size={50} radius={15}/>:<RaidServiceIcon kind={item.service!} size={50}/>}</View><Text style={[s.label,{color:theme.text}]}>{item.label}</Text></Pressable>)}
    <Pressable accessibilityRole="button" accessibilityLabel="المزيد" onPress={onMore} style={({pressed})=>[s.wrap,pressed&&s.press]}><View style={[s.box,{backgroundColor:theme.surface,borderColor:theme.border}]}><Ionicons name="add-outline" size={28} color={theme.text}/></View><Text style={[s.label,{color:theme.text}]}>المزيد</Text></Pressable>
  </ScrollView>;
}
const s=StyleSheet.create({row:{gap:13,paddingVertical:2},wrap:{width:82,alignItems:'center',gap:7},box:{width:68,height:68,borderRadius:21,borderWidth:1,alignItems:'center',justifyContent:'center'},label:{fontSize:11,fontWeight:'800',textAlign:'center'},press:{transform:[{scale:.97}],opacity:.82}});
