const base="https://api.open-meteo.com/v1/forecast";
export async function getWeather(lat,lon){
 const params=new URLSearchParams({latitude:lat,longitude:lon,timezone:"auto",forecast_days:"16",
 current:"temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m",
 hourly:"temperature_2m,apparent_temperature,precipitation_probability,weather_code,visibility,dew_point_2m",
 daily:"weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_sum,precipitation_probability_max,sunrise,sunset,uv_index_max,wind_speed_10m_max,relative_humidity_2m_mean,pressure_msl_mean,cloud_cover_mean",
 forecast_days:"16"});
 const response=await fetch(`${base}?${params}`);if(!response.ok)throw new Error("Weather service unavailable");return response.json();
}
export async function searchPlaces(query){
 const url=`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=ru&format=json`;
 const response=await fetch(url);if(!response.ok)throw new Error("Search unavailable");const data=await response.json();return data.results||[];
}
export function weatherDescription(code,lang="ru"){
 const ru={0:"Ясно",1:"Преимущественно ясно",2:"Переменная облачность",3:"Пасмурно",45:"Туман",48:"Изморозь",51:"Лёгкая морось",53:"Морось",55:"Сильная морось",61:"Небольшой дождь",63:"Дождь",65:"Сильный дождь",71:"Небольшой снег",73:"Снег",75:"Сильный снег",80:"Ливневый дождь",81:"Ливни",82:"Сильные ливни",95:"Гроза",96:"Гроза с градом",99:"Сильная гроза"};
 const en={0:"Clear sky",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",45:"Fog",48:"Depositing rime fog",51:"Light drizzle",53:"Drizzle",55:"Dense drizzle",61:"Light rain",63:"Rain",65:"Heavy rain",71:"Light snow",73:"Snow",75:"Heavy snow",80:"Rain showers",81:"Showers",82:"Heavy showers",95:"Thunderstorm",96:"Thunderstorm with hail",99:"Heavy thunderstorm"};
 return (lang==="ru"?ru:en)[code]||"—";
}
export function weatherSymbol(code,isDay=1){if(code===0)return isDay?"☀":"☾";if([1,2].includes(code))return "⛅";if([3,45,48].includes(code))return "☁";if([51,53,55,61,63,65,80,81,82].includes(code))return "☂";if([71,73,75].includes(code))return "❄";if(code>=95)return "ϟ";return "☁";}
