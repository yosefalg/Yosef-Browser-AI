import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getTheme, type ThemeName } from '@/lib/theme';

const options: Array<{name:ThemeName;label:string;glyph:string}> = [
  {name:'cinematic',label:'داكن',glyph:'☾'},
  {name:'light',label:'فاتح',glyph:'☀'},
  {name:'amoled',label:'AMOLED',glyph:'◐'},
];

export function ThemeSwitcher({ value, onChange }: { value: ThemeName; onChange: (value: ThemeName) => void }) {
  return <View style={s.row}>
    {options.map(option => {
      const palette=getTheme(option.name);
      const active=value===option.name;
      return <Pressable key={option.name} onPress={()=>onChange(option.name)} style={[s.item,{backgroundColor:palette.surface,borderColor:active?palette.accent:palette.border}]}>
        <Text style={[s.glyph,{color:palette.text}]}>{option.glyph}</Text>
        <Text style={[s.label,{color:palette.text}]}>{option.label}</Text>
      </Pressable>;
    })}
  </View>;
}

const s=StyleSheet.create({row:{flexDirection:'row-reverse',gap:8},item:{flex:1,minHeight:64,borderRadius:18,borderWidth:1,alignItems:'center',justifyContent:'center',gap:4},glyph:{fontSize:20},label:{fontSize:11,fontWeight:'800'}});
