import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { RaidServiceIcon, SiteIcon } from '@/components/SiteIcon';
import type { ThemePalette } from '@/lib/theme';

type Shortcut={label:string;url?:string;service?:'ai'|'vpn';onPress:()=>void};
function colorsFor(item:Shortcut):readonly [string,string]{
  if(item.service==='vpn')return ['rgba(50,145,112,.22)','rgba(30,72,68,.12)'];
  if(item.service==='ai')return ['rgba(196,139,92,.23)','rgba(89,61,72,.12)'];
  if(item.url?.includes('youtube'))return ['rgba(207,64,76,.20)','rgba(79,37,48,.11)'];
  if(item.url?.includes('google'))return ['rgba(71,133,220,.20)','rgba(42,68,104,.11)'];
  return ['rgba(132,110,190,.18)','rgba(53,48,83,.10)'];
}

export function HomeShortcuts({theme,items,onMore}:{theme:ThemePalette;items:Shortcut[];onMore:()=>void}){
  const tile=(label:string,content:ReactNode,onPress:()=>void,colors:readonly [string,string])=>
    <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({pressed})=>[s.wrap,pressed&&s.press]}>
      <LinearGradient colors={colors} style={[s.box,{backgroundColor:theme.surface,borderColor:theme.border}]}>
        <View pointerEvents="none" style={s.shine}/>{content}
      </LinearGradient>
      <Text numberOfLines={1} style={[s.label,{color:theme.text}]}>{label}</Text>
    </Pressable>;

  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
    {items.map(item=>tile(item.label,item.url?<SiteIcon url={item.url} size={40} radius={12}/>:<RaidServiceIcon kind={item.service!} size={40}/>,item.onPress,colorsFor(item)))}
    {tile('المزيد',<Ionicons name="add-outline" size={24} color={theme.text}/>,onMore,['rgba(255,255,255,.08)','rgba(255,255,255,.025)'])}
  </ScrollView>;
}

const s=StyleSheet.create({
  row:{gap:11,paddingVertical:3,paddingHorizontal:1},wrap:{width:68,alignItems:'center',gap:6},
  box:{width:58,height:58,borderRadius:20,borderWidth:1,alignItems:'center',justifyContent:'center',overflow:'hidden',boxShadow:'0 6px 16px rgba(0,0,0,.12)'},
  shine:{position:'absolute',top:0,left:10,right:10,height:1,backgroundColor:'rgba(255,255,255,.30)'},
  label:{fontSize:9.7,fontWeight:'800',textAlign:'center',maxWidth:66},press:{transform:[{scale:.93}],opacity:.78}
});
