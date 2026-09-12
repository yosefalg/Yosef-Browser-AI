import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AgentMessage, askAgent } from '@/lib/ai';
import { executeLocalAgentCommand } from '@/lib/agent';
import { getLatestPageContext, getMemories, getSetting } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { getTheme, type ThemeName } from '@/lib/theme';
import { AIQuickActions } from '@/components/ai/AIQuickActions';

export default function AIScreen() {
  const params = useLocalSearchParams<{ prompt?: string; url?: string; title?: string }>();
  const [messages,setMessages]=useState<AgentMessage[]>([{role:'assistant',content:'هاي يولد 👋 آني RAID AI. كلي شتريد: أفتحلك تبويب، التنزيلات، الإعدادات، أدورلك على موقع، أو أساعدك بالصفحة.'}]);
  const [text,setText]=useState('');
  const [busy,setBusy]=useState(false);
  const [signedIn,setSignedIn]=useState<boolean|null>(null);
  const [lastFailedText,setLastFailedText]=useState('');
  const [keyboardOpen,setKeyboardOpen]=useState(false);
  const [themeName,setThemeName]=useState<ThemeName>('cinematic');
  const theme=useMemo(()=>getTheme(themeName),[themeName]);
  const lastAutoPrompt=useRef('');
  const listRef=useRef<FlatList<AgentMessage>>(null);

  const refreshState=useCallback(async()=>{
    const [session,savedTheme]=await Promise.all([
      getCurrentSession().catch(()=>null),
      getSetting<ThemeName>('theme','cinematic').catch(()=>'cinematic' as ThemeName),
    ]);
    setSignedIn(Boolean(session));
    setThemeName(savedTheme==='cinematic'||savedTheme==='amoled'||savedTheme==='light'?savedTheme:'cinematic');
  },[]);

  useFocusEffect(useCallback(()=>{void refreshState();return()=>{};},[refreshState]));

  useEffect(()=>{const id=setTimeout(()=>listRef.current?.scrollToEnd({animated:true}),40);return()=>clearTimeout(id);},[messages.length,busy]);
  useEffect(()=>{
    const showEvent=Platform.OS==='ios'?'keyboardWillShow':'keyboardDidShow';
    const hideEvent=Platform.OS==='ios'?'keyboardWillHide':'keyboardDidHide';
    const show=Keyboard.addListener(showEvent,()=>{setKeyboardOpen(true);setTimeout(()=>listRef.current?.scrollToEnd({animated:true}),70);});
    const hide=Keyboard.addListener(hideEvent,()=>setKeyboardOpen(false));
    return()=>{show.remove();hide.remove();};
  },[]);

  const sendValue=useCallback(async(raw:string)=>{
    const value=raw.trim();
    if(!value||busy)return;
    const next=[...messages,{role:'user',content:value} as AgentMessage];
    setMessages(next);setText('');setLastFailedText('');setBusy(true);
    try{
      const local=await executeLocalAgentCommand(value);
      if(local.handled){
        setMessages([...next,{role:'assistant',content:local.message||'تم، حاضر.'}]);
        return;
      }

      const session=await getCurrentSession();
      if(!session){
        setSignedIn(false);setLastFailedText(value);
        setMessages([...next,{role:'assistant',content:'الأوامر داخل RAID تشتغل بدون تسجيل دخول. إذا تريد جواب AI سحابي أو تحليل محتوى، سجّل دخول حتى تنحمي الجلسة ومفاتيح المزود.'}]);
        return;
      }
      setSignedIn(true);
      const [page,memories]=await Promise.all([getLatestPageContext().catch(()=>null),getMemories(6).catch(()=>[])]);
      const memoryText=memories.length?`ذاكرة محلية مفيدة:\n${memories.map(m=>`- ${m.kind}: ${m.value}`).join('\n')}`.slice(0,1500):'';
      const pageText=page?`${memoryText?`${memoryText}\n\n`:''}الصفحة الحالية: ${page.title}\nالرابط: ${page.url}\n\n${page.text.slice(0,6500)}`:memoryText||undefined;
      const aiMessages=local.aiPrompt?[...messages.slice(-8),{role:'user',content:local.aiPrompt} as AgentMessage]:next.slice(-9);
      const answer=await askAgent(aiMessages,pageText);
      setMessages([...next,{role:'assistant',content:answer}]);
    }catch(error){
      setLastFailedText(value);
      setMessages([...next,{role:'assistant',content:error instanceof Error?error.message:'صار خلل بتشغيل RAID AI هسه.'}]);
      void refreshState();
    }finally{setBusy(false);}
  },[busy,messages,refreshState]);

  useEffect(()=>{
    const prompt=typeof params.prompt==='string'?params.prompt.trim():'';
    if(!prompt||lastAutoPrompt.current===prompt)return;
    lastAutoPrompt.current=prompt;
    const id=setTimeout(()=>void sendValue(prompt),0);
    return()=>clearTimeout(id);
  },[params.prompt,sendValue]);

  const send=()=>void sendValue(text);
  const hasContext=Boolean(params.title||params.url);

  return <SafeAreaView edges={['top','bottom','left','right']} style={[s.root,{backgroundColor:theme.bg}]}>
    <View style={[s.header,{backgroundColor:theme.surface,borderBottomColor:theme.border}]}>
      <Pressable onPress={()=>router.back()} style={({pressed})=>[s.iconButton,{backgroundColor:theme.surface2,borderColor:theme.border},pressed&&s.pressed]} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={23} color={theme.text}/></Pressable>
      <View style={s.headerText}><Text style={[s.title,{color:theme.text}]}>RAID AI</Text><View style={s.statusLine}><View style={[s.dot,{backgroundColor:signedIn?'#4CB884':theme.muted}]}/><Text style={[s.accountState,{color:signedIn?'#4CB884':theme.muted}]}>{signedIn===null?'دا أتحقق':signedIn?'الحساب متصل':'الأوامر المحلية جاهزة'}</Text></View>{hasContext?<Text style={[s.context,{color:theme.muted}]} numberOfLines={1}>{params.title||params.url}</Text>:null}</View>
      <View style={[s.aiBadge,{backgroundColor:theme.surface2,borderColor:theme.border}]}><Ionicons name="sparkles" size={20} color={theme.accent}/></View>
    </View>

    <KeyboardAvoidingView style={s.chat} behavior={Platform.OS==='ios'?'padding':'height'} keyboardVerticalOffset={0}>
      {signedIn===false&&<View style={[s.loginBanner,{backgroundColor:theme.surface,borderColor:theme.border}]}><View style={s.loginCopy}><Ionicons name="sparkles-outline" size={20} color={theme.accent}/><View style={{flex:1}}><Text style={[s.loginTitle,{color:theme.text}]}>RAID يفهم أوامرك داخل التطبيق</Text><Text style={[s.loginText,{color:theme.muted}]}>كله «وديني للتنزيلات» أو «افتح يوتيوب» ويشتغل محليًا. تسجيل الدخول مطلوب فقط للذكاء السحابي وتحليل المحتوى.</Text></View></View><Pressable onPress={()=>router.push('/login')} style={[s.loginButton,{backgroundColor:theme.accent}]}><Ionicons name="log-in-outline" size={18} color="#fff"/><Text style={s.loginButtonText}>تسجيل الدخول</Text></Pressable></View>}

      <FlatList ref={listRef} style={s.listView} data={messages} keyExtractor={(_,i)=>String(i)} contentContainerStyle={[s.list,keyboardOpen&&s.listKeyboard]} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS==='ios'?'interactive':'on-drag'} onContentSizeChange={()=>{if(keyboardOpen||busy)listRef.current?.scrollToEnd({animated:false});}} renderItem={({item})=>{
        const user=item.role==='user';
        return <View style={[s.messageRow,user&&s.messageRowUser]}><View style={[s.avatar,{backgroundColor:user?theme.surface2:theme.surface,borderColor:theme.border}]}><Ionicons name={user?'person-outline':'sparkles-outline'} size={15} color={user?theme.text:theme.accent}/></View><View style={[s.msg,{backgroundColor:user?theme.accent:theme.surface,borderColor:user?theme.accent:theme.border}]}><Text selectable style={[s.msgText,{color:user?'#fff':theme.text}]}>{item.content}</Text></View></View>;
      }} ListFooterComponent={busy?<View style={s.messageRow}><View style={[s.avatar,{backgroundColor:theme.surface,borderColor:theme.border}]}><Ionicons name="sparkles-outline" size={15} color={theme.accent}/></View><View style={[s.msg,s.thinking,{backgroundColor:theme.surface,borderColor:theme.border}]}><Ionicons name="ellipsis-horizontal" size={20} color={theme.accent}/><Text style={[s.thinkingText,{color:theme.muted}]}>دا أرتب طلبك</Text></View></View>:null}/>

      <View style={[s.bottomPanel,{backgroundColor:theme.bg,borderTopColor:theme.border}]}>
        {!keyboardOpen&&<AIQuickActions theme={theme} disabled={busy} onSelect={prompt=>void sendValue(prompt)}/>} 
        {!!lastFailedText&&!busy&&signedIn!==false&&<Pressable onPress={()=>void sendValue(lastFailedText)} style={[s.retryButton,{backgroundColor:theme.surface,borderColor:theme.border}]}><Ionicons name="refresh" size={17} color={theme.accent}/><Text style={[s.retryText,{color:theme.text}]}>عيد آخر طلب</Text></Pressable>}
        <View style={[s.composer,{backgroundColor:theme.surface,borderColor:theme.border}]}>
          <TextInput value={text} onChangeText={setText} onFocus={()=>setTimeout(()=>listRef.current?.scrollToEnd({animated:true}),70)} onSubmitEditing={send} placeholder="كلي شتريد أسويلك داخل RAID..." placeholderTextColor={theme.muted} style={[s.input,{color:theme.text}]} multiline textAlign="right" maxLength={4000} accessibilityLabel="رسالة RAID AI"/>
          <Pressable onPress={send} disabled={busy||!text.trim()} style={[s.send,{backgroundColor:theme.accent},(busy||!text.trim())&&s.sendDisabled]} accessibilityLabel="إرسال إلى RAID AI"><Ionicons name={busy?'hourglass-outline':'arrow-up'} size={20} color="#fff"/></Pressable>
        </View>
        <View style={s.privacyLine}><Ionicons name="shield-checkmark-outline" size={13} color={theme.muted}/><Text style={[s.privacyText,{color:theme.muted}]}>أوامر التطبيق محلية. سياق الصفحة ينرسل فقط عند طلب الذكاء السحابي، والوضع الخاص ما يشارك السياق.</Text></View>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const s=StyleSheet.create({
  root:{flex:1},chat:{flex:1,minHeight:0},header:{minHeight:68,flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',paddingHorizontal:14,paddingVertical:7,borderBottomWidth:1,gap:10},iconButton:{width:42,height:42,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},headerText:{flex:1,alignItems:'flex-end'},title:{fontSize:18,fontWeight:'900'},statusLine:{marginTop:2,flexDirection:'row-reverse',alignItems:'center',gap:5},dot:{width:6,height:6,borderRadius:3},accountState:{fontSize:9,fontWeight:'800'},context:{marginTop:2,maxWidth:'96%',fontSize:9,textAlign:'right'},aiBadge:{width:42,height:42,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},
  loginBanner:{margin:12,padding:14,borderRadius:20,borderWidth:1,gap:11},loginCopy:{flexDirection:'row-reverse',alignItems:'flex-start',gap:10},loginTitle:{fontSize:13,fontWeight:'900',textAlign:'right'},loginText:{fontSize:10,lineHeight:17,textAlign:'right',marginTop:4},loginButton:{height:42,borderRadius:14,alignItems:'center',justifyContent:'center',flexDirection:'row-reverse',gap:7},loginButtonText:{color:'#fff',fontWeight:'900'},
  listView:{flex:1,minHeight:0},list:{padding:14,gap:12,paddingBottom:18},listKeyboard:{paddingBottom:8},messageRow:{flexDirection:'row',alignItems:'flex-end',gap:7,maxWidth:'94%'},messageRowUser:{alignSelf:'flex-end',flexDirection:'row-reverse'},avatar:{width:30,height:30,borderRadius:11,borderWidth:1,alignItems:'center',justifyContent:'center'},msg:{maxWidth:'88%',paddingHorizontal:14,paddingVertical:11,borderRadius:18,borderWidth:1},msgText:{lineHeight:21,textAlign:'right',fontSize:13},thinking:{flexDirection:'row-reverse',alignItems:'center',gap:7},thinkingText:{fontSize:11,fontWeight:'800'},
  bottomPanel:{paddingHorizontal:12,paddingTop:9,paddingBottom:9,borderTopWidth:1,gap:9},retryButton:{height:40,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center',flexDirection:'row-reverse',gap:7},retryText:{fontSize:11,fontWeight:'900'},composer:{minHeight:54,maxHeight:132,borderRadius:18,borderWidth:1,flexDirection:'row',alignItems:'flex-end',gap:9,padding:6},input:{flex:1,maxHeight:118,minHeight:40,paddingHorizontal:8,paddingVertical:9,fontSize:13},send:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center'},sendDisabled:{opacity:.38},privacyLine:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:5,paddingHorizontal:5},privacyText:{fontSize:8.5,textAlign:'center'},pressed:{opacity:.72,transform:[{scale:.98}]}
});
