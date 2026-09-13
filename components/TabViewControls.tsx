import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ThemePalette } from '@/lib/theme';

export type TabViewMode = 'grid' | 'list';
export type TabSortMode = 'recent' | 'oldest' | 'domain' | 'title';

type SortItem = { key: TabSortMode; label: string; icon: keyof typeof Ionicons.glyphMap };

export function TabViewControls({ viewMode, sortMode, onViewMode, onSortMode, theme }: {
  viewMode: TabViewMode;
  sortMode: TabSortMode;
  onViewMode: (mode: TabViewMode) => void;
  onSortMode: (mode: TabSortMode) => void;
  theme: ThemePalette;
}) {
  const sortItems: SortItem[] = [
    { key: 'recent', label: 'الأحدث', icon: 'time-outline' },
    { key: 'oldest', label: 'الأقدم', icon: 'hourglass-outline' },
    { key: 'domain', label: 'الموقع', icon: 'globe-outline' },
    { key: 'title', label: 'الاسم', icon: 'text-outline' },
  ];

  return <View style={s.wrap}>
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.sortRow}
      keyboardShouldPersistTaps="handled"
    >
      {sortItems.map(item => {
        const active = sortMode === item.key;
        return <Pressable
          key={item.key}
          onPress={() => onSortMode(item.key)}
          accessibilityRole="button"
          accessibilityState={{ selected: active }}
          accessibilityLabel={`ترتيب حسب ${item.label}`}
          style={({pressed})=>[
            s.chip,
            {backgroundColor:active?theme.surface2:theme.surface,borderColor:active?theme.accent:theme.border},
            pressed&&s.press,
          ]}
        >
          <Ionicons name={item.icon} size={14} color={active?theme.accent:theme.muted}/>
          <Text style={[s.chipText,{color:active?theme.text:theme.muted}]}>{item.label}</Text>
        </Pressable>;
      })}
    </ScrollView>
    <View style={[s.modeRow,{backgroundColor:theme.surface,borderColor:theme.border}]}>
      <Pressable
        onPress={() => onViewMode('grid')}
        style={[s.mode,viewMode==='grid'&&{backgroundColor:theme.accent}]}
        accessibilityRole="button"
        accessibilityState={{ selected: viewMode==='grid' }}
        accessibilityLabel="عرض شبكي"
      ><Ionicons name="grid-outline" size={17} color={viewMode==='grid'?'#fff':theme.muted}/></Pressable>
      <Pressable
        onPress={() => onViewMode('list')}
        style={[s.mode,viewMode==='list'&&{backgroundColor:theme.accent}]}
        accessibilityRole="button"
        accessibilityState={{ selected: viewMode==='list' }}
        accessibilityLabel="عرض قائمة"
      ><Ionicons name="list-outline" size={19} color={viewMode==='list'?'#fff':theme.muted}/></Pressable>
    </View>
  </View>;
}

const s=StyleSheet.create({
  wrap:{marginTop:12,flexDirection:'row-reverse',alignItems:'center',gap:9},
  sortRow:{flexDirection:'row-reverse',gap:7,paddingVertical:1,paddingHorizontal:1},
  chip:{height:36,minWidth:78,paddingHorizontal:10,borderRadius:13,alignItems:'center',justifyContent:'center',borderWidth:1,flexDirection:'row-reverse',gap:5},
  chipText:{fontSize:10,fontWeight:'900'},
  modeRow:{flexDirection:'row',borderRadius:13,padding:3,borderWidth:1},
  mode:{width:37,height:30,borderRadius:10,alignItems:'center',justifyContent:'center'},
  press:{opacity:.82,transform:[{scale:.97}]}
});
