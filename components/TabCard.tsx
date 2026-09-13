import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SiteIcon } from '@/components/SiteIcon';
import type { BrowserTab } from '@/lib/db';
import type { ThemePalette } from '@/lib/theme';
import type { TabViewMode } from '@/components/TabViewControls';

function hostOf(value:string){try{return new URL(value).hostname.replace(/^www\./,'');}catch{return value;}}
function pathOf(value:string){try{const url=new URL(value);const path=`${url.pathname}${url.search}`;return path==='/'?'الصفحة الرئيسية':decodeURIComponent(path).slice(0,72);}catch{return '';}}
function isSecure(value:string){return /^https:\/\//i.test(value);}
function ago(ts:number){const diff=Math.max(0,Date.now()-ts);const min=Math.floor(diff/60000);if(min<1)return 'الآن';if(min<60)return `منذ ${min} د`;const hr=Math.floor(min/60);if(hr<24)return `منذ ${hr} س`;return `منذ ${Math.floor(hr/24)} ي`;}

export function TabCard({tab,viewMode,theme,busy,selected,selectionMode,recent,onOpen,onDuplicate,onClose,onMenu,onLongPress}:{tab:BrowserTab;viewMode:TabViewMode;theme:ThemePalette;busy:boolean;selected:boolean;selectionMode:boolean;recent:boolean;onOpen:()=>void;onDuplicate:()=>void;onClose:()=>void;onMenu:()=>void;onLongPress:()=>void}){
  const grid=viewMode==='grid';
  const secure=isSecure(tab.url);
  const path=pathOf(tab.url);
  const activityLabel=recent?'آخر نشاط • ':'';
  return <Pressable disabled={busy} onPress={onOpen} onLongPress={onLongPress} delayLongPress={320} style={({pressed})=>[
    grid?s.grid:s.list,
    {backgroundColor:selected?theme.surface2:theme.surface,borderColor:selected||recent?theme.accent:theme.border},
    pressed&&s.press,
    busy&&s.disabled,
  ]} accessibilityRole="button" accessibilityState={{selected,disabled:busy}} accessibilityLabel={`${activityLabel}${tab.title||hostOf(tab.url)}${selected?'، محدد':''}`}>
    {(selected||recent)&&<View style={[s.accentRail,{backgroundColor:theme.accent}]}/>} 
    {selected&&<View style={[s.selectedBadge,{backgroundColor:theme.accent}]}><Ionicons name="checkmark" size={14} color="#fff"/></View>}
    {grid?<>
      <View style={s.gridTop}>
        <View style={s.siteWrap}><SiteIcon url={tab.url} size={46} radius={15}/><View style={[s.securityBadge,{backgroundColor:theme.surface2,borderColor:theme.border}]}><Ionicons name={secure?'lock-closed':'warning-outline'} size={10} color={secure?theme.accent:theme.muted}/></View></View>
        {!selectionMode&&<View style={s.actions}>
          <Pressable onPress={event=>{event.stopPropagation();onMenu();}} hitSlop={10} style={[s.action,{backgroundColor:theme.surface2,borderColor:theme.border}]} accessibilityRole="button" accessibilityLabel="خيارات التبويب"><Ionicons name="ellipsis-horizontal" size={18} color={theme.muted}/></Pressable>
          <Pressable onPress={event=>{event.stopPropagation();onClose();}} hitSlop={10} style={[s.action,{backgroundColor:theme.surface2,borderColor:theme.border}]} accessibilityRole="button" accessibilityLabel="إغلاق التبويب"><Ionicons name="close" size={19} color={theme.muted}/></Pressable>
        </View>}
      </View>
      <View style={s.gridCopy}>
        <Text numberOfLines={2} style={[s.title,{color:theme.text}]}>{tab.title||hostOf(tab.url)}</Text>
        <View style={s.domainRow}><Ionicons name={secure?'shield-checkmark-outline':'globe-outline'} size={12} color={secure?theme.accent:theme.muted}/><Text numberOfLines={1} style={[s.host,{color:theme.muted}]}>{hostOf(tab.url)}</Text></View>
        {!!path&&<Text numberOfLines={1} style={[s.path,{color:theme.muted}]}>{path}</Text>}
      </View>
      <View style={s.footer}>
        <View style={s.meta}><Ionicons name="time-outline" size={12} color={theme.muted}/><Text style={[s.time,{color:theme.muted}]}>{ago(tab.updated_at)}</Text></View>
        {recent&&<View style={[s.recentBadge,{backgroundColor:theme.surface2,borderColor:theme.border}]}><Ionicons name="pulse-outline" size={11} color={theme.accent}/><Text style={[s.recentText,{color:theme.accent}]}>آخر نشاط</Text></View>}
      </View>
    </>:<>
      <View style={s.siteWrap}><SiteIcon url={tab.url} size={50} radius={16}/><View style={[s.securityBadge,{backgroundColor:theme.surface2,borderColor:theme.border}]}><Ionicons name={secure?'lock-closed':'warning-outline'} size={10} color={secure?theme.accent:theme.muted}/></View></View>
      <View style={s.copy}>
        <View style={s.listTitleRow}><Text numberOfLines={1} style={[s.title,{color:theme.text}]}>{tab.title||hostOf(tab.url)}</Text>{recent&&<View style={[s.activityPill,{backgroundColor:theme.surface2,borderColor:theme.border}]}><View style={[s.recentDot,{backgroundColor:theme.accent}]}/><Text style={[s.activityText,{color:theme.accent}]}>آخر نشاط</Text></View>}</View>
        <View style={s.domainRow}><Ionicons name={secure?'lock-closed-outline':'globe-outline'} size={11} color={secure?theme.accent:theme.muted}/><Text numberOfLines={1} style={[s.host,{color:theme.muted}]}>{hostOf(tab.url)}</Text></View>
        <View style={s.listMetaRow}><View style={s.meta}><Ionicons name="time-outline" size={12} color={theme.muted}/><Text style={[s.time,{color:theme.muted}]}>{ago(tab.updated_at)}</Text></View>{!!path&&<Text numberOfLines={1} style={[s.listPath,{color:theme.muted}]}>{path}</Text>}</View>
      </View>
      {!selectionMode&&<View style={s.actions}>
        <Pressable onPress={event=>{event.stopPropagation();onClose();}} hitSlop={10} style={[s.action,{backgroundColor:theme.surface2,borderColor:theme.border}]} accessibilityRole="button" accessibilityLabel="إغلاق التبويب"><Ionicons name="close" size={19} color={theme.muted}/></Pressable>
        <Pressable onPress={event=>{event.stopPropagation();onMenu();}} hitSlop={10} style={[s.action,{backgroundColor:theme.surface2,borderColor:theme.border}]} accessibilityRole="button" accessibilityLabel="خيارات التبويب"><Ionicons name="ellipsis-horizontal" size={18} color={theme.muted}/></Pressable>
      </View>}
    </>}
  </Pressable>;
}

const s=StyleSheet.create({
  grid:{width:'48.4%',minHeight:198,borderRadius:24,borderWidth:1,padding:13,gap:10,position:'relative',overflow:'hidden'},
  list:{width:'100%',minHeight:98,borderRadius:22,borderWidth:1,padding:13,flexDirection:'row-reverse',alignItems:'center',gap:12,position:'relative',overflow:'hidden'},
  accentRail:{position:'absolute',right:0,top:18,bottom:18,width:3,borderTopLeftRadius:4,borderBottomLeftRadius:4},
  selectedBadge:{position:'absolute',top:8,right:8,width:25,height:25,borderRadius:13,alignItems:'center',justifyContent:'center',zIndex:4},
  siteWrap:{position:'relative'},securityBadge:{position:'absolute',right:-4,bottom:-4,width:22,height:22,borderRadius:8,borderWidth:1,alignItems:'center',justifyContent:'center'},
  gridTop:{flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center'},
  actions:{flexDirection:'row',gap:7},action:{width:36,height:36,borderRadius:12,borderWidth:1,alignItems:'center',justifyContent:'center'},
  gridCopy:{flex:1,justifyContent:'center'},copy:{flex:1,alignItems:'flex-end'},listTitleRow:{maxWidth:'100%',flexDirection:'row-reverse',alignItems:'center',gap:7},
  title:{fontSize:14,fontWeight:'900',textAlign:'right',lineHeight:20,flexShrink:1},host:{fontSize:10,textAlign:'right',flexShrink:1},path:{fontSize:9,marginTop:6,textAlign:'right',opacity:.8},
  domainRow:{marginTop:5,flexDirection:'row-reverse',alignItems:'center',gap:5,maxWidth:'100%'},listMetaRow:{marginTop:7,width:'100%',flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:10},listPath:{fontSize:8,flex:1,textAlign:'left',opacity:.72},
  footer:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:7},meta:{flexDirection:'row-reverse',alignItems:'center',gap:4},time:{fontSize:9,fontWeight:'700'},
  recentBadge:{minHeight:25,paddingHorizontal:8,borderRadius:9,borderWidth:1,flexDirection:'row-reverse',alignItems:'center',gap:5},recentDot:{width:6,height:6,borderRadius:3},recentText:{fontSize:8,fontWeight:'900'},
  activityPill:{minHeight:22,paddingHorizontal:7,borderRadius:8,borderWidth:1,flexDirection:'row-reverse',alignItems:'center',gap:4,flexShrink:0},activityText:{fontSize:8,fontWeight:'900'},
  press:{opacity:.84,transform:[{scale:.985}]},disabled:{opacity:.5}
});
