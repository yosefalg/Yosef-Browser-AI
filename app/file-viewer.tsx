import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { TextStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { getDownload } from '@/features/downloads/store';
import { openDownload } from '@/features/downloads/download-manager';
import { getSetting, setSetting } from '@/lib/db';
import { getTheme, isThemeName, type ThemeName } from '@/lib/theme';

const TEXT_EXTENSIONS = ['txt','md','json','csv','log','xml','html','htm','css','js','ts'];
const IMAGE_EXTENSIONS = ['jpg','jpeg','png','webp'];
const STRUCTURED_EXTENSIONS = ['json','csv','log','xml','html','htm','css','js','ts'];
const MAX_INTERNAL_TEXT_BYTES = 8 * 1024 * 1024;
const DEFAULT_FONT_SIZE = 18;
const MIN_FONT_SIZE = 13;
const MAX_FONT_SIZE = 34;

function extension(name:string){return name.toLowerCase().split('?')[0].split('#')[0].split('.').pop()||'';}

function readerTextStyle(name:string,content:string):TextStyle{
  const structured=STRUCTURED_EXTENSIONS.includes(extension(name));
  const sample=content.slice(0,4000);
  const arabic=(sample.match(/[\u0600-\u06FF]/g)||[]).length;
  const latin=(sample.match(/[A-Za-z]/g)||[]).length;
  const rtl=!structured&&arabic>=latin;
  return {
    textAlign:rtl?'right':'left',
    writingDirection:rtl?'rtl':'ltr',
    fontFamily:structured?'monospace':undefined,
  };
}

export default function FileViewerScreen(){
  const params=useLocalSearchParams<{id?:string}>();
  const id=Number(Array.isArray(params.id)?params.id[0]:params.id);
  const [name,setName]=useState('ملف');
  const [content,setContent]=useState('');
  const [imageUri,setImageUri]=useState('');
  const [canOpenExternal,setCanOpenExternal]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [fontSize,setFontSize]=useState(DEFAULT_FONT_SIZE);
  const [fontSizeSaving,setFontSizeSaving]=useState(false);
  const fontSizeSavingRef=useRef(false);
  const [externalOpening,setExternalOpening]=useState(false);
  const externalOpeningRef=useRef(false);
  const [themeName,setThemeName]=useState<ThemeName>('cinematic');
  const theme=useMemo(()=>getTheme(themeName),[themeName]);
  const textLayout=useMemo(()=>readerTextStyle(name,content),[name,content]);

  useEffect(()=>{
    let active=true;
    void Promise.all([
      getSetting<ThemeName>('theme','cinematic'),
      getSetting<number>('file_reader_font_size',DEFAULT_FONT_SIZE),
    ]).then(([savedTheme,savedFontSize])=>{
      if(!active)return;
      setThemeName(isThemeName(savedTheme)?savedTheme:'cinematic');
      if(Number.isFinite(savedFontSize))setFontSize(Math.min(MAX_FONT_SIZE,Math.max(MIN_FONT_SIZE,Math.round(savedFontSize))));
    });
    return()=>{active=false;};
  },[]);
  useEffect(()=>{
    let active=true;
    setLoading(true);
    setError('');
    setName('ملف');
    setContent('');
    setImageUri('');
    setCanOpenExternal(false);
    void (async()=>{
      try{
        if(!Number.isInteger(id)||id<=0)throw new Error('معرّف الملف غير صالح.');
        const item=await getDownload(id);
        if(!item?.local_uri||item.state!=='completed')throw new Error('الملف غير جاهز للقراءة.');
        const info=await FileSystem.getInfoAsync(item.local_uri);
        if(!info.exists)throw new Error('الملف لم يعد موجودًا على الجهاز.');
        if(active){setName(item.file_name);setCanOpenExternal(true);}
        const fileExtension=extension(item.file_name);
        if(IMAGE_EXTENSIONS.includes(fileExtension)){
          if(active)setImageUri(item.local_uri);
          return;
        }
        if(!TEXT_EXTENSIONS.includes(fileExtension))throw new Error('هذا النوع يحتاج عارضًا متخصصًا. يمكنك فتحه بتطبيق مناسب من زر الفتح الخارجي.');
        const size='size' in info&&typeof info.size==='number'?info.size:0;
        if(size>MAX_INTERNAL_TEXT_BYTES)throw new Error('الملف كبير للعرض الداخلي الآمن. استخدم الفتح الخارجي لهذا الملف.');
        const text=await FileSystem.readAsStringAsync(item.local_uri,{encoding:FileSystem.EncodingType.UTF8});
        if(active)setContent(text);
      }catch(e){if(active)setError(e instanceof Error?e.message:'تعذر قراءة الملف.');}
      finally{if(active)setLoading(false);}
    })();
    return()=>{active=false;};
  },[id]);

  const openExternal=async()=>{
    if(!canOpenExternal||externalOpeningRef.current)return;
    externalOpeningRef.current=true;
    setExternalOpening(true);
    try{await openDownload(id);}
    catch(e){setError(e instanceof Error?`تعذر الفتح الخارجي: ${e.message}`:'تعذر فتح الملف خارجيًا.');}
    finally{
      externalOpeningRef.current=false;
      setExternalOpening(false);
    }
  };

  const changeFontSize=async(delta:number)=>{
    if(fontSizeSavingRef.current)return;
    const previous=fontSize;
    const next=Math.min(MAX_FONT_SIZE,Math.max(MIN_FONT_SIZE,previous+delta));
    if(next===previous)return;
    fontSizeSavingRef.current=true;
    setFontSizeSaving(true);
    setFontSize(next);
    try{await setSetting('file_reader_font_size',next);}
    catch{
      setFontSize(previous);
      Alert.alert('قارئ RAID','تعذر حفظ حجم الخط. أُعيد الحجم السابق ويمكنك المحاولة مرة أخرى.');
    }finally{
      fontSizeSavingRef.current=false;
      setFontSizeSaving(false);
    }
  };

  const fontAtMinimum=fontSize<=MIN_FONT_SIZE;
  const fontAtMaximum=fontSize>=MAX_FONT_SIZE;
  const textReady=!loading&&!error&&!imageUri;
  const viewerStatus=loading?'جاري تجهيز الملف…':imageUri?'RAID Image Viewer • محلي':error?(canOpenExternal?'فتح خارجي متاح':'تعذر تجهيز الملف'):`RAID Reader • ${textLayout.writingDirection==='rtl'?'RTL':'LTR'}`;

  return <SafeAreaView style={[s.root,{backgroundColor:theme.bg}]} edges={['top','bottom','left','right']}>
    <View style={[s.header,{backgroundColor:theme.surface,borderBottomColor:theme.border}]}>
      <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={()=>router.back()} style={[s.icon,{borderColor:theme.border,backgroundColor:theme.surface2}]}><Ionicons name="chevron-back" size={22} color={theme.text}/></Pressable>
      <View style={s.heading}><Text numberOfLines={1} style={[s.title,{color:theme.text}]}>{name}</Text><Text accessibilityLiveRegion="polite" style={[s.sub,{color:theme.muted}]}>{viewerStatus}</Text></View>
      <View style={s.controls}>
        {textReady&&<><Pressable accessibilityRole="button" accessibilityLabel="تصغير خط قارئ الملفات" accessibilityState={{disabled:fontSizeSaving||fontAtMinimum,busy:fontSizeSaving}} disabled={fontSizeSaving||fontAtMinimum} onPress={()=>void changeFontSize(-2)} style={[s.small,{borderColor:theme.border,opacity:fontSizeSaving||fontAtMinimum?0.45:1}]}><Text style={{color:theme.text,fontWeight:'900'}}>A−</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="تكبير خط قارئ الملفات" accessibilityState={{disabled:fontSizeSaving||fontAtMaximum,busy:fontSizeSaving}} disabled={fontSizeSaving||fontAtMaximum} onPress={()=>void changeFontSize(2)} style={[s.small,{borderColor:theme.border,opacity:fontSizeSaving||fontAtMaximum?0.45:1}]}><Text style={{color:theme.text,fontWeight:'900'}}>A+</Text></Pressable></>}
        {canOpenExternal&&<Pressable accessibilityRole="button" accessibilityLabel={`فتح ${name} بتطبيق خارجي`} accessibilityState={{disabled:externalOpening,busy:externalOpening}} disabled={externalOpening} onPress={()=>void openExternal()} style={[s.small,{borderColor:theme.border,backgroundColor:theme.surface2,opacity:externalOpening?0.45:1}]}><Ionicons name="open-outline" size={19} color={theme.accent}/></Pressable>}
      </View>
    </View>
    {loading?<View style={s.center}><ActivityIndicator color={theme.accent}/><Text style={{color:theme.muted}}>جاري تجهيز الملف…</Text></View>:error?<View style={s.center}><Ionicons name={imageUri?'image-outline':'document-text-outline'} size={44} color={theme.muted}/><Text accessibilityRole="alert" style={[s.error,{color:theme.text}]}>{error}</Text>{canOpenExternal&&<Pressable accessibilityRole="button" accessibilityLabel="فتح الملف بتطبيق خارجي" accessibilityState={{disabled:externalOpening,busy:externalOpening}} disabled={externalOpening} onPress={()=>void openExternal()} style={[s.external,{backgroundColor:theme.accent,opacity:externalOpening?0.6:1}]}>{externalOpening?<ActivityIndicator size="small" color="#fff"/>:<Ionicons name="open-outline" size={18} color="#fff"/>}<Text style={s.externalText}>{externalOpening?'جاري الفتح…':'فتح خارجي'}</Text></Pressable>}</View>:imageUri?<View style={[s.imageStage,{backgroundColor:theme.surface2}]}><Image source={{uri:imageUri}} resizeMode="contain" style={s.image} accessible accessibilityLabel={`صورة ${name}`} onError={()=>setError('تعذر عرض الصورة داخل RAID. يمكنك فتحها بتطبيق صور آخر.')}/></View>:<ScrollView contentContainerStyle={s.reader} showsVerticalScrollIndicator={false}><Text selectable style={[textLayout,{color:theme.text,fontSize,lineHeight:Math.round(fontSize*1.75)}]}>{content}</Text></ScrollView>}
  </SafeAreaView>;
}

const s=StyleSheet.create({root:{flex:1},header:{minHeight:66,borderBottomWidth:1,flexDirection:'row',alignItems:'center',paddingHorizontal:12,gap:10},icon:{width:42,height:42,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},heading:{flex:1,minWidth:0},title:{fontSize:15,fontWeight:'900',textAlign:'right'},sub:{fontSize:10,marginTop:2,textAlign:'right'},controls:{flexDirection:'row',gap:5},small:{height:36,minWidth:38,borderRadius:11,borderWidth:1,alignItems:'center',justifyContent:'center'},reader:{paddingHorizontal:20,paddingTop:22,paddingBottom:70},imageStage:{flex:1,margin:12,borderRadius:20,overflow:'hidden'},image:{width:'100%',height:'100%'},center:{flex:1,alignItems:'center',justifyContent:'center',padding:28,gap:14},error:{fontSize:15,lineHeight:24,textAlign:'center'},external:{minHeight:44,borderRadius:14,paddingHorizontal:18,flexDirection:'row',alignItems:'center',gap:7},externalText:{color:'#fff',fontWeight:'900'}});
