import {weatherDescription,weatherSymbol} from "./weather.js";
import {language} from "./localization.js";
let data=null,place=null,unit="C";
export function setForecastContext(weather,location,tempUnit){data=weather;place=location;unit=tempUnit;renderPreview();renderTable();}
export function renderPreview(){
 if(!data)return;const d=data.daily,el=document.getElementById("dailyPreview");el.innerHTML="";
 for(let i=0;i<8;i++){const date=new Date(d.time[i]+"T12:00:00");const label=i===0?(language==="ru"?"Сегодня":"Today"):new Intl.DateTimeFormat(language,{weekday:"short"}).format(date);el.insertAdjacentHTML("beforeend",`<div class="day-card"><small>${label}</small><b>${weatherSymbol(d.weather_code[i])}</b><strong>${fmt(d.temperature_2m_max[i])}°</strong><em>${fmt(d.temperature_2m_min[i])}° · ${d.precipitation_probability_max[i]??0}%</em></div>`);}
}
function fmt(v){return v==null?"—":Math.round(unit==="F"?v*9/5+32:v);}
export function renderTable(){
 if(!data)return;const d=data.daily,metric=document.getElementById("forecastMetric").value,tbody=document.getElementById("forecastRows"),labels={temperature_2m_max:"Температура",apparent_temperature_max:"Ощущается как",precipitation_probability_max:"Вероятность осадков",precipitation_sum:"Осадки",wind_speed_10m_max:"Ветер",relative_humidity_2m_mean:"Влажность",pressure_msl_mean:"Давление",uv_index_max:"УФ-индекс",cloud_cover_mean:"Облачность"};
 document.getElementById("forecastMetricHeading").textContent=labels[metric]||"Показатель";tbody.innerHTML="";
 for(let i=0;i<d.time.length;i++){const date=new Date(d.time[i]+"T12:00:00"),day=new Intl.DateTimeFormat(language,{weekday:"short",day:"numeric",month:"short"}).format(date);let value=d[metric]?.[i];if(value==null)value="—";else if(metric.includes("temperature"))value=fmt(value)+"°";else if(metric.includes("precipitation_sum"))value=value.toFixed(1)+" мм";else if(metric.includes("wind_speed"))value=Math.round(value)+" км/ч";else if(metric.includes("pressure"))value=Math.round(value)+" гПа";else value=Math.round(value)+(metric.includes("probability")||metric.includes("humidity")||metric.includes("cloud")?"%":"");
 tbody.insertAdjacentHTML("beforeend",`<tr><td>${day}</td><td class="forecast-condition">${weatherSymbol(d.weather_code[i])} ${weatherDescription(d.weather_code[i],language)}</td><td>${fmt(d.temperature_2m_max[i])}° / ${fmt(d.temperature_2m_min[i])}°</td><td>${value}</td><td>${d.precipitation_sum[i].toFixed(1)} мм</td></tr>`);}
}
