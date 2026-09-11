import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { AgentMessage, askAgent } from '@/lib/ai';
import { executeLocalAgentCommand } from '@/lib/agent';
import { getLatestPageContext, getMemories } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

export default function AIScreen() {
  const params = useLocalSearchParams<{ prompt?: string; url?: string; title?: string }>();
  const [messages, setMessages] = useState<AgentMessage[]>([{ role: 'assistant', content: 'مرحباً، أنا RAID AI. اسألني عن الصفحة الحالية أو اطلب تلخيصًا، شرحًا أو مقارنة.' }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [lastFailedText, setLastFailedText] = useState('');
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const lastAutoPrompt = useRef('');
  const listRef = useRef<FlatList<AgentMessage>>(null);

  const refreshAccountState = useCallback(async () => {
    try { setSignedIn(Boolean(await getCurrentSession())); }
    catch { setSignedIn(false); }
  }, []);

  useFocusEffect(useCallback(() => { void refreshAccountState(); return () => {}; }, [refreshAccountState]));

  useEffect(() => {
    const id = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 40);
    return () => clearTimeout(id);
  }, [messages.length, busy]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => {
      setKeyboardOpen(true);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 70);
    });
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const sendValue = async (raw: string) => {
    const value = raw.trim();
    if (!value || busy) return;
    const next = [...messages, { role:'user', content:value } as AgentMessage];
    setMessages(next); setText(''); setLastFailedText(''); setBusy(true);
    try {
      const session = await getCurrentSession();
      if (!session) {
        setSignedIn(false); setLastFailedText(value);
        setMessages([...next, { role:'assistant', content:'سجّل الدخول مرة واحدة حتى يعمل RAID AI على حسابك.' }]);
        return;
      }
      setSignedIn(true);

      const local = await executeLocalAgentCommand(value);
      if (local.handled) {
        setMessages([...next, { role:'assistant', content:local.message || 'تم التنفيذ.' }]);
        return;
      }

      const [page, memories] = await Promise.all([
        getLatestPageContext().catch(() => null),
        getMemories(6).catch(() => []),
      ]);
      const memoryText = memories.length
        ? `ذاكرة محلية مفيدة:\n${memories.map((m) => `- ${m.kind}: ${m.value}`).join('\n')}`.slice(0, 1500)
        : '';
      const pageText = page
        ? `${memoryText ? `${memoryText}\n\n` : ''}الصفحة الحالية: ${page.title}\nالرابط: ${page.url}\n\n${page.text.slice(0, 6500)}`
        : memoryText || undefined;

      const aiMessages = local.aiPrompt
        ? [...messages.slice(-8), { role: 'user', content: local.aiPrompt } as AgentMessage]
        : next.slice(-9);
      const answer = await askAgent(aiMessages, pageText);
      setMessages([...next, { role:'assistant', content:answer }]);
    } catch (error) {
      setLastFailedText(value);
      setMessages([...next, { role:'assistant', content:error instanceof Error ? error.message : 'تعذر تشغيل RAID AI الآن.' }]);
      void refreshAccountState();
    } finally { setBusy(false); }
  };

  const send = () => void sendValue(text);

  useEffect(() => {
    const prompt = typeof params.prompt === 'string' ? params.prompt.trim() : '';
    if (!prompt || lastAutoPrompt.current === prompt) return;
    lastAutoPrompt.current = prompt;
    const id = setTimeout(() => void sendValue(prompt), 0);
    return () => clearTimeout(id);
  }, [params.prompt]);

  return (
    <SafeAreaView edges={['top','bottom','left','right']} style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={()=>router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="رجوع"><Text style={styles.back}>‹</Text></Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>RAID AI</Text>
          <Text style={[styles.accountState, signedIn === false && styles.accountOff]}>{signedIn === null ? 'جارٍ التحقق…' : signedIn ? 'متصل بحسابك' : 'يلزم تسجيل الدخول'}</Text>
          {params.title ? <Text style={styles.context} numberOfLines={1}>السياق: {params.title}</Text> : null}
        </View>
        <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI</Text></View>
      </View>

      <KeyboardAvoidingView style={styles.chat} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        {signedIn === false && <View style={styles.loginBanner}><Text style={styles.loginText}>سجّل الدخول إلى حساب RAID نفسه المستخدم في بقية الخدمات.</Text><Pressable onPress={() => router.push('/login')} style={styles.loginButton}><Text style={styles.loginButtonText}>تسجيل الدخول</Text></Pressable></View>}

        <FlatList
          ref={listRef}
          style={styles.listView}
          data={messages}
          keyExtractor={(_,i)=>String(i)}
          contentContainerStyle={[styles.list, keyboardOpen && styles.listKeyboard]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          onContentSizeChange={() => { if (keyboardOpen || busy) listRef.current?.scrollToEnd({ animated: false }); }}
          renderItem={({item})=><View style={[styles.msg,item.role==='user'?styles.user:styles.ai]}><Text style={styles.msgText}>{item.content}</Text></View>}
          ListFooterComponent={busy ? <View style={[styles.msg, styles.ai, styles.thinking]}><Text style={styles.thinkingText}>RAID AI يفكر…</Text></View> : null}
        />

        {!!lastFailedText && !busy && signedIn !== false && <View style={styles.retryWrap}><Pressable onPress={() => void sendValue(lastFailedText)} style={styles.retryButton}><Text style={styles.retryText}>إعادة إرسال آخر طلب</Text></Pressable></View>}
        {!keyboardOpen && <View style={styles.hints}><Text style={styles.hint}>جرّب: «لخّص الصفحة» • «اشرح ببساطة» • «قارن بين التبويبات»</Text></View>}
        <View style={[styles.composer, keyboardOpen && styles.composerKeyboard]}>
          <TextInput value={text} onChangeText={setText} onFocus={() => setTimeout(() => listRef.current?.scrollToEnd({ animated:true }), 70)} onSubmitEditing={send} placeholder="اكتب سؤالك أو طلبك..." placeholderTextColor="#64748B" style={styles.input} multiline textAlign="right" maxLength={4000} accessibilityLabel="رسالة RAID AI" />
          <Pressable onPress={send} disabled={busy || !text.trim()} style={[styles.send, (busy || !text.trim()) && styles.sendDisabled]} accessibilityRole="button" accessibilityLabel="إرسال إلى RAID AI"><Text style={styles.sendText}>{busy?'…':'↑'}</Text></Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:'#070B14'},chat:{flex:1,minHeight:0},
  header:{minHeight:62,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:14,paddingVertical:5,borderBottomWidth:1,borderBottomColor:'#1E293B',gap:10},
  backButton:{width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:'#111827',borderWidth:1,borderColor:'#25334A'},back:{fontSize:30,color:'#fff',marginTop:-3},
  headerText:{flex:1,alignItems:'flex-end'},title:{fontSize:18,fontWeight:'900',color:'#fff'},accountState:{marginTop:1,fontSize:10,color:'#4ADE80',fontWeight:'800'},accountOff:{color:'#F59E0B'},context:{marginTop:1,maxWidth:'95%',fontSize:10,color:'#94A3B8',textAlign:'right'},
  aiBadge:{width:40,height:40,borderRadius:13,backgroundColor:'#7C3AED',alignItems:'center',justifyContent:'center'},aiBadgeText:{color:'#fff',fontWeight:'900'},
  loginBanner:{margin:12,padding:13,borderRadius:18,backgroundColor:'#151026',borderWidth:1,borderColor:'#5B21B6',gap:9},loginText:{color:'#DDD6FE',textAlign:'right',lineHeight:20},loginButton:{height:40,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:'#7C3AED'},loginButtonText:{color:'#fff',fontWeight:'900'},
  listView:{flex:1,minHeight:0},list:{padding:14,gap:10,paddingBottom:18},listKeyboard:{paddingBottom:8},msg:{maxWidth:'88%',paddingHorizontal:14,paddingVertical:11,borderRadius:18},user:{alignSelf:'flex-end',backgroundColor:'#7C3AED'},ai:{alignSelf:'flex-start',backgroundColor:'#111827',borderWidth:1,borderColor:'#27324A'},msgText:{color:'#F8FAFC',lineHeight:21,textAlign:'right'},thinking:{paddingVertical:9},thinkingText:{color:'#A78BFA',fontSize:12,fontWeight:'800'},
  retryWrap:{paddingHorizontal:12,paddingBottom:8,backgroundColor:'#0B1220'},retryButton:{height:40,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:'#172033',borderWidth:1,borderColor:'#2B3952'},retryText:{color:'#C4B5FD',fontWeight:'900'},
  hints:{paddingHorizontal:14,paddingTop:7,backgroundColor:'#0B1220'},hint:{color:'#64748B',fontSize:10,textAlign:'right'},composer:{flexDirection:'row',alignItems:'flex-end',gap:9,paddingHorizontal:12,paddingTop:9,paddingBottom:9,borderTopWidth:1,borderTopColor:'#1E293B',backgroundColor:'#0B1220'},composerKeyboard:{paddingTop:7,paddingBottom:5},input:{flex:1,maxHeight:120,minHeight:46,borderRadius:16,backgroundColor:'#111827',color:'#fff',padding:11,borderWidth:1,borderColor:'#1F2937'},send:{width:46,height:46,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:'#7C3AED'},sendDisabled:{opacity:.4},sendText:{color:'#fff',fontSize:23,fontWeight:'900'}
});