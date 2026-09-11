import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ThemePalette } from '@/lib/theme';

export type HomeMenuItem = { label: string; icon: string; onPress: () => void };

export function HomeMenu({ visible, onClose, theme, items }: { visible: boolean; onClose: () => void; theme: ThemePalette; items: HomeMenuItem[] }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={[s.card,{backgroundColor:theme.surface,borderColor:theme.border}]} onPress={() => {}}>
          <View style={s.grabber}><View style={[s.grabberDot,{backgroundColor:theme.accent}]} /><View style={[s.grabberDot,{backgroundColor:theme.accent}]} /><View style={[s.grabberDot,{backgroundColor:theme.accent}]} /></View>
          {items.map((item,index) => (
            <Pressable key={`${item.label}-${index}`} onPress={item.onPress} style={s.row}>
              <Text style={[s.icon,{color:theme.muted}]}>{item.icon}</Text>
              <Text style={[s.label,{color:theme.text}]}>{item.label}</Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s=StyleSheet.create({
  overlay:{flex:1,backgroundColor:'rgba(0,0,0,.48)',justifyContent:'flex-start',alignItems:'flex-end',paddingTop:84,paddingRight:14},
  card:{width:300,maxHeight:'82%',borderRadius:24,borderWidth:1,padding:10,shadowColor:'#000',shadowOpacity:.28,shadowRadius:24,elevation:12},
  grabber:{height:20,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4},grabberDot:{width:5,height:5,borderRadius:3},
  row:{minHeight:48,borderRadius:14,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:12},icon:{width:28,textAlign:'center',fontSize:19},label:{flex:1,fontSize:14,fontWeight:'800',textAlign:'right'}
});
