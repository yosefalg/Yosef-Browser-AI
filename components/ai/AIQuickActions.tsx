import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ThemePalette } from '@/lib/theme';

export type AIQuickAction = { label:string; prompt:string; icon:keyof typeof Ionicons.glyphMap };

export function AIQuickActions({theme,disabled,onSelect}:{theme:ThemePalette;disabled:boolean;onSelect:(prompt:string)=>void}){
  const actions:AIQuickAction[]=[
    {label:'لخّص',prompt:'لخّص الصفحة الحالية بأهم النقاط.',icon:'sparkles-outline'},
    {label:'اشرح',prompt:'اشرح محتوى الصفحة ببساطة وبالعربية.',icon:'bulb-outline'},
    {label:'استخرج',prompt:'استخرج أهم المعلومات والأرقام والروابط من الصفحة.',icon:'scan-outline'},
    {label:'قارن',prompt:'قارن بين هذه الصفحة والسياق المتاح من التبويبات والذاكرة المحلية.',icon:'git-compare-outline'},
  ];
  return <View style={s.wrap}>
    <Text style={[s.title,{color:theme.muted}]}>أوامر سريعة</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row} keyboardShouldPersistTaps="handled">
      {actions.map(action=><Pressable key={action.label} disabled={disabled} onPress={()=>onSelect(action.prompt)} style={({pressed})=>[s.chip,{backgroundColor:theme.surface,borderColor:theme.border},(pressed||disabled)&&s.dim]}>
        <Ionicons name={action.icon} size={16} color={theme.accent}/><Text style={[s.label,{color:theme.text}]}>{action.label}</Text>
      </Pressable>)}
    </ScrollView>
  </View>;
}

const s=StyleSheet.create({wrap:{gap:7},title:{fontSize:10,fontWeight:'800',textAlign:'right',paddingHorizontal:2},row:{gap:8,paddingHorizontal:1},chip:{height:38,borderRadius:14,borderWidth:1,paddingHorizontal:12,flexDirection:'row-reverse',alignItems:'center',gap:6},label:{fontSize:11,fontWeight:'900'},dim:{opacity:.55}});
