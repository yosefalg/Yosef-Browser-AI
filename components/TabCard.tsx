import { memo, useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { SiteIcon } from '@/components/SiteIcon';
import type { BrowserTab } from '@/lib/db';

function hostOf(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return value; }
}

type Props = {
  tab: BrowserTab;
  compact?: boolean;
  index?: number;
  disabled?: boolean;
  onOpen: () => void;
  onClose: () => void;
  onDuplicate: () => void;
  onMenu: () => void;
};

function TabCardBase({ tab, compact = false, index = 0, disabled, onOpen, onClose, onDuplicate, onMenu }: Props) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    Animated.spring(progress, {
      toValue: 1,
      delay: Math.min(index, 8) * 28,
      damping: 18,
      stiffness: 180,
      mass: 0.7,
      useNativeDriver: true,
    }).start();
  }, [index, progress, tab.id]);

  const animatedStyle = {
    opacity: progress,
    transform: [
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) },
    ],
  } as const;

  if (compact) {
    return (
      <Animated.View style={animatedStyle}>
        <Pressable disabled={disabled} onPress={onOpen} onLongPress={onMenu} delayLongPress={320} style={({ pressed }) => [s.listRow, pressed && s.pressed, disabled && s.disabled]}>
          <SiteIcon url={tab.url} size={42} radius={13} />
          <View style={s.listCopy}>
            <Text numberOfLines={1} style={s.listTitle}>{tab.title || hostOf(tab.url)}</Text>
            <Text numberOfLines={1} style={s.host}>{hostOf(tab.url)}</Text>
          </View>
          <Pressable onPress={(e) => { e.stopPropagation(); onMenu(); }} hitSlop={8} style={s.more}><Text style={s.moreText}>•••</Text></Pressable>
          <Pressable onPress={(e) => { e.stopPropagation(); onClose(); }} hitSlop={10} style={s.close}><Text style={s.closeText}>×</Text></Pressable>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[s.gridWrap, animatedStyle]}>
      <Pressable disabled={disabled} onPress={onOpen} onLongPress={onMenu} delayLongPress={320} style={({ pressed }) => [s.card, pressed && s.cardPressed, disabled && s.disabled]}>
        <View style={s.cardTop}>
          <SiteIcon url={tab.url} size={42} radius={13} />
          <View style={s.cardActions}>
            <Pressable onPress={(e) => { e.stopPropagation(); onDuplicate(); }} hitSlop={8} style={s.smallAction}><Text style={s.duplicateText}>⧉</Text></Pressable>
            <Pressable onPress={(e) => { e.stopPropagation(); onClose(); }} hitSlop={10} style={s.smallAction}><Text style={s.closeText}>×</Text></Pressable>
          </View>
        </View>
        <Text numberOfLines={2} style={s.cardTitle}>{tab.title || hostOf(tab.url)}</Text>
        <Text numberOfLines={1} style={s.host}>{hostOf(tab.url)}</Text>
        <Pressable onPress={(e) => { e.stopPropagation(); onMenu(); }} style={s.menuLine}><Text style={s.menuText}>المزيد</Text><Text style={s.menuDots}>•••</Text></Pressable>
      </Pressable>
    </Animated.View>
  );
}

export const TabCard = memo(TabCardBase);

const s = StyleSheet.create({
  gridWrap:{width:'48%'},
  card:{minHeight:166,borderRadius:22,padding:13,backgroundColor:'#101827',borderWidth:1,borderColor:'#26334A'},
  cardPressed:{transform:[{scale:.985}],borderColor:'#7457E8',backgroundColor:'#121C2F'},
  disabled:{opacity:.55},
  cardTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  cardActions:{flexDirection:'row',gap:6},
  smallAction:{width:32,height:32,borderRadius:11,backgroundColor:'#172033',alignItems:'center',justifyContent:'center'},
  duplicateText:{color:'#C4B5FD',fontSize:17,fontWeight:'900'},
  closeText:{color:'#A7B0C0',fontSize:21,lineHeight:22},
  cardTitle:{marginTop:15,color:'#F8FAFC',fontSize:14,fontWeight:'900',textAlign:'right',lineHeight:20},
  host:{marginTop:5,color:'#718096',fontSize:10,textAlign:'right'},
  menuLine:{marginTop:'auto',paddingTop:12,flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center'},
  menuText:{color:'#9D8DF1',fontSize:10,fontWeight:'900'},menuDots:{color:'#65728A',fontSize:13,letterSpacing:1},
  listRow:{minHeight:68,borderRadius:19,paddingHorizontal:12,paddingVertical:10,backgroundColor:'#101827',borderWidth:1,borderColor:'#26334A',flexDirection:'row-reverse',alignItems:'center',gap:10},
  pressed:{borderColor:'#7457E8',backgroundColor:'#121C2F'},
  listCopy:{flex:1,alignItems:'flex-end'},listTitle:{color:'#F8FAFC',fontSize:14,fontWeight:'900',textAlign:'right',maxWidth:'100%'},
  more:{width:34,height:34,borderRadius:11,backgroundColor:'#172033',alignItems:'center',justifyContent:'center'},moreText:{color:'#9D8DF1',fontSize:13,fontWeight:'900',letterSpacing:1},
  close:{width:34,height:34,borderRadius:11,backgroundColor:'#172033',alignItems:'center',justifyContent:'center'},
});