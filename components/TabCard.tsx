import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SiteIcon } from '@/components/SiteIcon';
import type { BrowserTab } from '@/lib/db';
import type { ThemePalette } from '@/lib/theme';
import type { TabViewMode } from '@/components/TabViewControls';

function hostOf(value:string){try{return new URL(value).hostname.replace(/^www\./,'');}catch{return value;}}
function ago(ts:number){const diff=Math.max(0,Date.now()-ts);const min=Math.floor(diff/60000);if(min<1)return 'الآن';if(min<60)return `منذ ${min} د`;const hr=Math.floor(min/60);if(hr<24)return `منذ ${hr} س`;return `منذ ${Math.floor(hr/24)} ي`;}

export function TabCard({tab,viewMode,theme,busy,onOpen,onDuplicate,onClose,onMenu}:{tab:BrowserTab;viewMode:TabViewMode;theme:ThemePalette;busy:boolean;onOpen:()=>void;onDuplicate:()=>void;onClose:()=>void;onMenu:()=>void}){
  const grid=viewMode==='grid';
  return <Pressable disabled={busy} onPress={onOpen} onLongPress={onMenu} delayLongPress={350} style={({pressed})=>[grid?s.grid:s.list,{backgroundColor:theme.surface,borderColor:theme.border},pressed&&s.press,busy&&s.disabled]}>
    <View style={s.top}><SiteIcon url={tab.url} size={grid?42:46} radius={14}/><View style={s.actions}>
      <Pressable onPress={e=>{e.stopPropagation();onDuplicate();}} hitSlop={8} style={[s.action,{backgroundColor:theme.surface2}]} accessibilityLabel="تكرار التبويب"><Ionicons name="copy-outline" size={16} color={theme.muted}/></Pressable>
      <Pressable onPress={e=>{e.stopPropagation();onClose();}} hitSlop={8} style={[s.action,{backgroundColor:theme.surface2}]} accessibilityLabel="إغلاق التبويب"><Ionicons name="close" size={18} color={theme.muted}/></Pressable>
    </View></View>
    <View style={grid?undefined:s.copy}><Text numberOfLines={grid?2:1} style={[s.title,{color:theme.text}]}>{tab.title||hostOf(tab.url)}</Text><Text numberOfLines={1} style={[s.host,{color:theme.muted}]}>{hostOf(tab.url)}</Text><View style={s.meta}><Ionicons name="time-outline" size={12} color={theme.muted}/><Text style={[s.time,{color:theme.muted}]}>{ago(tab.updated_at)}</Text></View></View>
  </Pressable>;
}

const s=StyleSheet.create({grid:{width:'48.4%',minHeight:168,borderRadius:22,borderWidth:1,padding:13,gap:13},list:{width:'100%',minHeight:86,borderRadius:20,borderWidth:1,padding:13,flexDirection:'row-reverse',alignItems:'center',gap:12},top:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},actions:{flexDirection:'row',gap:6},action:{width:30,height:30,borderRadius:10,alignItems:'center',justifyContent:'center'},copy:{flex:1},title:{fontSize:14,fontWeight:'900',textAlign:'right',lineHeight:20},host:{fontSize:10,marginTop:5,textAlign:'right'},meta:{marginTop:8,flexDirection:'row-reverse',alignItems:'center',gap:4},time:{fontSize:9,fontWeight:'700'},press:{opacity:.84,transform:[{scale:.985}]},disabled:{opacity:.5}});
