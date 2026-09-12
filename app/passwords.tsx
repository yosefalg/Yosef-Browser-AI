import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { deleteVaultEntry, generateStrongPassword, listVaultEntries, lockVault, saveVaultEntry, VaultEntry } from '@/lib/passwords';
import { getSetting } from '@/lib/db';
import { getTheme, type ThemeName } from '@/lib/theme';

export default function PasswordsScreen() {
  const focused = useRef(false);
  const unlocking = useRef(false);
  const [items, setItems] = useState<VaultEntry[]>([]);
  const [origin, setOrigin] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showDraftPassword, setShowDraftPassword] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set());
  const [locked, setLocked] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [themeName, setThemeName] = useState<ThemeName>('cinematic');
  const theme = useMemo(() => getTheme(themeName), [themeName]);

  const clearSensitiveView = useCallback(() => {
    setItems([]);
    setRevealedIds(new Set());
    setShowDraftPassword(false);
    setLocked(true);
    lockVault();
  }, []);

  const unlock = useCallback(async (silent = false) => {
    if (unlocking.current) return;
    unlocking.current = true;
    setBusy(true);
    if (!silent) setMessage('');
    try {
      const entries = await listVaultEntries();
      setItems(entries);
      setRevealedIds(new Set());
      setLocked(false);
    } catch (error) {
      setLocked(true);
      setItems([]);
      if (!silent) setMessage(error instanceof Error ? error.message : 'تعذر فتح الخزنة.');
    } finally {
      unlocking.current = false;
      setBusy(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    void getSetting<ThemeName>('theme', 'cinematic').then((value) => {
      if (value === 'cinematic' || value === 'amoled' || value === 'light') setThemeName(value);
    }).catch(() => {});
    void unlock(true);
    return () => {
      focused.current = false;
      clearSensitiveView();
    };
  }, [clearSensitiveView, unlock]));

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        clearSensitiveView();
        return;
      }
      if (focused.current) void unlock(true);
    });
    return () => sub.remove();
  }, [clearSensitiveView, unlock]);

  const refreshUnlocked = async () => {
    const entries = await listVaultEntries();
    setItems(entries);
    setRevealedIds(new Set());
    setLocked(false);
  };

  const generate = async () => {
    try {
      setPassword(await generateStrongPassword(20));
      setShowDraftPassword(false);
      setMessage('تم توليد كلمة مرور قوية عشوائيًا.');
    } catch {
      setMessage('تعذر توليد كلمة مرور الآن.');
    }
  };

  const save = async () => {
    if (!origin.trim() || !username.trim() || !password) {
      Alert.alert('أكمل البيانات', 'أدخل الموقع واسم المستخدم وكلمة المرور.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await saveVaultEntry({ origin, username, password });
      setOrigin('');
      setUsername('');
      setPassword('');
      setShowDraftPassword(false);
      await refreshUnlocked();
      setMessage('تم حفظ بيانات الدخول داخل الخزنة الآمنة على الجهاز.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر حفظ بيانات الدخول.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item: VaultEntry) => {
    Alert.alert('حذف بيانات الدخول؟', `سيتم حذف بيانات ${item.origin} من هذا الجهاز.`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await deleteVaultEntry(item.id);
            await refreshUnlocked();
            setMessage('تم حذف بيانات الدخول.');
          } catch (error) {
            setMessage(error instanceof Error ? error.message : 'تعذر حذف بيانات الدخول.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const toggleReveal = (id: string) => {
    setRevealedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return <SafeAreaView edges={['top','bottom','left','right']} style={[s.root,{backgroundColor:theme.bg}]}>
    <View style={[s.header,{backgroundColor:theme.surface,borderBottomColor:theme.border}]}>
      <Pressable onPress={() => router.back()} style={({pressed})=>[s.iconButton,{backgroundColor:theme.surface2,borderColor:theme.border},pressed&&s.pressed]} accessibilityRole="button" accessibilityLabel="رجوع"><MaterialCommunityIcons name="chevron-right" size={25} color={theme.text}/></Pressable>
      <View style={s.headerCopy}><Text style={[s.title,{color:theme.text}]}>خزنة RAID</Text><Text style={[s.subtitle,{color:theme.muted}]}>كلمات المرور محفوظة محليًا ومقفلة بالبصمة</Text></View>
      <Pressable onPress={() => locked ? void unlock() : clearSensitiveView()} style={({pressed})=>[s.iconButton,{backgroundColor:theme.surface2,borderColor:theme.border},pressed&&s.pressed]} accessibilityRole="button" accessibilityLabel={locked?'فتح الخزنة':'قفل الخزنة'}><MaterialCommunityIcons name={locked?'lock-outline':'lock-open-variant-outline'} size={21} color={theme.accent}/></Pressable>
    </View>

    {locked ? <View style={s.lockedWrap}>
      <View style={[s.lockedCard,{backgroundColor:theme.surface,borderColor:theme.border}]}>
        <View style={[s.lockIcon,{backgroundColor:theme.surface2,borderColor:theme.border}]}><MaterialCommunityIcons name="shield-lock-outline" size={34} color={theme.accent}/></View>
        <Text style={[s.lockTitle,{color:theme.text}]}>الخزنة مقفلة</Text>
        <Text style={[s.lockText,{color:theme.muted}]}>يتم قفل كلمات المرور تلقائيًا عند مغادرة الشاشة أو انتقال التطبيق إلى الخلفية.</Text>
        <Pressable disabled={busy} onPress={() => void unlock()} style={({pressed})=>[s.unlockButton,{backgroundColor:theme.accent},(pressed||busy)&&s.dim]}><MaterialCommunityIcons name="fingerprint" size={21} color="#fff"/><Text style={s.unlockText}>{busy?'جارٍ التحقق…':'فتح بالبصمة أو الوجه'}</Text></Pressable>
        {!!message&&<Text style={[s.lockMessage,{color:theme.muted}]}>{message}</Text>}
      </View>
    </View> : <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={[s.hero,{backgroundColor:theme.surface,borderColor:theme.border}]}>
        <View style={[s.heroIcon,{backgroundColor:theme.surface2,borderColor:theme.border}]}><MaterialCommunityIcons name="key-chain-variant" size={27} color={theme.accent}/></View>
        <View style={s.heroCopy}><Text style={[s.heroKicker,{color:theme.accent}]}>RAID Secure Vault</Text><Text style={[s.heroTitle,{color:theme.text}]}>جلسة خزنة قصيرة وآمنة</Text><Text style={[s.heroText,{color:theme.muted}]}>بعد التحقق تبقى الخزنة مفتوحة مؤقتًا لتجنب طلب البصمة مع كل إجراء، وتُقفل فور خروج التطبيق للخلفية.</Text></View>
      </View>

      <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.border}]}>
        <Text style={[s.sectionTitle,{color:theme.text}]}>إضافة بيانات دخول</Text>
        <TextInput value={origin} onChangeText={setOrigin} autoCapitalize="none" autoCorrect={false} style={[s.input,{backgroundColor:theme.surface2,borderColor:theme.border,color:theme.text}]} placeholder="example.com" placeholderTextColor={theme.muted}/>
        <TextInput value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} style={[s.input,{backgroundColor:theme.surface2,borderColor:theme.border,color:theme.text}]} placeholder="البريد أو اسم المستخدم" placeholderTextColor={theme.muted}/>
        <View style={[s.passwordRow,{backgroundColor:theme.surface2,borderColor:theme.border}]}>
          <TextInput value={password} onChangeText={setPassword} secureTextEntry={!showDraftPassword} autoCapitalize="none" autoCorrect={false} style={[s.passwordInput,{color:theme.text}]} placeholder="كلمة المرور" placeholderTextColor={theme.muted}/>
          <Pressable onPress={()=>setShowDraftPassword(v=>!v)} style={s.revealButton}><MaterialCommunityIcons name={showDraftPassword?'eye-off-outline':'eye-outline'} size={20} color={theme.accent}/></Pressable>
        </View>
        <View style={s.actions}>
          <Pressable disabled={busy} onPress={()=>void generate()} style={({pressed})=>[s.secondary,{backgroundColor:theme.surface2,borderColor:theme.border},(pressed||busy)&&s.dim]}><MaterialCommunityIcons name="auto-fix" size={18} color={theme.accent}/><Text style={[s.secondaryText,{color:theme.text}]}>توليد قوية</Text></Pressable>
          <Pressable disabled={busy} onPress={()=>void save()} style={({pressed})=>[s.primary,{backgroundColor:theme.accent},(pressed||busy)&&s.dim]}><MaterialCommunityIcons name="content-save-lock-outline" size={18} color="#fff"/><Text style={s.primaryText}>حفظ آمن</Text></Pressable>
        </View>
      </View>

      <View style={s.sectionHead}><Text style={[s.sectionTitle,{color:theme.text}]}>العناصر المحفوظة</Text><Text style={[s.count,{color:theme.muted}]}>{items.length} عنصر</Text></View>
      {items.length===0 ? <View style={[s.empty,{backgroundColor:theme.surface,borderColor:theme.border}]}><MaterialCommunityIcons name="key-outline" size={30} color={theme.accent}/><Text style={[s.emptyTitle,{color:theme.text}]}>الخزنة فارغة</Text><Text style={[s.emptyText,{color:theme.muted}]}>أضف أول بيانات دخول وستُحفظ في SecureStore على هذا الجهاز.</Text></View> : items.map((item)=>{
        const revealed=revealedIds.has(item.id);
        return <View key={item.id} style={[s.entry,{backgroundColor:theme.surface,borderColor:theme.border}]}>
          <View style={[s.entryIcon,{backgroundColor:theme.surface2,borderColor:theme.border}]}><MaterialCommunityIcons name="web" size={20} color={theme.accent}/></View>
          <View style={s.entryBody}><Text numberOfLines={1} style={[s.site,{color:theme.text}]}>{item.origin}</Text><Text numberOfLines={1} style={[s.user,{color:theme.muted}]}>{item.username}</Text><Text numberOfLines={1} style={[s.pass,{color:revealed?theme.text:theme.muted}]}>{revealed?item.password:'••••••••••••'}</Text></View>
          <View style={s.entryActions}><Pressable onPress={()=>toggleReveal(item.id)} style={[s.smallButton,{backgroundColor:theme.surface2,borderColor:theme.border}]} accessibilityLabel={revealed?'إخفاء':'إظهار'}><MaterialCommunityIcons name={revealed?'eye-off-outline':'eye-outline'} size={18} color={theme.accent}/></Pressable><Pressable disabled={busy} onPress={()=>void remove(item)} style={[s.smallButton,{backgroundColor:theme.surface2,borderColor:theme.border}]} accessibilityLabel="حذف"><MaterialCommunityIcons name="trash-can-outline" size={18} color="#C7746D"/></Pressable></View>
        </View>;
      })}

      {!!message&&<View style={[s.message,{backgroundColor:theme.surface2,borderColor:theme.border}]}><MaterialCommunityIcons name="information-outline" size={18} color={theme.accent}/><Text style={[s.messageText,{color:theme.text}]}>{message}</Text></View>}
      <View style={[s.note,{backgroundColor:theme.surface,borderColor:theme.border}]}><MaterialCommunityIcons name="shield-check-outline" size={20} color={theme.accent}/><Text style={[s.noteText,{color:theme.muted}]}>لا تتم مزامنة كلمات المرور سحابيًا. تبقى بيانات الخزنة داخل SecureStore على الجهاز فقط.</Text></View>
    </ScrollView>}
  </SafeAreaView>;
}

const s=StyleSheet.create({
  root:{flex:1},header:{minHeight:66,flexDirection:'row-reverse',alignItems:'center',gap:10,paddingHorizontal:14,paddingVertical:7,borderBottomWidth:1},iconButton:{width:42,height:42,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},headerCopy:{flex:1,alignItems:'center'},title:{fontSize:18,fontWeight:'900'},subtitle:{fontSize:9.5,marginTop:2,textAlign:'center'},pressed:{opacity:.72,transform:[{scale:.98}]},dim:{opacity:.55},
  lockedWrap:{flex:1,alignItems:'center',justifyContent:'center',padding:22},lockedCard:{width:'100%',maxWidth:430,borderRadius:28,borderWidth:1,padding:24,alignItems:'center'},lockIcon:{width:66,height:66,borderRadius:22,borderWidth:1,alignItems:'center',justifyContent:'center'},lockTitle:{fontSize:22,fontWeight:'900',marginTop:16},lockText:{fontSize:12,lineHeight:20,textAlign:'center',marginTop:8},unlockButton:{height:50,borderRadius:16,paddingHorizontal:20,marginTop:20,flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:8,alignSelf:'stretch'},unlockText:{color:'#fff',fontWeight:'900'},lockMessage:{fontSize:11,textAlign:'center',lineHeight:18,marginTop:12},
  content:{padding:16,paddingBottom:42,gap:14},hero:{padding:17,borderRadius:24,borderWidth:1,flexDirection:'row-reverse',gap:13,alignItems:'center'},heroIcon:{width:56,height:56,borderRadius:18,borderWidth:1,alignItems:'center',justifyContent:'center'},heroCopy:{flex:1,alignItems:'flex-end'},heroKicker:{fontSize:9,fontWeight:'900',letterSpacing:.6},heroTitle:{fontSize:19,fontWeight:'900',textAlign:'right',marginTop:3},heroText:{fontSize:11,lineHeight:18,textAlign:'right',marginTop:5},card:{padding:15,borderRadius:22,borderWidth:1,gap:10},sectionTitle:{fontSize:15,fontWeight:'900',textAlign:'right'},input:{height:47,borderRadius:15,borderWidth:1,paddingHorizontal:12,textAlign:'right'},passwordRow:{height:47,borderRadius:15,borderWidth:1,flexDirection:'row-reverse',alignItems:'center',overflow:'hidden'},passwordInput:{flex:1,height:'100%',paddingHorizontal:12,textAlign:'right'},revealButton:{width:48,height:'100%',alignItems:'center',justifyContent:'center'},actions:{flexDirection:'row-reverse',gap:9,marginTop:2},primary:{flex:1,height:46,borderRadius:15,alignItems:'center',justifyContent:'center',flexDirection:'row-reverse',gap:7},primaryText:{color:'#fff',fontWeight:'900'},secondary:{flex:1,height:46,borderRadius:15,borderWidth:1,alignItems:'center',justifyContent:'center',flexDirection:'row-reverse',gap:7},secondaryText:{fontWeight:'900'},sectionHead:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',paddingHorizontal:2},count:{fontSize:10,fontWeight:'800'},entry:{minHeight:92,borderRadius:20,borderWidth:1,padding:11,flexDirection:'row-reverse',alignItems:'center',gap:11},entryIcon:{width:44,height:44,borderRadius:15,borderWidth:1,alignItems:'center',justifyContent:'center'},entryBody:{flex:1,minWidth:0,alignItems:'flex-end'},site:{fontSize:14,fontWeight:'900',textAlign:'right'},user:{fontSize:10.5,marginTop:3,textAlign:'right'},pass:{fontSize:11,fontFamily:'monospace',marginTop:6,textAlign:'right'},entryActions:{gap:7},smallButton:{width:38,height:38,borderRadius:12,borderWidth:1,alignItems:'center',justifyContent:'center'},empty:{minHeight:150,borderRadius:22,borderWidth:1,alignItems:'center',justifyContent:'center',padding:22,gap:7},emptyTitle:{fontSize:15,fontWeight:'900'},emptyText:{fontSize:11,lineHeight:18,textAlign:'center'},message:{borderRadius:18,borderWidth:1,padding:12,flexDirection:'row-reverse',alignItems:'center',gap:8},messageText:{flex:1,textAlign:'right',fontSize:11,lineHeight:18},note:{borderRadius:18,borderWidth:1,padding:13,flexDirection:'row-reverse',alignItems:'flex-start',gap:9},noteText:{flex:1,fontSize:10.5,lineHeight:18,textAlign:'right'}
});