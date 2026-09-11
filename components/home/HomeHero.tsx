import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SiteIcon } from '@/components/SiteIcon';

type RecentSite={url:string;title:string;visited_at:number};
function hostOf(value:string){try{return new URL(value).hostname.replace(/^www\./,'');}catch{return value;}}

export function HomeHero({onPress,recent,vpnConnected,tabsCount}:{onPress:()=>void;recent?:RecentSite;vpnConnected:boolean;tabsCount:number}){
  const title=recent?.title||'تصفح بلا حدود';
  const subtitle=recent?hostOf(recent.url):'وصول أسرع • واجهة أهدأ • أدوات ذكية';
  return <Pressable accessibilityRole="button" accessibilityLabel={recent?'متابعة آخر موقع':'تصفح بلا حدود'} onPress={onPress} style={({pressed})=>[s.shell,pressed&&s.press]}>
    <LinearGradient colors={['#5A4639','#2E2B28','#17191C']} start={{x:0,y:0}} end={{x:1,y:1}} style={s.bg}>
      <View pointerEvents="none" style={s.glowA}/><View pointerEvents="none" style={s.glowB}/><View pointerEvents="none" style={s.ridgeA}/><View pointerEvents="none" style={s.ridgeB}/>
      <LinearGradient colors={['rgba(255,241,225,.04)','rgba(15,15,16,.58)']} style={s.overlay}>
        <View style={s.topLine}>
          <View style={s.brandPill}><Ionicons name="sparkles-outline" size={13} color="#E4C6AD"/><Text style={s.kicker}>RAID Browser</Text></View>
          <View style={s.statusRow}><View style={s.statusPill}><Ionicons name={vpnConnected?'shield-checkmark':'shield-outline'} size={13} color={vpnConnected?'#73D59E':'#C8B9AC'}/><Text style={s.statusText}>{vpnConnected?'VPN متصل':'VPN جاهز'}</Text></View><View style={s.statusPill}><Ionicons name="albums-outline" size={13} color="#D8B292"/><Text style={s.statusText}>{tabsCount} تبويب</Text></View></View>
        </View>
        <View style={s.bottomLine}>
          <View style={s.copy}>{recent?<View style={s.recentLine}><SiteIcon url={recent.url} size={32} radius={10}/><View style={s.recentCopy}><Text style={s.eyebrow}>متابعة التصفح</Text><Text numberOfLines={1} style={s.title}>{title}</Text><Text numberOfLines={1} style={s.sub}>{subtitle}</Text></View></View>:<><Text style={s.eyebrow}>جاهز للتصفح</Text><Text style={s.title}>{title}</Text><Text style={s.sub}>{subtitle}</Text></>}</View>
          <View style={s.arrowBubble}><Ionicons name="arrow-back" size={21} color="#FFF"/></View>
        </View>
      </LinearGradient>
    </LinearGradient>
  </Pressable>;
}

const s=StyleSheet.create({shell:{height:190,borderRadius:30,overflow:'hidden',borderWidth:1,borderColor:'rgba(234,220,207,.26)',backgroundColor:'#292A2A'},bg:{flex:1,overflow:'hidden'},glowA:{position:'absolute',width:190,height:190,borderRadius:95,backgroundColor:'rgba(214,152,111,.2)',top:-88,right:-28},glowB:{position:'absolute',width:130,height:130,borderRadius:65,backgroundColor:'rgba(239,211,183,.09)',bottom:-62,left:12},ridgeA:{position:'absolute',width:280,height:126,backgroundColor:'rgba(49,42,37,.76)',transform:[{rotate:'-15deg'}],bottom:-74,right:-8,borderRadius:44},ridgeB:{position:'absolute',width:238,height:104,backgroundColor:'rgba(89,69,57,.42)',transform:[{rotate:'12deg'}],bottom:-67,left:-20,borderRadius:40},overlay:{flex:1,padding:18,justifyContent:'space-between'},topLine:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:8},brandPill:{height:30,paddingHorizontal:10,borderRadius:12,backgroundColor:'rgba(255,255,255,.06)',borderWidth:1,borderColor:'rgba(255,255,255,.09)',flexDirection:'row-reverse',alignItems:'center',gap:6},kicker:{color:'#E4C6AD',fontSize:9,fontWeight:'900',letterSpacing:.7},statusRow:{flexDirection:'row',gap:6},statusPill:{height:30,paddingHorizontal:9,borderRadius:12,backgroundColor:'rgba(12,13,14,.28)',borderWidth:1,borderColor:'rgba(255,255,255,.08)',flexDirection:'row',alignItems:'center',gap:5},statusText:{color:'#E8E0D8',fontSize:9,fontWeight:'800'},bottomLine:{flexDirection:'row-reverse',alignItems:'flex-end',justifyContent:'space-between',gap:12},copy:{flex:1},recentLine:{flexDirection:'row-reverse',alignItems:'center',gap:10},recentCopy:{flex:1},eyebrow:{color:'#D8B292',fontSize:9,fontWeight:'900',textAlign:'right',marginBottom:3},title:{color:'#FFF9F2',fontSize:23,fontWeight:'900',textAlign:'right'},sub:{color:'#D9D2CB',fontSize:10,marginTop:5,textAlign:'right'},arrowBubble:{width:42,height:42,borderRadius:15,backgroundColor:'rgba(255,255,255,.1)',borderWidth:1,borderColor:'rgba(255,255,255,.12)',alignItems:'center',justifyContent:'center'},press:{transform:[{scale:.985}],opacity:.94}});
