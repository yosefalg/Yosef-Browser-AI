import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTheme, type ThemeName } from '@/lib/theme';

const options: Array<{name:ThemeName;label:string;hint:string;icon:keyof typeof Ionicons.glyphMap}> = [
  {name:'cinematic',label:'سينمائي',hint:'دافئ وهادئ',icon:'moon-outline'},
  {name:'light',label:'فاتح',hint:'واضح ومريح',icon:'sunny-outline'},
  {name:'amoled',label:'AMOLED',hint:'أسود عميق',icon:'contrast-outline'},
];

export function ThemeSwitcher({ value, onChange }: { value: ThemeName; onChange: (value: ThemeName) => void }) {
  return <View style={s.row}>
    {options.map(option => {
      const palette=getTheme(option.name);
      const active=value===option.name;
      return <Pressable key={option.name} onPress={()=>onChange(option.name)} accessibilityRole="button" accessibilityState={{selected:active}} style={({pressed})=>[s.item,{backgroundColor:palette.surface,borderColor:active?palette.accent:palette.border},active&&s.active,pressed&&s.pressed]}>
        <View style={[s.iconWrap,{backgroundColor:palette.surface2,borderColor:active?palette.accent:palette.border}]}><Ionicons name={option.icon} size={20} color={active?palette.accent:palette.text}/></View>
        <Text style={[s.label,{color:palette.text}]}>{option.label}</Text>
        <Text style={[s.hint,{color:palette.muted}]}>{option.hint}</Text>
        {active?<View style={[s.check,{backgroundColor:palette.accent}]}><Ionicons name="checkmark" size={12} color="#fff"/></View>:null}
      </Pressable>;
    })}
  </View>;
}

const s=StyleSheet.create({row:{flexDirection:'row-reverse',gap:8},item:{flex:1,minHeight:92,borderRadius:20,borderWidth:1,alignItems:'center',justifyContent:'center',paddingVertical:9,paddingHorizontal:5,gap:3,position:'relative'},active:{borderWidth:1.5},iconWrap:{width:36,height:36,borderRadius:12,borderWidth:1,alignItems:'center',justifyContent:'center',marginBottom:2},label:{fontSize:11,fontWeight:'900',textAlign:'center'},hint:{fontSize:8.5,fontWeight:'700',textAlign:'center'},check:{position:'absolute',top:6,right:6,width:18,height:18,borderRadius:9,alignItems:'center',justifyContent:'center'},pressed:{opacity:.78,transform:[{scale:.985}]}});
