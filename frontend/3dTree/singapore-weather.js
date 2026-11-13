import { availableAreas, nearestPoint, recentRain, singaporeCoordinates } from './singapore-rain.js';

const rainFeed = 'https://api-open.data.gov.sg/v2/real-time/api/rainfall';
const areaFeed = 'https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast';
const skyFeed = 'https://api.open-meteo.com/v1/forecast?'+new URLSearchParams({
  latitude:1.3521, longitude:103.8198, current:'weather_code,cloud_cover',
  daily:'sunrise,sunset', timezone:'Asia/Singapore', forecast_days:2,
});
const displayClock = new Intl.DateTimeFormat('en-SG',{
  timeZone:'Asia/Singapore',hour:'2-digit',minute:'2-digit',hourCycle:'h23',
});
const singaporeTime = now => displayClock.format(now)+' SGT';
const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
function localTime(value) {
  if (typeof value!=='string') return NaN;
  return Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : value+'+08:00');
}
function fresh(stamp,now,minutes) {
  return Number.isFinite(stamp) && stamp<=now+90000 && now-stamp<=minutes*60000;
}
function solarState(now,forecast) {
  const date = new Date(now+8*3600000).toISOString().slice(0,10);
  function solarTime(key,fallback) {
    const value=forecast?.daily?.[key]?.find?.(time=>typeof time==='string'&&time.startsWith(date));
    const parsed=localTime(value);
    return Number.isFinite(parsed)?parsed:localTime(date+'T'+fallback);
  }
  const sunrise=solarTime('sunrise','07:00'), sunset=solarTime('sunset','19:10');
  const minute=60000;
  const dawn=sunrise-25*minute, daylight=sunrise+15*minute;
  const evening=sunset-25*minute, dark=sunset+25*minute;
  if (now<dawn || now>=dark) return {phase:2,period:'Night'};
  if (now<daylight) {
    const phase=now<sunrise ? 1+(sunrise-now)/(sunrise-dawn) : (daylight-now)/(daylight-sunrise);
    return {phase,period:'Sunrise'};
  }
  if (now<evening) return {phase:0,period:'Day'};
  const phase=now<sunset ? (now-evening)/(sunset-evening) : 1+(now-sunset)/(dark-sunset);
  return {phase,period:'Sunset'};
}

export function conditions(now,observations,forecast,area=null) {
  const reading=recentRain(observations,now,area);
  const current=forecast?.current;
  const available=fresh(localTime(current?.time),now,45);
  const wet=(reading?.amount??0)>0;
  const rain=wet?clamp(.46+reading.amount*.30,.46,1):0;
  const clouds=clamp(Math.max(available?(current.cloud_cover??34)/100:.34,rain*.8),0,1);
  const {phase,period}=solarState(now,forecast);
  const thunder=wet && available && current.weather_code>=95;

  let status='Rain data unavailable';
  if (reading) {
    if (!wet) status='No rain reported';
    else if (area) status='Rain reported';
    else status='Rain at '+reading.wetCount+(reading.wetCount===1?' gauge':' gauges');
  }
  const name=area?.name??'All Singapore';
  const label=name+' · '+period+' · '+status+' · '+singaporeTime(now);
  const detail=reading
    ? (reading.station?reading.station+' rain gauge · ':'')+'Reading at '+singaporeTime(reading.at)
    : '';
  return {phase,period,rain,clouds,thunder,label,detail};
}

export function installSkyControls(weather,camera) {
  const live=document.querySelector('#live-weather'), manual=document.querySelector('#manual-weather');
  const rainButton=document.querySelector('#rain-weather'), play=document.querySelector('#play-sunset');
  const readout=document.querySelector('#weather-readout'), presets=[...document.querySelectorAll('.weather-options [data-sky]')];
  const areaPanel=document.querySelector('#weather-location'), areaSelect=document.querySelector('#weather-area');
  const locationNote=document.querySelector('#weather-location-note');
  const phases={sunrise:1,day:0,sunset:1,night:2};
  const rising={sunrise:true,sunset:false};
  const themes={Day:'sunny',Sunrise:'sunrise',Sunset:'sunset',Night:'night'};
  for (const button of [live,manual,rainButton,play,...presets]) button.disabled=false;
  areaSelect.disabled=false;

  const rainfall={url:rainFeed,interval:60000};
  const locations={url:areaFeed,interval:30*60000};
  const sky={url:skyFeed,interval:5*60000};
  const feeds=[rainfall,locations,sky];
  let active=false, preset='day', raining=false, playing=false, liveState=null, timer;
  let areas=new Map(), listedNames='', pickedArea=false;
  let detectedPoint=null, locationMessage='', watchId=null, watchGeneration=0;

  function updateAreaChoices() {
    const selected=areaSelect.value||'all';
    const updated=new Map([...availableAreas(locations.data,rainfall.data).values()]
      .map(area=>['area:'+area.name,area]));
    // Keep a selected gauge when the named-area list finishes loading.
    if (areas.has(selected) && !updated.has(selected)) updated.set(selected,areas.get(selected));
    areas=updated;
    const options=[...areas].sort((a,b)=>a[1].name.localeCompare(b[1].name));
    const names=options.map(([key])=>key).join('\n');
    if (names===listedNames) return;
    listedNames=names;
    areaSelect.replaceChildren(new Option('All Singapore','all'),new Option('Use my location','location'),
      ...options.map(([key,area])=>new Option(area.name,key)));
    areaSelect.value=selected;
  }

  function selectedArea() {
    if (areaSelect.value!=='location') return areas.get(areaSelect.value)??null;
    if (!detectedPoint) return null;
    const nearest=nearestPoint(detectedPoint,areas.values());
    return {...detectedPoint,name:nearest?'Near '+nearest.name:'My location'};
  }

  function refresh() {
    live.setAttribute('aria-pressed',String(active));
    manual.setAttribute('aria-pressed',String(!active));
    const rain=active?liveState?.rain>0:raining;
    rainButton.setAttribute('aria-pressed',String(rain));
    play.setAttribute('aria-pressed',String(playing));
    for (const button of presets) button.setAttribute('aria-pressed',String(!active&&!playing&&button.dataset.sky===preset));
    areaPanel.hidden=!active;
    locationNote.hidden=!locationMessage;
    if (locationNote.textContent!==locationMessage) locationNote.textContent=locationMessage;
    readout.hidden=!(active||playing);
    let label='Day → Sunset → Night';
    if (active) {
      const clock=liveState.period+' · '+singaporeTime(Date.now());
      if (areaSelect.value==='location' && !detectedPoint) label=clock;
      else label=rainfall.checked?liveState.label:'Checking rain · '+clock;
    }
    if (readout.textContent!==label) readout.textContent=label;
    readout.title=active?liveState.detail:'';
    const skyName=active?themes[liveState.period]
      :playing?'sunset':preset==='day'?'sunny':preset;
    document.body.dataset.weather=rain?'rain':skyName;
  }

  function clearLocation() {
    watchGeneration++;
    if (watchId!==null) navigator.geolocation.clearWatch(watchId);
    watchId=null;
    detectedPoint=null;
    locationMessage='';
  }

  function stopLive() {
    active=false;
    clearInterval(timer);
    clearLocation();
    for (const feed of feeds) {
      feed.request?.abort();
      feed.request=null;
    }
  }
  function manualRain() {
    weather.setRain(raining ? 1 : 0, raining ? .88 : .34,raining);
  }
  function selectSky(skyName) {
    stopLive();
    preset=skyName;
    playing=false;
    weather.setSky(phases[skyName],camera,{rising:rising[skyName]});
    manualRain();
    refresh();
  }
  function applyLive(seconds) {
    const area=selectedArea();
    const observations=areaSelect.value==='location'&&!area?null:rainfall.data;
    liveState=conditions(Date.now(),observations,sky.data,area);
    weather.setSky(liveState.phase,camera,{
      seconds,align:false,rising:rising[liveState.period.toLowerCase()],
    });
    weather.setRain(liveState.rain,liveState.clouds,liveState.thunder);
    refresh();
  }

  async function refreshFeed(feed) {
    if (feed.request || Date.now()<(feed.nextPoll??0)) return;
    const request=new AbortController();
    feed.request=request;
    let data;
    try {
      const response=await fetch(feed.url,{
        signal:AbortSignal.any([request.signal,AbortSignal.timeout(7000)]),
        cache:'no-store',
      });
      if (response.ok) data=await response.json();
    } catch {
      // The last usable response can still supply a recent reading.
    }
    if (feed.request!==request || !active) return;
    feed.request=null;
    feed.checked=true;
    feed.nextPoll=Date.now()+(data?feed.interval:60000);
    if (data) feed.data=data;
    if (feed!==sky) updateAreaChoices();
    applyLive();
  }

  function tick() {
    if (!active) return;
    applyLive();
    return Promise.all(feeds.map(refreshFeed));
  }

  function locationUnavailable(message) {
    clearLocation();
    areaSelect.value='all';
    locationMessage=message;
    applyLive();
  }

  function changeArea() {
    clearLocation();
    if (areaSelect.value==='location') {
      const geolocation=navigator.geolocation;
      if (!geolocation) {
        locationUnavailable('Location is unavailable. Choose an area.');
        return;
      }
      locationMessage='Finding your area…';
      const generation=watchGeneration;
      watchId=geolocation.watchPosition(({coords})=>{
        if (generation!==watchGeneration) return;
        if (!singaporeCoordinates(coords)) {
          locationUnavailable('Location is outside the Singapore weather area. Choose an area.');
          return;
        }
        detectedPoint={latitude:coords.latitude,longitude:coords.longitude};
        locationMessage='';
        applyLive();
      },error=>{
        if (generation!==watchGeneration) return;
        if (error.code===1) {
          locationUnavailable('Location access is off. Choose an area.');
          return;
        }
        locationMessage='Waiting for your location. You can choose an area.';
        applyLive();
      },{maximumAge:60000,timeout:12000});
    }
    applyLive();
  }

  async function useGrantedLocation() {
    try {
      const permission=await navigator.permissions?.query({name:'geolocation'});
      if (permission?.state==='granted' && active && !pickedArea && areaSelect.value==='all') {
        areaSelect.value='location';
        changeArea();
      }
    } catch {
      // The location option can also request permission directly.
    }
  }

  function startLive(initial=false) {
    if (active) return;
    active=true;
    playing=false;
    if (!initial) weather.frameSky(camera);
    applyLive(initial?0:undefined);
    if (areaSelect.value==='location') changeArea();
    else if (!pickedArea) useGrantedLocation();
    tick();
    timer=setInterval(tick,15000);
  }

  updateAreaChoices();
  areaSelect.addEventListener('change',()=>{
    pickedArea=true;
    changeArea();
  });
  live.addEventListener('click',()=>startLive());
  document.addEventListener('visibilitychange',()=>{
    if (!document.hidden) tick();
  });
  manual.addEventListener('click',()=>selectSky(preset));
  for (const button of presets) button.addEventListener('click',()=>selectSky(button.dataset.sky));
  rainButton.addEventListener('click',()=>{
    raining=!(active?liveState?.rain>0:raining);
    if (active) selectSky(preset);
    else {manualRain();refresh();}
  });
  play.addEventListener('click',()=>{
    stopLive();
    preset='night';
    playing=true;
    manualRain();
    weather.playSunset(camera);
    refresh();
  });
  if (new URLSearchParams(location.search).get('weather')==='manual') refresh();
  else startLive(true);
  return ()=>{playing=false;refresh();};
}
