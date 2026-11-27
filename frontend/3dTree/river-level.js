export const normalWaterHeight = .028;

const normalLevel = 35;
const highLevel = 70;
const dangerLevel = 90;
const bankLevel = 100;
const maxLevel = 117;
const riseToBank = .70 - normalWaterHeight;
const previews = {normal:normalLevel, high:78, danger:maxLevel};
const labels = {normal:'Normal', high:'High', danger:'Danger'};
const stageDetails = {normal:'Below the bank mark', high:'Approaching the bank', danger:'Near overflow'};

export function installRiverLevel(rain, setRise) {
  const panel = document.getElementById('river-level-panel');
  const mode = document.getElementById('river-level-mode');
  const status = document.getElementById('river-level-status');
  const meter = document.getElementById('river-level-meter');
  const value = document.getElementById('river-level-value');
  const detail = document.getElementById('river-level-detail');
  let level = normalLevel;
  let displayed = -1;
  let stage;

  function percentOnMeter(reading) {
    return (100 * reading / maxLevel) + '%';
  }

  meter.style.setProperty('--high-mark', percentOnMeter(highLevel));
  meter.style.setProperty('--danger-mark', percentOnMeter(dangerLevel));
  meter.style.setProperty('--bank-mark', percentOnMeter(bankLevel));
  meter.setAttribute('aria-valuemax', String(maxLevel));
  mode.disabled = false;

  return dt => {
    const preview = previews[mode.value];
    const wetness = Math.max(0, Math.min(1, (rain.value - .35) / .65));
    const target = preview ?? normalLevel + (maxLevel - normalLevel) * wetness;
    if (level !== target) {
      const rainResponseSeconds = target > level ? 35 : 92;
      const seconds = preview !== undefined ? 2.4 : rainResponseSeconds;
      level += (target - level) * -Math.expm1(-dt / seconds);
      if (Math.abs(target - level) < .04) level = target;
      setRise(riseToBank * (level - normalLevel) / (bankLevel - normalLevel));
    }

    const reading = Math.floor(level);
    if (reading === displayed) return;
    displayed = reading;
    const nextStage = reading >= dangerLevel ? 'danger' : reading >= highLevel ? 'high' : 'normal';
    if (nextStage !== stage) {
      stage = nextStage;
      panel.dataset.stage = stage;
      status.textContent = labels[stage];
    }
    const note = reading >= bankLevel ? 'Over the bank mark' : stageDetails[stage];
    if (detail.textContent !== note) detail.textContent = note;
    value.textContent = reading + '%';
    meter.style.setProperty('--level-mark', percentOnMeter(reading));
    meter.setAttribute('aria-valuenow', String(reading));
    meter.setAttribute('aria-valuetext', reading + '% of modeled bank height, ' + labels[stage]);
  };
}
