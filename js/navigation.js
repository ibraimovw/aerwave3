import {initMap} from "./map.js";
const titles={home:"Overview",forecast:"Forecast",map:"Weather Map",favorites:"Favorites"};
export function setupNavigation(onMap){
 const buttons=document.querySelectorAll("[data-view]");
 buttons.forEach(btn=>btn.addEventListener("click",()=>{const view=btn.dataset.view;document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));document.getElementById(view+"View").classList.add("active");document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));document.getElementById("pageTitle").textContent=titles[view];if(view==="map")onMap();window.scrollTo({top:0,behavior:"smooth"});}));
 document.querySelectorAll("[data-open-view]").forEach(btn=>btn.addEventListener("click",()=>document.querySelector(`[data-view="${btn.dataset.openView}"]`).click()));
}
