import { createMusic, MUSIC_STYLE_DEFAULT } from './background-music.js';

// The page's sound: the ambient sounds the admin has chosen (3D Scene Controls > Sound: setMix), each on or
// off at its own volume:
//   river    the flowing river water (a recording; on by default)
//   birds    a magpie-robin calling now and then (a recording; on by default; quieter at night and in rain)
//   wind     the breeze in the trees, stronger in gusts (made here; on by default)
//   rain     a gentle, steady rain whatever the weather (made here; off by default)
//   insects  crickets and cicadas chirping, a little louder at night (made here; off by default)
// with the weather's own sounds (rain as it rains, thunder, a leaf's splash), and the background music in the
// admin's style (background-music.js; musicEnabled, musicStyle, at musicVolume) or the admin's uploaded music
// (musicStyle 'uploaded', musicTrack), all under the one volume and
// switched on together.
export const AMBIENT_SOUNDS = ['river', 'birds', 'wind', 'rain', 'insects'];
// The admin's settings (tree3dParameters ambientRiver, ambientRiverVolume and so on) as a mix for setMix.
export function mixFromSettings(settings = {}) {
  const sound = (key, name) => ({
    on: settings[key] === undefined ? MIX_DEFAULTS[name].on : settings[key] !== false,
    volume: Number.isFinite(Number(settings[`${key}Volume`])) ? Math.max(0, Math.min(100, Number(settings[`${key}Volume`]))) / 100 : MIX_DEFAULTS[name].volume,
  });
  return { river: sound('ambientRiver', 'river'), birds: sound('ambientBirds', 'birds'), wind: sound('ambientWind', 'wind'),
    rain: sound('ambientRain', 'rain'), insects: sound('ambientInsects', 'insects') };
}
const MIX_DEFAULTS = {
  river: { on: true, volume: 1 }, birds: { on: true, volume: 1 }, wind: { on: true, volume: 1 },
  rain: { on: false, volume: 0.6 }, insects: { on: false, volume: 0.6 },
};

// A few seconds of crickets and cicadas, made once, looped: each cricket a high tone chirping in short pulses
// a few times a second, each at its own pitch and pace, and a soft cicada shimmer under them.
function insectBuffer(context, seconds = 9) {
  const rate = context.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = context.createBuffer(2, length, rate);
  const crickets = [
    { pitch: 4300, every: 0.62, pulses: 3, pan: -0.5, level: 0.22, offset: 0.1 },
    { pitch: 4750, every: 0.81, pulses: 4, pan: 0.45, level: 0.17, offset: 0.37 },
    { pitch: 3900, every: 1.13, pulses: 2, pan: 0.1, level: 0.13, offset: 0.6 },
  ];
  let seed = 51721, hiss = 0;
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      let value = 0;
      for (const c of crickets) {
        const side = channel === 0 ? 1 - Math.max(0, c.pan) : 1 + Math.min(0, c.pan);
        const inChirp = (t + c.offset) % c.every;
        const pulse = inChirp / 0.034;                    // each pulse 34 ms apart
        if (pulse < c.pulses) {
          const within = (pulse % 1) * 0.034;
          const shape = Math.sin(Math.PI * Math.min(1, within / 0.022)) ** 2; // a soft 22 ms pulse
          value += c.level * side * shape * Math.sin(2 * Math.PI * c.pitch * t);
        }
      }
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      hiss += 0.5 * ((seed / 2147483648 - 1) - hiss);
      const shimmer = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.21 * t + channel);   // the cicadas swell and fade
      value += hiss * 0.025 * shimmer * Math.sin(2 * Math.PI * 6200 * t);
      const edge = Math.min(1, i / 2000, (length - i) / 2000); // loops without a click
      data[i] = value * edge;
    }
  }
  return buffer;
}
// Next to this file, so the admin's Listen here (another page) finds them too.
const riverFile=new URL('./assets/audio/river-loop.mp3',import.meta.url).href;
const birdFile=new URL('./assets/audio/magpie-robin.mp3',import.meta.url).href;

function waterDropBuffer(context) {
  const rate=context.sampleRate;
  const buffer=context.createBuffer(1,Math.ceil(rate*.30),rate);
  const samples=buffer.getChannelData(0);
  let seed=78133, filtered=0;
  for (let i=0;i<samples.length;i++) {
    const time=i/rate;
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const noise=seed/2147483648-1;
    filtered+=.22*(noise-filtered);
    const plip=Math.sin(2*Math.PI*(570*time+3.9*(1-Math.exp(-45*time))))*Math.exp(-54*time);
    const spray=(.75*filtered+.25*noise)*Math.exp(-34*time);
    const after=Math.max(0,time-.035);
    const droplet=Math.sin(2*Math.PI*(1000*after+1.6*(1-Math.exp(-58*after))))*Math.exp(-72*after);
    samples[i]=(.56*plip+.33*spray+.18*droplet)*(1-Math.exp(-510*time));
  }
  return buffer;
}

export function createAmbience() {
  let context, master, riverGain, windGain, rainGain, birdGain, stereo, birds, preparation;
  let level=.78, audible=false, nextCall=Infinity, thunderBuffer, splashBuffer;
  let musicBus, music, musicOn=true, musicLevel=.45, musicStyle=MUSIC_STYLE_DEFAULT, musicTrack='';
  // The admin's ambient sounds: each its own gain (mixGains) after the scene's own changes (gusts, night, rain).
  let mix=structuredClone(MIX_DEFAULTS);
  const mixGains={};
  let gentleRainGain, insectGain;
  const thunderVoices=new Set();

  async function decode(file) {
    const response=await fetch(file);
    if (!response.ok) throw new Error('Audio asset failed to load: '+file);
    return context.decodeAudioData(await response.arrayBuffer());
  }

  function initialise() {
    const Audio=window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('Web Audio is unavailable in this browser.');
    context=new Audio();
    master=context.createGain();
    master.gain.value=0;
    const limiter=context.createDynamicsCompressor();
    limiter.threshold.value=-12;
    limiter.knee.value=12;
    limiter.ratio.value=3;
    limiter.attack.value=.014;
    limiter.release.value=.23;
    master.connect(limiter).connect(context.destination);
    musicBus=context.createGain();
    musicBus.gain.value=musicLevel;
    musicBus.connect(master);
    music=createMusic(context,musicBus,musicStyle,musicTrack);
    for (const name of AMBIENT_SOUNDS) {
      mixGains[name]=context.createGain();
      mixGains[name].gain.value=mixLevel(name);
      mixGains[name].connect(master);
    }
    riverGain=context.createGain();
    riverGain.gain.value=.92;
    riverGain.connect(mixGains.river);
    windGain=context.createGain();
    windGain.gain.value=.20;
    windGain.connect(mixGains.wind);
    rainGain=context.createGain();
    rainGain.gain.value=0;
    rainGain.connect(master); // the weather's rain, as it rains
    gentleRainGain=context.createGain();
    gentleRainGain.gain.value=.32;
    gentleRainGain.connect(mixGains.rain); // the admin's gentle rain, whatever the weather
    insectGain=context.createGain();
    insectGain.gain.value=.8;
    insectGain.connect(mixGains.insects);
    birdGain=context.createGain();
    birdGain.gain.value=.74;
    if (context.createStereoPanner) {
      stereo=context.createStereoPanner();
      birdGain.connect(stereo).connect(mixGains.birds);
    } else {
      birdGain.connect(mixGains.birds);
    }
  }

  // An ambient sound's level as the admin set it: 0 when off.
  function mixLevel(name) {
    const sound=mix[name];
    return sound?.on ? Math.max(0,Math.min(1,Number(sound.volume))) : 0;
  }

  async function prepare() {
    const [water,call]=await Promise.all([decode(riverFile),decode(birdFile)]);
    const river=context.createBufferSource();
    river.buffer=water;
    river.loop=true;
    river.connect(riverGain);
    river.start();
    const breeze=context.createBuffer(1,context.sampleRate*8,context.sampleRate);
    const samples=breeze.getChannelData(0);
    const shower=context.createBuffer(1,context.sampleRate*8,context.sampleRate);
    const rainSamples=shower.getChannelData(0);
    let slow=0, rustle=0, seed=20301;
    for(let i=0;i<samples.length;i++) {
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const noise=seed/2147483648-1;
      slow+=.006*(noise-slow);
      rustle+=.067*(noise-rustle);
      const edge=Math.min(1,i/550,(samples.length-i)/550);
      samples[i]=edge*(slow*1.35+rustle*.42);
      rainSamples[i]=edge*(noise*.40+rustle*.24);
    }
    const wind=context.createBufferSource();
    wind.buffer=breeze;
    wind.loop=true;
    wind.connect(windGain);
    wind.start();
    const drops=context.createBufferSource();
    drops.buffer=shower;
    drops.loop=true;
    const low=context.createBiquadFilter();
    low.type='lowpass';
    low.frequency.value=5700;
    const high=context.createBiquadFilter();
    high.type='highpass';
    high.frequency.value=280;
    const rainSound=drops.connect(low).connect(high);
    rainSound.connect(rainGain);
    rainSound.connect(gentleRainGain);
    drops.start();
    const insects=context.createBufferSource();
    insects.buffer=insectBuffer(context);
    insects.loop=true;
    const insectBand=context.createBiquadFilter();
    insectBand.type='highpass';
    insectBand.frequency.value=2200;
    insects.connect(insectBand).connect(insectGain);
    insects.start();
    // A reusable, low-frequency thunder roll; no remote sound requests.
    thunderBuffer=context.createBuffer(1,context.sampleRate*5.8,context.sampleRate);
    const rumble=thunderBuffer.getChannelData(0);
    let body=0, lowBody=0;
    for(let i=0;i<rumble.length;i++) {
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const noise=seed/2147483648-1;
      body+=.065*(noise-body);
      lowBody+=.008*(noise-lowBody);
      const t=i/context.sampleRate;
      const envelope=(1-Math.exp(-t*24))*Math.exp(-t*.72);
      const echoes=.76+.15*Math.sin(t*8.7)+.09*Math.sin(t*17.2);
      const end=Math.min(1,(rumble.length-i)/4000);
      rumble[i]=(body*1.9+lowBody*4.3+noise*.035)*envelope*echoes*end;
    }
    splashBuffer=waterDropBuffer(context);
    birds=call;
  }

  function leafSplash(pan,distance) {
    if (!audible || !splashBuffer || context.state!=='running') return;
    const source=context.createBufferSource(), gain=context.createGain();
    const panner=context.createStereoPanner?.();
    source.buffer=splashBuffer;
    source.playbackRate.value=.94+Math.random()*.12;
    gain.gain.value=.38/(1+distance*.021);
    source.connect(gain);
    if (panner) {
      panner.pan.value=pan*.78;
      gain.connect(panner).connect(master);
    } else gain.connect(master);
    source.onended=()=>{source.disconnect();gain.disconnect();panner?.disconnect();};
    source.start();
  }

  function thunder(delay,strength=1,pan=0) {
    if(!audible || !thunderBuffer || context.state!=='running') return;
    const source=context.createBufferSource();
    source.buffer=thunderBuffer;
    source.playbackRate.value=.86+strength*.14;
    const lowpass=context.createBiquadFilter();
    lowpass.type='lowpass';
    lowpass.frequency.value=480+strength*650;
    const gain=context.createGain();
    gain.gain.value=.78+strength*.40;
    const panner=context.createStereoPanner?.();
    source.connect(lowpass).connect(gain);
    if(panner) {
      panner.pan.value=pan;
      gain.connect(panner).connect(master);
    } else gain.connect(master);
    const voice={source,lowpass,gain,panner};
    thunderVoices.add(voice);
    source.onended=()=>{
      source.disconnect();lowpass.disconnect();gain.disconnect();panner?.disconnect();
      thunderVoices.delete(voice);
    };
    source.start(context.currentTime+Math.max(0,delay));
  }

  function cancelThunder() {
    if(!context) return;
    for(const voice of thunderVoices) {
      voice.gain.gain.setTargetAtTime(0,context.currentTime,.035);
      try {voice.source.stop(context.currentTime+.14);} catch {}
    }
  }

  function playCall(at,pan) {
    if (stereo) stereo.pan.setTargetAtTime(pan*.63,at,.11);
    const call=context.createBufferSource();
    call.buffer=birds;
    call.playbackRate.value=.94+Math.random()*.13;
    call.connect(birdGain);
    call.start(at);
    call.onended=()=>call.disconnect();
  }

  function setLevel(value) {
    level=Math.max(0,Math.min(1,value));
    if (master) master.gain.setTargetAtTime(audible?level:0,context.currentTime,.085);
  }

  // The background music on or off, how loud against the ambient sounds (0 to 1) and its style
  // (background-music.js MUSIC_STYLES, or 'uploaded': the admin's own music, track, a file in assets/Tree/music);
  // all may be set before the sound is first turned on.
  function setMusic(on,value,style,track) {
    musicOn=Boolean(on);
    if (Number.isFinite(value)) musicLevel=Math.max(0,Math.min(1,value));
    if (style) musicStyle=style;
    if (track!==undefined) musicTrack=track||'';
    if (musicBus) musicBus.gain.setTargetAtTime(musicLevel,context.currentTime,.15);
    music?.setStyle(musicStyle,musicTrack);
    music?.setActive(audible&&musicOn);
  }

  // The admin's ambient sounds: { river: { on, volume (0 to 1) }, birds, wind, rain, insects }; any left out
  // stay as they are. May be set before the sound is first turned on.
  function setMix(next={}) {
    for (const name of AMBIENT_SOUNDS) {
      if (!next[name]) continue;
      mix[name]={ on: next[name].on!==false, volume: Number.isFinite(Number(next[name].volume)) ? Number(next[name].volume) : mix[name].volume };
      mixGains[name]?.gain.setTargetAtTime(mixLevel(name),context.currentTime,.2);
    }
  }

  return {
    get enabled() { return audible; },
    get musicPlaying() { return Boolean(music?.active); },
    setLevel,
    setMusic,
    setMix,
    leafSplash,
    thunder,
    cancelThunder,
    async toggle() {
      if (!context) initialise();
      const enable=!audible;
      if (enable) {
        // Resume directly in the click handler before waiting for the recordings. A browser that plays sound
        // only after a touch on the page leaves it suspended (and its resume waiting): then it is not waited for,
        // so the next touch can start it (SoundBlocked; tree3d-settings.js armSoundRetry).
        const resume=context.resume().catch(()=>{});
        preparation ??= prepare().catch(error=>{
          preparation=null;
          throw error;
        });
        await Promise.all([Promise.race([resume,new Promise(done=>setTimeout(done,1500))]),preparation]);
        if (context.state!=='running') {
          const blocked=new Error('The browser plays sound only after a touch on the page.');
          blocked.name='SoundBlocked';
          throw blocked;
        }
      }
      audible=enable;
      music.setActive(audible&&musicOn);
      if(!audible) cancelThunder();
      setLevel(level);
      nextCall=audible?context.currentTime+.66:Infinity;
      return audible;
    },
    update(pan,distance,gust,rain=0,night=0) {
      if (!audible || context.state!=='running') return;
      const time=context.currentTime;
      riverGain.gain.setTargetAtTime(.74+.23*Math.exp(-distance/47)+.07*gust,time,.22);
      windGain.gain.setTargetAtTime(.22+.76*gust+.05*Math.sin(time*.36),time,.26);
      rainGain.gain.setTargetAtTime(rain*.47,time,.25);
      birdGain.gain.setTargetAtTime(.74*(1-.80*night)*(1-.40*rain),time,.3);
      insectGain.gain.setTargetAtTime(.55+.45*night,time,.6); // the insects a little louder at night
      if (time>=nextCall && mix.birds.on) {
        playCall(time+.025,pan);
        nextCall=time+(8.3+Math.random()*6.3)*(1+night*1.4+rain*.35);
      }
    },
  };
}
