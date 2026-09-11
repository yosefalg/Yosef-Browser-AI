import { NativeModules, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getSupabase } from '@/lib/auth';

const LEGACY_CONFIG_KEY = 'raid_wireguard_config_v2';
const OWNER_KEY = 'raid_wireguard_owner_v3';
const LOCAL_OWNER = 'local-device';
const configKeyFor = (owner: string) => `raid_wireguard_config_v3_${owner}`;
const localMarkerFor = (owner: string) => `raid_wireguard_local_v4_${owner}`;

type RaidVpnNative = { connect(configText:string):Promise<boolean>; disconnect():Promise<boolean>; getStatus():Promise<boolean> };
type VpnFunctionPayload = { configured?:boolean; configText?:string; reason?:string; error?:string };
export type VpnProvisioningState = { configured:boolean; source:'service'|'local'|'cache'|'none' };

function native():RaidVpnNative {
  if (Platform.OS !== 'android') throw new Error('RAID VPN متاح حاليًا على Android فقط.');
  const module = NativeModules.RaidVpn as RaidVpnNative | undefined;
  if (!module) throw new Error('وحدة RAID VPN غير موجودة في هذا الإصدار. أعد بناء APK.');
  return module;
}

function normalize(value:string){return value.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();}
function validateConfig(configText:string){
  const value=normalize(configText);
  if(!value||value.length>32768||value.includes('\0')) throw new Error('إعداد WireGuard غير صالح.');
  const required=[/^\s*\[Interface\]/im,/^\s*PrivateKey\s*=\s*\S+/im,/^\s*\[Peer\]/im,/^\s*PublicKey\s*=\s*\S+/im,/^\s*Endpoint\s*=\s*\S+/im,/^\s*AllowedIPs\s*=\s*\S+/im];
  if(!required.every(r=>r.test(value))) throw new Error('إعداد WireGuard غير مكتمل.');
  return value;
}
async function currentSession(){
  const supabase=getSupabase();
  const {data,error}=await supabase.auth.getSession();
  if(error) throw error;
  return data.session;
}
async function owner(){return SecureStore.getItemAsync(OWNER_KEY);}
async function load(ownerId:string){return SecureStore.getItemAsync(configKeyFor(ownerId));}
async function isLocal(ownerId:string){return (await SecureStore.getItemAsync(localMarkerFor(ownerId)))==='1';}
async function localProfile():Promise<{ownerId:string;config:string}|null>{
  const ownerId=await owner();
  if(!ownerId||!(await isLocal(ownerId))) return null;
  const config=await load(ownerId);
  if(!config) return null;
  try{return {ownerId,config:validateConfig(config)}}catch{return null;}
}
async function saveService(userId:string,configText:string){
  const value=validateConfig(configText);
  const secure={keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY} as const;
  await SecureStore.setItemAsync(configKeyFor(userId),value,secure);
  await SecureStore.setItemAsync(OWNER_KEY,userId,secure);
  await SecureStore.deleteItemAsync(localMarkerFor(userId)).catch(()=>{});
  await SecureStore.deleteItemAsync(LEGACY_CONFIG_KEY).catch(()=>{});
}

export async function clearWireGuardConfig(){
  const ownerId=await owner();
  if(ownerId){await SecureStore.deleteItemAsync(configKeyFor(ownerId)).catch(()=>{});await SecureStore.deleteItemAsync(localMarkerFor(ownerId)).catch(()=>{});}
  await SecureStore.deleteItemAsync(OWNER_KEY).catch(()=>{});
  await SecureStore.deleteItemAsync(LEGACY_CONFIG_KEY).catch(()=>{});
}

export async function syncVpnProfileFromAccount():Promise<VpnProvisioningState>{
  const local=await localProfile();
  if(local) return {configured:true,source:'local'};
  const session=await currentSession().catch(()=>null);
  if(!session?.access_token||!session.user) return {configured:false,source:'none'};
  const {data,error}=await getSupabase().functions.invoke('raid-vpn-config',{body:{},headers:{Authorization:`Bearer ${session.access_token}`}});
  if(error) throw new Error('تعذر الاتصال بخدمة RAID VPN.');
  const payload=data as VpnFunctionPayload|null;
  if(payload?.error==='VPN_SERVICE_NOT_CONFIGURED'||payload?.reason==='NO_VPN_SERVER') throw new Error('خادم RAID VPN غير مربوط بخدمة التزويد التلقائي بعد.');
  if(!payload?.configured||!payload.configText) return {configured:false,source:'none'};
  await saveService(session.user.id,payload.configText);
  return {configured:true,source:'service'};
}

export async function getVpnProvisioningState():Promise<VpnProvisioningState>{
  const local=await localProfile();
  if(local) return {configured:true,source:'local'};
  const ownerId=await owner();
  if(ownerId&&ownerId!==LOCAL_OWNER){
    const cached=await load(ownerId);
    if(cached){try{validateConfig(cached);return {configured:true,source:'cache'}}catch{}}
  }
  return syncVpnProfileFromAccount().catch(()=>({configured:false,source:'none'}));
}

export async function connectVpn(){
  const local=await localProfile();
  if(local) return native().connect(local.config);
  const state=await syncVpnProfileFromAccount();
  if(!state.configured) throw new Error('لا يوجد إعداد VPN صالح. افتح مزود VPN وأضف إعداد WireGuard أولًا.');
  const ownerId=await owner();
  if(!ownerId) throw new Error('لا يوجد إعداد VPN محفوظ.');
  const config=await load(ownerId);
  if(!config) throw new Error('لا يوجد إعداد VPN محفوظ.');
  return native().connect(validateConfig(config));
}
export async function disconnectVpn(){return native().disconnect();}
export async function isVpnConnected(){return native().getStatus();}
