import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { saveLocalWireGuardConfig } from '@/lib/vpn-import';

export default function VpnProviderScreen() {
  const [config, setConfig] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const openProton = () => void Linking.openURL('https://account.protonvpn.com/downloads');

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await saveLocalWireGuardConfig(config);
      setMessage('تم حفظ إعداد WireGuard بأمان على هذا الجهاز.');
      setTimeout(() => router.replace('/vpn'), 450);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر حفظ إعداد VPN.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={['top','bottom','left','right']} style={s.root}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.back}><Text style={s.backText}>‹</Text></Pressable>
        <View style={s.headCopy}><Text style={s.title}>مزود VPN بديل</Text><Text style={s.sub}>WireGuard حقيقي • محفوظ محليًا</Text></View>
        <View style={s.badge}><Text style={s.badgeText}>WG</Text></View>
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={s.hero}>
          <Text style={s.kicker}>RAID VPN PROVIDER</Text>
          <Text style={s.heroTitle}>لا تبقَ عالقًا على خادم واحد</Text>
          <Text style={s.heroText}>يمكنك ربط أي إعداد WireGuard قياسي من مزود موثوق. يبقى المفتاح الخاص داخل SecureStore على هاتفك ولا يتم رفعه إلى قاعدة البيانات.</Text>
        </View>

        <Pressable onPress={openProton} style={s.provider}>
          <View style={s.providerCopy}><Text style={s.providerTitle}>Proton VPN</Text><Text style={s.providerText}>افتح صفحة الحساب وأنشئ WireGuard config، ثم انسخ محتواه هنا.</Text></View>
          <Text style={s.providerArrow}>↗</Text>
        </Pressable>

        <View style={s.card}>
          <Text style={s.label}>إعداد WireGuard</Text>
          <Text style={s.hint}>يجب أن يبدأ بـ [Interface] ويحتوي [Peer] وEndpoint وAllowedIPs.</Text>
          <TextInput
            value={config}
            onChangeText={setConfig}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            textAlign="left"
            placeholder={'[Interface]\nPrivateKey = ...\nAddress = ...\n\n[Peer]\nPublicKey = ...\nEndpoint = ...\nAllowedIPs = 0.0.0.0/0'}
            placeholderTextColor="#536174"
            style={s.input}
          />
          <Pressable onPress={save} disabled={busy || !config.trim()} style={[s.primary,(busy || !config.trim()) && s.disabled]}>
            <Text style={s.primaryText}>{busy ? 'جارٍ التحقق والحفظ…' : 'حفظ وربط المزود'}</Text>
          </Pressable>
          {!!message && <Text style={s.message}>{message}</Text>}
        </View>

        <View style={s.note}>
          <Text style={s.noteTitle}>مهم</Text>
          <Text style={s.noteText}>هذا ليس VPN وهميًا: RAID يستخدم نفس وحدة WireGuard الأصلية الموجودة في التطبيق. هذه الشاشة فقط توفر مصدر إعداد بديل عندما لا يكون خادم RAID المركزي جاهزًا.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:'#070B14'},
  header:{minHeight:68,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:'#1D2939'},
  back:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#111827',borderWidth:1,borderColor:'#25334A'},backText:{fontSize:30,color:'#fff',marginTop:-3},
  headCopy:{flex:1,alignItems:'flex-end'},title:{color:'#fff',fontSize:19,fontWeight:'900'},sub:{color:'#8FA0B7',fontSize:11,marginTop:2},badge:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#2563EB'},badgeText:{color:'#fff',fontWeight:'900'},
  content:{padding:16,paddingBottom:40,gap:14},hero:{padding:20,borderRadius:24,backgroundColor:'#0D1628',borderWidth:1,borderColor:'#263653'},kicker:{color:'#60A5FA',fontSize:10,fontWeight:'900',letterSpacing:1.2,textAlign:'right'},heroTitle:{color:'#fff',fontSize:23,fontWeight:'900',textAlign:'right',marginTop:6},heroText:{color:'#9AA8BC',lineHeight:21,textAlign:'right',marginTop:8},
  provider:{minHeight:76,borderRadius:20,padding:15,backgroundColor:'#111827',borderWidth:1,borderColor:'#2B3952',flexDirection:'row-reverse',alignItems:'center',gap:12},providerCopy:{flex:1,alignItems:'flex-end'},providerTitle:{color:'#fff',fontWeight:'900',fontSize:16},providerText:{color:'#8FA0B7',fontSize:11,lineHeight:18,textAlign:'right',marginTop:4},providerArrow:{color:'#93C5FD',fontSize:24},
  card:{padding:15,borderRadius:22,backgroundColor:'#111827',borderWidth:1,borderColor:'#27324A',gap:10},label:{color:'#fff',fontWeight:'900',textAlign:'right'},hint:{color:'#7E8DA3',fontSize:11,lineHeight:18,textAlign:'right'},input:{minHeight:240,maxHeight:360,borderRadius:16,backgroundColor:'#0B1220',borderWidth:1,borderColor:'#263653',padding:14,color:'#E5E7EB',fontSize:12,lineHeight:19,textAlignVertical:'top'},primary:{height:50,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:'#2563EB'},primaryText:{color:'#fff',fontWeight:'900'},disabled:{opacity:.42},message:{color:'#C7D2FE',textAlign:'center',lineHeight:20},
  note:{padding:16,borderRadius:20,backgroundColor:'#0B1220',borderWidth:1,borderColor:'#1F2B3D'},noteTitle:{color:'#C4B5FD',fontWeight:'900',textAlign:'right'},noteText:{marginTop:5,color:'#8492A6',lineHeight:20,textAlign:'right',fontSize:12}
});
