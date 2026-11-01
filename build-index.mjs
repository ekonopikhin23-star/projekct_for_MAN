// Перевіряє пакети в workshop/packs і збирає workshop/index.json.
// Запуск: node scripts/build-index.mjs [--check]
import {readdirSync,readFileSync,writeFileSync} from "node:fs";
const check=process.argv.includes("--check"),dir="workshop/packs",errs=[],out=[];
const str=(s,n)=>typeof s=="string"&&s.length>0&&s.length<=n;
const num=(v,a,b)=>typeof v=="number"&&Number.isFinite(v)&&v>=a&&v<=b;
const IMG=/^data:image\/(jpeg|png|gif|webp);base64,[A-Za-z0-9+/=]+$/;
for(const f of readdirSync(dir).filter(f=>f.endsWith(".json"))){
  const bad=m=>errs.push(`${f}: ${m}`);
  if(!/^[a-z0-9][a-z0-9-]{0,58}\.json$/.test(f)){bad("назва файлу: лише a-z, 0-9 та дефіс");continue}
  const raw=readFileSync(`${dir}/${f}`,"utf8");
  if(raw.length>700000){bad("файл завеликий (понад 700 КБ)");continue}
  let d;try{d=JSON.parse(raw)}catch{bad("некоректний JSON");continue}
  if(d.format!=="quiz-geo-pack"||d.v!==1){bad("це не файл майстерні (format/v)");continue}
  if(!["theme","map"].includes(d.kind)){bad("kind має бути theme або map");continue}
  if(!str(d.title,40)){bad("потрібна назва до 40 символів");continue}
  if(d.desc!=null&&(typeof d.desc!="string"||d.desc.length>120)){bad("опис до 120 символів");continue}
  if(d.author!=null&&d.author!==""&&!/^[A-Za-z0-9-]{1,39}$/.test(d.author)){bad("author: нік GitHub");continue}
  if(!/^#[0-9a-f]{6}$/i.test(d.color||"")){bad("color: формат #rrggbb");continue}
  if(!str(d.icon,8)){bad("потрібна icon");continue}
  if(!num(d.ts,0,4e12)){bad("потрібне число ts");continue}
  let n=0,ok=true;
  if(d.kind=="theme"){
    const q=d.theme&&d.theme.qs;
    if(!d.theme||!str(d.theme.name,30)||!Array.isArray(q)||q.length<3||q.length>200){bad("тема: потрібні name та 3–200 питань");continue}
    for(const x of q){
      if(!x||!str(x.q,300)||!Array.isArray(x.o)||x.o.length<2||x.o.length>4||!x.o.every(o=>str(o,300))){ok=false;bad("питання має мати текст і 2–4 відповіді");break}
      if(x.img!=null&&(typeof x.img!="string"||x.img.length>200000||!IMG.test(x.img))){ok=false;bad("малюнок має бути data:image до 200 КБ");break}
    }
    n=q.length;
  }else{
    const m=d.map;
    if(!Array.isArray(m)||m.length<1||m.length>100){bad("map: від 1 до 100 питань");continue}
    for(const x of m)if(!x||!str(x.n,40)||!str(x.c,300)||!num(x.x,-180,180)||!num(x.y,-90,90)||!num(x.r,0,1500)){ok=false;bad("питання карти: n, c, x, y, r");break}
    n=m.length;
  }
  if(!ok)continue;
  out.push({file:f,title:d.title,icon:d.icon,color:d.color,kind:d.kind,n,desc:d.desc||"",author:d.author||"",ts:d.ts});
}
if(errs.length){console.error("Знайдено помилки:\n"+errs.map(e=>" - "+e).join("\n"));process.exit(1)}
out.sort((a,b)=>b.ts-a.ts);
if(!check)writeFileSync("workshop/index.json",JSON.stringify({packs:out},null,1));
console.log(`${check?"Перевірено":"Зібрано"} пакетів: ${out.length}`);
