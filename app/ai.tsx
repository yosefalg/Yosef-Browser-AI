import { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { AgentMessage, askAgent } from '@/lib/ai';

export default function AIScreen() {
  const [messages, setMessages] = useState<AgentMessage[]>([{ role: 'assistant', content: 'مرحباً، أنا RAID AI. أربطني بخادم AI من الإعدادات لأعمل بحسابك بشكل آمن.' }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const value = text.trim();
    if (!value || busy) return;
    const next = [...messages, { role:'user', content:value } as AgentMessage];
    setMessages(next); setText(''); setBusy(true);
    try {
      const answer = await askAgent(next);
      setMessages([...next, { role:'assistant', content:answer }]);
    } catch (e) {
      setMessages([...next, { role:'assistant', content:e instanceof Error ? e.message : 'AI error' }]);
    } finally { setBusy(false); }
  };
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}><Pressable onPress={()=>router.back()}><Text style={styles.back}>‹</Text></Pressable><Text style={styles.title}>RAID AI Agent</Text><View style={{width:32}}/></View>
      <FlatList data={messages} keyExtractor={(_,i)=>String(i)} contentContainerStyle={styles.list} renderItem={({item})=><View style={[styles.msg,item.role==='user'?styles.user:styles.ai]}><Text style={styles.msgText}>{item.content}</Text></View>} />
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined}>
        <View style={styles.composer}><TextInput value={text} onChangeText={setText} placeholder="اكتب طلبك..." placeholderTextColor="#64748B" style={styles.input} multiline/><Pressable onPress={send} style={styles.send}><Text style={styles.sendText}>{busy?'…':'↑'}</Text></Pressable></View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:'#070B14'},header:{height:58,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:'#1E293B'},back:{fontSize:34,color:'#fff'},title:{fontSize:18,fontWeight:'900',color:'#fff'},list:{padding:16,gap:10},msg:{maxWidth:'86%',padding:14,borderRadius:18},user:{alignSelf:'flex-end',backgroundColor:'#7C3AED'},ai:{alignSelf:'flex-start',backgroundColor:'#111827',borderWidth:1,borderColor:'#27324A'},msgText:{color:'#F8FAFC',lineHeight:21},composer:{flexDirection:'row',alignItems:'flex-end',gap:10,padding:12,borderTopWidth:1,borderTopColor:'#1E293B',backgroundColor:'#0B1220'},input:{flex:1,maxHeight:130,minHeight:46,borderRadius:17,backgroundColor:'#111827',color:'#fff',padding:12,textAlign:'right'},send:{width:46,height:46,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:'#7C3AED'},sendText:{color:'#fff',fontSize:24,fontWeight:'900'}});
