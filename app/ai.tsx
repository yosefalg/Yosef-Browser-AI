import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AgentMessage, askAgent } from '@/lib/ai';
import { executeLocalAgentCommand } from '@/lib/agent';
import { getLatestPageContext, getMemories } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

export default function AIScreen() {
  const params = useLocalSearchParams<{ prompt?: string; url?: string; title?: string }>();
  const [messages, setMessages] = useState<AgentMessage[]>([{ role: 'assistant', content: 'مرحباً، أنا RAID AI. أنا مرتبط بحساب RAID الخاص بك وأستطيع مساعدتك في البحث، تلخيص الصفحات، المقارنة، الشرح وتنفيذ الأوامر المحلية الآمنة.' }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const autoSent = useRef(false);

  useEffect(() => {
    getCurrentSession().then((session) => setSignedIn(Boolean(session))).catch(() => setSignedIn(false));
  }, []);

  const sendValue = async (raw: string) => {
    const value = raw.trim();
    if (!value || busy) return;
    const next = [...messages, { role:'user', content:value } as AgentMessage];
    setMessages(next); setText(''); setBusy(true);
    try {
      const session = await getCurrentSession();
      if (!session) {
        setSignedIn(false);
        setMessages([...next, { role:'assistant', content:'يلزم تسجيل الدخول مرة واحدة حتى يعمل RAID AI بشكل مباشر وآمن على حسابك.' }]);
        return;
      }
      setSignedIn(true);

      const local = await executeLocalAgentCommand(value);
      if (local.handled) {
        setMessages([...next, { role:'assistant', content:local.message || 'تم التنفيذ.' }]);
        return;
      }

      const page = await getLatestPageContext().catch(() => null);
      const memories = await getMemories(10).catch(() => []);
      const memoryText = memories.length
        ? `\n\nذاكرة المتصفح المحلية:\n${memories.map((m) => `- ${m.kind}: ${m.value}`).join('\n')}`
        : '';
      const pageText = page
        ? `الصفحة الحالية: ${page.title}\nالرابط: ${page.url}\n\n${page.text}${memoryText}`
        : memoryText || undefined;

      const aiMessages = local.aiPrompt
        ? [...messages, { role: 'user', content: local.aiPrompt } as AgentMessage]
        : next;
      const answer = await askAgent(aiMessages, pageText);
      setMessages([...next, { role:'assistant', content:answer }]);
    } catch (e) {
      setMessages([...next, { role:'assistant', content:e instanceof Error ? e.message : 'تعذر تشغيل RAID AI الآن.' }]);
    } finally { setBusy(false); }
  };

  const send = () => sendValue(text);

  useEffect(() => {
    if (!autoSent.current && typeof params.prompt === 'string' && params.prompt.trim()) {
      autoSent.current = true;
      setTimeout(() => sendValue(params.prompt as string), 0);
    }
  }, [params.prompt]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={()=>router.back()} style={styles.backButton}><Text style={styles.back}>‹</Text></Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>RAID AI</Text>
          <Text style={[styles.accountState, signedIn === false && styles.accountOff]}>{signedIn === null ? 'جارٍ التحقق من الحساب...' : signedIn ? 'متصل بحسابك وجاهز' : 'يلزم تسجيل الدخول'}</Text>
          {params.title ? <Text style={styles.context} numberOfLines={1}>السياق: {params.title}</Text> : null}
        </View>
        <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI</Text></View>
      </View>

      {signedIn === false && (
        <View style={styles.loginBanner}>
          <Text style={styles.loginText}>سجّل الدخول مرة واحدة، وبعدها يعمل RAID AI مباشرةً مع حسابك.</Text>
          <Pressable onPress={() => router.push('/login')} style={styles.loginButton}><Text style={styles.loginButtonText}>تسجيل الدخول</Text></Pressable>
        </View>
      )}

      <FlatList
        data={messages}
        keyExtractor={(_,i)=>String(i)}
        contentContainerStyle={styles.list}
        renderItem={({item})=><View style={[styles.msg,item.role==='user'?styles.user:styles.ai]}><Text style={styles.msgText}>{item.content}</Text></View>}
      />

      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined}>
        <View style={styles.hints}><Text style={styles.hint}>جرّب: «لخّص الصفحة» • «اشرح هذا بشكل أبسط» • «قارن بين التبويبات» • «ابحث لي عن الفكرة الأساسية»</Text></View>
        <View style={styles.composer}>
          <TextInput value={text} onChangeText={setText} onSubmitEditing={send} placeholder="اكتب سؤالك أو طلبك..." placeholderTextColor="#64748B" style={styles.input} multiline textAlign="right" />
          <Pressable onPress={send} disabled={busy || !text.trim()} style={[styles.send, (busy || !text.trim()) && styles.sendDisabled]}><Text style={styles.sendText}>{busy?'…':'↑'}</Text></Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:'#070B14'},
  header:{minHeight:72,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:'#1E293B',gap:10},
  backButton:{width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:'#111827'},back:{fontSize:30,color:'#fff',marginTop:-3},
  headerText:{flex:1,alignItems:'flex-end'},title:{fontSize:19,fontWeight:'900',color:'#fff'},accountState:{marginTop:2,fontSize:11,color:'#4ADE80',fontWeight:'800'},accountOff:{color:'#F59E0B'},context:{marginTop:2,maxWidth:'95%',fontSize:11,color:'#94A3B8',textAlign:'right'},
  aiBadge:{width:42,height:42,borderRadius:14,backgroundColor:'#7C3AED',alignItems:'center',justifyContent:'center'},aiBadgeText:{color:'#fff',fontWeight:'900'},
  loginBanner:{margin:12,padding:14,borderRadius:18,backgroundColor:'#151026',borderWidth:1,borderColor:'#5B21B6',gap:10},loginText:{color:'#DDD6FE',textAlign:'right',lineHeight:20},loginButton:{height:42,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:'#7C3AED'},loginButtonText:{color:'#fff',fontWeight:'900'},
  list:{padding:16,gap:10},msg:{maxWidth:'88%',padding:14,borderRadius:18},user:{alignSelf:'flex-end',backgroundColor:'#7C3AED'},ai:{alignSelf:'flex-start',backgroundColor:'#111827',borderWidth:1,borderColor:'#27324A'},msgText:{color:'#F8FAFC',lineHeight:21,textAlign:'right'},
  hints:{paddingHorizontal:14,paddingTop:8,backgroundColor:'#0B1220'},hint:{color:'#64748B',fontSize:11,textAlign:'right'},composer:{flexDirection:'row',alignItems:'flex-end',gap:10,padding:12,borderTopWidth:1,borderTopColor:'#1E293B',backgroundColor:'#0B1220'},input:{flex:1,maxHeight:130,minHeight:48,borderRadius:17,backgroundColor:'#111827',color:'#fff',padding:12,borderWidth:1,borderColor:'#1F2937'},send:{width:48,height:48,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:'#7C3AED'},sendDisabled:{opacity:.4},sendText:{color:'#fff',fontSize:24,fontWeight:'900'}
});
