import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { saveLocalWireGuardConfig } from '@/lib/vpn-import';

type Provider = { name:string; note:string; url:string; badge:string };
const providers: Provider[] = [
  { name:'Proton VPN', note:'خيار مجاني قوي ويدعم WireGuard.', url:'https://account.protonvpn.com/downloads', badge:'P' },
  { name:'Windscribe', note:'خطة مجانية ومزود بديل جيد عند الحاجة.', url:'https://windscribe.com/', badge:'W' },
  { name:'hide.me', note:'خطة مجانية ويمكن استخدامه كمصدر بديل.', url:'https://hide.me/', badge:'H' },
  { name:'PrivadoVPN', note:'خيار مجاني إضافي مع حصة استخدام شهرية.', url:'https://privadovpn.com/', badge:'V' },
];

export default function VpnProviderScreen() {
  const [config, setConfig] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const openProvider = (url: string) => void Linking.openURL(url).catch(() => setMessage('تعذر فتح صفحة المزود.'));

  const save = async () => {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      await saveLocalWireGuardConfig(config);
      setMessage('تم التحقق من إعداد WireGuard وحفظه بأمان على هذا الجهاز.');
      setTimeout(() => router.replace('/vpn'), 450);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر حفظ إعداد VPN.');
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView edges={['top','bottom','left','right']} style={s.root}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.back} accessibilityRole="button" accessibilityLabel="رجوع"><Text style={s.backText}>‹</Text></Pressable>
        <View style={s.headCopy}><Text style={s.title}>مزودات VPN</Text><Text style={s.sub}>خيارات مجانية + WireGuard مخصص</Text></View>
        <View style={s.badge}><Text style={s.badgeText}>WG</Text></View>
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={s.hero}>
          <Text style={s.kicker}>RAID MULTI-PROVIDER</Text>
          <Text style={s.heroTitle}>لا تعتمد على مزود واحد</Text>
          <Text style={s.heroText}>اختر مزودًا مناسبًا، ثم استخدم إعداد WireGuard قياسيًا عندما يكون المزود يتيحه لحسابك. المفتاح الخاص يبقى داخل SecureStore على هاتفك ولا يُرفع إلى قاعدة البيانات.</Text>
        </View>

        <Text style={s.section}>مزودات مقترحة</Text>
        {providers.map((provider) => (
          <Pressable key={provider.name} onPress={() => openProvider(provider.url)} style={({pressed})=>[s.provider,pressed&&s.pressed]}>
            <View style={s.providerBadge}><Text style={s.providerBadgeText}>{provider.badge}</Text></View>
            <View style={s.providerCopy}><Text style={s.providerTitle}>{provider.name}</Text><Text style={s.providerText}>{provider.note}</Text></View>
            <Text style={s.providerArrow}>↗</Text>
          </Pressable>
        ))}

        <View style={s.card}>
          <Text style={s.label}>إعداد WireGuard المخصص</Text>
          <Text style={s.hint}>ألصق ملف .conf كاملًا. RAID يتحقق من PrivateKey وPeer وEndpoint وAllowedIPs قبل الحفظ.</Text>
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
            accessibilityLabel="إعداد WireGuard"
          />
          <Pressable onPress={save} disabled={busy || !config.trim()} style={[s.primary,(busy || !config.trim()) && s.disabled]} accessibilityRole="button">
            <Text style={s.primaryText}>{busy ? 'جارٍ التحقق والحفظ…' : 'حفظ وربط الإعداد'}</Text>
          </Pressable>
          {!!message && <Text style={s.message}>{message}</Text>}
        </View>

        <View style={s.note}>
          <Text style={s.noteTitle}>تنبيه مهم</Text>
          <Text style={s.noteText}>RAID لا ينشئ حسابًا تلقائيًا لدى هذه الشركات ولا يتجاوز شروطها. الروابط تفتح المواقع الرسمية فقط، والاتصال داخل RAID يتم عندما يكون لديك إعداد WireGuard صالح من المزود.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:'#070B14'},
  header:{minHeight:62,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:14,paddingVertical:5,borderBottomWidth:1,borderBottomColor:'#1D2939'},
  back:{width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:'#111827',borderWidth:1,borderColor:'#25334A'},backText:{fontSize:30,color:'#fff',marginTop:-3},
  headCopy:{flex:1,alignItems:'flex-end'},title:{color:'#fff',fontSize:18,fontWeight:'900'},sub:{color:'#8FA0B7',fontSize:10,marginTop:1},badge:{width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:'#2563EB'},badgeText:{color:'#fff',fontWeight:'900'},
  content:{padding:16,paddingBottom:40,gap:11},hero:{padding:19,borderRadius:23,backgroundColor:'#0D1628',borderWidth:1,borderColor:'#263653'},kicker:{color:'#60A5FA',fontSize:10,fontWeight:'900',letterSpacing:1.1,textAlign:'right'},heroTitle:{color:'#fff',fontSize:22,fontWeight:'900',textAlign:'right',marginTop:5},heroText:{color:'#9AA8BC',lineHeight:20,textAlign:'right',marginTop:7,fontSize:12},
  section:{color:'#A78BFA',fontWeight:'900',textAlign:'right',marginTop:2},provider:{minHeight:70,borderRadius:18,padding:12,backgroundColor:'#111827',borderWidth:1,borderColor:'#2B3952',flexDirection:'row-reverse',alignItems:'center',gap:10},pressed:{opacity:.72,transform:[{scale:.995}]},providerBadge:{width:38,height:38,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#172554'},providerBadgeText:{color:'#BFDBFE',fontWeight:'900',fontSize:16},providerCopy:{flex:1,alignItems:'flex-end'},providerTitle:{color:'#fff',fontWeight:'900',fontSize:15},providerText:{color:'#8FA0B7',fontSize:10,lineHeight:16,textAlign:'right',marginTop:3},providerArrow:{color:'#93C5FD',fontSize:22},
  card:{padding:15,borderRadius:22,backgroundColor:'#111827',borderWidth:1,borderColor:'#27324A',gap:10,marginTop:3},label:{color:'#fff',fontWeight:'900',textAlign:'right'},hint:{color:'#7E8DA3',fontSize:11,lineHeight:18,textAlign:'right'},input:{minHeight:210,maxHeight:340,borderRadius:16,backgroundColor:'#0B1220',borderWidth:1,borderColor:'#263653',padding:14,color:'#E5E7EB',fontSize:12,lineHeight:19,textAlignVertical:'top'},primary:{height:48,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:'#2563EB'},primaryText:{color:'#fff',fontWeight:'900'},disabled:{opacity:.42},message:{color:'#C7D2FE',textAlign:'center',lineHeight:20},
  note:{padding:15,borderRadius:19,backgroundColor:'#0B1220',borderWidth:1,borderColor:'#1F2B3D'},noteTitle:{color:'#C4B5FD',fontWeight:'900',textAlign:'right'},noteText:{marginTop:5,color:'#8492A6',lineHeight:19,textAlign:'right',fontSize:11}
});