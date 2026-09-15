import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SiteIcon } from '@/components/SiteIcon';
import type { ThemePalette } from '@/lib/theme';

export type RecentSite = { url:string; title:string; visited_at:number };

function hostOf(value:string){
  try{return new URL(value).hostname.replace(/^www\./,'')}catch{return value}
}

function visitedLabel(value:number){
  const minutes=Math.max(0,Math.floor((Date.now()-value)/60000));
  if(minutes<1)return 'هسه';
  if(minutes<60)return `قبل ${minutes} د`;
  const hours=Math.floor(minutes/60);
  if(hours<24)return `قبل ${hours} س`;
  const days=Math.floor(hours/24);
  return days===1?'أمس':`قبل ${Math.min(days,99)} يوم`;
}

export function HomeRecentSites({
  theme,
  items,
  onOpen,
  onViewAll,
}:{
  theme:ThemePalette;
  items:RecentSite[];
  onOpen:(url:string)=>void;
  onViewAll:()=>void;
}){
  if(!items.length)return null;

  return <View style={s.wrap}>
    <View style={s.head}>
      <View style={s.titleLine}>
        <View style={[s.titleIcon,{backgroundColor:theme.surface2,borderColor:theme.border}]}><Ionicons name="time-outline" size={16} color={theme.accent}/></View>
        <View><Text style={[s.title,{color:theme.text}]}>تابع من وين وقفت</Text><Text style={[s.subtitle,{color:theme.muted}]}>من سجلّك على هذا الجهاز</Text></View>
      </View>
      <Pressable onPress={onViewAll} hitSlop={8} accessibilityRole="button" accessibilityLabel="عرض سجل التصفح كاملًا"><Text style={[s.more,{color:theme.accent}]}>عرض الكل</Text></Pressable>
    </View>

    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
      {items.map(item=>{
        const host=hostOf(item.url);
        const title=item.title?.trim()||host;
        return <Pressable
          key={`${item.url}-${item.visited_at}`}
          onPress={()=>onOpen(item.url)}
          accessibilityRole="button"
          accessibilityLabel={`متابعة تصفح ${title}`}
          style={({pressed})=>[s.card,{backgroundColor:theme.surface,borderColor:theme.border},pressed&&s.pressed]}>
          <View style={s.cardTop}>
            <SiteIcon url={item.url} size={42} radius={14}/>
            <View style={s.copy}><Text numberOfLines={1} style={[s.cardTitle,{color:theme.text}]}>{title}</Text><Text numberOfLines={1} style={[s.host,{color:theme.muted}]}>{host}</Text></View>
          </View>
          <View style={s.cardBottom}><Text style={[s.time,{color:theme.muted}]}>{visitedLabel(item.visited_at)}</Text><View style={[s.resume,{backgroundColor:theme.surface2,borderColor:theme.border}]}><Text style={[s.resumeText,{color:theme.accent}]}>متابعة</Text><Ionicons name="arrow-back" size={13} color={theme.accent}/></View></View>
        </Pressable>;
      })}
    </ScrollView>
  </View>;
}

const s=StyleSheet.create({
  wrap:{gap:9},
  head:{minHeight:36,flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',paddingHorizontal:2},
  titleLine:{flexDirection:'row-reverse',alignItems:'center',gap:8},
  titleIcon:{width:32,height:32,borderRadius:11,borderWidth:1,alignItems:'center',justifyContent:'center'},
  title:{fontSize:13,fontWeight:'900',textAlign:'right'},
  subtitle:{fontSize:8.5,fontWeight:'700',textAlign:'right',marginTop:2},
  more:{fontSize:10,fontWeight:'900'},
  row:{gap:9,paddingHorizontal:1,paddingBottom:2},
  card:{width:210,minHeight:112,borderRadius:22,borderWidth:1,padding:11,justifyContent:'space-between',gap:11},
  cardTop:{flexDirection:'row-reverse',alignItems:'center',gap:9},
  copy:{flex:1,alignItems:'flex-end'},
  cardTitle:{fontSize:11.5,fontWeight:'900',textAlign:'right',width:'100%'},
  host:{fontSize:8.5,fontWeight:'700',textAlign:'right',width:'100%',marginTop:3},
  cardBottom:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'},
  resume:{height:28,borderRadius:10,borderWidth:1,paddingHorizontal:9,flexDirection:'row-reverse',alignItems:'center',gap:4},
  resumeText:{fontSize:9,fontWeight:'900'},
  time:{fontSize:8.5,fontWeight:'700',fontVariant:['tabular-nums']},
  pressed:{opacity:.76,transform:[{scale:.985}]},
});
