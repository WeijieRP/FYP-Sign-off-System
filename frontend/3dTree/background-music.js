// Background music for the 3D ESG Tree: a gentle piece that plays together with the ambient sounds
// (ambience.js) whenever the page's sound is on and the admin has chosen a music style (3D Scene Controls >
// Sound: tree3dParameters.musicEnabled, musicStyle, at musicVolume). It is original music composed here, live,
// by the browser (Web Audio), so it is never the same twice and there is no recording or anyone else's music
// in it, nothing to license. Each style (MUSIC_STYLES) has its own pace, chords, instrument and how busy its
// tune is:
//   kalimba   Calm kalimba: soft kalimba notes over a warm pad and a low bass (the first style, the default)
//   piano     Soft piano: a slow, quiet piano tune with a gently broken chord in the left hand
//   dreamy    Dreamy pads: long, slowly swelling chords with a few far-off bell notes, very calm
//   musicbox  Music box: a light, twinkling music box rippling through the chords, high and delicate
// Each bar has its chord; the tune is chosen as it plays, moving by small steps through the chord's notes and
// the style's scale, with rests, so it breathes like the river. All in a hall's echo. Turning it off (or
// changing the style) fades it out; a new style fades in.
// Or the admin's own music (UPLOADED_STYLE, 'My uploaded music': tree3dParameters.musicTrack, a file uploaded in
// Admin > 3D Tree Settings > Sound to assets/Tree/music): it plays looped instead, through the same volume and
// fades, with the river, birds and wind as before. If it cannot be played (deleted, or a format this browser
// does not play), the Calm kalimba plays instead.

const midiHz = note => 440 * 2 ** ((note - 69) / 12);

// One chord per bar (MIDI notes; 60 = middle C): its bass and the notes of its pad.
const CALM_CHORDS = [
  { bass: 36, pad: [55, 59, 62, 64] }, // Cmaj9
  { bass: 33, pad: [55, 60, 64, 67] }, // Am7
  { bass: 29, pad: [57, 60, 64, 65] }, // Fmaj7
  { bass: 31, pad: [55, 59, 62, 67] }, // G
];
const PIANO_CHORDS = [
  { bass: 41, pad: [57, 60, 64] }, // F
  { bass: 43, pad: [59, 62, 67] }, // G
  { bass: 40, pad: [55, 59, 64] }, // Em
  { bass: 45, pad: [57, 60, 64] }, // Am
];
const DREAMY_CHORDS = [
  { bass: 36, pad: [52, 55, 59, 62] }, // Cmaj9
  { bass: 40, pad: [55, 59, 62, 66] }, // Em7 with a raised colour
  { bass: 41, pad: [57, 60, 64, 67] }, // Fmaj9
  { bass: 33, pad: [55, 60, 64, 71] }, // Am(add9)
];

export const MUSIC_STYLES = {
  kalimba: { name: 'Calm kalimba', bpm: 62, chords: CALM_CHORDS, scale: [72, 74, 76, 79, 81, 84, 86], busy: 0.32,
    lead: 'kalimba', levels: { pad: 0.034, bass: 0.12, lead: 0.16 } },
  piano: { name: 'Soft piano', bpm: 56, chords: PIANO_CHORDS, scale: [64, 65, 67, 69, 71, 72, 74, 76, 77, 79], busy: 0.27,
    lead: 'piano', leftHand: true, levels: { pad: 0.012, bass: 0, lead: 0.22 } },
  dreamy: { name: 'Dreamy pads', bpm: 46, chords: DREAMY_CHORDS, scale: [76, 79, 81, 83, 84, 88], busy: 0.1,
    lead: 'bell', levels: { pad: 0.05, bass: 0.06, lead: 0.08 } },
  musicbox: { name: 'Music box', bpm: 74, chords: CALM_CHORDS, scale: [79, 81, 83, 84, 86, 88, 91, 93], busy: 0.55,
    lead: 'musicbox', arpeggio: true, levels: { pad: 0.016, bass: 0, lead: 0.2 } },
};
export const MUSIC_STYLE_DEFAULT = 'kalimba';
export const UPLOADED_STYLE = 'uploaded';
const UPLOADED_LEVEL = 0.4; // a recording is mastered much louder than the music composed here: this evens them out
const styleOf = name => MUSIC_STYLES[name] || MUSIC_STYLES[MUSIC_STYLE_DEFAULT];
const knownStyle = name => (name === UPLOADED_STYLE || MUSIC_STYLES[name] ? name : MUSIC_STYLE_DEFAULT);

function envelope(context, output, start, attack, peak, hold, release) {
  const gain = context.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + attack);
  gain.gain.setValueAtTime(peak, start + attack + hold);
  gain.gain.setTargetAtTime(0, start + attack + hold, release / 4);
  gain.connect(output);
  return gain;
}

function tone(context, type, frequency, detune = 0) {
  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  oscillator.detune.value = detune;
  return oscillator;
}

// A warm, slow pad: two soft saws a little apart, through a low filter.
function pad(context, output, note, start, length, level, attackShare = 0.35) {
  if (level <= 0) return;
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  filter.Q.value = 0.4;
  const attack = Math.min(length * 0.8, Math.max(0.3, length * attackShare));
  filter.connect(envelope(context, output, start, attack, level, Math.max(0, length - attack), 3));
  for (const detune of [-7, 7]) {
    const oscillator = tone(context, 'sawtooth', midiHz(note), detune);
    oscillator.connect(filter);
    oscillator.start(start);
    oscillator.stop(start + length + 3.5);
  }
}

// A low, soft bass under each chord.
function bass(context, output, note, start, length, level) {
  if (level <= 0) return;
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 320;
  filter.connect(envelope(context, output, start, 0.25, level, length - 0.25, 1.4));
  const oscillator = tone(context, 'triangle', midiHz(note));
  oscillator.connect(filter);
  oscillator.start(start);
  oscillator.stop(start + length + 2);
}

// The instruments for the tune: each a few sine partials with its own attack and decay.
//   kalimba   a round tine with a short bright click
//   piano     a soft hammer: the note with its octave and twelfth, fading over a few seconds, darker as it fades
//   bell      a far-off bell: inharmonic partials ringing long
//   musicbox  a small steel comb: bright, short, with a high glint
const INSTRUMENTS = {
  kalimba: [{ ratio: 1, share: 1, decay: 1.6 }, { ratio: 5.4, share: 0.22, decay: 0.12, attack: 0.002 }],
  piano: [{ ratio: 1, share: 1, decay: 2.8 }, { ratio: 2, share: 0.35, decay: 1.4 }, { ratio: 3, share: 0.12, decay: 0.7 }],
  bell: [{ ratio: 1, share: 1, decay: 4.5 }, { ratio: 2.76, share: 0.35, decay: 2.2 }, { ratio: 5.4, share: 0.12, decay: 1 }],
  musicbox: [{ ratio: 1, share: 1, decay: 1.1 }, { ratio: 4, share: 0.3, decay: 0.35 }, { ratio: 9.2, share: 0.08, decay: 0.08 }],
};
function play(context, output, instrument, note, start, level) {
  for (const { ratio, share, decay, attack = 0.004 } of INSTRUMENTS[instrument]) {
    const partial = tone(context, 'sine', midiHz(note) * ratio);
    partial.connect(envelope(context, output, start, attack, level * share, 0, decay));
    partial.start(start);
    partial.stop(start + decay * 1.6 + 0.2);
  }
}

// A hall's echo, made once: two channels of fading noise.
function hallReverb(context, seconds = 3.4) {
  const length = Math.floor(context.sampleRate * seconds);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    let smooth = 0;
    for (let i = 0; i < length; i++) {
      smooth += 0.35 * ((Math.random() * 2 - 1) - smooth); // a little darker than white noise
      data[i] = smooth * (1 - i / length) ** 2.4;
    }
  }
  const reverb = context.createConvolver();
  reverb.buffer = impulse;
  return reverb;
}

// The music player: setActive(true) plays the chosen style (bars are scheduled a moment ahead on the audio
// clock), setActive(false) fades it out; setStyle changes the style, fading one into the other while playing.
export function createMusic(context, output, styleName = MUSIC_STYLE_DEFAULT, trackUrl = '') {
  const reverb = hallReverb(context);
  reverb.connect(output);
  let style = knownStyle(styleName);
  let track = trackUrl || '';
  let playing = null;

  function start(name) {
    if (name !== UPLOADED_STYLE) return compose(name);
    return track ? playTrack(track) : compose(MUSIC_STYLE_DEFAULT); // none uploaded yet: the page's own music
  }

  // The admin's uploaded music, looped, faded in and out like the composed music.
  function playTrack(url) {
    const audio = new Audio();
    audio.loop = true;
    audio.preload = 'auto';
    audio.src = url;
    const source = context.createMediaElementSource(audio);
    const bus = context.createGain();
    bus.gain.value = 0;
    source.connect(bus).connect(output);
    let stopped = false;
    const handle = {
      stop() {
        stopped = true;
        bus.gain.setTargetAtTime(0, context.currentTime, 0.6);
        window.setTimeout(() => {
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
          source.disconnect();
          bus.disconnect();
        }, 3000);
      },
    };
    const instead = reason => {
      if (stopped) return;
      console.warn(`The uploaded music (${url}) cannot be played, so the Calm kalimba plays instead:`, reason);
      handle.stop();
      if (playing === handle) playing = compose(MUSIC_STYLE_DEFAULT);
    };
    audio.addEventListener('error', () => instead(audio.error?.message || `media error ${audio.error?.code ?? ''}`));
    audio.play().catch(error => { if (error?.name !== 'AbortError') instead(error?.message || error); });
    bus.gain.setTargetAtTime(UPLOADED_LEVEL, context.currentTime, 0.8);
    return handle;
  }

  function compose(name) {
    const piece = styleOf(name);
    const beat = 60 / piece.bpm;
    const barLength = beat * 4;
    const { levels } = piece;
    const bus = context.createGain();
    bus.gain.value = 0;
    const dry = context.createGain();
    dry.gain.value = 0.72;
    const wet = context.createGain();
    wet.gain.value = piece.lead === 'bell' ? 0.85 : 0.6;
    bus.connect(dry).connect(output);
    bus.connect(wet).connect(reverb);
    let bar = 0;
    let nextBar = context.currentTime + 0.15;
    let lastNote = piece.scale[Math.floor(piece.scale.length / 2)];

    function scheduleBar(at) {
      const chord = piece.chords[bar % piece.chords.length];
      bass(context, bus, chord.bass, at, barLength, levels.bass);
      for (const note of chord.pad) pad(context, bus, note, at, barLength + 0.4, levels.pad, piece.lead === 'bell' ? 0.6 : 0.35);
      // The piano's left hand: the chord broken gently, low, on the first and third beats.
      if (piece.leftHand) {
        play(context, bus, 'piano', chord.bass, at, levels.lead * 0.55);
        play(context, bus, 'piano', chord.pad[0], at + beat * 0.5, levels.lead * 0.35);
        play(context, bus, 'piano', chord.bass + 7, at + beat * 2, levels.lead * 0.4);
        play(context, bus, 'piano', chord.pad[1], at + beat * 2.5, levels.lead * 0.3);
      }
      // The tune: on each eighth note, a note now and then, by small steps, often a note of the chord. The
      // music box ripples up and down through the chord's notes instead.
      const chordNotes = new Set(chord.pad.map(note => note % 12));
      for (let step = 0; step < 8; step++) {
        const strong = step % 2 === 0;
        if (Math.random() > piece.busy * (strong ? 1.3 : 0.7)) continue;
        let note;
        if (piece.arpeggio) {
          const fitting = piece.scale.filter(n => chordNotes.has(n % 12));
          const run = fitting.length ? fitting : piece.scale;
          note = run[(bar * 3 + (step < 4 ? step : 7 - step)) % run.length];
        } else {
          const near = piece.scale.filter(n => Math.abs(n - lastNote) <= 5 && n !== lastNote);
          const choices = near.length ? near : piece.scale;
          const fitting = choices.filter(n => chordNotes.has(n % 12));
          const pool = strong && fitting.length ? fitting : choices;
          note = pool[Math.floor(Math.random() * pool.length)];
        }
        lastNote = note;
        const swing = (Math.random() - 0.5) * 0.03; // played by hand, not by a machine
        play(context, bus, piece.lead, note, at + step * beat / 2 + swing, levels.lead * (0.75 + Math.random() * 0.35));
      }
      bar += 1;
    }

    const timer = window.setInterval(() => {
      while (nextBar < context.currentTime + 1.6) {
        scheduleBar(nextBar);
        nextBar += barLength;
      }
    }, 300);
    bus.gain.setTargetAtTime(1, context.currentTime, 0.8);
    return {
      stop() {
        window.clearInterval(timer);
        bus.gain.setTargetAtTime(0, context.currentTime, 0.6);
        window.setTimeout(() => { bus.disconnect(); dry.disconnect(); wet.disconnect(); }, 6000); // after the last notes ring out
      },
    };
  }

  return {
    setActive(on) {
      if (on && !playing) playing = start(style);
      else if (!on && playing) { playing.stop(); playing = null; }
    },
    // Another style (or, for the uploaded music, another file): while playing, the old one fades out as the
    // new one fades in.
    setStyle(name, nextTrack = track) {
      const next = knownStyle(name);
      const changed = next !== style || (next === UPLOADED_STYLE && (nextTrack || '') !== track);
      style = next;
      track = nextTrack || '';
      if (changed && playing) { playing.stop(); playing = start(style); }
    },
    get style() { return style; },
    get active() { return Boolean(playing); },
  };
}
