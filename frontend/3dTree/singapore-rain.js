const startingAreas = [
  {name:'Jurong West',latitude:1.3404,longitude:103.7090},
  {name:'Woodlands',latitude:1.4360,longitude:103.7860},
  {name:'Yishun',latitude:1.4293,longitude:103.8355},
];

export function singaporeCoordinates(point) {
  const {latitude,longitude}=point??{};
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude>=1.16 && latitude<=1.49 && longitude>=103.59 && longitude<=104.11;
}

export function nearestPoint(origin, points, limit=Infinity) {
  let closest=null, distance=limit;
  for (const point of points) {
    const offset=Math.hypot(point.latitude-origin.latitude,point.longitude-origin.longitude);
    if (offset<distance) {
      distance=offset;
      closest=point;
    }
  }
  return closest;
}

export function availableAreas(areaResponse, rainResponse) {
  const choices=new Map(startingAreas.map(area=>[area.name,area]));
  const metadata=areaResponse?.data?.area_metadata;
  if (Array.isArray(metadata) && metadata.length) {
    for (const {name,label_location} of metadata) {
      if (typeof name==='string' && singaporeCoordinates(label_location)) {
        choices.set(name,{name,...label_location});
      }
    }
  } else if (Array.isArray(rainResponse?.data?.stations)) {
    for (const {name,labelLocation} of rainResponse.data.stations) {
      if (typeof name==='string' && singaporeCoordinates(labelLocation) && !choices.has(name)) {
        choices.set(name,{name,...labelLocation});
      }
    }
  }
  return choices;
}

export function recentRain(observations, now, area) {
  const {stations,readings}=observations?.data??{};
  if (!Array.isArray(stations)||!Array.isArray(readings)) return null;

  const stationMap=new Map(stations.map(station=>[station.id,station]));
  const reports=readings.map(report=>({rows:report.data,at:Date.parse(report.timestamp)}))
    .filter(report=>Array.isArray(report.rows) && report.at<=now+90000 && now-report.at<=15*60000)
    .sort((a,b)=>b.at-a.at);

  for (const report of reports) {
    const samples=report.rows.filter(row=>Number.isFinite(row.value)&&row.value>=0)
      .map(({stationId,value})=>{
        const station=stationMap.get(stationId);
        return {name:station?.name??stationId,...station?.labelLocation,value};
      });
    if (!samples.length) continue;

    if (area) {
      const nearest=nearestPoint(area,samples,.055);
      if (nearest) return {amount:nearest.value,station:nearest.name,at:report.at};
    } else {
      const wet=samples.filter(sample=>sample.value>0);
      return {amount:Math.max(...samples.map(sample=>sample.value)),wetCount:wet.length,at:report.at};
    }
  }
  return null;
}
