import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTheme, type ThemeName } from '@/lib/theme';

const options: Array<{name:ThemeName;label:string;hint:string;icon:keyof typeof Ionicons.glyphMap}> = [
  {name:'cinematic',label:'Cinematic',hint:'زجاج داكن متوازن',icon:'moon-outline'},
  {name:'graphite',label:'Graphite',hint:'رمادي فاخر بارد',icon:'diamond-outline'},
  {name:'teal',label:'Deep Teal',hint:'أخضر مزرق هادئ',icon:'water-outline'},
  {name:'amoled',label:'AMOLED',hint:'أسود عميق',icon:'contrast-outline'},
  {name:'light',label:'Light',hint:'فاتح ونظيف',icon:'sunny-outline'},
  {name:'ivory',label:'Warm Ivory',hint:'عاجي دافئ ومريح',icon:'cafe-outline'},
];

export function ThemeSwitcher({ value, onChange }: { value: ThemeName; onChange: (value: ThemeName) => void }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
    {options.map(option => {
      const palette=getTheme(option.name);
      const active=value===option.name;
      return <Pressable key={option.name} onPress={()=>onChange(option.name)} accessibilityRole="button" accessibilityState={{selected:active}} style={({pressed})=>[s.item,{backgroundColor:palette.surface,borderColor:active?palette.accent:palette.border},active&&s.active,pressed&&s.pressed]}>
        <View style={[s.preview,{backgroundColor:palette.bg,borderColor:palette.border}]}><View style={[s.previewGlow,{backgroundColor:palette.accent}]}/><View style={[s.previewBar,{backgroundColor:palette.surface2}]}/><View style={[s.previewDot,{backgroundColor:palette.accent}]}/></View>
        <View style={[s.iconWrap,{backgroundColor:palette.surface2,borderColor:active?palette.accent:palette.border}]}><Ionicons name={option.icon} size={18} color={active?palette.accent:palette.text}/></View>
        <Text style={[s.label,{color:palette.text}]}>{option.label}</Text>
        <Text style={[s.hint,{color:palette.muted}]} numberOfLines={1}>{option.hint}</Text>
        {active?<View style={[s.check,{backgroundColor:palette.accent}]}><Ionicons name="checkmark" size={12} color="#fff"/></View>:null}
      </Pressable>;
    })}
  </ScrollView>;
}

const s=StyleSheet.create({
  row:{gap:10,paddingVertical:2,paddingHorizontal:1},item:{width:132,minHeight:148,borderRadius:22,borderWidth:1,alignItems:'center',paddingVertical:10,paddingHorizontal:8,gap:4,position:'relative'},active:{borderWidth:1.5},
  preview:{width:'100%',height:54,borderRadius:15,borderWidth:1,overflow:'hidden',position:'relative',marginBottom:3},previewGlow:{position:'absolute',width:52,height:52,borderRadius:26,right:-8,top:-15,opacity:.20},previewBar:{position:'absolute',left:9,right:9,bottom:8,height:16,borderRadius:8},previewDot:{position:'absolute',left:15,bottom:13,width:6,height:6,borderRadius:3},
  iconWrap:{width:34,height:34,borderRadius:11,borderWidth:1,alignItems:'center',justifyContent:'center',marginTop:1},label:{fontSize:11,fontWeight:'900',textAlign:'center'},hint:{fontSize:8.5,fontWeight:'700',textAlign:'center',width:'100%'},check:{position:'absolute',top:7,right:7,width:18,height:18,borderRadius:9,alignItems:'center',justifyContent:'center'},pressed:{opacity:.80,transform:[{scale:.985}]}
});
