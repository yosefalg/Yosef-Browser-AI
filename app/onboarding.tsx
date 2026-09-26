import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
  const [finishError, setFinishError] = useState('');
  const { height } = useWindowDimensions();
  const compactHeight = height < 700;
  const step = useMemo(() => STEPS[index], [index]);
  const last = index === STEPS.length - 1;
  const first = index === 0;

  const finish = async () => {
    if (finishing) return;
    setFinishing(true);
    setFinishError('');
    try {
      await completeOnboarding();
      router.replace('/');
    } catch {
      setFinishError('تعذر حفظ إعداد البداية. بقيت بياناتك كما هي؛ تحقق من مساحة الجهاز ثم حاول مجددًا.');
    } finally {
      setFinishing(false);
    }
  };

  const next = () => {
    if (last) {
      void finish();
      return;
    }
    setFinishError('');
    setIndex((value) => Math.min(value + 1, STEPS.length - 1));
  };

  const previous = () => {
    if (finishing || first) return;
    setFinishError('');
    setIndex((value) => Math.max(value - 1, 0));
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom', 'left', 'right']}>
      <View style={s.topRow}>
        <Text style={s.brand} maxFontSizeMultiplier={1.25}>RAID Browser</Text>
        <Pressable disabled={finishing} onPress={() => void finish()} style={({ pressed }) => [s.skip, pressed && s.pressed, finishing && s.disabled]} accessibilityRole="button" accessibilityLabel="تخطي المقدمة" accessibilityState={{ disabled: finishing }}>
          <Text style={s.skipText} maxFontSizeMultiplier={1.35}>تخطي</Text>
        </Pressable>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={[s.content, compactHeight && s.contentCompact]} showsVerticalScrollIndicator={false} bounces={false}>
        <View style={[s.iconWrap, compactHeight && s.iconWrapCompact]} accessible accessibilityLabel={`${step.eyebrow}: ${step.title}`}>
          <Ionicons name={step.icon} size={compactHeight ? 36 : 42} color="#D5AA88" />
        </View>
        <Text style={s.eyebrow} maxFontSizeMultiplier={1.35}>{step.eyebrow}</Text>
        <Text style={[s.title, compactHeight && s.titleCompact]} maxFontSizeMultiplier={1.35}>{step.title}</Text>
        <Text style={s.body} maxFontSizeMultiplier={1.45}>{step.body}</Text>

        <View style={s.bullets}>
          {step.bullets.map((item) => (
            <View key={item} style={s.bulletRow} accessible accessibilityLabel={item}>
              <Ionicons name="checkmark-circle" size={19} color="#83B58D" />
              <Text style={s.bulletText} maxFontSizeMultiplier={1.45}>{item}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={s.footer}>
        {!!finishError && <Text style={s.error} accessibilityRole="alert" accessibilityLiveRegion="assertive" maxFontSizeMultiplier={1.45}>{finishError}</Text>}
        <Text style={s.progressText} accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.35}>{`الخطوة ${index + 1} من ${STEPS.length}`}</Text>
        <View style={s.dots} accessible accessibilityLabel={`الخطوة ${index + 1} من ${STEPS.length}`}>
          {STEPS.map((_, itemIndex) => <View key={itemIndex} style={[s.dot, itemIndex === index && s.dotActive]} />)}
        </View>
        <View style={s.actions}>
          <Pressable disabled={first || finishing} onPress={previous} style={({ pressed }) => [s.back, pressed && s.pressed, (first || finishing) && s.disabled]} accessibilityRole="button" accessibilityLabel="الخطوة السابقة" accessibilityState={{ disabled: first || finishing }}>
            <Ionicons name="chevron-forward" size={20} color="#E9E3DC" />
            <Text style={s.backText} maxFontSizeMultiplier={1.35}>السابق</Text>
          </Pressable>
          <Pressable disabled={finishing} onPress={next} style={({ pressed }) => [s.next, pressed && s.nextPressed, finishing && s.disabled]} accessibilityRole="button" accessibilityLabel={last ? 'بدء استخدام RAID' : 'التالي'} accessibilityState={{ disabled: finishing, busy: finishing }}>
            <Text style={s.nextText} maxFontSizeMultiplier={1.35}>{finishing ? 'جارٍ التجهيز…' : last ? 'ابدأ استخدام RAID' : 'التالي'}</Text>
            {!finishing && <Ionicons name="chevron-back" size={20} color="#fff" />}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:'#161A18',paddingHorizontal:22},
  topRow:{minHeight:64,flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:12},
  brand:{color:'#F7F2EC',fontSize:18,fontWeight:'900'},
  skip:{minWidth:68,minHeight:44,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#292E2B',borderWidth:1,borderColor:'#3F4541',paddingHorizontal:12},
  skipText:{color:'#C8C1B9',fontSize:12,fontWeight:'800'},
  scroll:{flex:1},
  content:{flexGrow:1,justifyContent:'center',alignItems:'stretch',paddingVertical:24},
  contentCompact:{justifyContent:'flex-start',paddingTop:14,paddingBottom:18},
  iconWrap:{width:78,height:78,borderRadius:26,alignSelf:'center',alignItems:'center',justifyContent:'center',backgroundColor:'#292E2B',borderWidth:1,borderColor:'#4A504B',marginBottom:22},
  iconWrapCompact:{width:66,height:66,borderRadius:22,marginBottom:16},
  eyebrow:{color:'#D5AA88',fontSize:12,fontWeight:'900',textAlign:'center',marginBottom:8},
  title:{color:'#FFF8F1',fontSize:29,lineHeight:39,fontWeight:'900',textAlign:'center'},
  titleCompact:{fontSize:25,lineHeight:34},
  body:{color:'#C8C1B9',fontSize:14,lineHeight:23,textAlign:'center',marginTop:14},
  bullets:{marginTop:24,gap:12},
  bulletRow:{minHeight:48,flexDirection:'row-reverse',alignItems:'center',gap:11,paddingHorizontal:14,paddingVertical:10,borderRadius:16,backgroundColor:'#222725',borderWidth:1,borderColor:'#383E3A'},
  bulletText:{flex:1,color:'#E9E3DC',fontSize:13,lineHeight:20,textAlign:'right',fontWeight:'700'},
  footer:{paddingTop:10,paddingBottom:8,gap:10},
  error:{color:'#F2B8AE',fontSize:11,lineHeight:18,textAlign:'center',fontWeight:'800',paddingHorizontal:8},
  progressText:{color:'#9FA8A2',fontSize:11,fontWeight:'800',textAlign:'center'},
  dots:{height:18,flexDirection:'row',justifyContent:'center',alignItems:'center',gap:7},
  dot:{width:7,height:7,borderRadius:4,backgroundColor:'#4B514D'},
  dotActive:{width:25,backgroundColor:'#D5AA88'},
  actions:{flexDirection:'row-reverse',gap:10},
  back:{minWidth:96,height:54,borderRadius:18,flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:5,backgroundColor:'#292E2B',borderWidth:1,borderColor:'#3F4541',paddingHorizontal:14},
  backText:{color:'#E9E3DC',fontSize:14,fontWeight:'900'},
  next:{flex:1,minHeight:54,borderRadius:18,flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:'#A9785C',paddingHorizontal:16},
  nextPressed:{transform:[{scale:.985}],opacity:.92},
  nextText:{color:'#fff',fontSize:15,fontWeight:'900'},
  pressed:{opacity:.72},
  disabled:{opacity:.42},
});
