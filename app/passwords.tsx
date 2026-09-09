import { useEffect, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { deleteVaultEntry, generateStrongPassword, listVaultEntries, saveVaultEntry, VaultEntry } from '@/lib/passwords';

export default function PasswordsScreen() {
  const [items, setItems] = useState<VaultEntry[]>([]);
  const [origin, setOrigin] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showDraftPassword, setShowDraftPassword] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set());

  const load = async () => {
    try {
      setItems(await listVaultEntries());
      setRevealedIds(new Set());
    } catch (e) {
      Alert.alert('مدير كلمات المرور', e instanceof Error ? e.message : 'تعذر فتح الخزنة');
    }
  };

  useEffect(() => { load().catch(() => {}); }, []);

  const generate = async () => {
    setPassword(await generateStrongPassword(20));
    setShowDraftPassword(false);
  };

  const save = async () => {
    if (!origin.trim() || !username.trim() || !password) {
      return Alert.alert('أكمل البيانات', 'أدخل الموقع واسم المستخدم وكلمة المرور.');
    }
    try {
      await saveVaultEntry({ origin: origin.trim(), username: username.trim(), password });
      setOrigin('');
      setUsername('');
      setPassword('');
      setShowDraftPassword(false);
      await load();
    } catch (e) {
      Alert.alert('تعذر الحفظ', e instanceof Error ? e.message : 'خطأ غير معروف');
    }
  };

  const toggleReveal = (id: string) => {
    setRevealedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return <SafeAreaView style={s.root}>
    <View style={s.head}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="رجوع"><Text style={s.back}>‹</Text></Pressable>
      <Text style={s.title}>Password Manager</Text>
      <View style={{width:30}} />
    </View>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.card}>
        <Text style={s.label}>الموقع</Text>
        <TextInput value={origin} onChangeText={setOrigin} autoCapitalize="none" style={s.input} placeholder="example.com" placeholderTextColor="#64748B" />
        <Text style={s.label}>اسم المستخدم / البريد</Text>
        <TextInput value={username} onChangeText={setUsername} autoCapitalize="none" style={s.input} placeholder="user@example.com" placeholderTextColor="#64748B" />
        <Text style={s.label}>كلمة المرور</Text>
        <View style={s.passwordInputRow}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            style={s.passwordInput}
            secureTextEntry={!showDraftPassword}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="••••••••"
            placeholderTextColor="#64748B"
            accessibilityLabel="كلمة المرور"
          />
          <Pressable
            onPress={() => setShowDraftPassword((value) => !value)}
            style={s.revealButton}
            accessibilityRole="button"
            accessibilityLabel={showDraftPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
          >
            <Text style={s.revealText}>{showDraftPassword ? 'إخفاء' : 'إظهار'}</Text>
          </Pressable>
        </View>
        <View style={s.actions}>
          <Pressable onPress={generate} style={s.secondary}><Text style={s.secondaryText}>توليد قوية</Text></Pressable>
          <Pressable onPress={save} style={s.primary}><Text style={s.primaryText}>حفظ بالبصمة</Text></Pressable>
        </View>
      </View>

      <Text style={s.section}>العناصر المحفوظة</Text>
      {items.map((item) => {
        const revealed = revealedIds.has(item.id);
        return <View key={item.id} style={s.row}>
          <View style={s.entryBody}>
            <Text style={s.site}>{item.origin}</Text>
            <Text style={s.user}>{item.username}</Text>
            <View style={s.savedPasswordRow}>
              <Text style={s.pass} numberOfLines={1}>{revealed ? item.password : '••••••••••••'}</Text>
              <Pressable
                onPress={() => toggleReveal(item.id)}
                style={s.smallReveal}
                accessibilityRole="button"
                accessibilityLabel={revealed ? 'إخفاء كلمة المرور المحفوظة' : 'إظهار كلمة المرور المحفوظة'}
              >
                <Text style={s.smallRevealText}>{revealed ? 'إخفاء' : 'إظهار'}</Text>
              </Pressable>
            </View>
          </View>
          <Pressable
            onPress={async () => {
              try {
                await deleteVaultEntry(item.id);
                await load();
              } catch (e) {
                Alert.alert('تعذر الحذف', e instanceof Error ? e.message : 'تعذر حذف كلمة المرور.');
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={`حذف كلمة مرور ${item.origin}`}
          >
            <Text style={s.delete}>حذف</Text>
          </Pressable>
        </View>;
      })}
      {!items.length && <Text style={s.empty}>لا توجد كلمات مرور محفوظة.</Text>}
      <Text style={s.note}>تُحفظ البيانات داخل SecureStore على الجهاز، ولا تتم مزامنتها سحابياً إلا بعد إضافة مزامنة Supabase صريحة.</Text>
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:'#070B14'},
  head:{height:58,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:'#1E293B'},
  back:{fontSize:34,color:'#fff'},
  title:{fontSize:18,fontWeight:'900',color:'#fff'},
  content:{padding:16,gap:12},
  card:{padding:16,borderRadius:20,backgroundColor:'#111827',borderWidth:1,borderColor:'#27324A',gap:8},
  label:{color:'#CBD5E1',fontWeight:'800',textAlign:'right'},
  input:{height:46,borderRadius:14,backgroundColor:'#0B1220',color:'#fff',paddingHorizontal:12,borderWidth:1,borderColor:'#1E293B'},
  passwordInputRow:{height:46,borderRadius:14,backgroundColor:'#0B1220',borderWidth:1,borderColor:'#1E293B',flexDirection:'row',alignItems:'center',overflow:'hidden'},
  passwordInput:{flex:1,height:'100%',color:'#fff',paddingHorizontal:12},
  revealButton:{height:'100%',minWidth:66,alignItems:'center',justifyContent:'center',paddingHorizontal:10,borderLeftWidth:1,borderLeftColor:'#1E293B'},
  revealText:{color:'#C4B5FD',fontSize:12,fontWeight:'900'},
  actions:{flexDirection:'row',gap:8,marginTop:6},
  primary:{flex:1,height:44,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#7C3AED'},
  primaryText:{color:'#fff',fontWeight:'900'},
  secondary:{flex:1,height:44,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#1E293B'},
  secondaryText:{color:'#E2E8F0',fontWeight:'800'},
  section:{color:'#A78BFA',fontWeight:'900',textAlign:'right'},
  row:{flexDirection:'row',alignItems:'center',gap:12,padding:14,borderRadius:18,backgroundColor:'#111827',borderWidth:1,borderColor:'#27324A'},
  entryBody:{flex:1,minWidth:0},
  site:{color:'#fff',fontWeight:'900'},
  user:{color:'#94A3B8',marginTop:4},
  savedPasswordRow:{flexDirection:'row',alignItems:'center',gap:8,marginTop:5},
  pass:{flex:1,color:'#CBD5E1',fontFamily:'monospace'},
  smallReveal:{paddingHorizontal:9,height:30,borderRadius:10,backgroundColor:'#172033',alignItems:'center',justifyContent:'center'},
  smallRevealText:{color:'#C4B5FD',fontSize:11,fontWeight:'900'},
  delete:{color:'#FCA5A5',fontWeight:'900'},
  empty:{color:'#64748B',textAlign:'center',paddingVertical:16},
  note:{color:'#94A3B8',lineHeight:20,textAlign:'right'}
});
