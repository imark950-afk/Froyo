if (window.top !== window.self) { document.documentElement.style.display='none'; try { window.top.location = window.self.location.href; } catch(e){} }
(function(){
const $ = s => document.querySelector(s);
const gbp = n => "£" + n.toLocaleString("en-GB",{minimumFractionDigits: n%1?2:0, maximumFractionDigits:2});
const TODAY = new Date(); TODAY.setHours(0,0,0,0);
const MIN_NOTICE = 7;
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MON3 = MONTHS.map(m=>m.slice(0,3));
const DOW = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

const EVENTS = [
  {id:"wedding", name:"Wedding", blurb:"Dessert bar or evening treat", ico:"ring"},
  {id:"corporate", name:"Corporate", blurb:"Staff days, launches, summer socials", ico:"case"},
  {id:"birthday", name:"Birthday party", blurb:"Kids' parties and big birthdays", ico:"cake"},
  {id:"school", name:"School or fête", blurb:"Summer fairs, prom, sports day", ico:"flag"},
  {id:"festival", name:"Festival or market", blurb:"Pitch fee or vend-only options", ico:"tent"},
  {id:"other", name:"Something else", blurb:"Tell us about it", ico:"spark"}
];
const PACKAGES = [
  {id:"popup", name:"Pop-up", cups:60, hours:2, price:395, desc:"Up to 60 cups · 3 flavours"},
  {id:"party", name:"Party", cups:130, hours:3, price:695, desc:"Up to 130 cups · 4 flavours"},
  {id:"festival", name:"Festival", cups:400, hours:4, price:1150, desc:"Up to 400 cups · 6 flavours · 2 servers"}
];
const ADDONS = [
  {id:"toppings", name:"Unlimited toppings bar", note:"12 toppings, 3 sauces", per:"guest", price:1.5},
  {id:"cones", name:"Waffle cones", note:"Swap cups for cones", per:"guest", price:0.75},
  {id:"vegan", name:"Dairy-free sorbet station", note:"2 vegan flavours alongside", per:"event", price:60},
  {id:"branded", name:"Branded cups", note:"Your logo or names, 2-colour print", per:"event", price:95},
  {id:"server", name:"Extra server", note:"Faster queues for big crowds", per:"event", price:90}
];
const SLOTS = ["11:00","13:00","15:00","18:00"];
const EXTRA_HOUR = 120, DEPOSIT = 0.25;
const UNITS = [
  {id:"cart", name:"Indoor cart", short:"Cart", tag:"Indoors", points:["Fits through a standard double door and lifts","Needs a 2m × 1.5m space and one 13A socket","Ideal for hotels, offices, halls and marquees"]},
  {id:"trailer", name:"Mobile trailer", short:"Trailer", tag:"Outdoors", points:["Serving hatch trailer towed to your site","Needs a flat 3m × 7m pitch with vehicle access","Ideal for gardens, fields, fêtes and festivals"]}
];
const unitName = id => (UNITS.find(u=>u.id===id)||{}).name || "—";

function mapsUrl(q){ return "https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(q); }
function key(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function parseDay(iso){ const [y,m,d]=String(iso).slice(0,10).split("-").map(Number); return new Date(y,m-1,d); }

// Availability comes from the database: which start times are already taken, per setup and month.
const AV = {};
function avKey(unit, d){ return unit+"|"+d.getFullYear()+"-"+(d.getMonth()+1); }
function loadAvail(unit, d){
  const k = avKey(unit, d); if (AV[k]) return; AV[k] = "loading";
  Neon.rpc("get_availability", {p_unit: unit, p_month: key(new Date(d.getFullYear(), d.getMonth(), 1))})
    .then(r=>{ AV[k] = r || {}; if (S.tab==="book" && (S.step===1)) render(); })
    .catch(()=>{ delete AV[k]; });
}
function dayInfo(d, unit){
  const diff = (d - TODAY)/864e5;
  if (diff < MIN_NOTICE) return {st:"past", taken:[]};
  if (!unit) return {st:"open", taken:[]};
  const m = AV[avKey(unit, d)];
  if (!m || m==="loading"){ loadAvail(unit, d); return {st:"open", taken:[], loading:true}; }
  const taken = m[key(d)] || [];
  if (taken.length >= SLOTS.length) return {st:"full", taken};
  if (taken.length) return {st:"limited", taken};
  return {st:"open", taken:[]};
}

function addDays(n){ const d=new Date(TODAY); d.setDate(d.getDate()+n); return d; }
const S = {
  tab:"book", step:0,
  event:null, unit:null, date:null, time:null, calMonth:new Date(TODAY.getFullYear(), TODAY.getMonth(), 1),
  guests:80, pkg:null, pkgTouched:false, extraHours:0, addons:new Set(),
  venue:"", postcode:"", name:"", email:"", phone:"", notes:"",
  mine:[], mineLoaded:false, ops:[], opsLoaded:false, opsFilter:"all", opsView:"events", showErr:false, busy:false,
  trailer:{live:false, now_id:null, stops:[]},
  view:"loading", user:null, auth:{screen:"welcome", email:"", err:"", busy:false, resendAt:0}, returnTab:"book", acctOpen:false, finishBooking:false
};
// first bookable month
(function(){ const d = addDays(MIN_NOTICE); S.calMonth = new Date(d.getFullYear(), d.getMonth(), 1); })();

function recommended(){ return (PACKAGES.find(p=>S.guests<=p.cups) || PACKAGES[2]).id; }
function pkgObj(){ return PACKAGES.find(p=>p.id===(S.pkg||recommended())); }
function quote(){
  const p = pkgObj(); const lines = [[p.name+" package", p.price]];
  if (S.extraHours) lines.push([S.extraHours+" extra hour"+(S.extraHours>1?"s":""), S.extraHours*EXTRA_HOUR]);
  ADDONS.forEach(a=>{ if(S.addons.has(a.id)) lines.push([a.name + (a.per==="guest"?" × "+S.guests:""), +(a.per==="guest"? a.price*S.guests : a.price).toFixed(2)]); });
  const total = lines.reduce((s,l)=>s+l[1],0);
  return {lines,total,deposit:Math.round(total*DEPOSIT*100)/100};
}
function fmtDate(d, long){ return (long? ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()]+" ":"") + d.getDate()+" "+(long?MONTHS:MON3)[d.getMonth()]+" "+d.getFullYear(); }
function evName(id){ return (EVENTS.find(e=>e.id===id)||{}).name||""; }

const ICONS = {
  ring:'<circle cx="11" cy="13" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 4h6l-3 3z" fill="currentColor"/>',
  case:'<rect x="3" y="7" width="16" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 7V5h6v2" fill="none" stroke="currentColor" stroke-width="2"/>',
  cake:'<rect x="4" y="11" width="14" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M11 11V7" stroke="currentColor" stroke-width="2"/><circle cx="11" cy="5" r="1.6" fill="currentColor"/>',
  flag:'<path d="M5 19V3" stroke="currentColor" stroke-width="2"/><path d="M5 4h11l-3 4 3 4H5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  tent:'<path d="M2 18L11 4l9 14z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M11 10l-3 8h6z" fill="currentColor"/>',
  spark:'<path d="M11 2l2 7 7 2-7 2-2 7-2-7-7-2 7-2z" fill="currentColor"/>'
};
const ico = n => '<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" style="color:var(--ink)">'+ICONS[n]+'</svg>';
const cupSvg = (fill) => '<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><path d="M6 11h14l-2.4 12H8.4z" fill="var(--berry)"/><path d="M7 11c0-'+(2+fill)+' 2.5-'+(4+fill)+' 6-'+(4+fill)+'s6 '+(2)+' 6 '+(4+fill)+'z" fill="var(--mint)"/></svg>';

// ================= Neon (sign-in + database) =================
// Only these two addresses are allowed by the page's security policy.
const CFG = {
  auth: "https://ep-red-paper-za2pjniz.neonauth.c-2.eu-west-2.aws.neon.tech/neondb/auth",
  api:  "https://ep-red-paper-za2pjniz.apirest.c-2.eu-west-2.aws.neon.tech/neondb/rest/v1"
};
function friendlyAuth(j, status){
  const code = j && j.code || "";
  if (status===429 || code==="TOO_MANY_ATTEMPTS" || code==="TOO_MANY_REQUESTS") return "Too many attempts. Please wait a few minutes and try again.";
  if (code==="INVALID_OTP" || code==="OTP_EXPIRED") return "That code didn’t work or has expired. Check the email or ask for a new code.";
  if (code==="INVALID_EMAIL_OR_PASSWORD" || code==="INVALID_EMAIL" || code==="INVALID_PASSWORD" || status===401) return "Email or password not recognised.";
  return "Something went wrong. Please try again.";
}
const Neon = (function(){
  // The sign-in session lives in a secure cookie the page can't read.
  // The short-lived database pass (JWT) is kept in memory only, never saved to the device.
  let jwt=null, jwtExp=0, anon=null, anonExp=0;
  function expOf(t){ try{ return JSON.parse(atob(t.split(".")[1].replace(/-/g,"+").replace(/_/g,"/"))).exp*1000; }catch(e){ return 0; } }
  async function authCall(path, body){
    const r = await fetch(CFG.auth+path, {method: body?"POST":"GET", credentials:"include", cache:"no-store",
      headers: body?{"content-type":"application/json"}:{}, body: body?JSON.stringify(body):undefined});
    const j = await r.json().catch(()=>null);
    if (!r.ok){ const e=new Error(friendlyAuth(j, r.status)); e.status=r.status; throw e; }
    return j;
  }
  async function token(){
    if (jwt && Date.now() < jwtExp-30000) return jwt;
    const r = await fetch(CFG.auth+"/token", {credentials:"include", cache:"no-store"});
    if (!r.ok){ jwt=null; return null; }
    const j = await r.json().catch(()=>null);
    if (!j || !j.token) return null;
    jwt = j.token; jwtExp = expOf(jwt); return jwt;
  }
  async function anonToken(){
    if (anon && Date.now() < anonExp-30000) return anon;
    const r = await fetch(CFG.auth+"/token/anonymous", {credentials:"omit", cache:"no-store"});
    const j = await r.json(); anon = j.token; anonExp = expOf(anon); return anon;
  }
  async function rpc(fn, args, needUser){
    let t = S.user ? await token() : null;
    if (!t){
      if (needUser){ const e=new Error("Please sign in again."); e.status=401; throw e; }
      t = await anonToken();
    }
    const r = await fetch(CFG.api+"/rpc/"+fn, {method:"POST", credentials:"omit", cache:"no-store",
      headers:{"content-type":"application/json", "accept":"application/json", "authorization":"Bearer "+t},
      body: JSON.stringify(args||{})});
    const text = await r.text(); let j=null; try{ j = text ? JSON.parse(text) : null; }catch(e){}
    if (!r.ok){
      const e = new Error(j && j.message && r.status < 500 && !/^(permission denied|JWT|function )/i.test(j.message) ? j.message : (r.status===401||r.status===403 ? "Please sign in again." : "Something went wrong. Please try again."));
      e.status = r.status; throw e;
    }
    return j;
  }
  return {
    session: ()=>authCall("/get-session").catch(()=>null),
    sendCode: email=>authCall("/email-otp/send-verification-otp", {email, type:"sign-in"}),
    verifyCode: (email, otp)=>authCall("/sign-in/email-otp", {email, otp}),
    passwordSignIn: (email, password)=>authCall("/sign-in/email", {email, password}),
    signOut: async ()=>{ jwt=null; jwtExp=0; try{ await authCall("/sign-out", {}); }catch(e){} },
    rpc
  };
})();

function toast(msg){ const t=$("#toast"); t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,2400); }

// ---------- views ----------
function render(){
  renderAcct();
  const tabsEl = $("#tabs");
  if (S.view==="loading"){ tabsEl.hidden=true; $("#bar").hidden=true; $("#view").innerHTML='<section class="signin"><div class="si-hero"><img class="si-logo" src="'+logoSrc()+'" alt=""><p>Loading…</p></div></section>'; return; }
  if (S.view==="signin"){ tabsEl.hidden=true; $("#bar").hidden=true; const v=$("#view"); v.innerHTML=renderSignin(); v.firstElementChild.classList.add("fade"); return; }
  tabsEl.hidden=false;
  const isStaff = !!(S.user && S.user.staff);
  $("#tab-ops").hidden = !isStaff;
  if (S.tab==="ops" && !isStaff) S.tab="book";
  document.querySelectorAll(".tabs button").forEach(b=>b.setAttribute("aria-selected", b.dataset.tab===S.tab));
  const v = $("#view");
  if (S.tab==="mine" && S.user && !S.mineLoaded) loadMine();
  if (S.tab==="ops" && S.user && S.user.staff && !S.opsLoaded) loadOps();
  if (S.tab==="rewards" && S.user && !S.user.staff && !CARD) loadCard();
  if (S.tab==="book") v.innerHTML = renderBook();
  else if (S.tab==="mine") v.innerHTML = renderMine();
  else if (S.tab==="find") v.innerHTML = renderFind();
  else if (S.tab==="rewards") v.innerHTML = (S.user && !S.user.staff) ? renderRewards() : renderRewardsLocked();
  else v.innerHTML = (S.user && S.user.staff) ? renderOps() : renderStaffLocked();
  v.firstElementChild && v.firstElementChild.classList.add("fade");
  drawQR(); R.newStamps=[]; R.flash=false;
  renderBar();
}

function stepper(){ return '<div class="steps" aria-hidden="true">'+[0,1,2,3,4].map(i=>'<i class="'+(i<=S.step?"on":"")+'"></i>').join("")+'</div>'; }

function renderBook(){
  if (S.step===5) return renderConfirm();
  let h = '<section>';
  if (S.step===0){
    h += '<div class="hero"><svg class="drips" viewBox="0 0 150 120" aria-hidden="true"><path d="M20 0h130v40c-8 0-8 22-16 22s-8-30-16-30-8 52-17 52-8-38-16-38-8 18-16 18-8-26-16-26-8 14-17 14-8-22-16-22z" fill="#fff" opacity=".22"/><circle cx="118" cy="92" r="9" fill="var(--yolk)"/><circle cx="92" cy="104" r="5" fill="var(--mint)"/></svg>'
      + '<h1>Frozen yogurt at your event, indoors or out</h1><p>Book the indoor cart or the mobile trailer, pick a date and pay a 25% deposit to lock it in.</p>'
      + '<div class="facts"><span>Indoor cart</span><span>Mobile trailer</span><span>From £395</span></div></div>';
  }
  h += stepper();
  if (S.step===0){
    h += '<div class="step-head"><h2>What’s the occasion?</h2><span class="eyebrow">Step 1 of 5</span></div><div class="grid2">';
    EVENTS.forEach(e=>{ h += '<button class="tile" data-act="event" data-id="'+e.id+'" aria-pressed="'+(S.event===e.id)+'"><span class="ico">'+ico(e.ico)+'</span><strong>'+e.name+'</strong><small>'+e.blurb+'</small></button>'; });
    h += '</div>';
    h += '<div class="step-head" style="margin-top:22px"><h2>Cart or trailer?</h2></div>';
    UNITS.forEach(u=>{ h += '<button class="unit" data-act="unit" data-id="'+u.id+'" aria-pressed="'+(S.unit===u.id)+'"><span class="pic">'+unitSvg(u.id)+'</span><span><strong>'+u.name+'<span class="tag">'+u.tag+'</span></strong><ul>'+u.points.map(p=>'<li>'+p+'</li>').join("")+'</ul></span></button>'; });
  }
  if (S.step===1){
    const m = S.calMonth, first = new Date(m.getFullYear(), m.getMonth(), 1);
    const offset = (first.getDay()+6)%7, days = new Date(m.getFullYear(), m.getMonth()+1, 0).getDate();
    const minMonth = new Date(addDays(MIN_NOTICE).getFullYear(), addDays(MIN_NOTICE).getMonth(), 1);
    h += '<div class="step-head"><h2>Pick a date for the '+unitName(S.unit).toLowerCase()+'</h2><span class="eyebrow">Step 2 of 5</span></div>';
    h += '<div class="cal"><div class="cal-head"><button class="round" data-act="month" data-d="-1" aria-label="Previous month" '+(m<=minMonth?"disabled style=\"opacity:.3\"":"")+'>‹</button><h3>'+MONTHS[m.getMonth()]+' '+m.getFullYear()+'</h3><button class="round" data-act="month" data-d="1" aria-label="Next month">›</button></div><div class="cal-grid">';
    DOW.forEach(d=>h+='<div class="dow">'+d[0]+'</div>');
    for(let i=0;i<offset;i++) h+='<span class="day blank"></span>';
    for(let d=1; d<=days; d++){
      const dt = new Date(m.getFullYear(), m.getMonth(), d), info = dayInfo(dt, S.unit), sel = S.date && key(S.date)===key(dt);
      const dis = info.st==="full"||info.st==="past";
      const lbl = fmtDate(dt,true)+(info.st==="full"?", fully booked":info.st==="limited"?", some times taken":info.st==="past"?", unavailable":", available");
      h += '<button class="day '+info.st+(sel?" sel":"")+'" data-act="date" data-k="'+key(dt)+'" aria-label="'+lbl+'" '+(dis?"disabled":"")+'>'+d+'</button>';
    }
    h += '</div><div class="legend"><span><i style="background:var(--mint-soft)"></i>Available</span><span><i style="background:var(--yolk-soft)"></i>Some times taken</span><span><i style="background:var(--full)"></i>Booked</span></div></div>';
    if (S.date){
      const info = dayInfo(S.date, S.unit);
      h += '<div style="margin-top:16px"><div class="field"><label>Arrival time on '+fmtDate(S.date,true)+'</label><div class="chips">';
      SLOTS.forEach(s=>{ const taken = info.taken.includes(s); h += '<button class="chip" data-act="time" data-t="'+s+'" aria-pressed="'+(S.time===s)+'" '+(taken?"disabled":"")+'>'+s+'</button>'; });
      h += '</div><span class="hint">We arrive 45 minutes early to set up. Serving starts at the time you pick.</span></div></div>';
    }
  }
  if (S.step===2){
    const rec = recommended();
    h += '<div class="step-head"><h2>Guests & package</h2><span class="eyebrow">Step 3 of 5</span></div>';
    h += '<div class="field"><label for="guests">How many guests?</label><div class="counter"><span class="val mono" id="gval">'+S.guests+'</span><div class="btns"><button class="round" data-act="g" data-d="-10" aria-label="10 fewer guests">−</button><button class="round" data-act="g" data-d="10" aria-label="10 more guests">+</button></div></div><input type="range" id="guests" min="10" max="400" step="5" value="'+S.guests+'" aria-label="Guest count"></div>';
    h += '<div id="pkgs">'+pkgList()+'</div>';
    h += '<div class="eyebrow" style="margin:14px 0 4px">Extras</div><div class="panel" style="padding-block:4px">';
    ADDONS.forEach(a=>{ h += '<div class="addon"><input type="checkbox" id="ad-'+a.id+'" data-act="addon" data-id="'+a.id+'" '+(S.addons.has(a.id)?"checked":"")+'><label for="ad-'+a.id+'"><strong>'+a.name+'</strong><small class="muted">'+a.note+'</small></label><span class="p">'+gbp(a.price)+(a.per==="guest"?"/guest":"")+'</span></div>'; });
    h += '</div>';
  }
  if (S.step===3){
    const e = S.showErr;
    const bad = f => e && !valid(f);
    h += '<div class="step-head"><h2>Location</h2><span class="eyebrow">Step 4 of 5</span></div>';
    h += fld("venue","Venue name or address","text","e.g. The Old Barn, Shere","",bad("venue")?"Tell us where the cart or trailer should go.":"");
    h += fld("postcode","Postcode","text","GU5 9HB","Travel is free within 25 miles of our Surrey base. We’ll quote anything further before you pay the balance.",bad("postcode")?"Enter a UK postcode, like GU5 9HB.":"");
    h += '<div class="note" style="margin-bottom:14px">'+(S.unit==="trailer" ? 'The trailer needs a flat 3m × 7m pitch with vehicle access, and a 13A socket within 25m. No socket? We bring a quiet generator.' : 'The cart needs a 2m × 1.5m space near a 13A socket, and step-free or lift access. It fits through a standard double door.')+'</div>';
    h += '<div class="step-head" style="margin-top:22px"><h2>Contact details</h2></div>';
    h += fld("name","Your name","text","","",bad("name")?"Add the name for the booking.":"");
    h += '<div class="row">'+fld("email","Email","email","","",bad("email")?"Check the email address.":"")+fld("phone","Mobile","tel","07…","",bad("phone")?"Add a number we can call on the day.":"")+'</div>';
    h += '<div class="field"><label for="notes">Anything we should know?</label><textarea id="notes" data-f="notes" placeholder="Allergies, access, timings, dress code">'+esc(S.notes)+'</textarea></div>';
  }
  if (S.step===4){
    const q = quote(), p = pkgObj();
    h += '<div class="step-head"><h2>Check your booking</h2><span class="eyebrow">Step 5 of 5</span></div>';
    h += '<div class="panel"><dl class="kv"><dt>Event</dt><dd>'+evName(S.event)+'</dd><dt>Setup</dt><dd>'+unitName(S.unit)+'</dd><dt>When</dt><dd>'+fmtDate(S.date,true)+', serving from '+S.time+'</dd><dt>Guests</dt><dd>'+S.guests+'</dd><dt>Where</dt><dd>'+esc(S.venue)+', '+esc(S.postcode.toUpperCase())+'</dd><dt>Contact</dt><dd>'+esc(S.name)+' · '+esc(S.phone)+'</dd></dl></div>';
    h += '<div class="panel">'+q.lines.map(l=>'<div class="sum-row"><span>'+l[0]+'</span><span>'+gbp(l[1])+'</span></div>').join("")
      + '<div class="sum-row"><span>Travel (within 25 miles)</span><span>£0</span></div>'
      + '<div class="sum-row total"><span>Total inc. VAT</span><span>'+gbp(q.total)+'</span></div>'
      + '<div class="sum-row dep"><span>Deposit (25%)</span><span>'+gbp(q.deposit)+'</span></div>'
      + '<div class="sum-row muted"><span>Balance due 14 days before</span><span>'+gbp(Math.round((q.total-q.deposit)*100)/100)+'</span></div></div>';
    h += '<p class="note">Your date is held when you confirm. We then email you a secure link to pay the 25% deposit. Free date change up to 30 days before, and the deposit is refunded if we can’t attend.</p>';
  }
  h += '</section>';
  return h;
}
function pkgList(){
  const rec = recommended(); let h="";
  PACKAGES.forEach((p,i)=>{
    const on = (S.pkg||rec)===p.id;
    h += '<button class="pkg" data-act="pkg" data-id="'+p.id+'" aria-pressed="'+on+'"><span class="cup">'+cupSvg(i)+'</span><span><strong>'+p.name+(p.id===rec?'<span class="badge">Fits '+S.guests+'</span>':'')+'</strong><small class="muted">'+p.desc+'</small></span><span class="price">'+gbp(p.price)+'</span></button>';
  });
  if (S.guests > pkgObj().cups) h += '<p class="err">'+S.guests+' guests is more than the '+pkgObj().name+' package serves. Pick a bigger package or we’ll run out of yogurt.</p>';
  return h;
}
function esc(s){ return String(s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function fld(id,label,type,ph,hint,err){
  return '<div class="field"><label for="'+id+'">'+label+'</label><input id="'+id+'" data-f="'+id+'" type="'+type+'" placeholder="'+ph+'" value="'+esc(S[id])+'" '+(type==="email"?'autocomplete="email"':type==="tel"?'autocomplete="tel"':"")+(err?' aria-invalid="true"':'')+'>'+(err?'<span class="err">'+err+'</span>':hint?'<span class="hint">'+hint+'</span>':'')+'</div>';
}
function valid(f){
  const v = (S[f]||"").trim();
  if (f==="postcode") return /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/.test(v);
  if (f==="email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  if (f==="phone") return v.replace(/\D/g,"").length>=10;
  return v.length>1;
}
function canNext(){
  if (S.step===0) return !!(S.event && S.unit);
  if (S.step===1) return !!(S.date && S.time);
  if (S.step===2) return S.guests <= pkgObj().cups;
  if (S.step===3) return ["venue","postcode","name","email","phone"].every(valid);
  return true;
}

function renderConfirm(){
  const b = S.mine[0];
  const bal = new Date(b.date); bal.setDate(bal.getDate()-14);
  const pkgName = (PACKAGES.find(p=>p.id===b.pkg)||{}).name||"";
  return '<section><div class="ticket"><div class="t-top"><div class="eyebrow" style="color:rgba(255,255,255,.7)">Booking received</div><h2>Your date is held: '+fmtDate(b.date,true)+'</h2></div><div class="t-body"><div class="eyebrow">Booking reference</div><div class="ref">'+esc(b.ref)+'</div></div><div class="perf"></div><div class="t-body"><dl class="kv"><dt>Serving</dt><dd>From '+esc(b.time)+' · '+b.guests+' guests</dd><dt>Setup</dt><dd>'+unitName(b.unit)+'</dd><dt>Package</dt><dd>'+esc(pkgName)+'</dd><dt>Total</dt><dd class="mono">'+gbp(b.total)+'</dd><dt>Deposit due</dt><dd class="mono">'+gbp(b.deposit)+'</dd></dl></div></div>'
   + '<div class="bonus"><span class="pico" style="width:44px;height:44px;border-radius:14px;display:grid;place-items:center;flex:none">'+cupIco()+'</span><span style="flex:1"><b>+'+BOOKING_BONUS+' stamps when your deposit is paid</b><small class="muted">They’re added to your Froyo card automatically.</small></span></div>'
   + '<div class="panel"><div class="eyebrow" style="margin-bottom:10px">What happens next</div><ol class="timeline"><li class="done"><i></i><span>Booking saved. We’ll be in touch at '+esc(b.email)+'</span></li><li><i></i><span>We email you a secure link to pay the '+gbp(b.deposit)+' deposit within 1 working day</span></li><li><i></i><span>Balance of '+gbp(Math.round((b.total-b.deposit)*100)/100)+' due '+fmtDate(bal)+'</span></li><li><i></i><span>'+(b.unit==="trailer"?"On the day, track the trailer in Find us":"Our team texts you on the morning with an arrival time")+'</span></li></ol></div></section>';
}

const ST_LABEL = {pending_deposit:"Deposit due", deposit_paid:"Deposit paid", confirmed:"Confirmed"};
const ST_CLASS = {pending_deposit:"st-enquiry", deposit_paid:"st-deposit", confirmed:"st-confirmed"};
function normB(x){ return Object.assign({}, x, {date: parseDay(x.date), total: x.total/100, deposit: x.deposit/100}); }
function bkCard(b, ops){
  const d = b.date;
  const next = {pending_deposit:"Mark deposit paid", deposit_paid:"Confirm booking"}[b.status];
  const pkgName = (PACKAGES.find(p=>p.id===b.pkg)||{}).name||"";
  return '<article class="bk"><div class="date"><small>'+MON3[d.getMonth()]+'</small><b>'+d.getDate()+'</b><small>'+DOW[(d.getDay()+6)%7]+'</small></div><div><h3>'+esc(b.name)+' · '+evName(b.event)+'</h3><div class="meta">'+esc(b.time)+' · '+b.guests+' guests · '+esc(pkgName)+' · '+esc(String(b.postcode).toUpperCase())+'</div>'
    + (ops ? '<div class="meta">'+esc(b.venue)+(b.phone?' · '+esc(b.phone):'')+(b.notes?'<br>Notes: '+esc(b.notes):'')+'</div>' : '')
    + '<div class="foot"><span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="status '+(ST_CLASS[b.status]||"")+'">'+(ST_LABEL[b.status]||esc(b.status))+'</span><span class="van">'+esc(b.ref)+' · '+unitName(b.unit)+'</span></span>'+(ops&&next?'<button class="btn ghost small" data-act="adv" data-ref="'+esc(b.ref)+'">'+next+'</button>':'<span class="mono" style="font-size:13px">'+gbp(b.total)+'</span>')+'</div></div></article>';
}
async function loadMine(){
  S.mineLoaded = true;
  try { S.mine = (await Neon.rpc("my_bookings", {}, true)).map(normB); } catch(e){ S.mineLoaded=false; toast(e.message); }
  if (S.tab==="mine") render();
}
function renderMine(){
  if (!S.user) return '<section><div class="panel empty"><h2 style="font-size:24px;margin-bottom:6px">Your bookings</h2><p>Sign in to see your bookings from any device.</p><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn" data-act="signin">Sign in</button><button class="btn ghost" data-act="goto" data-tab="book">Book Froyo</button></div></div></section>';
  if (!S.mineLoaded) return '<section><div class="panel empty">Loading your bookings…</div></section>';
  if (!S.mine.length) return '<section><div class="panel empty"><h2 style="font-size:20px;margin-bottom:6px">No bookings yet</h2><p>Bookings you make appear here with the deposit and balance due dates.</p><button class="btn" data-act="goto" data-tab="book">Book Froyo</button></div></section>';
  return '<section><div class="step-head"><h2>My bookings</h2></div>'+S.mine.map(b=>bkCard(b,false)).join("")+'<p class="note">To change or cancel a booking, reply to our email or call us with your booking reference.</p></section>';
}

function unitSvg(id){
  if (id==="cart") return '<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><rect x="7" y="16" width="26" height="15" rx="3" fill="var(--berry)"/><rect x="5" y="12" width="30" height="4" rx="2" fill="var(--ink)"/><path d="M9 12l3-6h16l3 6" fill="var(--yolk)"/><circle cx="12" cy="33" r="3" fill="var(--ink)"/><circle cx="28" cy="33" r="3" fill="var(--ink)"/></svg>';
  return '<svg width="44" height="40" viewBox="0 0 44 40" aria-hidden="true"><rect x="4" y="10" width="30" height="20" rx="4" fill="var(--berry)"/><rect x="10" y="14" width="14" height="8" rx="2" fill="var(--ground)"/><path d="M34 26h8" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round"/><circle cx="17" cy="32" r="4" fill="var(--ink)"/><path d="M8 10l4-5h14l4 5" fill="var(--mint)"/></svg>';
}
function dayName(n){ if(n===0) return "Today"; if(n===1) return "Tomorrow"; const d=addDays(n); return ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()]+" "+d.getDate()+" "+MON3[d.getMonth()]; }
function mapSvg(stop, live){
  const others = S.trailer.stops.filter(t=>t.day===0 && t.id!==stop.id && t.x);
  const lw = stop.place.length*7+18, lx = stop.x+14+lw > 352 ? stop.x-14-lw : stop.x+14;
  let s = '<svg class="map" viewBox="0 0 360 225" role="img" aria-label="Map showing the trailer at '+esc(stop.place)+'">'
    + '<rect width="360" height="225" fill="var(--surface-2)"/>'
    + '<rect x="70" y="40" width="110" height="80" rx="14" fill="var(--mint-soft)"/>'
    + '<path d="M-10 170 C 60 140, 90 190, 170 160 S 290 120, 370 150" fill="none" stroke="var(--mint)" stroke-width="14" opacity=".55"/>'
    + '<g stroke="var(--surface)" stroke-width="9" stroke-linecap="round"><path d="M0 60H360"/><path d="M200 0V225"/><path d="M40 0L120 225"/><path d="M200 130H360"/><path d="M280 0V130"/></g>';
  others.forEach(o=>{ s += '<circle cx="'+(+o.x)+'" cy="'+(+o.y)+'" r="6" fill="var(--ink-3)" opacity=".6"/>'; });
  s += (live?'<circle cx="'+(+stop.x)+'" cy="'+(+stop.y)+'" r="16" fill="var(--berry)" opacity=".18"/>':'')
    + '<path d="M'+(+stop.x)+' '+(stop.y+2)+' c-9-12-13-17-13-24 a13 13 0 0 1 26 0 c0 7-4 12-13 24z" fill="var(--berry)" transform="translate(0,-2)"/>'
    + '<circle cx="'+(+stop.x)+'" cy="'+(stop.y-24)+'" r="5" fill="var(--ground)"/>'
    + '<rect x="'+lx+'" y="'+(stop.y-40)+'" width="'+lw+'" height="22" rx="8" fill="var(--ink)"/>'
    + '<text x="'+(lx+9)+'" y="'+(stop.y-25)+'" font-family="Jost, system-ui, sans-serif" font-size="11.5" font-weight="700" fill="var(--ground)">'+esc(stop.place)+'</text></svg>';
  return s;
}
function trailerNow(){ const T=S.trailer; return T.live ? T.stops.find(t=>t.id===T.now_id) || null : null; }
function trailerNext(now){
  const nowM = new Date().getHours()*60 + new Date().getMinutes();
  const mins = t => { const [h,m]=t.split(":").map(Number); return h*60+m; };
  return S.trailer.stops.find(t=>!t.private && t!==now && (t.day>0 || mins(t.to) > nowM)) || null;
}
async function loadTrailer(){ try { S.trailer = await Neon.rpc("get_trailer"); } catch(e){} if (S.tab==="find"||S.tab==="rewards"||S.tab==="ops") render(); }
function renderFind(){
  const now = trailerNow(), next = trailerNext(now), focus = now || next;
  let h = '<section><div class="step-head"><h2>Find the trailer</h2><span class="eyebrow">Public pop-ups</span></div>';
  h += '<div class="live"><div class="live-head">';
  if (now) h += '<span class="live-state"><span class="dot"></span>Serving now</span><h2>'+esc(now.place)+'</h2><span class="muted">'+esc(now.area)+' · until '+esc(now.to)+'</span>';
  else if (next) h += '<span class="live-state off"><span class="dot"></span>Not serving right now</span><h2>Next: '+esc(next.place)+'</h2><span class="muted">'+dayName(next.day)+', '+esc(next.from)+'–'+esc(next.to)+(next.area?' · '+esc(next.area):'')+'</span>';
  else h += '<span class="live-state off"><span class="dot"></span>Not serving right now</span><h2>No public stops this week</h2><span class="muted">Check back soon.</span>';
  h += '</div>';
  if (focus && focus.x) h += mapSvg(focus, !!now) + '<div class="map-cap">Map preview, not to scale. Use Directions for the exact spot.</div>';
  if (focus) h += '<div class="live-actions"><a class="btn small" href="'+mapsUrl(focus.place+" "+focus.pc)+'" target="_blank" rel="noopener noreferrer">Directions</a></div>';
  h += '</div>';
  if (S.trailer.stops.length){
    h += '<div class="panel"><div class="eyebrow">This week’s stops</div><ul class="stops">';
    let lastDay = -1;
    S.trailer.stops.forEach(t=>{
      if (t.day!==lastDay){ h += '<li class="day-label">'+dayName(t.day)+'</li>'; lastDay=t.day; }
      const isNow = now && now.id===t.id;
      if (t.private) h += '<li class="stop private"><span class="when">'+esc(t.from)+'–'+esc(t.to)+'</span><span><strong>Private event</strong><small>Not open to the public</small></span><span></span></li>';
      else h += '<li class="stop'+(isNow?" now":"")+'"><span class="when">'+esc(t.from)+'–'+esc(t.to)+'</span><span><strong>'+(isNow?"● ":"")+esc(t.place)+'</strong><small>'+esc(t.area)+'</small></span><a href="'+mapsUrl(t.place+" "+t.pc)+'" target="_blank" rel="noopener noreferrer">Map</a></li>';
    });
    h += '</ul></div>';
  }
  h += '<div class="panel empty" style="padding:18px 16px"><strong>Want the trailer at your own event?</strong><p style="margin:4px 0 12px">Weddings, fêtes, festivals and garden parties.</p><button class="btn small" data-act="goto" data-tab="book">Book the trailer</button></div></section>';
  return h;
}

async function loadOps(){
  S.opsLoaded = true;
  try { S.ops = (await Neon.rpc("staff_bookings", {}, true)).map(normB); } catch(e){ S.opsLoaded=false; toast(e.message); }
  if (S.tab==="ops") render();
}
function renderOps(){
  const seg = '<div class="seg" role="group" aria-label="Operator views"><button data-act="opsview" data-v="events" aria-pressed="'+(S.opsView==="events")+'">Events</button><button data-act="opsview" data-v="till" aria-pressed="'+(S.opsView==="till")+'">Stamp till</button></div>';
  if (S.opsView==="till") return '<section>'+seg+renderTill()+'</section>';
  const list = S.ops.slice().sort((a,b)=>a.date-b.date);
  const f = S.opsFilter;
  const shown = list.filter(b=>f==="all"||b.status===f);
  const pipeline = list.reduce((s,b)=>s+b.total,0);
  const deposits = list.filter(b=>b.status!=="pending_deposit").reduce((s,b)=>s+b.deposit,0);
  const T = S.trailer, today = T.stops.filter(t=>t.day===0 && !t.private);
  let h = '<section>'+seg+'<div class="step-head"><h2>Upcoming events</h2><span class="eyebrow">Operator view</span></div>';
  h += '<div class="stats"><div class="stat"><small>Events</small><b class="mono">'+list.length+'</b></div><div class="stat"><small>Pipeline</small><b class="mono">'+gbp(pipeline)+'</b></div><div class="stat"><small>Deposits in</small><b class="mono">'+gbp(deposits)+'</b></div></div>';
  h += '<div class="panel"><div class="switch"><label for="liveToggle"><strong>Share trailer location</strong><br><small class="muted">'+(T.live?"Customers see where you’re serving now":"Customers see your next stop only")+'</small></label><input type="checkbox" id="liveToggle" '+(T.live?"checked":"")+'></div>'
    + (today.length ? '<div class="eyebrow" style="margin:12px 0 6px">Serving today at</div><div class="chips">'+today.map(t=>'<button class="chip" data-act="stop" data-i="'+t.id+'" aria-pressed="'+(T.live&&T.now_id===t.id)+'">'+esc(t.from)+' '+esc(t.place)+'</button>').join("")+'</div>' : '<p class="hint" style="margin:10px 0 0">No public stops today.</p>')
    + '</div>';
  h += '<div class="chips" style="margin-bottom:12px">'+[["all","All"],["pending_deposit","Deposit due"],["deposit_paid","Deposit paid"],["confirmed","Confirmed"]].map(x=>'<button class="chip" data-act="filter" data-f="'+x[0]+'" aria-pressed="'+(f===x[0])+'">'+x[1]+'</button>').join("")+'</div>';
  h += !S.opsLoaded ? '<div class="panel empty">Loading bookings…</div>' : shown.length ? shown.map(b=>bkCard(b,true)).join("") : '<div class="panel empty">Nothing with this status.</div>';
  h += '<p class="note">Marking a deposit as paid adds '+BOOKING_BONUS+' bonus stamps to the customer’s card. Only do it once the money has arrived.</p></section>';
  return h;
}

function renderBar(){
  const bar = $("#bar"), inn = $("#barIn");
  if (S.tab!=="book"){ bar.hidden = true; return; }
  bar.hidden = false;
  if (S.step===5){ inn.innerHTML = '<button class="btn ghost" data-act="goto" data-tab="mine" style="flex:1">View my bookings</button><button class="btn" data-act="restart" style="flex:1">Book another</button>'; return; }
  const q = quote();
  const est = S.step>=2 ? '<b class="mono">'+gbp(q.total)+'</b><small>Deposit '+gbp(q.deposit)+' to hold your date</small>'
            : S.date ? '<b style="font-size:16px">'+fmtDate(S.date)+(S.time?' · '+S.time:'')+'</b><small>'+evName(S.event)+'</small>'
            : '<b style="font-size:16px">'+(S.event?evName(S.event):"From £395")+'</b><small>'+(S.event?"Next, pick a date":"25% deposit secures your date")+'</small>';
  const label = S.step===4 ? (S.busy ? "Booking…" : S.user ? "Confirm booking" : "Sign in to book") : "Continue";
  inn.innerHTML = (S.step>0?'<button class="btn ghost" data-act="back" aria-label="Back">‹</button>':'')+'<div class="est">'+est+'</div><button class="btn" data-act="next" '+((S.step===3||canNext()) && !S.busy?"":"disabled")+'>'+label+'</button>';
}

// ---------- events ----------
document.addEventListener("click", e=>{
  const t = e.target.closest("[data-act],[data-tab]"); if(!t) return;
  const a = t.dataset.act;
  if (a==="acct"){ if(!S.user){ openSignin(); } else { S.acctOpen=!S.acctOpen; renderAcct(); } return; }
  if (S.acctOpen){ S.acctOpen=false; renderAcct(); }
  if (a==="signin"){ openSignin(); return; }
  if (a==="signin-staff"){ openSignin("staff"); return; }
  if (a==="guest"){ S.view="app"; S.auth.err=""; render(); window.scrollTo(0,0); return; }
  if (a==="staff-screen"){ S.auth.screen="staff"; S.auth.err=""; render(); return; }
  if (a==="change-email"){ S.auth.screen="welcome"; S.auth.err=""; render(); return; }
  if (a==="resend"){ if (Date.now() < S.auth.resendAt){ toast("Please wait a moment before asking for another code"); return; } sendCode(S.auth.email, true); return; }
  if (a==="signout"){ signOut(); return; }
  if (!a && t.dataset.tab){ S.tab = t.dataset.tab; render(); return; }
  if (a==="goto"){ S.tab=t.dataset.tab; render(); window.scrollTo(0,0); return; }
  if (a==="event"){ S.event=t.dataset.id; if(!S.unit && (S.event==="festival"||S.event==="school")) S.unit="trailer"; }
  if (a==="unit"){ if(S.unit!==t.dataset.id){ S.unit=t.dataset.id; S.date=null; S.time=null; } }
  if (a==="stop"){ setLive(true, +t.dataset.i); return; }
  if (a==="month"){ S.calMonth = new Date(S.calMonth.getFullYear(), S.calMonth.getMonth()+(+t.dataset.d), 1); }
  if (a==="date"){ const [y,m,d]=t.dataset.k.split("-").map(Number); S.date=new Date(y,m-1,d); if (S.time && dayInfo(S.date, S.unit).taken.includes(S.time)) S.time=null; }
  if (a==="time"){ S.time=t.dataset.t; }
  if (a==="g"){ S.guests=Math.max(10,Math.min(400,S.guests+(+t.dataset.d))); S.pkg=null; S.pkgTouched=false; }
  if (a==="pkg"){ S.pkg=t.dataset.id; S.pkgTouched=true; }
  if (a==="hrs"){ S.extraHours=+t.dataset.n; }
  if (a==="addon"){ return; }
  if (a==="back"){ S.step=Math.max(0,S.step-1); S.showErr=false; window.scrollTo(0,0); }
  if (a==="next"){
    if (S.step===3 && !canNext()){ S.showErr=true; render(); const bad=document.querySelector('[aria-invalid="true"]'); bad&&bad.focus(); return; }
    if (S.step===4){ book(); } else { S.step++; S.showErr=false; }
    window.scrollTo(0,0);
  }
  if (a==="restart"){ Object.assign(S,{finishBooking:false,step:0,event:null,unit:null,date:null,time:null,pkg:null,pkgTouched:false,extraHours:0,addons:new Set(),venue:"",notes:""}); }
  if (a==="filter"){ S.opsFilter=t.dataset.f; }
  if (a==="opsview"){ S.opsView=t.dataset.v; }
  if (a==="rw-copy-unused"){ const txt=$("#refcode").textContent; try{ navigator.clipboard.writeText(txt).then(()=>toast("Code copied"),selectCode); }catch(err){ selectCode(); } return; }
  if (a==="rw-bday"){ saveBirthday(); return; }
  if (a==="rw-find"){ tillFind(); return; }
  if (a==="rw-qty"){ R.qty=Math.max(1,Math.min(MAX_PER_VISIT,R.qty+(+t.dataset.d))); }
  if (a==="rw-stamp"){ tillStamp(); return; }
  if (a==="rw-redeem"){ tillRedeem(); return; }
  if (a==="adv"){ advance(t.dataset.ref, t); return; }
  render();
});
document.addEventListener("keydown", e=>{ if(e.key==="Enter" && e.target.id==="lookup"){ e.preventDefault(); $('[data-act="rw-find"]').click(); } });
document.addEventListener("change", e=>{
  const t=e.target;
  if (t.id==="liveToggle"){ setLive(t.checked, null); return; }
  if (t.dataset.act==="addon"){ t.checked?S.addons.add(t.dataset.id):S.addons.delete(t.dataset.id); renderBar(); }
  if (t.id==="guests"){ const y=window.scrollY; render(); window.scrollTo(0,y); }
});
document.addEventListener("input", e=>{
  const t=e.target;
  if (t.id==="guests"){ S.guests=+t.value; S.pkg=null; S.pkgTouched=false; $("#gval").textContent=S.guests; $("#pkgs").innerHTML=pkgList(); renderBar(); return; }
  if (t.dataset.f){ S[t.dataset.f]=t.value; if (S.step===3) renderBar(); }
});

async function book(){
  if (!S.user){ S.finishBooking = true; openSignin(); S.auth.note = "Sign in to finish your booking. Your details are kept."; render(); return; }
  if (S.busy) return;
  S.busy = true; renderBar();
  const payload = {event:S.event, unit:S.unit, date:key(S.date), time:S.time, guests:S.guests, pkg:pkgObj().id, addons:[...S.addons],
    venue:S.venue.trim(), postcode:S.postcode.trim(), name:S.name.trim(), email:S.email.trim(), phone:S.phone.trim(), notes:S.notes.trim()};
  try {
    const b = normB(await Neon.rpc("create_booking", {p: payload}, true));
    S.mine = [b].concat(S.mine.filter(x=>x.ref!==b.ref)); S.step = 5; S.finishBooking=false;
    delete AV[avKey(S.unit, S.date)];
  } catch(e){
    toast(e.message);
    if (/just been booked/.test(e.message)){ delete AV[avKey(S.unit, S.date)]; S.time=null; S.step=1; }
  }
  S.busy = false; render(); window.scrollTo(0,0);
}

async function setLive(on, stopId){
  try { S.trailer = await Neon.rpc("staff_set_live", {p_live:on, p_stop_id:stopId}, true);
        toast(on ? "Location is live for customers" : "Location hidden. Customers see the next stop"); }
  catch(e){ toast(e.message); }
  render();
}
async function advance(ref, btn){
  if (btn) btn.disabled = true;
  try { const b = normB(await Neon.rpc("staff_advance_booking", {p_ref: ref}, true));
        S.ops = S.ops.map(x=>x.ref===b.ref ? Object.assign({}, x, b) : x);
        toast(b.status==="deposit_paid" ? "Deposit marked as paid. "+BOOKING_BONUS+" bonus stamps added" : b.ref+" confirmed"); }
  catch(e){ toast(e.message); }
  render();
}

// ================= Rewards (loyalty card) =================
const GOAL = 10, MAX_PER_VISIT = 6, BOOKING_BONUS = 2;
let CARD = null;        // the signed-in customer's stamp card, from the database
let CARD_LOADING = false;
const R = {lookup:"", found:null, qty:1, err:"", stats:null, busy:false, newStamps:[], flash:false};
async function loadCard(){
  if (CARD_LOADING) return; CARD_LOADING = true;
  try {
    let c = await Neon.rpc("my_card", {}, true);
    if (!c.name && S.user){ c = Object.assign(c, await Neon.rpc("update_my_card", {p_name: S.user.name}, true)); }
    const before = CARD;
    CARD = c;
    if (before && (c.stamps > before.stamps || c.rewards > before.rewards)){ R.newStamps = c.rewards > before.rewards ? [GOAL] : Array.from({length:c.stamps-before.stamps},(_,i)=>before.stamps+i+1); R.flash = true; if (c.rewards > before.rewards) setTimeout(confetti,80); }
  } catch(e){ toast(e.message); }
  CARD_LOADING = false;
  if (S.tab==="rewards") render();
}
async function saveBirthday(){
  const v = $("#bday").value.trim();
  if (v.length < 3){ toast("Add a date, like 14 March"); $("#bday").focus(); return; }
  try { CARD = Object.assign(CARD||{}, await Neon.rpc("update_my_card", {p_birthday: v}, true)); toast("Birthday saved"); }
  catch(e){ toast(e.message); }
  render();
}
async function tillFind(){
  const v = $("#lookup").value.trim().toUpperCase().replace(/^FR-?/,"FR-");
  R.lookup = v; R.err = ""; R.qty = 1;
  if (!/^FR-\d{5}$/.test(v)){ R.found=null; R.err = "Member numbers look like FR-12345."; render(); return; }
  try { R.found = await Neon.rpc("staff_find_member", {p_member_no: v}, true); if (!R.found) R.err = "No member with number "+esc(v)+". Check the number on their card."; }
  catch(e){ R.found=null; R.err = esc(e.message); }
  render();
}
async function tillStamp(){
  if (!R.found || R.busy) return; R.busy = true; render();
  try { const m = await Neon.rpc("staff_add_stamps", {p_member_no: R.found.member_no, p_n: R.qty, p_where: tillWhere()}, true);
        const n = R.qty; R.found = m; R.qty = 1;
        toast(m.unlocked ? m.name+" unlocked a free cup!" : "Added "+n+" stamp"+(n>1?"s":"")+" for "+m.name);
        loadStats(); }
  catch(e){ toast(e.message); }
  R.busy = false; render();
}
async function tillRedeem(){
  if (!R.found || R.busy) return; R.busy = true; render();
  try { R.found = await Neon.rpc("staff_redeem", {p_member_no: R.found.member_no, p_where: tillWhere()}, true); toast("Free cup redeemed for "+R.found.name); loadStats(); }
  catch(e){ toast(e.message); }
  R.busy = false; render();
}
function tillWhere(){ const n = trailerNow(); return n ? "Trailer · "+n.place : "Froyo on the go"; }
async function loadStats(){ try { R.stats = await Neon.rpc("staff_stats", {}, true); } catch(e){} if (S.tab==="ops") render(); }
const SWIRL = "data:image/webp;base64,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";
let _cupN = 0;
function cupArt(){
  const id = "cc"+(++_cupN);
  const drips = [[7.6,4.2],[12,6.8],[16.4,3.4],[21,7.4],[25.6,4.6],[29.8,6.2],[33.6,3.6]];
  const body = "M3.8 12.4H36.2L33.2 33.4Q33 34.6 31.8 34.6H8.2Q7 34.6 6.8 33.4Z";
  let d = '<svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden="true"><defs><clipPath id="'+id+'"><path d="'+body+'"/></clipPath></defs>'
    + '<path d="'+body+'" fill="#121212"/>'
    + '<g clip-path="url(#'+id+')" fill="#fff"><rect x="0" y="11" width="40" height="5.2"/>'
    + drips.map(([x,l])=>'<rect x="'+(x-1.7)+'" y="14" width="3.4" height="'+(1.8+l*.8)+'" rx="1.7"/>').join("")
    + '</g><image href="'+SWIRL+'" x="11.2" y="17" width="17.6" height="17.6"/>'
    + '<rect x="2.6" y="9.8" width="34.8" height="3.4" rx="1.7" fill="#fff" stroke="#121212" stroke-width="1.2"/>'
    + '<path d="'+body+'" fill="none" stroke="#121212" stroke-width="1.2"/></svg>';
  return d;
}
function cupIco(){ return '<span class="swd" style="width:44px;height:44px">'+cupArt()+'</span>'; }
function stampCup(){ return '<span class="swd">'+cupArt()+'</span>'; }

function loyaltyCard(m){
  let st="";
  for (let i=1;i<=GOAL;i++){
    const free=i===GOAL, on = free ? m.rewards>0 : i<=m.stamps, pop=R.newStamps.includes(i);
    st += '<div class="stamp'+(on?" on":"")+(free?" free":"")+(pop?" pop":"")+'" aria-hidden="true">'+(on?(free?"Free":stampCup()):(free?"Free":i))+'</div>';
  }
  const left = GOAL-1-m.stamps;
  const sub = m.rewards ? "Your free froyo is ready" : left+" more cup"+(left>1?"s":"")+" until a free one";
  return '<div class="lcard" role="group" aria-label="Stamp card: '+m.stamps+' of 9 stamps'+(m.rewards?", free cup ready":"")+'">'
    + '<svg class="drip" viewBox="0 0 170 110" aria-hidden="true"><path d="M20 0h150v34c-8 0-8 24-17 24s-8-32-17-32-8 50-17 50-8-36-17-36-8 18-17 18-8-26-17-26-8 12-17 12-8-20-17-20z" fill="#fff" opacity=".16"/></svg>'
    + '<div class="row1"><div><div class="eyebrow" style="color:rgba(255,255,255,.8)">Froyo stamp card</div><h2>Hi '+esc(m.name)+'</h2><div class="sub">'+sub+'</div></div>'
    + '<div class="count mono">'+m.stamps+'<span style="opacity:.6;font-size:24px">/9</span><small>stamps</small></div></div>'
    + '<div class="stamps">'+st+'</div>'
    + (m.rewards ? '<div class="unlocked">'+stampCup().replace('60%','30').replace('60%','30')+'<div><b>'+(m.rewards>1?m.rewards+" free cups":"Free cup")+' unlocked</b><span style="font-size:13px">Show your code at the cart or trailer</span></div></div>' : '')
    + '<div class="lfoot"><span>Member since '+esc(m.since)+'</span><span class="mono" style="letter-spacing:.06em">'+esc(m.member_no)+'</span></div></div>';
}

function renderRewards(){
  if (!CARD) return '<section><div class="step-head"><h2>Rewards</h2></div><div class="panel empty">Loading your stamp card…</div></section>';
  const m = CARD, pct = Math.min(100, m.stamps/9*100);
  const now = trailerNow();
  let h = '<section><div class="step-head"><h2>Rewards</h2><span class="eyebrow">Buy 9, the 10th is free</span></div>' + loyaltyCard(m);
  h += '<div class="scan"><div class="qr" id="qr" aria-label="Your member QR code"></div><div><h3>Scan to collect</h3><p>Show this when you order at the cart or trailer. One stamp per cup.</p><div class="memno">'+esc(m.member_no)+'</div></div></div>';
  h += '<button class="nextstop'+(now?"":" off")+'" data-act="goto" data-tab="find"><span class="ldot"></span><span style="flex:1"><strong>'+(now?"Trailer serving now":"Trailer not serving right now")+'</strong><span class="muted" style="display:block;font-size:13px">'+(now?esc(now.place)+" · until "+esc(now.to):"See this week’s stops")+'</span></span><span aria-hidden="true" style="font-weight:800">›</span></button>';
  h += '<div class="panel"><div class="eyebrow">Perks</div>';
  h += '<div class="perk"><span class="pico">'+stampCup().replace(/60%/g,'30')+'</span><div><h3>Free cup every 10th visit</h3><p>Buy 9 cups, the 10th is on us. Any size, any toppings.</p><div class="prog"><i style="width:'+pct+'%"></i></div><div class="muted mono" style="font-size:12.5px;margin-top:4px">'+m.stamps+' of 9 stamps'+(m.rewards?' · '+m.rewards+' ready to use':'')+'</div></div></div>';
  h += '<div class="perk"><span class="pico"><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="12" rx="2" fill="var(--berry)"/><path d="M7 7V5h10v2" fill="none" stroke="var(--ink)" stroke-width="2"/><path d="M3 12h18" stroke="#fff" stroke-width="1.5"/></svg></span><div><h3>Book an event, get '+BOOKING_BONUS+' stamps</h3><p>Every booking adds '+BOOKING_BONUS+' bonus stamps to your card once the deposit is paid.</p><button class="btn ghost small" data-act="goto" data-tab="book">Book Froyo</button></div></div>';
  h += '<div class="perk"><span class="pico"><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="11" width="16" height="9" rx="2" fill="var(--berry)"/><path d="M12 11V7" stroke="var(--ink)" stroke-width="2"/><circle cx="12" cy="5" r="2" fill="var(--yolk)"/></svg></span><div><h3>Birthday treat</h3><p>A free cup any day in your birthday week.</p>'
    + (m.birthday ? '<div class="muted" style="font-size:13px"><strong style="color:var(--ink)">Saved: '+esc(m.birthday)+'</strong> · Show your card that week.</div>'
      : '<div class="inline"><div class="field"><label for="bday">Your birthday</label><input id="bday" type="text" maxlength="30" placeholder="e.g. 14 March"></div><button class="btn small" data-act="rw-bday">Save</button></div><p class="hint" style="margin:6px 0 0">You can only set this once.</p>') + '</div></div>';
  h += '<div class="perk"><span class="pico"><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="var(--yolk)" stroke="var(--ink)" stroke-width="1.2" stroke-linejoin="round"/></svg></span><div><h3>Double stamp Tuesdays</h3><p>Every cup bought from the trailer on a Tuesday counts twice.</p></div></div></div>';
  h += '<div class="panel"><div class="panel-head"><h3 style="font-size:16px">Activity</h3></div>';
  if (!m.history.length) h += '<p class="muted" style="margin:6px 0">No stamps yet. Show your code next time you order.</p>';
  else {
    h += '<ul class="hist">';
    m.history.slice(0,6).forEach((x,i)=>{
      const red = x.kind==="redeem", d = new Date(x.at);
      const title = red ? "Free cup redeemed" : x.kind==="bonus" ? "+"+x.n+" bonus stamp"+(x.n>1?"s":"") : x.n+" stamp"+(x.n>1?"s":"")+" collected";
      h += '<li class="'+(i===0&&R.flash?"new":"")+'"><span class="ic'+(red?" red":"")+'">'+(red?"★":"+"+x.n)+'</span><span><strong>'+title+'</strong><small>'+esc(x.where)+'</small></span><span class="amt muted">'+d.getDate()+" "+MON3[d.getMonth()]+'</span></li>';
    });
    h += '</ul>';
  }
  h += '</div><p class="note">Stamps are added by the team when you pay, so they can’t be collected online. Free cups don’t expire while you visit at least once every 12 months.</p></section>';
  return h;
}

function renderTill(){
  if (!R.stats) loadStats();
  const m = R.found;
  let h = '<div class="till"><div class="eyebrow">Stamp a card · cart or trailer tablet</div><h2>Type the member number</h2>';
  h += '<div class="inline" style="margin-top:12px"><div class="field"><label for="lookup">Member number</label><input id="lookup" value="'+esc(R.lookup)+'" placeholder="FR-12345" maxlength="9" autocomplete="off" spellcheck="false" autocapitalize="characters"></div><button class="btn small" data-act="rw-find">Find</button></div>';
  if (R.err) h += '<div class="terr">'+R.err+'</div>';
  if (m){
    let mini=""; for(let i=1;i<=GOAL;i++) mini += '<i class="'+((i===GOAL?m.rewards>0:i<=m.stamps)?"on":"")+(i===GOAL?" free":"")+'"></i>';
    h += '<div class="member"><div class="member-top"><div><b>'+esc(m.name)+'</b> <span class="mono" style="opacity:.7;font-size:13px">'+esc(m.member_no)+'</span></div><span class="mono">'+m.stamps+'/9</span></div><div class="mini">'+mini+'</div>'
      + (m.rewards ? '<div style="margin-top:10px;font-weight:800;color:var(--yolk)">★ '+m.rewards+' free cup'+(m.rewards>1?"s":"")+' ready</div>' : '')
      + '<div class="qty"><span style="font-weight:800">Cups in this order</span><div style="display:flex;align-items:center;gap:8px"><button class="round" data-act="rw-qty" data-d="-1" aria-label="One fewer cup">−</button><span class="n mono" aria-live="polite">'+R.qty+'</span><button class="round" data-act="rw-qty" data-d="1" aria-label="One more cup">+</button></div></div>'
      + '<div class="tactions"><button class="btn big" data-act="rw-stamp" '+(R.busy?"disabled":"")+'>Add '+R.qty+' stamp'+(R.qty>1?"s":"")+'</button>'
      + (m.rewards ? '<button class="btn big redeem" data-act="rw-redeem" '+(R.busy?"disabled":"")+'>Redeem free cup</button>' : '')
      + '</div><div class="thint">Max '+MAX_PER_VISIT+' stamps per order and 18 per member per day. A free cup doesn’t earn a stamp.</div></div>';
  }
  const st = R.stats || {stamps_today:"–", redeemed_today:"–", members:"–"};
  h += '</div><div class="stats" style="margin-top:14px"><div class="stat"><small>Stamps today</small><b class="mono">'+st.stamps_today+'</b></div><div class="stat"><small>Free cups today</small><b class="mono">'+st.redeemed_today+'</b></div><div class="stat"><small>Members</small><b class="mono">'+st.members+'</b></div></div>';
  h += '<p class="note">Every stamp and free cup is recorded against your staff account and the time.</p>';
  return h;
}
function drawQR(){ const el=document.getElementById("qr"); if(el && CARD) el.innerHTML = FroyoQR.svg("froyo:member:"+CARD.member_no, "QR code for member "+CARD.member_no); }
function selectCode(){ const r=document.createRange(); r.selectNodeContents($("#refcode")); const sel=getSelection(); sel.removeAllRanges(); sel.addRange(r); toast("Code selected. Copy it from here"); }
function confetti(){
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c=$("#confetti"), x=c.getContext("2d"); c.hidden=false; c.width=innerWidth; c.height=innerHeight;
  const cols=["#121212","#C9A45C","#9FB39B","#DCDAD4"];
  const P=Array.from({length:120},()=>({x:innerWidth/2+(Math.random()-.5)*200,y:innerHeight*.35,vx:(Math.random()-.5)*9,vy:-Math.random()*10-3,r:Math.random()*6+3,c:cols[Math.floor(Math.random()*4)],a:Math.random()*6}));
  let f=0; (function tick(){ x.clearRect(0,0,c.width,c.height); P.forEach(p=>{p.vy+=.28;p.x+=p.vx;p.y+=p.vy;p.a+=.1;x.save();x.translate(p.x,p.y);x.rotate(p.a);x.fillStyle=p.c;x.fillRect(-p.r/2,-p.r/2,p.r,p.r*.6);x.restore();}); if(++f<110) requestAnimationFrame(tick); else c.hidden=true; })();
}

// ================= Sign in =================
function logoSrc(){ const l=document.querySelector(".brand .logo"); return l?l.src:""; }
function openSignin(screen){ S.returnTab = S.tab; S.view="signin"; S.auth.screen=screen||"welcome"; S.auth.err=""; S.acctOpen=false; render(); window.scrollTo(0,0); }
function nameFromEmail(e){ const w=(e.split("@")[0]||"").split(/[._\-+0-9]+/).filter(Boolean)[0]||"there"; return w.charAt(0).toUpperCase()+w.slice(1).toLowerCase(); }
async function afterSignIn(){
  const sess = await Neon.session();
  if (!sess || !sess.user){ S.user=null; return false; }
  const u = sess.user;
  S.user = {id:u.id, email:u.email, name: (u.name && u.name.trim()) || nameFromEmail(u.email), staff:false};
  try { const c = await Neon.rpc("my_card", {}, true); S.user.staff = !!c.staff; if (!S.user.staff) CARD = c; } catch(e){}
  if (!S.name) S.name = S.user.name; if (!S.email) S.email = S.user.email;
  S.mineLoaded=false; S.opsLoaded=false;
  return true;
}
async function signOut(){
  await Neon.signOut();
  S.user=null; CARD=null; S.mine=[]; S.mineLoaded=false; S.ops=[]; S.opsLoaded=false; R.found=null; R.stats=null; R.lookup="";
  S.acctOpen=false; toast("Signed out"); render();
}
async function sendCode(email, isResend){
  S.auth.busy = true; S.auth.err=""; render();
  try { await Neon.sendCode(email); S.auth.screen="code"; S.auth.resendAt = Date.now()+30000; if (isResend) toast("New code sent to "+email); }
  catch(e){ S.auth.err = e.message; }
  S.auth.busy = false; render();
  const f = $(S.auth.screen==="code" ? "#si-code" : "#si-email"); f && f.focus();
}
function enterApp(){
  S.view="app"; S.auth.err=""; S.auth.note="";
  if (S.finishBooking){ S.tab="book"; S.step=4; }
  else S.tab = S.user && S.user.staff ? "ops" : (S.returnTab==="ops" ? "book" : S.returnTab);
  render(); window.scrollTo(0,0);
}
function renderAcct(){
  const b=$("#acct"), m=$("#acctMenu");
  b.hidden = (S.view==="signin");
  if (!S.user){ b.className="acct"; b.textContent="Sign in"; b.setAttribute("aria-label","Sign in"); m.hidden=true; return; }
  b.className="acct on"; b.textContent=S.user.name.charAt(0).toUpperCase(); b.setAttribute("aria-label","Account: "+S.user.name); b.setAttribute("aria-expanded", S.acctOpen);
  m.hidden=!S.acctOpen;
  if (S.acctOpen) m.innerHTML = '<div class="who"><b>'+esc(S.user.name)+(S.user.staff?' · Staff':'')+'</b><small>'+esc(S.user.email)+'</small>'+(S.user.staff||!CARD?'':'<small style="display:block" class="mono">Member '+esc(CARD.member_no)+'</small>')+'</div>'
    + (S.user.staff ? '<button class="btn ghost small" data-act="goto" data-tab="ops">Operator</button>' : '<button class="btn ghost small" data-act="goto" data-tab="rewards">My stamp card</button><button class="btn ghost small" data-act="goto" data-tab="mine">My bookings</button>')
    + '<button class="btn small" data-act="signout">Sign out</button>';
}
function renderSignin(){
  const A=S.auth, err = A.err ? '<span class="err" role="alert">'+esc(A.err)+'</span>' : '';
  const dis = A.busy ? ' disabled' : '';
  let h='<section class="signin">';
  if (A.screen==="welcome"){
    h += '<div class="si-hero"><img class="si-logo" src="'+logoSrc()+'" alt=""><h1>Welcome to Froyo on the go</h1><p>Sign in to collect stamps on every cup and keep your bookings in one place.</p></div>';
    if (A.note) h += '<p class="note" style="margin:0">'+esc(A.note)+'</p>';
    h += '<form data-form="email" novalidate><div class="field"><label for="si-email">Email</label><input id="si-email" type="email" autocomplete="email" inputmode="email" maxlength="254" placeholder="you@example.com" value="'+esc(A.email)+'"'+(A.err?' aria-invalid="true"':'')+'></div>'+err+'<button class="btn big" type="submit"'+dis+'>'+(A.busy?"Sending…":"Email me a sign-in code")+'</button></form>';
    h += '<button class="linkbtn center" data-act="guest">Continue as guest</button>';
    h += '<p class="si-small">No password needed. New here? Signing in creates your account.</p>';
    h += '<div class="si-foot"><button class="linkbtn" data-act="staff-screen">Staff sign in</button></div>';
  } else if (A.screen==="code"){
    h += '<button class="linkbtn" data-act="change-email" style="align-self:flex-start">‹ Back</button>';
    h += '<div class="si-head"><img class="si-logo sm" src="'+logoSrc()+'" alt=""><h2>Check your email</h2><p>We sent a 6-digit code to <strong>'+esc(A.email)+'</strong>. It may take a minute, and could be in your junk folder.</p></div>';
    h += '<form data-form="code" novalidate><div class="field"><label for="si-code">Sign-in code</label><input id="si-code" class="codein mono" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000"'+(A.err?' aria-invalid="true"':'')+'></div>'+err+'<button class="btn big" type="submit"'+dis+'>'+(A.busy?"Checking…":"Sign in")+'</button></form>';
    h += '<div class="row-links"><button class="linkbtn" data-act="resend">Resend code</button><button class="linkbtn" data-act="change-email">Use a different email</button></div>';
  } else {
    h += '<button class="linkbtn" data-act="change-email" style="align-self:flex-start">‹ Customer sign in</button>';
    h += '<div class="si-head"><img class="si-logo sm" src="'+logoSrc()+'" alt=""><div class="eyebrow" style="margin-top:10px">Staff only</div><h2>Staff sign in</h2><p>For the team running the cart, the trailer and bookings.</p></div>';
    h += '<form data-form="staff" novalidate><div class="field"><label for="st-email">Work email</label><input id="st-email" type="email" autocomplete="username" maxlength="254" value="'+esc(A.staffEmail||"")+'"></div><div class="field"><label for="st-pass">Password</label><input id="st-pass" type="password" autocomplete="current-password" maxlength="128"></div>'+err+'<button class="btn big" type="submit"'+dis+'>'+(A.busy?"Signing in…":"Sign in")+'</button></form>';
  }
  return h+'</section>';
}
function renderRewardsLocked(){
  let st=""; for(let i=1;i<=GOAL;i++) st+='<div class="stamp'+(i===GOAL?" free":"")+'" aria-hidden="true">'+(i===GOAL?"Free":i)+'</div>';
  if (S.user && S.user.staff) return '<section><div class="panel empty"><h2 style="font-size:24px;margin-bottom:6px">You’re signed in as staff</h2><p>Stamp customers’ cards from the Stamp till in the Operator tab.</p><button class="btn" data-act="goto" data-tab="ops">Open Operator</button></div></section>';
  return '<section><div class="step-head"><h2>Rewards</h2><span class="eyebrow">Buy 9, the 10th is free</span></div><div class="lcard lock-card"><div class="eyebrow" style="color:rgba(255,255,255,.75)">Froyo stamp card</div><h2 style="font-size:26px">Collect a stamp on every cup</h2><div class="stamps" style="width:100%">'+st+'</div><p style="margin:4px 0 6px;opacity:.9">Plus a birthday treat, bonus stamps when you book an event, and double stamps on Tuesdays.</p><button class="btn big" data-act="signin">Sign in to start collecting</button></div></section>';
}
function renderStaffLocked(){
  return '<section><div class="panel empty"><div class="eyebrow">Staff only</div><h2 style="font-size:24px;margin:6px 0">Operator</h2><p>Sign in with your staff account to manage bookings, share the trailer’s location and use the stamp till.</p><button class="btn" data-act="signin-staff">Staff sign in</button></div></section>';
}
document.addEventListener("submit", async e=>{
  const f=e.target.dataset.form; if(!f) return; e.preventDefault();
  if (S.auth.busy) return;
  const okEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254;
  if (f==="email"){
    const v=$("#si-email").value.trim().toLowerCase(); S.auth.email=v;
    if(!okEmail(v)){ S.auth.err="Enter an email address like name@example.com."; render(); $("#si-email").focus(); return; }
    sendCode(v, false);
  }
  if (f==="code"){
    const v=$("#si-code").value.replace(/\D/g,"");
    if(v.length!==6){ S.auth.err="Enter the 6-digit code from the email."; render(); $("#si-code").focus(); return; }
    S.auth.busy=true; S.auth.err=""; render();
    try { await Neon.verifyCode(S.auth.email, v); await afterSignIn(); S.auth.busy=false; toast("Signed in"); enterApp(); }
    catch(err){ S.auth.busy=false; S.auth.err=err.message; render(); $("#si-code").focus(); }
  }
  if (f==="staff"){
    const em=$("#st-email").value.trim().toLowerCase(), pw=$("#st-pass").value; S.auth.staffEmail=em;
    if(!okEmail(em) || !pw){ S.auth.err = !pw && /@/.test(em) ? "Enter your password." : "Enter your work email and password."; render(); return; }
    S.auth.busy=true; S.auth.err=""; render();
    try {
      await Neon.passwordSignIn(em, pw);
      await afterSignIn();
      if (!S.user || !S.user.staff){ await Neon.signOut(); S.user=null; CARD=null; throw new Error("This account doesn’t have staff access."); }
      S.auth.busy=false; S.opsView="events"; toast("Signed in as staff"); enterApp();
    } catch(err){ S.auth.busy=false; S.auth.err=err.message; render(); }
  }
});

// ---------- start up ----------
async function boot(){
  render();
  Neon.rpc("get_catalogue").then(c=>{
    (c.packages||[]).forEach(p=>{ const l=PACKAGES.find(x=>x.id===p.id); if(l){ l.cups=p.cups; l.price=p.price/100; l.desc = "Up to "+p.cups+" cups"+l.desc.replace(/^Up to \d+ cups/,""); } });
    (c.addons||[]).forEach(a=>{ const l=ADDONS.find(x=>x.id===a.id); if(l){ l.price=a.price/100; } });
    if (S.view==="app") render();
  }).catch(()=>{});
  loadTrailer();
  const signedIn = await afterSignIn().catch(()=>false);
  S.view = signedIn ? "app" : "signin";
  if (signedIn && S.user.staff) S.tab = "ops";
  render();
}
boot();
})();
