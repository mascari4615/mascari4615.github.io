const cutoutNames=['yawn','alisa','ling','timeto'];
atelierSkins.forEach((skins,i)=>skins.forEach((skin,j)=>{if(i===0&&j===0)return;const outfit=['lobby','rainwalk','dayoff'][j];skin.src=`${cutoutNames[i]}-${outfit}-cutout-r${i===0&&j===1?4:1}.png`}));
backgrounds[0]={id:'rain',name:'A 심야 오락실, 장면 세트',src:'/.local/arcade-art/lobby-a-room-v1.png'};
function fitComposition(){const style=document.documentElement.style;style.setProperty('--ui-scale',Math.min(1.1,(innerHeight-30)/941,innerWidth/1250));style.setProperty('--portrait-play-scale',Math.min(.8,innerWidth*.78/620));style.setProperty('--portrait-menu-scale',Math.min(.85,innerWidth*.92/775))}
addEventListener('resize',fitComposition);
