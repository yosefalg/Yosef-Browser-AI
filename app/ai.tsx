import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AgentMessage, askAgent } from '@/lib/ai';
import { executeLocalAgentCommand } from '@/lib/agent';
import { getLatestPageContext, getMemories } from '@/lib/db';

export default function AIScreen() {
  const params = useLocalSearchParams<{ prompt?: string; url?: string; title?: string }>();
  const [messages, setMessages] = useState<AgentMessage[]>([{ role: 'assistant', content: 'مرحباً، أنا RAID AI. أستطيع فهم الصفحة الحالية وتنفيذ أوامر محلية آمنة مثل: افتح، ابحث عن، وتذكّر.' }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const autoSent = useRef(false);

  const sendValue = async (raw: string) => {
    const value = raw.trim();
    if (!value || busy) return;
    const next = [...messages, { role:'user', content:value } as AgentMessage];
    setMessages(next); setText(''); setBusy(true);
    try {
      const local = await executeLocalAgentCommand(value);
      if (local.handled) {
        setMessages([...next, { role:'assistant', content:local.message || 'تم التنفيذ.' }]);
        return;
      }

      const page = await getLatestPageContext().catch(() => null);
      const memories = await getMemories(10).catch(() => []);
      const memoryText = memories.length
        ? `\n\nLocal browser memory:\n${memories.map((m) => `- ${m.kind}: ${m.value}`).join('\n')}`
        : '';
      const pageText = page
        ? `Current page: ${page.title}\nURL: ${page.url}\n\n${page.text}${memoryText}`
        : memoryText || undefined;

      const answer = await askAgent(next, pageText);
      setMessages([...next, { role:'assistant', content:answer }]);
    } catch (e) {
      setMessages([...next, { role:'assistant', content:e instanceof Error ? e.message : 'AI error' }]);
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
      <View style={styles.header}><Pressable onPress={()=>router.back()}><Text style={styles.back}>‹</Text></Pressable><View style={styles.headerText}><Text style={styles.title}>RAID AI Agent</Text>{params.title ? <Text style={styles.context} numberOfLines={1}>السياق: {params.title}</Text> : null}</View><View style={{width:32}}/></View>
      <FlatList data={messages} keyExtractor={(_,i)=>String(i)} contentContainerStyle={styles.list} renderItem={({item})=><View style={[styles.msg,item.role==='user'?styles.user:styles.ai]}><Text style={styles.msgText}>{item.content}</Text></View>} />
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined}>
        <View style={styles.hints}><Text style={styles.hint}>جرّب: «افتح wikipedia.org» • «ابحث عن أخبار التقنية» • «تذكّر أنني أفضل الوضع الداكن»</Text></View>
        <View style={styles.composer}><TextInput value={text} onChangeText={setText} onSubmitEditing={send} placeholder="اكتب طلبك أو أمرك..." placeholderTextColor="#64748B" style={styles.input} multiline/><Pressable onPress={send} style={styles.send}><Text style={styles.sendText}>{busy?'…':'↑'}</Text></Pressable></View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:'#070B14'},header:{minHeight:64,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:'#1E293B'},headerText:{flex:1,alignItems:'center'},back:{fontSize:34,color:'#fff'},title:{fontSize:18,fontWeight:'900',color:'#fff'},context:{marginTop:2,maxWidth:'80%',fontSize:11,color:'#94A3B8'},list:{padding:16,gap:10},msg:{maxWidth:'86%',padding:14,borderRadius:18},user:{alignSelf:'flex-end',backgroundColor:'#7C3AED'},ai:{alignSelf:'flex-start',backgroundColor:'#111827',borderWidth:1,borderColor:'#27324A'},msgText:{color:'#F8FAFC',lineHeight:21},hints:{paddingHorizontal:14,paddingTop:8,backgroundColor:'#0B1220'},hint:{color:'#64748B',fontSize:11,textAlign:'right'},composer:{flexDirection:'row',alignItems:'flex-end',gap:10,padding:12,borderTopWidth:1,borderTopColor:'#1E293B',backgroundColor:'#0B1220'},input:{flex:1,maxHeight:130,minHeight:46,borderRadius:17,backgroundColor:'#111827',color:'#fff',padding:12,textAlign:'right'},send:{width:46,height:46,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:'#7C3AED'},sendText:{color:'#fff',fontSize:24,fontWeight:'900'}});
