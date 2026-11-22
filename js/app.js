import {getWeather,searchPlaces,weatherDescription,weatherSymbol} from "./weather.js";
import {setForecastContext,renderTable} from "./forecast.js";
import {setCityImage} from "./images.js";
import {setupNavigation} from "./navigation.js";
import {initMap,setMapLayer} from "./map.js";
import {language,setLanguage} from "./localization.js";

let currentPlace={name:"Бишкек",country:"Кыргызстан",latitude:42.8746,longitude:74.5698},weather=null,unit=localStorage.getItem("aerwave-unit")||"C";
const $=id=>document.getElementById(id),fmtTemp=v=>v==null?"—":Math.round(unit==="F"?v*9/5+32:v);
function time(value){return value?value.slice(11,16):"—";}
function updateUnits(){ $("unitToggle").textContent="°"+unit; if(weather)renderWeather();}
function renderWeather(){
 const c=weather.current,d=weather.daily,h=weather.hourly;const lang=language;
 $("cityName").textContent=`${currentPlace.name}, ${currentPlace.country||""}`;$("heroCoordinates").textContent=`${currentPlace.latitude.toFixed(2)}° / ${currentPlace.longitude.toFixed(2)}°`;
 $("currentTemp").textContent=fmtTemp(c.temperature_2m)+"°";$("conditionText").textContent=weatherDescription(c.weather_code,lang);$("weatherIcon").textContent=weatherSymbol(c.weather_code,c.is_day);
 $("feelsLike").textContent=(lang==="ru"?"Ощущается как ":"Feels like ")+fmtTemp(c.apparent_temperature)+"°";
 $("todayHigh").textContent=(lang==="ru"?"Макс. ":"High ")+fmtTemp(d.temperature_2m_max[0])+"°";$("todayLow").textContent=(lang==="ru"?"Мин. ":"Low ")+fmtTemp(d.temperature_2m_min[0])+"°";
 $("humidity").textContent=c.relative_humidity_2m+"%";$("wind").textContent=Math.round(c.wind_speed_10m)+" км/ч";$("windDirection").textContent=Math.round(c.wind_direction_10m)+"°";
 $("pressure").textContent=Math.round(c.pressure_msl)+" гПа";$("uv").textContent=d.uv_index_max[0]?.toFixed(1)??"—";$("uvLabel").textContent=d.uv_index_max[0]>=6?"Высокий уровень":d.uv_index_max[0]>=3?"Умеренный уровень":"Низкий уровень";
 const idx=h.time.findIndex(t=>t>=c.time);$("visibility").textContent=idx>=0&&h.visibility[idx]!=null?(h.visibility[idx]/1000).toFixed(1)+" км":"—";$("dewPoint").textContent=idx>=0&&h.dew_point_2m[idx]!=null?fmtTemp(h.dew_point_2m[idx])+"°":"—";
 $("sunrise").textContent=time(d.sunrise[0]);$("sunset").textContent=time(d.sunset[0]);const mins=(new Date(d.sunset[0])-new Date(d.sunrise[0]))/60000;$("dayLength").textContent=`${Math.floor(mins/60)} ч ${Math.round(mins%60)} мин`;
 $("localDate").textContent=new Intl.DateTimeFormat(lang,{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:weather.timezone}).format(new Date(c.time));
 $("updatedAt").textContent=(lang==="ru"?"Обновлено ":"Updated ")+time(c.time);
 const list=$("hourlyList");list.innerHTML="";for(let i=Math.max(0,idx);i<Math.max(0,idx)+24&&i<h.time.length;i++){list.insertAdjacentHTML("beforeend",`<div class="hour-item"><small>${i===idx?(lang==="ru"?"Сейчас":"Now"):time(h.time[i])}</small><b>${weatherSymbol(h.weather_code[i])}</b><strong>${fmtTemp(h.temperature_2m[i])}°</strong></div>`);}
 $("weatherInsight").textContent=makeInsight(c,d,lang);setForecastContext(weather,currentPlace,unit);
}
function makeInsight(c,d,lang){if(c.precipitation>0)return lang==="ru"?"Сейчас фиксируются осадки. Перед выходом лучше взять зонт.":"Precipitation is currently reported. Consider taking an umbrella.";if(c.wind_speed_10m>30)return lang==="ru"?"Ветер усилился. На открытых участках ощущаемая температура может быть ниже.":"Wind is strong; exposed areas may feel colder.";if(d.uv_index_max[0]>=6)return lang==="ru"?"Сегодня высокий УФ-индекс. На улице пригодится защита от солнца.":"High UV index today. Sun protection is recommended.";return lang==="ru"?"Условия относительно спокойные. Следите за почасовым прогнозом для локальных изменений.":"Conditions look relatively calm. Check the hourly outlook for local changes.";}
async function loadPlace(place){currentPlace=place;$("cityName").textContent=place.name+"…";try{weather=await getWeather(place.latitude,place.longitude);renderWeather();setCityImage(place.name);if(document.getElementById("mapView").classList.contains("active"))initMap(place.latitude,place.longitude);}catch(e){$("conditionText").textContent="Не удалось загрузить данные";console.error(e);}}
let searchTimer; $("citySearch").addEventListener("input",e=>{clearTimeout(searchTimer);const q=e.target.value.trim();if(q.length<2){$("searchResults").classList.remove("show");return;}searchTimer=setTimeout(async()=>{try{const places=await searchPlaces(q);$("searchResults").innerHTML=places.map((p,i)=>`<button class="search-result" data-result="${i}">${p.name}<small>${[p.admin1,p.country].filter(Boolean).join(", ")}</small></button>`).join("")||'<div class="search-result">Ничего не найдено</div>';$("searchResults").classList.add("show");$("searchResults").querySelectorAll("[data-result]").forEach(b=>b.addEventListener("click",()=>{const p=places[+b.dataset.result];$("searchResults").classList.remove("show");$("citySearch").value="";loadPlace({name:p.name,country:p.country,latitude:p.latitude,longitude:p.longitude});}));}catch{$("searchResults").classList.remove("show");}},350);});
document.addEventListener("click",e=>{if(!e.target.closest(".search-wrap"))$("searchResults").classList.remove("show");});
function favorites(){return JSON.parse(localStorage.getItem("aerwave-favorites")||"[]");}
function saveFavorites(list){localStorage.setItem("aerwave-favorites",JSON.stringify(list));renderFavorites();}
function renderFavorites(){const list=favorites();$("favoriteCount").textContent=`${list.length} / 10`;const el=$("favoritesList");el.innerHTML="";if(!list.length){el.innerHTML='<div class="empty-state">Добавляйте города с помощью ☆ рядом с названием.</div>';return;}list.forEach((p,i)=>el.insertAdjacentHTML("beforeend",`<article class="favorite-card" data-fav="${i}"><div class="favorite-card-top"><span>${p.country||""}</span><button class="remove-favorite" data-remove="${i}">×</button></div><strong>⌖</strong><p>${p.name}</p></article>`));el.querySelectorAll("[data-fav]").forEach(card=>card.addEventListener("click",e=>{if(e.target.closest("[data-remove]"))return;loadPlace(list[+card.dataset.fav]);document.querySelector('[data-view="home"]').click();}));el.querySelectorAll("[data-remove]").forEach(b=>b.addEventListener("click",e=>{e.stopPropagation();const next=favorites();next.splice(+b.dataset.remove,1);saveFavorites(next);}));}
$("favoriteCurrent").addEventListener("click",()=>{let list=favorites();if(list.some(p=>p.latitude===currentPlace.latitude&&p.longitude===currentPlace.longitude))return;if(list.length>=10)return alert("Можно сохранить не более 10 городов.");list.push(currentPlace);saveFavorites(list);$("favoriteCurrent").textContent="★";});
$("unitToggle").addEventListener("click",()=>{unit=unit==="C"?"F":"C";localStorage.setItem("aerwave-unit",unit);updateUnits();});
$("languageToggle").addEventListener("click",()=>{setLanguage(language==="ru"?"en":"ru");$("languageToggle").textContent=language.toUpperCase();if(weather)renderWeather();});
$("forecastMetric").addEventListener("change",renderTable);
document.querySelectorAll("[data-layer]").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll("[data-layer]").forEach(x=>x.classList.toggle("active",x===b));setMapLayer(b.dataset.layer);}));
setupNavigation(()=>initMap(currentPlace.latitude,currentPlace.longitude));setLanguage(language);$("languageToggle").textContent=language.toUpperCase();updateUnits();renderFavorites();loadPlace(currentPlace);
