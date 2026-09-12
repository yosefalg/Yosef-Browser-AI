import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SiteIcon } from '@/components/SiteIcon';
import type { BrowserTab } from '@/lib/db';
import type { ThemePalette } from '@/lib/theme';
import type { TabViewMode } from '@/components/TabViewControls';

function hostOf(value:string){try{return new URL(value).hostname.replace(/^www\./,'');}catch{return value;}}
function ago(ts:number){const diff=Math.max(0,Date.now()-ts);const min=Math.floor(diff/60000);if(min<1)return 'الآن';if(min<60)return `منذ ${min} د`;const hr=Math.floor(min/60);if(hr<24)return `منذ ${hr} س`;return `منذ ${Math.floor(hr/24)} ي`;}

export function TabCard({tab,viewMode,theme,busy,selected,selectionMode,recent,onOpen,onDuplicate,onClose,onMenu,onLongPress}:{tab:BrowserTab;viewMode:TabViewMode;theme:ThemePalette;busy:boolean;selected:boolean;selectionMode:boolean;recent:boolean;onOpen:()=>void;onDuplicate:()=>void;onClose:()=>void;onMenu:()=>void;onLongPress:()=>void}){
  const grid=viewMode==='grid';
  return <Pressable disabled={busy} onPress={onOpen} onLongPress={onLongPress} delayLongPress={320} style={({pressed})=>[
    grid?s.grid:s.list,
    {backgroundColor:selected?theme.surface2:theme.surface,borderColor:selected?theme.accent:theme.border},
    recent&&!selected&&{borderColor:theme.accent},
    pressed&&s.press,
    busy&&s.disabled,
  ]} accessibilityRole="button" accessibilityLabel={`${tab.title||hostOf(tab.url)}${selected?'، محدد':''}`}>
    {selected&&<View style={[s.selectedBadge,{backgroundColor:theme.accent}]}><Ionicons name="checkmark" size={14} color="#fff"/></View>}
    {grid?<>
      <View style={s.gridTop}>
        <SiteIcon url={tab.url} size={44} radius={15}/>
        {!selectionMode&&<View style={s.actions}>
          <Pressable onPress={event=>{event.stopPropagation();onMenu();}} hitSlop={8} style={[s.action,{backgroundColor:theme.surface2}]} accessibilityLabel="خيارات التبويب"><Ionicons name="ellipsis-horizontal" size={18} color={theme.muted}/></Pressable>
          <Pressable onPress={event=>{event.stopPropagation();onClose();}} hitSlop={8} style={[s.action,{backgroundColor:theme.surface2}]} accessibilityLabel="إغلاق التبويب"><Ionicons name="close" size={18} color={theme.muted}/></Pressable>
        </View>}
      </View>
      <View style={s.gridCopy}>
        <Text numberOfLines={2} style={[s.title,{color:theme.text}]}>{tab.title||hostOf(tab.url)}</Text>
        <Text numberOfLines={1} style={[s.host,{color:theme.muted}]}>{hostOf(tab.url)}</Text>
      </View>
      <View style={s.footer}>
        <View style={s.meta}><Ionicons name="time-outline" size={12} color={theme.muted}/><Text style={[s.time,{color:theme.muted}]}>{ago(tab.updated_at)}</Text></View>
        {recent&&<View style={[s.recentBadge,{backgroundColor:theme.surface2}]}><View style={[s.recentDot,{backgroundColor:theme.accent}]}/><Text style={[s.recentText,{color:theme.accent}]}>آخر نشاط</Text></View>}
      </View>
    </>:<>
      <SiteIcon url={tab.url} size={48} radius={16}/>
      <View style={s.copy}>
        <View style={s.listTitleRow}><Text numberOfLines={1} style={[s.title,{color:theme.text}]}>{tab.title||hostOf(tab.url)}</Text>{recent&&<View style={[s.recentDot,{backgroundColor:theme.accent}]}/>}</View>
        <Text numberOfLines={1} style={[s.host,{color:theme.muted}]}>{hostOf(tab.url)}</Text>
        <View style={s.meta}><Ionicons name="time-outline" size={12} color={theme.muted}/><Text style={[s.time,{color:theme.muted}]}>{ago(tab.updated_at)}</Text></View>
      </View>
      {!selectionMode&&<View style={s.actions}>
        <Pressable onPress={event=>{event.stopPropagation();onDuplicate();}} hitSlop={8} style={[s.action,{backgroundColor:theme.surface2}]} accessibilityLabel="تكرار التبويب"><Ionicons name="copy-outline" size={16} color={theme.muted}/></Pressable>
        <Pressable onPress={event=>{event.stopPropagation();onMenu();}} hitSlop={8} style={[s.action,{backgroundColor:theme.surface2}]} accessibilityLabel="خيارات التبويب"><Ionicons name="ellipsis-horizontal" size={18} color={theme.muted}/></Pressable>
      </View>}
    </>}
  </Pressable>;
}

const s=StyleSheet.create({
  grid:{width:'48.4%',minHeight:186,borderRadius:23,borderWidth:1,padding:13,gap:11,position:'relative',overflow:'hidden'},
  list:{width:'100%',minHeight:92,borderRadius:21,borderWidth:1,padding:13,flexDirection:'row-reverse',alignItems:'center',gap:12,position:'relative',overflow:'hidden'},
  selectedBadge:{position:'absolute',top:8,right:8,width:25,height:25,borderRadius:13,alignItems:'center',justifyContent:'center',zIndex:3},
  gridTop:{flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center'},
  actions:{flexDirection:'row',gap:6},action:{width:31,height:31,borderRadius:10,alignItems:'center',justifyContent:'center'},
  gridCopy:{flex:1,justifyContent:'center'},copy:{flex:1,alignItems:'flex-end'},listTitleRow:{maxWidth:'100%',flexDirection:'row-reverse',alignItems:'center',gap:7},
  title:{fontSize:14,fontWeight:'900',textAlign:'right',lineHeight:20,flexShrink:1},host:{fontSize:10,marginTop:5,textAlign:'right'},
  footer:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:7},meta:{marginTop:7,flexDirection:'row-reverse',alignItems:'center',gap:4},time:{fontSize:9,fontWeight:'700'},
  recentBadge:{minHeight:24,paddingHorizontal:8,borderRadius:9,flexDirection:'row-reverse',alignItems:'center',gap:5},recentDot:{width:6,height:6,borderRadius:3},recentText:{fontSize:8,fontWeight:'900'},
  press:{opacity:.84,transform:[{scale:.985}]},disabled:{opacity:.5}
});
