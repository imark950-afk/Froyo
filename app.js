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

// Public trailer schedule (example data). In the live app the operator sets this and the trailer's GPS updates the pin.
function mapsUrl(q){ return "https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(q); }
const TRAILER = [
  {day:0, from:"11:00", to:"14:00", place:"Riverside Park", area:"by the boathouse", pc:"GU1 1AA", x:118, y:92},
  {day:0, from:"15:00", to:"18:00", place:"Market Square", area:"Saturday food market", pc:"GU1 3AJ", x:250, y:150},
  {day:1, from:"12:00", to:"17:00", place:"Private event", private:true},
  {day:3, from:"15:15", to:"17:30", place:"Northgate Primary", area:"after-school pop-up, by the main gate", pc:"SE22 8QF"},
  {day:5, from:"12:00", to:"14:00", place:"Station Approach", area:"lunchtime pop-up", pc:"GU1 4UT"},
  {day:6, from:"10:00", to:"16:00", place:"Village Green Fête", area:"stall 14, near the bandstand", pc:"GU5 0QF"}
];

// deterministic sample availability
function hash(n){ n = ((n>>16)^n)*0x45d9f3b; n = ((n>>16)^n)*0x45d9f3b; return ((n>>16)^n)>>>0; }
function key(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function dayInfo(d, unit){
  const diff = (d - TODAY)/864e5;
  if (diff < MIN_NOTICE) return {st:"past"};
  const h = hash(d.getFullYear()*500 + d.getMonth()*40 + d.getDate() + (unit==="trailer"?7919:0)) % 10;
  const wknd = d.getDay()===0 || d.getDay()===6;
  if (h < (wknd?3:1)) return {st:"full"};
  if (h < (wknd?6:3)) return {st:"limited", taken:[SLOTS[h%4], SLOTS[(h+2)%4]]};
  return {st:"open", taken:[]};
}

function addDays(n){ const d=new Date(TODAY); d.setDate(d.getDate()+n); return d; }
const SAMPLE = [
  {ref:"FR-4K2P", name:"Priya & Tom", event:"wedding", unit:"trailer", date:addDays(13), time:"18:00", guests:110, pkg:"party", total:1060, status:"deposit", postcode:"GU1 3AA", sample:true},
  {ref:"FR-9D3M", name:"Northgate Primary PTA", event:"school", unit:"trailer", date:addDays(20), time:"13:00", guests:220, pkg:"festival", total:1480, status:"confirmed", postcode:"SE22 8QF", sample:true},
  {ref:"FR-2H7X", name:"Lumen Studios", event:"corporate", unit:"cart", date:addDays(27), time:"15:00", guests:75, pkg:"party", total:808, status:"enquiry", postcode:"EC2A 4NE", sample:true},
  {ref:"FR-6R1B", name:"Maya's 7th", event:"birthday", unit:"cart", date:addDays(34), time:"11:00", guests:35, pkg:"popup", total:447, status:"confirmed", postcode:"KT2 6PT", sample:true}
];

const S = {
  tab:"book", step:0,
  event:null, unit:null, live:true, liveStop:1, notify:false, date:null, time:null, calMonth:new Date(TODAY.getFullYear(), TODAY.getMonth(), 1),
  guests:80, pkg:null, pkgTouched:false, extraHours:0, addons:new Set(),
  venue:"", postcode:"", name:"", email:"", phone:"", notes:"",
  mine:[], ops:SAMPLE.slice(), opsFilter:"all", opsView:"events", showErr:false,
  view:"signin", user:null, auth:{screen:"welcome", email:"", err:""}, returnTab:"book", pendingBonus:null, acctOpen:false
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

function toast(msg){ const t=$("#toast"); t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,2400); }

// ---------- views ----------
function render(){
  renderAcct();
  const tabsEl = $("#tabs");
  if (S.view==="signin"){ tabsEl.hidden=true; $("#bar").hidden=true; const v=$("#view"); v.innerHTML=renderSignin(); v.firstElementChild.classList.add("fade"); return; }
  tabsEl.hidden=false;
  const isStaff = !!(S.user && S.user.staff);
  $("#tab-ops").hidden = !isStaff;
  if (S.tab==="ops" && !isStaff) S.tab="book";
  document.querySelectorAll(".tabs button").forEach(b=>b.setAttribute("aria-selected", b.dataset.tab===S.tab));
  const v = $("#view");
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
    h += '<div class="step-head"><h2>Check & pay deposit</h2><span class="eyebrow">Step 5 of 5</span></div>';
    h += '<div class="panel"><dl class="kv"><dt>Event</dt><dd>'+evName(S.event)+'</dd><dt>Setup</dt><dd>'+unitName(S.unit)+'</dd><dt>When</dt><dd>'+fmtDate(S.date,true)+', serving from '+S.time+'</dd><dt>Guests</dt><dd>'+S.guests+'</dd><dt>Where</dt><dd>'+esc(S.venue)+', '+esc(S.postcode.toUpperCase())+'</dd><dt>Contact</dt><dd>'+esc(S.name)+' · '+esc(S.phone)+'</dd></dl></div>';
    h += '<div class="panel">'+q.lines.map(l=>'<div class="sum-row"><span>'+l[0]+'</span><span>'+gbp(l[1])+'</span></div>').join("")
      + '<div class="sum-row"><span>Travel (within 25 miles)</span><span>£0</span></div>'
      + '<div class="sum-row total"><span>Total inc. VAT</span><span>'+gbp(q.total)+'</span></div>'
      + '<div class="sum-row dep"><span>Deposit due today (25%)</span><span>'+gbp(q.deposit)+'</span></div>'
      + '<div class="sum-row muted"><span>Balance due 14 days before</span><span>'+gbp(Math.round((q.total-q.deposit)*100)/100)+'</span></div></div>';
    h += '<p class="note">Free date change up to 30 days before. Deposit is refundable if we can’t attend. In the live app, the button below opens Stripe Checkout with Apple Pay and Google Pay. This prototype skips payment.</p>';
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
  return '<section><div class="ticket"><div class="t-top"><div class="eyebrow" style="color:rgba(255,255,255,.7)">Booking confirmed</div><h2>See you on '+fmtDate(b.date,true)+'</h2></div><div class="t-body"><div class="eyebrow">Booking reference</div><div class="ref">'+b.ref+'</div></div><div class="perf"></div><div class="t-body"><dl class="kv"><dt>Serving</dt><dd>From '+b.time+' · '+b.guests+' guests</dd><dt>Setup</dt><dd>'+unitName(b.unit)+'</dd><dt>Package</dt><dd>'+PACKAGES.find(p=>p.id===b.pkg).name+'</dd><dt>Paid</dt><dd class="mono">'+gbp(b.deposit)+' of '+gbp(b.total)+'</dd></dl></div></div>'
   + '<button class="bonus" '+(S.pendingBonus?'data-act="signin"':'data-act="goto" data-tab="rewards"')+' style="width:100%;border:0;text-align:left"><span class="pico" style="width:44px;height:44px;border-radius:14px;display:grid;place-items:center;background:transparent;flex:none">'+cupIco()+'</span><span style="flex:1"><b>'+(S.pendingBonus?'Sign in to claim '+BOOKING_BONUS+' bonus stamps':'+'+BOOKING_BONUS+' stamps on your Froyo card')+'</b><small class="muted">'+(S.pendingBonus?'Your stamps are saved for this booking. Signing in adds them to your card':'Thanks for booking. See your card in Rewards')+'</small></span><span aria-hidden="true" style="font-weight:800">›</span></button>'
   + '<div class="panel"><div class="eyebrow" style="margin-bottom:10px">What happens next</div><ol class="timeline"><li class="done"><i></i><span>Deposit received. Confirmation sent to '+esc(b.email)+'</span></li><li><i></i><span>We call within 2 working days to confirm access and flavours</span></li><li><i></i><span>Balance of '+gbp(Math.round((b.total-b.deposit)*100)/100)+' due '+fmtDate(bal)+'</span></li><li><i></i><span>'+(b.unit==="trailer"?"On the day, track the trailer in Find us and get a text when it’s 15 minutes away":"Our team texts you on the morning with an arrival time")+'</span></li></ol></div></section>';
}

function bkCard(b, ops){
  const d = b.date;
  const next = {enquiry:"Mark deposit paid", deposit:"Confirm booking"}[b.status];
  const label = {enquiry:"Enquiry", deposit:"Deposit paid", confirmed:"Confirmed"}[b.status];
  return '<article class="bk"><div class="date"><small>'+MON3[d.getMonth()]+'</small><b>'+d.getDate()+'</b><small>'+DOW[(d.getDay()+6)%7]+'</small></div><div><h3>'+esc(b.name)+' · '+evName(b.event)+'</h3><div class="meta">'+b.time+' · '+b.guests+' guests · '+PACKAGES.find(p=>p.id===b.pkg).name+' · '+esc(b.postcode.toUpperCase())+'</div><div class="foot"><span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="status st-'+b.status+'">'+label+'</span><span class="van">'+b.ref+' · '+unitName(b.unit)+'</span>'+(b.sample?'<span class="sample-tag">Example</span>':'')+'</span>'+(ops&&next?'<button class="btn ghost small" data-act="adv" data-ref="'+b.ref+'">'+next+'</button>':'<span class="mono" style="font-size:13px">'+gbp(b.total)+'</span>')+'</div></div></article>';
}

function renderMine(){
  if (!S.user && !S.mine.length) return '<section><div class="panel empty"><h2 style="font-size:24px;margin-bottom:6px">Your bookings</h2><p>Sign in to see your bookings, pay the balance and change dates from any device.</p><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn" data-act="signin">Sign in</button><button class="btn ghost" data-act="goto" data-tab="book">Book Froyo</button></div></div></section>';
  if (!S.user) return '<section><div class="step-head"><h2>My bookings</h2></div>'+S.mine.map(b=>bkCard(b,false)).join("")+'<div class="panel" style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap"><span style="flex:1;min-width:180px"><strong>Keep these bookings</strong><br><small class="muted">You booked as a guest. Sign in to save them to your account.</small></span><button class="btn small" data-act="signin">Sign in</button></div></section>';
  if (!S.mine.length) return '<section><div class="panel empty"><h2 style="font-size:20px;margin-bottom:6px">No bookings yet</h2><p>Bookings you make appear here with the balance due date and arrival details.</p><button class="btn" data-act="goto" data-tab="book">Book Froyo</button></div></section>';
  return '<section><div class="step-head"><h2>My bookings</h2></div>'+S.mine.map(b=>bkCard(b,false)).join("")+'<p class="note">In the live app, customers sign in with a magic link sent to their email, and can change the date or pay the balance from here.</p></section>';
}

function unitSvg(id){
  if (id==="cart") return '<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><rect x="7" y="16" width="26" height="15" rx="3" fill="var(--berry)"/><rect x="5" y="12" width="30" height="4" rx="2" fill="var(--ink)"/><path d="M9 12l3-6h16l3 6" fill="var(--yolk)"/><circle cx="12" cy="33" r="3" fill="var(--ink)"/><circle cx="28" cy="33" r="3" fill="var(--ink)"/></svg>';
  return '<svg width="44" height="40" viewBox="0 0 44 40" aria-hidden="true"><rect x="4" y="10" width="30" height="20" rx="4" fill="var(--berry)"/><rect x="10" y="14" width="14" height="8" rx="2" fill="var(--ground)"/><path d="M34 26h8" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round"/><circle cx="17" cy="32" r="4" fill="var(--ink)"/><path d="M8 10l4-5h14l4 5" fill="var(--mint)"/></svg>';
}
function dayName(n){ if(n===0) return "Today"; if(n===1) return "Tomorrow"; const d=addDays(n); return ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()]+" "+d.getDate()+" "+MON3[d.getMonth()]; }
function mapSvg(stop, live){
  const others = TRAILER.filter(t=>t.day===0 && t!==stop && t.x);
  const lw = stop.place.length*7+18, lx = stop.x+14+lw > 352 ? stop.x-14-lw : stop.x+14;
  let s = '<svg class="map" viewBox="0 0 360 225" role="img" aria-label="Map showing the trailer at '+esc(stop.place)+'">'
    + '<rect width="360" height="225" fill="var(--surface-2)"/>'
    + '<rect x="70" y="40" width="110" height="80" rx="14" fill="var(--mint-soft)"/>'
    + '<path d="M-10 170 C 60 140, 90 190, 170 160 S 290 120, 370 150" fill="none" stroke="var(--mint)" stroke-width="14" opacity=".55"/>'
    + '<g stroke="var(--surface)" stroke-width="9" stroke-linecap="round"><path d="M0 60H360"/><path d="M200 0V225"/><path d="M40 0L120 225"/><path d="M200 130H360"/><path d="M280 0V130"/></g>'
    + '<g font-family="Nunito Sans, system-ui, sans-serif" font-size="10" font-weight="700" fill="var(--ink-3)"><text x="206" y="18">High Street</text><text x="290" y="124">Castle St</text><text x="84" y="112">Park</text><text x="12" y="190">River Wey</text></g>';
  others.forEach(o=>{ s += '<circle cx="'+o.x+'" cy="'+o.y+'" r="6" fill="var(--ink-3)" opacity=".6"/>'; });
  s += (live?'<circle cx="'+stop.x+'" cy="'+(stop.y)+'" r="16" fill="var(--berry)" opacity=".18"/>':'')
    + '<path d="M'+stop.x+' '+(stop.y+2)+' c-9-12-13-17-13-24 a13 13 0 0 1 26 0 c0 7-4 12-13 24z" fill="var(--berry)" transform="translate(0,-2)"/>'
    + '<circle cx="'+stop.x+'" cy="'+(stop.y-24)+'" r="5" fill="var(--ground)"/>'
    + '<rect x="'+lx+'" y="'+(stop.y-40)+'" width="'+lw+'" height="22" rx="8" fill="var(--ink)"/>'
    + '<text x="'+(lx+9)+'" y="'+(stop.y-25)+'" font-family="Nunito Sans, system-ui, sans-serif" font-size="11.5" font-weight="800" fill="var(--ground)">'+esc(stop.place)+'</text></svg>';
  return s;
}
function renderFind(){
  const now = S.live ? TRAILER[S.liveStop] : null;
  const next = TRAILER.find(t=>!t.private && t!==now && (t.day>0 || (S.live && TRAILER.indexOf(t)>S.liveStop) || (!S.live && t.day===0 && TRAILER.indexOf(t)>=S.liveStop)));
  const focus = now || next;
  let h = '<section><div class="step-head"><h2>Find the trailer</h2><span class="eyebrow">Public pop-ups</span></div>';
  h += '<div class="live"><div class="live-head">';
  if (now) h += '<span class="live-state"><span class="dot"></span>Serving now · updated 2 min ago</span><h2>'+esc(now.place)+'</h2><span class="muted">'+esc(now.area)+' · until '+now.to+'</span>';
  else h += '<span class="live-state off"><span class="dot"></span>Not serving right now</span><h2>Next: '+esc(next.place)+'</h2><span class="muted">'+dayName(next.day)+', '+next.from+'–'+next.to+' · '+esc(next.area)+'</span>';
  h += '</div>';
  if (focus && focus.x) h += mapSvg(focus, !!now) + '<div class="map-cap">Map preview. In the app this is a live map using the trailer’s GPS.</div>';
  h += '<div class="live-actions"><a class="btn small" href="'+mapsUrl(focus.place+" "+focus.pc)+'" target="_blank" rel="noopener">Directions</a><button class="btn ghost small" data-act="notify" aria-pressed="'+S.notify+'">'+(S.notify?"✓ Nearby alerts on":"Alert me when it’s nearby")+'</button></div></div>';
  h += '<div class="panel"><div class="eyebrow">This week’s stops</div><ul class="stops">';
  let lastDay = -1;
  TRAILER.forEach((t,i)=>{
    if (t.day!==lastDay){ h += '<li class="day-label">'+dayName(t.day)+'</li>'; lastDay=t.day; }
    const isNow = now===t;
    if (t.private) h += '<li class="stop private"><span class="when">'+t.from+'–'+t.to+'</span><span><strong>Private event</strong><small>Not open to the public</small></span><span></span></li>';
    else h += '<li class="stop'+(isNow?" now":"")+'"><span class="when">'+t.from+'–'+t.to+'</span><span><strong>'+(isNow?"● ":"")+esc(t.place)+'</strong><small>'+esc(t.area)+'</small></span><a href="'+mapsUrl(t.place+" "+t.pc)+'" target="_blank" rel="noopener">Map</a></li>';
  });
  h += '</ul></div><div class="panel empty" style="padding:18px 16px"><strong>Want the trailer at your own event?</strong><p style="margin:4px 0 12px">Weddings, fêtes, festivals and garden parties.</p><button class="btn small" data-act="goto" data-tab="book">Book the trailer</button></div>';
  h += '<p class="note">Example schedule. The operator sets public stops in the Operator tab, and customers can follow Froyo on the go to get an alert when the trailer is serving nearby.</p></section>';
  return h;
}

function renderOps(){
  const seg = '<div class="seg" role="group" aria-label="Operator views"><button data-act="opsview" data-v="events" aria-pressed="'+(S.opsView==="events")+'">Events</button><button data-act="opsview" data-v="till" aria-pressed="'+(S.opsView==="till")+'">Stamp till</button></div>';
  if (S.opsView==="till") return '<section>'+seg+renderTill()+'</section>';
  const list = S.ops.slice().sort((a,b)=>a.date-b.date);
  const f = S.opsFilter;
  const shown = list.filter(b=>f==="all"||b.status===f);
  const pipeline = list.reduce((s,b)=>s+b.total,0);
  const deposits = list.filter(b=>b.status!=="enquiry").reduce((s,b)=>s+Math.round(b.total*DEPOSIT),0);
  let h = '<section>'+seg+'<div class="step-head"><h2>Upcoming events</h2><span class="eyebrow">Operator view</span></div>';
  h += '<div class="stats"><div class="stat"><small>Events</small><b class="mono">'+list.length+'</b></div><div class="stat"><small>Pipeline</small><b class="mono">'+gbp(pipeline)+'</b></div><div class="stat"><small>Deposits in</small><b class="mono">'+gbp(deposits)+'</b></div></div>';
  h += '<div class="panel"><div class="switch"><label for="liveToggle"><strong>Share trailer location</strong><br><small class="muted">'+(S.live?"Customers see where you’re serving now":"Customers see your next stop only")+'</small></label><input type="checkbox" id="liveToggle" '+(S.live?"checked":"")+'></div>'
    + '<div class="eyebrow" style="margin:12px 0 6px">Serving today at</div><div class="chips">'+TRAILER.map((t,i)=>t.day===0?'<button class="chip" data-act="stop" data-i="'+i+'" aria-pressed="'+(S.live&&S.liveStop===i)+'">'+t.from+' '+esc(t.place)+'</button>':'').join("")+'</div>'
    + '<p class="hint" style="margin:10px 0 0">In the live app, the trailer’s phone shares GPS while this is on, and switches off automatically at the end of each stop.</p></div>';
  h += '<div class="chips" style="margin-bottom:12px">'+[["all","All"],["enquiry","Enquiries"],["deposit","Deposit paid"],["confirmed","Confirmed"]].map(x=>'<button class="chip" data-act="filter" data-f="'+x[0]+'" aria-pressed="'+(f===x[0])+'">'+x[1]+'</button>').join("")+'</div>';
  h += shown.length ? shown.map(b=>bkCard(b,true)).join("") : '<div class="panel empty">Nothing with this status.</div>';
  h += '<p class="note">Cards marked Example are sample data. Bookings you make in the Book tab appear here too.</p></section>';
  return h;
}

function renderBar(){
  const bar = $("#bar"), inn = $("#barIn");
  if (S.tab!=="book"){ bar.hidden = true; return; }
  bar.hidden = false;
  if (S.step===5){ inn.innerHTML = '<button class="btn ghost" data-act="goto" data-tab="mine" style="flex:1">View my bookings</button><button class="btn" data-act="restart" style="flex:1">Book another</button>'; return; }
  const q = quote();
  const est = S.step>=2 ? '<b class="mono">'+gbp(q.total)+'</b><small>Deposit '+gbp(q.deposit)+' today</small>'
            : S.date ? '<b style="font-size:16px">'+fmtDate(S.date)+(S.time?' · '+S.time:'')+'</b><small>'+evName(S.event)+'</small>'
            : '<b style="font-size:16px">'+(S.event?evName(S.event):"From £395")+'</b><small>'+(S.event?"Next, pick a date":"25% deposit secures your date")+'</small>';
  const label = S.step===4 ? "Pay "+gbp(q.deposit)+" deposit" : "Continue";
  inn.innerHTML = (S.step>0?'<button class="btn ghost" data-act="back" aria-label="Back">‹</button>':'')+'<div class="est">'+est+'</div><button class="btn" data-act="next" '+(S.step===3||canNext()?"":"disabled")+'>'+label+'</button>';
}

// ---------- events ----------
document.addEventListener("click", e=>{
  const t = e.target.closest("[data-act],[data-tab]"); if(!t) return;
  const a = t.dataset.act;
  if (a==="acct"){ if(!S.user){ openSignin(); } else { S.acctOpen=!S.acctOpen; renderAcct(); } return; }
  if (S.acctOpen){ S.acctOpen=false; renderAcct(); }
  if (a==="signin"){ openSignin(); return; }
  if (a==="signin-staff"){ openSignin("staff"); return; }
  if (a==="sso"){ signInCustomer("Alex","alex@example.com"); toast("Signed in with "+t.dataset.p); return; }
  if (a==="guest"){ S.view="app"; S.auth.err=""; render(); window.scrollTo(0,0); return; }
  if (a==="staff-screen"){ S.auth.screen="staff"; S.auth.err=""; render(); return; }
  if (a==="change-email"){ S.auth.screen="welcome"; S.auth.err=""; render(); return; }
  if (a==="resend"){ toast("New code sent to "+S.auth.email); return; }
  if (a==="signout"){ S.user=null; S.acctOpen=false; toast("Signed out"); render(); return; }
  if (!a && t.dataset.tab){ S.tab = t.dataset.tab; render(); return; }
  if (a==="goto"){ S.tab=t.dataset.tab; render(); window.scrollTo(0,0); return; }
  if (a==="event"){ S.event=t.dataset.id; if(!S.unit && (S.event==="festival"||S.event==="school")) S.unit="trailer"; }
  if (a==="unit"){ if(S.unit!==t.dataset.id){ S.unit=t.dataset.id; S.date=null; S.time=null; } }
  if (a==="stop"){ S.liveStop=+t.dataset.i; S.live=true; toast("Customers now see: "+TRAILER[S.liveStop].place); }
  if (a==="notify"){ S.notify=!S.notify; toast(S.notify?"We’ll let you know when the trailer is nearby":"Nearby alerts off"); }
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
  if (a==="restart"){ Object.assign(S,{step:0,event:null,unit:null,date:null,time:null,pkg:null,pkgTouched:false,extraHours:0,addons:new Set(),venue:"",notes:""}); }
  if (a==="filter"){ S.opsFilter=t.dataset.f; }
  if (a==="opsview"){ S.opsView=t.dataset.v; }
  if (a==="rw-wallet"){ toast("In the live app this adds your card to "+t.dataset.w); return; }
  if (a==="rw-copy"){ const txt=$("#refcode").textContent; try{ navigator.clipboard.writeText(txt).then(()=>toast("Code copied"),selectCode); }catch(err){ selectCode(); } return; }
  if (a==="rw-bday"){ const v=$("#bday").value.trim(); if(!v){ toast("Add a date, like 14 March"); $("#bday").focus(); return; } MEMBERS[ME].birthday=v; toast("Birthday saved"); }
  if (a==="rw-pick"){ R.lookup=t.dataset.k; R.found=t.dataset.k; R.err=""; R.qty=1; }
  if (a==="rw-find"){ const v=$("#lookup").value.trim().toUpperCase().replace(/^FR-?/,"FR-"); R.lookup=v; if(MEMBERS[v]){R.found=v;R.err="";R.qty=1;} else {R.found=null; R.err="No member with number "+esc(v)+". Check the number on their card, or pick one below.";} }
  if (a==="rw-qty"){ R.qty=Math.max(1,Math.min(MAX_PER_VISIT,R.qty+(+t.dataset.d))); }
  if (a==="rw-stamp"){ const m=MEMBERS[R.found], n=R.qty, un=addStamps(R.found, n, "stamp", "Trailer · Market Square"); R.today.stamps+=n; R.qty=1; toast(un ? m.name+" unlocked a free cup!" : "Added "+n+" stamp"+(n>1?"s":"")+" for "+m.name); }
  if (a==="rw-redeem"){ const m=MEMBERS[R.found]; m.rewards--; R.today.redeemed++; m.history.unshift({d:new Date(), t:"redeem", n:0, where:"Trailer · Market Square"}); if(R.found===ME) R.flash=true; toast("Free cup redeemed for "+m.name); }
  if (a==="adv"){ const b=S.ops.find(x=>x.ref===t.dataset.ref); if(b){ if(b.status==="enquiry"){b.status="deposit";toast("Deposit marked as paid for "+b.ref);} else {b.status="confirmed"; toast(b.ref+" confirmed");} } }
  render();
});
document.addEventListener("keydown", e=>{ if(e.key==="Enter" && e.target.id==="lookup"){ e.preventDefault(); $('[data-act="rw-find"]').click(); } });
document.addEventListener("change", e=>{
  const t=e.target;
  if (t.id==="liveToggle"){ S.live=t.checked; toast(S.live?"Location is live for customers":"Location hidden. Customers see the next stop"); render(); return; }
  if (t.dataset.act==="addon"){ t.checked?S.addons.add(t.dataset.id):S.addons.delete(t.dataset.id); renderBar(); }
  if (t.id==="guests"){ const y=window.scrollY; render(); window.scrollTo(0,y); }
});
document.addEventListener("input", e=>{
  const t=e.target;
  if (t.id==="guests"){ S.guests=+t.value; S.pkg=null; S.pkgTouched=false; $("#gval").textContent=S.guests; $("#pkgs").innerHTML=pkgList(); renderBar(); return; }
  if (t.dataset.f){ S[t.dataset.f]=t.value; if (S.step===3) renderBar(); }
});

function book(){
  const q = quote(), chars="ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let ref="FR-"; for(let i=0;i<4;i++) ref+=chars[Math.floor(Math.random()*chars.length)];
  const b = {ref, name:S.name.trim(), email:S.email.trim(), event:S.event, date:S.date, time:S.time, guests:S.guests, pkg:pkgObj().id, total:q.total, deposit:q.deposit, status:"deposit", postcode:S.postcode.trim(), unit:S.unit};
  S.mine.unshift(b); S.ops.push(b); S.step=5;
  if (S.user && !S.user.staff) addStamps(ME, BOOKING_BONUS, "bonus", "Booking bonus · "+b.ref); else S.pendingBonus = b.ref;
}

// ================= Rewards (loyalty card) =================
const GOAL = 10, MAX_PER_VISIT = 6, BOOKING_BONUS = 2;
const agoD = n => { const d=new Date(); d.setDate(d.getDate()-n); return d; };
const MEMBERS = {
  "FR-48213": {name:"Alex", since:"Jun 2026", stamps:5, rewards:0, birthday:"", referrals:1, history:[
    {d:agoD(3), t:"stamp", n:2, where:"Trailer · Market Square"},
    {d:agoD(11), t:"stamp", n:1, where:"Trailer · Riverside Park"},
    {d:agoD(19), t:"bonus", n:1, where:"Friend joined with your code"},
    {d:agoD(26), t:"stamp", n:1, where:"Indoor cart · Lumen Studios summer social"}
  ]},
  "FR-10577": {name:"Jordan", since:"Apr 2026", stamps:8, rewards:1, birthday:"", referrals:0, history:[]},
  "FR-33902": {name:"Sam", since:"Aug 2026", stamps:2, rewards:0, birthday:"", referrals:0, history:[]}
};
const ME = "FR-48213";
const R = {lookup:ME, found:ME, qty:1, err:"", today:{stamps:14, redeemed:3, members:212}, newStamps:[], flash:false};

function addStamps(id, n, type, where){
  const m = MEMBERS[id], newOnes=[]; let unlocked=0;
  for (let i=0;i<n;i++){ m.stamps++; newOnes.push(m.stamps); }
  while (m.stamps >= GOAL-1){ m.stamps -= GOAL-1; m.rewards++; unlocked++; }
  m.history.unshift({d:new Date(), t:type, n, where});
  if (id===ME){ R.newStamps = unlocked ? [GOAL].concat(Array.from({length:m.stamps},(_,i)=>i+1)) : newOnes; R.flash=true; if(unlocked) setTimeout(confetti,80); }
  return unlocked;
}
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
    + '<div class="lfoot"><span>Member since '+m.since+'</span><span class="mono" style="letter-spacing:.06em">'+ME+'</span></div></div>';
}

function renderRewards(){
  const m = MEMBERS[ME], pct = Math.min(100, m.stamps/9*100);
  const now = S.live ? TRAILER[S.liveStop] : null;
  let h = '<section><div class="step-head"><h2>Rewards</h2><span class="eyebrow">Buy 9, the 10th is free</span></div>' + loyaltyCard(m);
  h += '<div class="scan"><div class="qr" id="qr" aria-label="Your member QR code"></div><div><h3>Scan to collect</h3><p>Show this when you order at the cart or trailer. One stamp per cup.</p><div class="memno">'+ME+'</div></div></div>';
  h += '<button class="nextstop'+(now?"":" off")+'" data-act="goto" data-tab="find"><span class="ldot"></span><span style="flex:1"><strong>'+(now?"Trailer serving now":"Trailer not serving right now")+'</strong><span class="muted" style="display:block;font-size:13px">'+(now?esc(now.place)+" · until "+now.to:"See this week’s stops")+'</span></span><span aria-hidden="true" style="font-weight:800">›</span></button>';
  h += '<div class="panel"><div class="panel-head"><h3 style="font-size:16px">Keep it on your lock screen</h3></div><p class="muted" style="margin:0 0 10px;font-size:13px">Your card updates on its own after every visit.</p><div class="wallet"><button class="btn dark small" data-act="rw-wallet" data-w="Apple Wallet">Add to Apple Wallet</button><button class="btn ghost small" data-act="rw-wallet" data-w="Google Wallet">Add to Google Wallet</button></div></div>';
  h += '<div class="panel"><div class="eyebrow">Perks</div>';
  h += '<div class="perk"><span class="pico">'+stampCup().replace(/60%/g,'30')+'</span><div><h3>Free cup every 10th visit</h3><p>Buy 9 cups, the 10th is on us. Any size, any toppings.</p><div class="prog"><i style="width:'+pct+'%"></i></div><div class="muted mono" style="font-size:12.5px;margin-top:4px">'+m.stamps+' of 9 stamps'+(m.rewards?' · '+m.rewards+' ready to use':'')+'</div></div></div>';
  h += '<div class="perk"><span class="pico"><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="12" rx="2" fill="var(--berry)"/><path d="M7 7V5h10v2" fill="none" stroke="var(--ink)" stroke-width="2"/><path d="M3 12h18" stroke="#fff" stroke-width="1.5"/></svg></span><div><h3>Book an event, get '+BOOKING_BONUS+' stamps</h3><p>Every paid booking for the cart or trailer adds '+BOOKING_BONUS+' bonus stamps to your card.</p><button class="btn ghost small" data-act="goto" data-tab="book">Book Froyo</button></div></div>';
  h += '<div class="perk"><span class="pico"><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="11" width="16" height="9" rx="2" fill="var(--berry)"/><path d="M12 11V7" stroke="var(--ink)" stroke-width="2"/><circle cx="12" cy="5" r="2" fill="var(--yolk)"/></svg></span><div><h3>Birthday treat</h3><p>A free cup any day in your birthday week.</p>'
    + (m.birthday ? '<div class="muted" style="font-size:13px"><strong style="color:var(--ink)">Saved: '+esc(m.birthday)+'</strong> · We’ll add your treat that week.</div>'
      : '<div class="inline"><div class="field"><label for="bday">Your birthday</label><input id="bday" type="text" placeholder="e.g. 14 March"></div><button class="btn small" data-act="rw-bday">Save</button></div>') + '</div></div>';
  h += '<div class="perk"><span class="pico"><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="9" r="3.5" fill="var(--berry)"/><circle cx="16.5" cy="9" r="3.5" fill="var(--mint)"/><path d="M2 20c0-4 3-6 6-6s6 2 6 6zM11 20c0-4 3-6 5.5-6S22 16 22 20z" fill="var(--ink)" opacity=".8"/></svg></span><div><h3>Bring a friend</h3><p>When a friend joins with your code and buys their first cup, you both get a bonus stamp.</p><div class="code"><span class="mono" id="refcode">ALEX-FROYO</span><button class="btn ghost small" data-act="rw-copy">Copy code</button></div></div></div>';
  h += '<div class="perk"><span class="pico"><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="var(--yolk)" stroke="var(--ink)" stroke-width="1.2" stroke-linejoin="round"/></svg></span><div><h3>Double stamp Tuesdays</h3><p>Every cup bought from the trailer on a Tuesday counts twice.</p></div></div></div>';
  h += '<div class="panel"><div class="panel-head"><h3 style="font-size:16px">Activity</h3><span class="sample-tag">Includes examples</span></div><ul class="hist">';
  m.history.slice(0,6).forEach((x,i)=>{
    const red = x.t==="redeem";
    const title = red ? "Free cup redeemed" : x.t==="bonus" ? "+"+x.n+" bonus stamp"+(x.n>1?"s":"") : x.n+" stamp"+(x.n>1?"s":"")+" collected";
    h += '<li class="'+(i===0&&R.flash?"new":"")+'"><span class="ic'+(red?" red":"")+'">'+(red?"★":"+"+x.n)+'</span><span><strong>'+title+'</strong><small>'+esc(x.where)+'</small></span><span class="amt muted">'+x.d.getDate()+" "+MON3[x.d.getMonth()]+'</span></li>';
  });
  h += '</ul></div><p class="note">Example member and activity. Stamps are added by the team when you pay, so they can’t be collected online. Free cups don’t expire while you visit at least once every 12 months.</p></section>';
  return h;
}

function renderTill(){
  const m = R.found ? MEMBERS[R.found] : null;
  let h = '<div class="till"><div class="eyebrow">Stamp a card · cart or trailer tablet</div><h2>Scan or type a member number</h2>';
  h += '<div class="inline" style="margin-top:12px"><div class="field"><label for="lookup">Member number</label><input id="lookup" value="'+esc(R.lookup)+'" autocomplete="off" spellcheck="false"></div><button class="btn small" data-act="rw-find">Find</button></div>';
  h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">'+Object.keys(MEMBERS).map(k=>'<button class="btn ghost small" data-act="rw-pick" data-k="'+k+'">'+k+'</button>').join("")+'</div>';
  if (R.err) h += '<div class="terr">'+R.err+'</div>';
  if (m){
    let mini=""; for(let i=1;i<=GOAL;i++) mini += '<i class="'+((i===GOAL?m.rewards>0:i<=m.stamps)?"on":"")+(i===GOAL?" free":"")+'"></i>';
    h += '<div class="member"><div class="member-top"><div><b>'+esc(m.name)+'</b> <span class="mono" style="opacity:.7;font-size:13px">'+R.found+'</span>'+(R.found===ME?' <span style="font-size:11px;font-weight:800;color:var(--mint)">Rewards tab card</span>':'')+'</div><span class="mono">'+m.stamps+'/9</span></div><div class="mini">'+mini+'</div>'
      + (m.rewards ? '<div style="margin-top:10px;font-weight:800;color:var(--yolk)">★ '+m.rewards+' free cup'+(m.rewards>1?"s":"")+' ready</div>' : '')
      + '<div class="qty"><span style="font-weight:800">Cups in this order</span><div style="display:flex;align-items:center;gap:8px"><button class="round" data-act="rw-qty" data-d="-1" aria-label="One fewer cup">−</button><span class="n mono" aria-live="polite">'+R.qty+'</span><button class="round" data-act="rw-qty" data-d="1" aria-label="One more cup">+</button></div></div>'
      + '<div class="tactions"><button class="btn big" data-act="rw-stamp">Add '+R.qty+' stamp'+(R.qty>1?"s":"")+'</button>'
      + (m.rewards ? '<button class="btn big redeem" data-act="rw-redeem">Redeem free cup</button>' : '')
      + '</div><div class="thint">Max '+MAX_PER_VISIT+' stamps per order. A free cup doesn’t earn a stamp.</div></div>';
  }
  h += '</div><div class="stats" style="margin-top:14px"><div class="stat"><small>Stamps today</small><b class="mono">'+R.today.stamps+'</b></div><div class="stat"><small>Free cups today</small><b class="mono">'+R.today.redeemed+'</b></div><div class="stat"><small>Members</small><b class="mono">'+R.today.members+'</b></div></div>';
  h += '<p class="note">Example numbers. In the live app, staff scan the customer’s QR code with the tablet camera, and every stamp is logged against the staff member and location. Stamp Alex’s card here, then open the Rewards tab to see it.</p>';
  return h;
}
const QR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 33 33" width="106" height="106" shape-rendering="crispEdges" role="img" aria-label="QR code for member FR-48213"><rect width="100%" height="100%" fill="#fff"/><path fill="#121212" d="M2 2h1v1h-1zM3 2h1v1h-1zM4 2h1v1h-1zM5 2h1v1h-1zM6 2h1v1h-1zM7 2h1v1h-1zM8 2h1v1h-1zM10 2h1v1h-1zM11 2h1v1h-1zM12 2h1v1h-1zM13 2h1v1h-1zM15 2h1v1h-1zM16 2h1v1h-1zM18 2h1v1h-1zM20 2h1v1h-1zM21 2h1v1h-1zM24 2h1v1h-1zM25 2h1v1h-1zM26 2h1v1h-1zM27 2h1v1h-1zM28 2h1v1h-1zM29 2h1v1h-1zM30 2h1v1h-1zM2 3h1v1h-1zM8 3h1v1h-1zM11 3h1v1h-1zM14 3h1v1h-1zM15 3h1v1h-1zM16 3h1v1h-1zM17 3h1v1h-1zM20 3h1v1h-1zM22 3h1v1h-1zM24 3h1v1h-1zM30 3h1v1h-1zM2 4h1v1h-1zM4 4h1v1h-1zM5 4h1v1h-1zM6 4h1v1h-1zM8 4h1v1h-1zM14 4h1v1h-1zM16 4h1v1h-1zM19 4h1v1h-1zM20 4h1v1h-1zM21 4h1v1h-1zM22 4h1v1h-1zM24 4h1v1h-1zM26 4h1v1h-1zM27 4h1v1h-1zM28 4h1v1h-1zM30 4h1v1h-1zM2 5h1v1h-1zM4 5h1v1h-1zM5 5h1v1h-1zM6 5h1v1h-1zM8 5h1v1h-1zM10 5h1v1h-1zM12 5h1v1h-1zM19 5h1v1h-1zM21 5h1v1h-1zM24 5h1v1h-1zM26 5h1v1h-1zM27 5h1v1h-1zM28 5h1v1h-1zM30 5h1v1h-1zM2 6h1v1h-1zM4 6h1v1h-1zM5 6h1v1h-1zM6 6h1v1h-1zM8 6h1v1h-1zM10 6h1v1h-1zM12 6h1v1h-1zM14 6h1v1h-1zM19 6h1v1h-1zM21 6h1v1h-1zM22 6h1v1h-1zM24 6h1v1h-1zM26 6h1v1h-1zM27 6h1v1h-1zM28 6h1v1h-1zM30 6h1v1h-1zM2 7h1v1h-1zM8 7h1v1h-1zM10 7h1v1h-1zM11 7h1v1h-1zM13 7h1v1h-1zM18 7h1v1h-1zM19 7h1v1h-1zM21 7h1v1h-1zM24 7h1v1h-1zM30 7h1v1h-1zM2 8h1v1h-1zM3 8h1v1h-1zM4 8h1v1h-1zM5 8h1v1h-1zM6 8h1v1h-1zM7 8h1v1h-1zM8 8h1v1h-1zM10 8h1v1h-1zM12 8h1v1h-1zM14 8h1v1h-1zM16 8h1v1h-1zM18 8h1v1h-1zM20 8h1v1h-1zM22 8h1v1h-1zM24 8h1v1h-1zM25 8h1v1h-1zM26 8h1v1h-1zM27 8h1v1h-1zM28 8h1v1h-1zM29 8h1v1h-1zM30 8h1v1h-1zM10 9h1v1h-1zM12 9h1v1h-1zM15 9h1v1h-1zM17 9h1v1h-1zM18 9h1v1h-1zM21 9h1v1h-1zM2 10h1v1h-1zM6 10h1v1h-1zM8 10h1v1h-1zM9 10h1v1h-1zM10 10h1v1h-1zM11 10h1v1h-1zM13 10h1v1h-1zM14 10h1v1h-1zM15 10h1v1h-1zM21 10h1v1h-1zM23 10h1v1h-1zM24 10h1v1h-1zM25 10h1v1h-1zM26 10h1v1h-1zM27 10h1v1h-1zM30 10h1v1h-1zM2 11h1v1h-1zM7 11h1v1h-1zM9 11h1v1h-1zM10 11h1v1h-1zM13 11h1v1h-1zM15 11h1v1h-1zM16 11h1v1h-1zM18 11h1v1h-1zM20 11h1v1h-1zM22 11h1v1h-1zM23 11h1v1h-1zM24 11h1v1h-1zM26 11h1v1h-1zM27 11h1v1h-1zM29 11h1v1h-1zM30 11h1v1h-1zM3 12h1v1h-1zM6 12h1v1h-1zM7 12h1v1h-1zM8 12h1v1h-1zM10 12h1v1h-1zM12 12h1v1h-1zM18 12h1v1h-1zM19 12h1v1h-1zM22 12h1v1h-1zM23 12h1v1h-1zM25 12h1v1h-1zM26 12h1v1h-1zM27 12h1v1h-1zM30 12h1v1h-1zM2 13h1v1h-1zM3 13h1v1h-1zM5 13h1v1h-1zM6 13h1v1h-1zM10 13h1v1h-1zM11 13h1v1h-1zM14 13h1v1h-1zM16 13h1v1h-1zM19 13h1v1h-1zM20 13h1v1h-1zM23 13h1v1h-1zM25 13h1v1h-1zM27 13h1v1h-1zM2 14h1v1h-1zM4 14h1v1h-1zM6 14h1v1h-1zM8 14h1v1h-1zM9 14h1v1h-1zM13 14h1v1h-1zM14 14h1v1h-1zM15 14h1v1h-1zM16 14h1v1h-1zM17 14h1v1h-1zM18 14h1v1h-1zM20 14h1v1h-1zM21 14h1v1h-1zM23 14h1v1h-1zM25 14h1v1h-1zM27 14h1v1h-1zM29 14h1v1h-1zM30 14h1v1h-1zM4 15h1v1h-1zM5 15h1v1h-1zM7 15h1v1h-1zM9 15h1v1h-1zM10 15h1v1h-1zM11 15h1v1h-1zM12 15h1v1h-1zM14 15h1v1h-1zM19 15h1v1h-1zM22 15h1v1h-1zM25 15h1v1h-1zM26 15h1v1h-1zM30 15h1v1h-1zM3 16h1v1h-1zM8 16h1v1h-1zM9 16h1v1h-1zM10 16h1v1h-1zM13 16h1v1h-1zM14 16h1v1h-1zM15 16h1v1h-1zM16 16h1v1h-1zM17 16h1v1h-1zM20 16h1v1h-1zM24 16h1v1h-1zM27 16h1v1h-1zM28 16h1v1h-1zM30 16h1v1h-1zM3 17h1v1h-1zM4 17h1v1h-1zM5 17h1v1h-1zM6 17h1v1h-1zM14 17h1v1h-1zM15 17h1v1h-1zM17 17h1v1h-1zM18 17h1v1h-1zM21 17h1v1h-1zM23 17h1v1h-1zM29 17h1v1h-1zM2 18h1v1h-1zM3 18h1v1h-1zM5 18h1v1h-1zM7 18h1v1h-1zM8 18h1v1h-1zM9 18h1v1h-1zM10 18h1v1h-1zM12 18h1v1h-1zM13 18h1v1h-1zM14 18h1v1h-1zM15 18h1v1h-1zM21 18h1v1h-1zM23 18h1v1h-1zM2 19h1v1h-1zM3 19h1v1h-1zM4 19h1v1h-1zM5 19h1v1h-1zM7 19h1v1h-1zM9 19h1v1h-1zM13 19h1v1h-1zM14 19h1v1h-1zM15 19h1v1h-1zM16 19h1v1h-1zM18 19h1v1h-1zM20 19h1v1h-1zM22 19h1v1h-1zM23 19h1v1h-1zM25 19h1v1h-1zM26 19h1v1h-1zM27 19h1v1h-1zM29 19h1v1h-1zM30 19h1v1h-1zM4 20h1v1h-1zM5 20h1v1h-1zM8 20h1v1h-1zM10 20h1v1h-1zM11 20h1v1h-1zM12 20h1v1h-1zM18 20h1v1h-1zM19 20h1v1h-1zM23 20h1v1h-1zM24 20h1v1h-1zM25 20h1v1h-1zM26 20h1v1h-1zM28 20h1v1h-1zM30 20h1v1h-1zM10 21h1v1h-1zM11 21h1v1h-1zM12 21h1v1h-1zM13 21h1v1h-1zM14 21h1v1h-1zM16 21h1v1h-1zM19 21h1v1h-1zM20 21h1v1h-1zM23 21h1v1h-1zM25 21h1v1h-1zM27 21h1v1h-1zM29 21h1v1h-1zM2 22h1v1h-1zM3 22h1v1h-1zM7 22h1v1h-1zM8 22h1v1h-1zM9 22h1v1h-1zM11 22h1v1h-1zM15 22h1v1h-1zM16 22h1v1h-1zM17 22h1v1h-1zM18 22h1v1h-1zM20 22h1v1h-1zM22 22h1v1h-1zM23 22h1v1h-1zM24 22h1v1h-1zM25 22h1v1h-1zM26 22h1v1h-1zM27 22h1v1h-1zM29 22h1v1h-1zM10 23h1v1h-1zM12 23h1v1h-1zM13 23h1v1h-1zM14 23h1v1h-1zM19 23h1v1h-1zM22 23h1v1h-1zM26 23h1v1h-1zM30 23h1v1h-1zM2 24h1v1h-1zM3 24h1v1h-1zM4 24h1v1h-1zM5 24h1v1h-1zM6 24h1v1h-1zM7 24h1v1h-1zM8 24h1v1h-1zM10 24h1v1h-1zM11 24h1v1h-1zM13 24h1v1h-1zM15 24h1v1h-1zM16 24h1v1h-1zM17 24h1v1h-1zM20 24h1v1h-1zM21 24h1v1h-1zM22 24h1v1h-1zM24 24h1v1h-1zM26 24h1v1h-1zM27 24h1v1h-1zM30 24h1v1h-1zM2 25h1v1h-1zM8 25h1v1h-1zM11 25h1v1h-1zM13 25h1v1h-1zM15 25h1v1h-1zM17 25h1v1h-1zM18 25h1v1h-1zM22 25h1v1h-1zM26 25h1v1h-1zM27 25h1v1h-1zM30 25h1v1h-1zM2 26h1v1h-1zM4 26h1v1h-1zM5 26h1v1h-1zM6 26h1v1h-1zM8 26h1v1h-1zM10 26h1v1h-1zM11 26h1v1h-1zM12 26h1v1h-1zM13 26h1v1h-1zM15 26h1v1h-1zM21 26h1v1h-1zM22 26h1v1h-1zM23 26h1v1h-1zM24 26h1v1h-1zM25 26h1v1h-1zM26 26h1v1h-1zM27 26h1v1h-1zM29 26h1v1h-1zM2 27h1v1h-1zM4 27h1v1h-1zM5 27h1v1h-1zM6 27h1v1h-1zM8 27h1v1h-1zM12 27h1v1h-1zM14 27h1v1h-1zM16 27h1v1h-1zM18 27h1v1h-1zM20 27h1v1h-1zM21 27h1v1h-1zM22 27h1v1h-1zM28 27h1v1h-1zM29 27h1v1h-1zM2 28h1v1h-1zM4 28h1v1h-1zM5 28h1v1h-1zM6 28h1v1h-1zM8 28h1v1h-1zM11 28h1v1h-1zM12 28h1v1h-1zM13 28h1v1h-1zM14 28h1v1h-1zM18 28h1v1h-1zM19 28h1v1h-1zM21 28h1v1h-1zM23 28h1v1h-1zM27 28h1v1h-1zM29 28h1v1h-1zM30 28h1v1h-1zM2 29h1v1h-1zM8 29h1v1h-1zM12 29h1v1h-1zM13 29h1v1h-1zM19 29h1v1h-1zM20 29h1v1h-1zM21 29h1v1h-1zM22 29h1v1h-1zM27 29h1v1h-1zM29 29h1v1h-1zM30 29h1v1h-1zM2 30h1v1h-1zM3 30h1v1h-1zM4 30h1v1h-1zM5 30h1v1h-1zM6 30h1v1h-1zM7 30h1v1h-1zM8 30h1v1h-1zM10 30h1v1h-1zM11 30h1v1h-1zM12 30h1v1h-1zM13 30h1v1h-1zM15 30h1v1h-1zM17 30h1v1h-1zM18 30h1v1h-1zM20 30h1v1h-1zM21 30h1v1h-1zM22 30h1v1h-1zM23 30h1v1h-1zM25 30h1v1h-1zM27 30h1v1h-1zM29 30h1v1h-1z"/></svg>';
function drawQR(){ const el=document.getElementById("qr"); if(el) el.innerHTML = QR_SVG; }
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
function signInCustomer(name, email){
  S.user={name, email, member:ME}; MEMBERS[ME].name=name;
  if(!S.name) S.name=name; if(!S.email) S.email=email;
  S.view="app"; S.tab = (S.returnTab==="ops") ? "book" : S.returnTab;
  if (S.pendingBonus){ addStamps(ME, BOOKING_BONUS, "bonus", "Booking bonus · "+S.pendingBonus); S.pendingBonus=null; setTimeout(()=>toast("+"+BOOKING_BONUS+" bonus stamps added to your card"),50); }
  render(); window.scrollTo(0,0);
}
function renderAcct(){
  const b=$("#acct"), m=$("#acctMenu");
  b.hidden = (S.view==="signin");
  if (!S.user){ b.className="acct"; b.textContent="Sign in"; b.setAttribute("aria-label","Sign in"); m.hidden=true; return; }
  b.className="acct on"; b.textContent=S.user.name.charAt(0).toUpperCase(); b.setAttribute("aria-label","Account: "+S.user.name); b.setAttribute("aria-expanded", S.acctOpen);
  m.hidden=!S.acctOpen;
  if (S.acctOpen) m.innerHTML = '<div class="who"><b>'+esc(S.user.name)+(S.user.staff?' · Staff':'')+'</b><small>'+esc(S.user.email)+'</small>'+(S.user.staff?'':'<small style="display:block" class="mono">Member '+ME+'</small>')+'</div>'
    + (S.user.staff ? '<button class="btn ghost small" data-act="goto" data-tab="ops">Operator</button>' : '<button class="btn ghost small" data-act="goto" data-tab="rewards">My stamp card</button><button class="btn ghost small" data-act="goto" data-tab="mine">My bookings</button>')
    + '<button class="btn small" data-act="signout">Sign out</button>';
}
function renderSignin(){
  const A=S.auth, err = A.err ? '<span class="err">'+A.err+'</span>' : '';
  let h='<section class="signin">';
  if (A.screen==="welcome"){
    h += '<div class="si-hero"><img class="si-logo" src="'+logoSrc()+'" alt=""><h1>Welcome to Froyo on the go</h1><p>Sign in to collect stamps on every cup, keep your bookings in one place and get an alert when the trailer is near you.</p></div>';
    h += '<button class="btn big sso dark" data-act="sso" data-p="Apple">Continue with Apple</button>';
    h += '<button class="btn big sso outline" data-act="sso" data-p="Google">Continue with Google</button>';
    h += '<div class="or">or</div>';
    h += '<form data-form="email" novalidate><div class="field"><label for="si-email">Email</label><input id="si-email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" value="'+esc(A.email)+'"'+(A.err?' aria-invalid="true"':'')+'></div>'+err+'<button class="btn big" type="submit">Email me a sign-in code</button></form>';
    h += '<button class="linkbtn center" data-act="guest">Continue as guest</button>';
    h += '<p class="si-small">No password needed. New here? Signing in creates your account.</p>';
    h += '<p class="note" style="margin:0">This is a prototype. Nothing you type is sent anywhere or saved, and any code or password works. Please don’t use a real password.</p>';
    h += '<div class="si-foot"><button class="linkbtn" data-act="staff-screen">Staff sign in</button><span class="demo-pill">Prototype</span></div>';
  } else if (A.screen==="code"){
    h += '<button class="linkbtn" data-act="change-email" style="align-self:flex-start">‹ Back</button>';
    h += '<div class="si-head"><img class="si-logo sm" src="'+logoSrc()+'" alt=""><h2>Check your email</h2><p>We sent a 6-digit code to <strong>'+esc(A.email)+'</strong>. It expires in 10 minutes.</p></div>';
    h += '<form data-form="code" novalidate><div class="field"><label for="si-code">Sign-in code</label><input id="si-code" class="codein mono" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000"'+(A.err?' aria-invalid="true"':'')+'></div>'+err+'<button class="btn big" type="submit">Sign in</button></form>';
    h += '<div class="row-links"><button class="linkbtn" data-act="resend">Resend code</button><button class="linkbtn" data-act="change-email">Use a different email</button></div>';
    h += '<p class="note">Prototype: any 6 digits will sign you in.</p>';
  } else {
    h += '<button class="linkbtn" data-act="change-email" style="align-self:flex-start">‹ Customer sign in</button>';
    h += '<div class="si-head"><img class="si-logo sm" src="'+logoSrc()+'" alt=""><div class="eyebrow" style="margin-top:10px">Staff only</div><h2>Staff sign in</h2><p>For the team running the cart, the trailer and bookings.</p></div>';
    h += '<form data-form="staff" novalidate><div class="field"><label for="st-email">Work email</label><input id="st-email" type="email" autocomplete="username" value="'+esc(A.staffEmail||"")+'"></div><div class="field"><label for="st-pass">Password</label><input id="st-pass" type="password" autocomplete="current-password"></div>'+err+'<button class="btn big" type="submit">Sign in</button></form>';
    h += '<p class="note">Prototype: any email and password sign you in as staff. In the live app each team member has their own login, so bookings and stamps are logged against them.</p>';
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
document.addEventListener("submit", e=>{
  const f=e.target.dataset.form; if(!f) return; e.preventDefault();
  if (f==="email"){ const v=$("#si-email").value.trim(); S.auth.email=v; if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)){ S.auth.err="Enter an email address like name@example.com."; render(); $("#si-email").focus(); return; } S.auth.err=""; S.auth.screen="code"; render(); $("#si-code").focus(); }
  if (f==="code"){ const v=$("#si-code").value.replace(/\D/g,""); if(v.length!==6){ S.auth.err="Enter the 6-digit code from the email."; render(); $("#si-code").focus(); return; } S.auth.err=""; signInCustomer(nameFromEmail(S.auth.email), S.auth.email); toast("Signed in"); }
  if (f==="staff"){ const em=$("#st-email").value.trim(), pw=$("#st-pass").value; S.auth.staffEmail=em; if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) || !pw){ S.auth.err = !pw && /@/.test(em) ? "Enter your password." : "Enter your work email and password."; render(); return; } S.auth.err=""; S.user={staff:true, name:nameFromEmail(em), email:em}; S.view="app"; S.tab="ops"; S.opsView="events"; render(); window.scrollTo(0,0); toast("Signed in as staff"); }
});

render();
})();
