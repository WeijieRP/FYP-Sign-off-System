const riverFile='./assets/audio/river-loop.mp3';
const birdFile='./assets/audio/magpie-robin.mp3';

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
    riverGain=context.createGain();
    riverGain.gain.value=.92;
    riverGain.connect(master);
    windGain=context.createGain();
    windGain.gain.value=.20;
    windGain.connect(master);
    rainGain=context.createGain();
    rainGain.gain.value=0;
    rainGain.connect(master);
    birdGain=context.createGain();
    birdGain.gain.value=.74;
    if (context.createStereoPanner) {
      stereo=context.createStereoPanner();
      birdGain.connect(stereo).connect(master);
    } else {
      birdGain.connect(master);
    }
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
    drops.connect(low).connect(high).connect(rainGain);
    drops.start();
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

  return {
    get enabled() { return audible; },
    setLevel,
    leafSplash,
    thunder,
    cancelThunder,
    async toggle() {
      if (!context) initialise();
      const enable=!audible;
      if (enable) {
        // Resume directly in the click handler before waiting for the recordings.
        const resume=context.resume();
        preparation ??= prepare().catch(error=>{
          preparation=null;
          throw error;
        });
        await Promise.all([resume,preparation]);
        if (context.state!=='running') throw new Error('The browser did not start audio.');
      }
      audible=enable;
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
      if (time>=nextCall) {
        playCall(time+.025,pan);
        nextCall=time+(8.3+Math.random()*6.3)*(1+night*1.4+rain*.35);
      }
    },
  };
}
