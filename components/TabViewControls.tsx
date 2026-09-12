import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ThemePalette } from '@/lib/theme';

export type TabViewMode = 'grid' | 'list';
export type TabSortMode = 'recent' | 'oldest' | 'domain' | 'title';

export function TabViewControls({ viewMode, sortMode, onViewMode, onSortMode, theme }: {
  viewMode: TabViewMode;
  sortMode: TabSortMode;
  onViewMode: (mode: TabViewMode) => void;
  onSortMode: (mode: TabSortMode) => void;
  theme: ThemePalette;
}) {
  const sortItems: Array<{ key: TabSortMode; label: string }> = [
    { key: 'recent', label: 'الأحدث' },
    { key: 'oldest', label: 'الأقدم' },
    { key: 'domain', label: 'الموقع' },
    { key: 'title', label: 'الاسم' },
  ];

  return <View style={s.wrap}>
    <View style={s.sortRow}>{sortItems.map(item => {
      const active = sortMode === item.key;
      return <Pressable key={item.key} onPress={() => onSortMode(item.key)} style={({pressed})=>[s.chip,{backgroundColor:active?theme.surface2:theme.surface,borderColor:active?theme.accent:theme.border},pressed&&s.press]}>
        <Text style={[s.chipText,{color:active?theme.text:theme.muted}]}>{item.label}</Text>
      </Pressable>;
    })}</View>
    <View style={[s.modeRow,{backgroundColor:theme.surface,borderColor:theme.border}]}>
      <Pressable onPress={() => onViewMode('grid')} style={[s.mode,viewMode==='grid'&&{backgroundColor:theme.accent}]} accessibilityLabel="عرض شبكي"><Ionicons name="grid-outline" size={16} color={viewMode==='grid'?'#fff':theme.muted}/></Pressable>
      <Pressable onPress={() => onViewMode('list')} style={[s.mode,viewMode==='list'&&{backgroundColor:theme.accent}]} accessibilityLabel="عرض قائمة"><Ionicons name="list-outline" size={18} color={viewMode==='list'?'#fff':theme.muted}/></Pressable>
    </View>
  </View>;
}

const s=StyleSheet.create({wrap:{marginTop:12,flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:9},sortRow:{flex:1,flexDirection:'row-reverse',gap:5},chip:{flex:1,minWidth:0,paddingHorizontal:6,height:34,borderRadius:12,alignItems:'center',justifyContent:'center',borderWidth:1},chipText:{fontSize:9,fontWeight:'900'},modeRow:{flexDirection:'row',borderRadius:12,padding:3,borderWidth:1},mode:{width:33,height:28,borderRadius:9,alignItems:'center',justifyContent:'center'},press:{opacity:.82,transform:[{scale:.97}]}});
