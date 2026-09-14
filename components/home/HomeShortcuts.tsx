import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RaidServiceIcon, SiteIcon } from '@/components/SiteIcon';
import type { ThemePalette } from '@/lib/theme';

type Shortcut={label:string;url?:string;service?:'ai'|'vpn';onPress:()=>void};

export function HomeShortcuts({theme,items,onMore}:{theme:ThemePalette;items:Shortcut[];onMore:()=>void}){
  const tile=(label:string,content:ReactNode,onPress:()=>void)=>
    <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({pressed})=>[s.wrap,pressed&&s.press]}>
      <View style={[s.box,{backgroundColor:theme.surface,borderColor:theme.border}]}>{content}</View>
      <Text numberOfLines={1} style={[s.label,{color:theme.text}]}>{label}</Text>
    </Pressable>;

  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
    {items.map(item=>tile(item.label,item.url?<SiteIcon url={item.url} size={38} radius={11}/>:<RaidServiceIcon kind={item.service!} size={38}/>,item.onPress))}
    {tile('المزيد',<Ionicons name="add-outline" size={23} color={theme.text}/>,onMore)}
  </ScrollView>;
}

const s=StyleSheet.create({
  row:{gap:10,paddingVertical:2,paddingHorizontal:1},
  wrap:{width:66,alignItems:'center',gap:5},
  box:{width:54,height:54,borderRadius:18,borderWidth:1,alignItems:'center',justifyContent:'center'},
  label:{fontSize:9.5,fontWeight:'800',textAlign:'center',maxWidth:64},
  press:{transform:[{scale:.94}],opacity:.76}
});
