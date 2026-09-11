import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ThemePalette } from '@/lib/theme';

export type HomeMenuItem = {
  label: string;
  icon: string;
  onPress: () => void;
  hint?: string;
  disabled?: boolean;
};

export function HomeMenu({ visible, onClose, theme, items }: { visible: boolean; onClose: () => void; theme: ThemePalette; items: HomeMenuItem[] }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={[s.card,{backgroundColor:theme.surface,borderColor:theme.border}]} onPress={() => {}}>
          <View style={s.grabber}>
            <View style={[s.grabberLine,{backgroundColor:theme.border}]} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
            {items.map((item,index) => (
              <Pressable
                key={`${item.label}-${index}`}
                disabled={item.disabled}
                onPress={() => { onClose(); item.onPress(); }}
                style={({ pressed }) => [s.row, pressed && !item.disabled ? { backgroundColor: theme.border } : null, item.disabled ? s.disabled : null]}
              >
                <View style={[s.iconBox,{backgroundColor:theme.bg,borderColor:theme.border}]}>
                  <Text style={[s.icon,{color:theme.accent}]}>{item.icon}</Text>
                </View>
                <View style={s.copy}>
                  <Text style={[s.label,{color:theme.text}]}>{item.label}</Text>
                  {item.hint ? <Text numberOfLines={1} style={[s.hint,{color:theme.muted}]}>{item.hint}</Text> : null}
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s=StyleSheet.create({
  overlay:{flex:1,backgroundColor:'rgba(0,0,0,.50)',justifyContent:'flex-start',alignItems:'flex-end',paddingTop:76,paddingRight:12,paddingLeft:12},
  card:{width:'88%',maxWidth:360,maxHeight:'84%',borderRadius:26,borderWidth:1,padding:8,shadowColor:'#000',shadowOpacity:.30,shadowRadius:26,elevation:14,overflow:'hidden'},
  grabber:{height:22,alignItems:'center',justifyContent:'center'},grabberLine:{width:38,height:4,borderRadius:3},content:{paddingBottom:6},
  row:{minHeight:58,borderRadius:17,paddingHorizontal:10,paddingVertical:7,flexDirection:'row',alignItems:'center',gap:11},disabled:{opacity:.42},
  iconBox:{width:38,height:38,borderRadius:13,borderWidth:1,alignItems:'center',justifyContent:'center'},icon:{textAlign:'center',fontSize:18,fontWeight:'800'},
  copy:{flex:1},label:{fontSize:14,fontWeight:'800',textAlign:'right'},hint:{fontSize:11,fontWeight:'600',textAlign:'right',marginTop:2}
});
