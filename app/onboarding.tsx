import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { completeOnboarding } from '@/lib/onboarding';

type Step = {
  icon: keyof typeof Ionicons.glyphMap;
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
};

const STEPS: Step[] = [
  {
    icon: 'shield-checkmark-outline',
    eyebrow: 'خصوصية وأمان',
    title: 'تصفح واضح بدون ادعاءات وهمية',
    body: 'RAID يركز على ما يستطيع المتصفح التحكم به فعليًا: أمان الروابط، إعدادات المواقع، الوضع الخاص واستقرار WebView.',
    bullets: ['الوضع الخاص لا يحفظ السجل أو سياق AI', 'إعدادات HTTPS والموقع تبقى تحت سيطرتك', 'استعادة محرك العرض عند انهياره على Android'],
  },
  {
    icon: 'speedometer-outline',
    eyebrow: 'Performance',
    title: 'اضبط RAID حسب نوع التصفح',
    body: 'مركز الأداء يغيّر سلوك RAID نفسه بدل الادعاء برفع سرعة مزود الإنترنت.',
    bullets: ['Boost للصفحة الحالية والعمل الخلفي الأقل', 'Video للاستقرار أثناء المشاهدة', 'Reading وLow Data للاستخدام الأخف'],
  },
  {
    icon: 'download-outline',
    eyebrow: 'تنزيلات وقراءة',
    title: 'أدواتك الأساسية داخل المتصفح',
    body: 'التنزيلات الداخلية ووضع القراءة وMedia Player والتبويبات كلها متاحة من نفس تجربة RAID.',
    bullets: ['مدير تنزيلات داخلي مع الحالات والتقدم', 'Reader Mode للنصوص الطويلة', 'إدارة تبويبات واستعادة المغلق مؤخرًا'],
  },
];

export default function OnboardingScreen() {
  const [index, setIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const step = useMemo(() => STEPS[index], [index]);
  const last = index === STEPS.length - 1;

  const finish = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      await completeOnboarding();
      router.replace('/');
    } finally {
      setFinishing(false);
    }
  };

  const next = () => {
    if (last) {
      void finish();
      return;
    }
    setIndex((value) => Math.min(value + 1, STEPS.length - 1));
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom', 'left', 'right']}>
      <View style={s.topRow}>
        <Text style={s.brand}>RAID Browser</Text>
        <Pressable disabled={finishing} onPress={() => void finish()} style={({ pressed }) => [s.skip, pressed && s.pressed, finishing && s.disabled]} accessibilityRole="button" accessibilityLabel="تخطي المقدمة">
          <Text style={s.skipText}>تخطي</Text>
        </Pressable>
      </View>

      <View style={s.content}>
        <View style={s.iconWrap}><Ionicons name={step.icon} size={42} color="#D5AA88" /></View>
        <Text style={s.eyebrow}>{step.eyebrow}</Text>
        <Text style={s.title}>{step.title}</Text>
        <Text style={s.body}>{step.body}</Text>

        <View style={s.bullets}>
          {step.bullets.map((item) => (
            <View key={item} style={s.bulletRow}>
              <Ionicons name="checkmark-circle" size={19} color="#83B58D" />
              <Text style={s.bulletText}>{item}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={s.footer}>
        <View style={s.dots} accessibilityLabel={`الخطوة ${index + 1} من ${STEPS.length}`}>
          {STEPS.map((_, itemIndex) => <View key={itemIndex} style={[s.dot, itemIndex === index && s.dotActive]} />)}
        </View>
        <Pressable disabled={finishing} onPress={next} style={({ pressed }) => [s.next, pressed && s.nextPressed, finishing && s.disabled]} accessibilityRole="button" accessibilityLabel={last ? 'بدء استخدام RAID' : 'التالي'}>
          <Text style={s.nextText}>{finishing ? 'جارٍ التجهيز…' : last ? 'ابدأ استخدام RAID' : 'التالي'}</Text>
          {!finishing && <Ionicons name="chevron-back" size={20} color="#fff" />}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:'#161A18',paddingHorizontal:22},
  topRow:{height:64,flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'},
  brand:{color:'#F7F2EC',fontSize:18,fontWeight:'900'},
  skip:{minWidth:68,height:38,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#292E2B',borderWidth:1,borderColor:'#3F4541'},
  skipText:{color:'#C8C1B9',fontSize:12,fontWeight:'800'},
  content:{flex:1,justifyContent:'center',alignItems:'stretch',paddingBottom:24},
  iconWrap:{width:78,height:78,borderRadius:26,alignSelf:'center',alignItems:'center',justifyContent:'center',backgroundColor:'#292E2B',borderWidth:1,borderColor:'#4A504B',marginBottom:22},
  eyebrow:{color:'#D5AA88',fontSize:12,fontWeight:'900',textAlign:'center',marginBottom:8},
  title:{color:'#FFF8F1',fontSize:29,lineHeight:39,fontWeight:'900',textAlign:'center'},
  body:{color:'#C8C1B9',fontSize:14,lineHeight:23,textAlign:'center',marginTop:14},
  bullets:{marginTop:28,gap:12},
  bulletRow:{minHeight:48,flexDirection:'row-reverse',alignItems:'center',gap:11,paddingHorizontal:14,paddingVertical:10,borderRadius:16,backgroundColor:'#222725',borderWidth:1,borderColor:'#383E3A'},
  bulletText:{flex:1,color:'#E9E3DC',fontSize:13,lineHeight:20,textAlign:'right',fontWeight:'700'},
  footer:{paddingBottom:8,gap:18},
  dots:{height:18,flexDirection:'row',justifyContent:'center',alignItems:'center',gap:7},
  dot:{width:7,height:7,borderRadius:4,backgroundColor:'#4B514D'},
  dotActive:{width:25,backgroundColor:'#D5AA88'},
  next:{height:54,borderRadius:18,flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:'#A9785C'},
  nextPressed:{transform:[{scale:.985}],opacity:.92},
  nextText:{color:'#fff',fontSize:15,fontWeight:'900'},
  pressed:{opacity:.72},disabled:{opacity:.5},
});
