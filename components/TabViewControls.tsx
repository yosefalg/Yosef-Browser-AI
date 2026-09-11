import { Pressable, StyleSheet, Text, View } from 'react-native';

export type TabViewMode = 'grid' | 'list';
export type TabSortMode = 'recent' | 'oldest' | 'domain';

export function TabViewControls({
  viewMode,
  sortMode,
  onViewMode,
  onSortMode,
}: {
  viewMode: TabViewMode;
  sortMode: TabSortMode;
  onViewMode: (mode: TabViewMode) => void;
  onSortMode: (mode: TabSortMode) => void;
}) {
  const sortItems: Array<{ key: TabSortMode; label: string }> = [
    { key: 'recent', label: 'الأحدث' },
    { key: 'oldest', label: 'الأقدم' },
    { key: 'domain', label: 'الموقع' },
  ];

  return (
    <View style={s.wrap}>
      <View style={s.sortRow}>
        {sortItems.map((item) => (
          <Pressable key={item.key} onPress={() => onSortMode(item.key)} style={[s.chip, sortMode === item.key && s.chipOn]}>
            <Text style={[s.chipText, sortMode === item.key && s.chipTextOn]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={s.modeRow}>
        <Pressable onPress={() => onViewMode('grid')} style={[s.mode, viewMode === 'grid' && s.modeOn]} accessibilityLabel="عرض شبكي">
          <Text style={[s.modeText, viewMode === 'grid' && s.modeTextOn]}>▦</Text>
        </Pressable>
        <Pressable onPress={() => onViewMode('list')} style={[s.mode, viewMode === 'list' && s.modeOn]} accessibilityLabel="عرض قائمة">
          <Text style={[s.modeText, viewMode === 'list' && s.modeTextOn]}>☷</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:{marginTop:12,flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:10},
  sortRow:{flex:1,flexDirection:'row-reverse',gap:7},
  chip:{paddingHorizontal:11,height:34,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#101827',borderWidth:1,borderColor:'#27324A'},
  chipOn:{backgroundColor:'#24143F',borderColor:'#6947C6'},
  chipText:{color:'#7D8CA3',fontSize:10,fontWeight:'800'},chipTextOn:{color:'#E9DDFF'},
  modeRow:{flexDirection:'row',backgroundColor:'#0E1522',borderRadius:12,padding:3,borderWidth:1,borderColor:'#27324A'},
  mode:{width:34,height:28,borderRadius:9,alignItems:'center',justifyContent:'center'},modeOn:{backgroundColor:'#6D4AC4'},
  modeText:{color:'#718096',fontSize:17,fontWeight:'900'},modeTextOn:{color:'#fff'},
});
