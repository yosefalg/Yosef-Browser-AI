import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { getDownload } from '@/features/downloads/store';
import { openDownload } from '@/features/downloads/download-manager';
import { getSetting } from '@/lib/db';
import { getTheme, type ThemeName } from '@/lib/theme';

const TEXT_EXTENSIONS = ['txt','md','json','csv','log','xml','html','htm','css','js','ts'];
const MAX_INTERNAL_TEXT_BYTES = 8 * 1024 * 1024;

function extension(name:string){return name.toLowerCase().split('?')[0].split('#')[0].split('.').pop()||'';}

export default function FileViewerScreen(){
  const params=useLocalSearchParams<{id?:string}>();
  const id=Number(Array.isArray(params.id)?params.id[0]:params.id);
  const [name,setName]=useState('ملف');
  const [content,setContent]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [fontSize,setFontSize]=useState(18);
  const [themeName,setThemeName]=useState<ThemeName>('cinematic');
  const theme=useMemo(()=>getTheme(themeName),[themeName]);

  useEffect(()=>{void getSetting<ThemeName>('theme','cinematic').then(setThemeName).catch(()=>{});},[]);
  useEffect(()=>{
    let active=true;
    setLoading(true);
    setError('');
    setName('ملف');
    setContent('');
    void (async()=>{
      try{
        if(!Number.isFinite(id))throw new Error('معرّف الملف غير صالح.');
        const item=await getDownload(id);
        if(!item?.local_uri||item.state!=='completed')throw new Error('الملف غير جاهز للقراءة.');
        const info=await FileSystem.getInfoAsync(item.local_uri);
        if(!info.exists)throw new Error('الملف لم يعد موجودًا على الجهاز.');
        if(!TEXT_EXTENSIONS.includes(extension(item.file_name)))throw new Error('هذا النوع يحتاج عارضًا متخصصًا. يمكنك فتحه بتطبيق مناسب من زر الفتح الخارجي.');
        const size='size' in info&&typeof info.size==='number'?info.size:0;
        if(size>MAX_INTERNAL_TEXT_BYTES)throw new Error('الملف كبير للعرض الداخلي الآمن. استخدم الفتح الخارجي لهذا الملف.');
        const text=await FileSystem.readAsStringAsync(item.local_uri,{encoding:FileSystem.EncodingType.UTF8});
        if(active){setName(item.file_name);setContent(text);}
      }catch(e){if(active)setError(e instanceof Error?e.message:'تعذر قراءة الملف.');}
      finally{if(active)setLoading(false);}
    })();
    return()=>{active=false;};
  },[id]);

  const openExternal=async()=>{
    try{await openDownload(id);}
    catch(e){setError(e instanceof Error?`تعذر الفتح الخارجي: ${e.message}`:'تعذر فتح الملف خارجيًا.');}
  };

  return <SafeAreaView style={[s.root,{backgroundColor:theme.bg}]} edges={['top','bottom','left','right']}>
    <View style={[s.header,{backgroundColor:theme.surface,borderBottomColor:theme.border}]}>
      <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={()=>router.back()} style={[s.icon,{borderColor:theme.border,backgroundColor:theme.surface2}]}><Ionicons name="chevron-back" size={22} color={theme.text}/></Pressable>
      <View style={s.heading}><Text numberOfLines={1} style={[s.title,{color:theme.text}]}>{name}</Text><Text style={[s.sub,{color:theme.muted}]}>RAID Reader • قراءة داخل التطبيق</Text></View>
      <View style={s.controls}><Pressable accessibilityLabel="تصغير الخط" onPress={()=>setFontSize(v=>Math.max(13,v-2))} style={[s.small,{borderColor:theme.border}]}><Text style={{color:theme.text,fontWeight:'900'}}>A−</Text></Pressable><Pressable accessibilityLabel="تكبير الخط" onPress={()=>setFontSize(v=>Math.min(34,v+2))} style={[s.small,{borderColor:theme.border}]}><Text style={{color:theme.text,fontWeight:'900'}}>A+</Text></Pressable></View>
    </View>
    {loading?<View style={s.center}><ActivityIndicator color={theme.accent}/><Text style={{color:theme.muted}}>جاري تجهيز الملف…</Text></View>:error?<View style={s.center}><Ionicons name="document-text-outline" size={44} color={theme.muted}/><Text style={[s.error,{color:theme.text}]}>{error}</Text><Pressable onPress={()=>void openExternal()} style={[s.external,{backgroundColor:theme.accent}]}><Ionicons name="open-outline" size={18} color="#fff"/><Text style={s.externalText}>فتح خارجي</Text></Pressable></View>:<ScrollView contentContainerStyle={s.reader} showsVerticalScrollIndicator={false}><Text selectable style={[s.body,{color:theme.text,fontSize,lineHeight:Math.round(fontSize*1.75)}]}>{content}</Text></ScrollView>}
  </SafeAreaView>;
}

const s=StyleSheet.create({root:{flex:1},header:{minHeight:66,borderBottomWidth:1,flexDirection:'row',alignItems:'center',paddingHorizontal:12,gap:10},icon:{width:42,height:42,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},heading:{flex:1,minWidth:0},title:{fontSize:15,fontWeight:'900',textAlign:'right'},sub:{fontSize:10,marginTop:2,textAlign:'right'},controls:{flexDirection:'row',gap:5},small:{height:36,minWidth:38,borderRadius:11,borderWidth:1,alignItems:'center',justifyContent:'center'},reader:{paddingHorizontal:20,paddingTop:22,paddingBottom:70},body:{textAlign:'right',writingDirection:'rtl'},center:{flex:1,alignItems:'center',justifyContent:'center',padding:28,gap:14},error:{fontSize:15,lineHeight:24,textAlign:'center'},external:{minHeight:44,borderRadius:14,paddingHorizontal:18,flexDirection:'row',alignItems:'center',gap:7},externalText:{color:'#fff',fontWeight:'900'}});
