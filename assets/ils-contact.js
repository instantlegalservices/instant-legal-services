(()=>{if(window.__ILS_CONTACT_WIDGET__)return;window.__ILS_CONTACT_WIDGET__=true;
const WA="8445609837",EMAIL="islegalservices5@gmail.com";
const css=`
#ils-contact-fab{position:fixed;right:18px;bottom:18px;z-index:2147483000;display:flex;align-items:center;gap:9px;padding:11px 15px;border:1px solid rgba(242,189,85,.42);border-radius:999px;background:linear-gradient(135deg,rgba(12,31,48,.97),rgba(7,18,31,.97));color:#fff;box-shadow:0 12px 35px rgba(0,0,0,.28),0 0 24px rgba(242,189,85,.08);font:800 12px/1 system-ui,-apple-system,Segoe UI,sans-serif;cursor:pointer;transition:.2s}
#ils-contact-fab:hover{transform:translateY(-3px) scale(1.02);border-color:rgba(242,189,85,.7)}
#ils-contact-fab .ils-ci{width:29px;height:29px;border-radius:50%;display:grid;place-items:center;background:rgba(92,197,255,.13);font-size:16px}
#ils-contact-panel{position:fixed;right:18px;bottom:76px;z-index:2147483001;width:min(350px,calc(100vw - 28px));padding:16px;border:1px solid rgba(242,189,85,.28);border-radius:18px;background:rgba(8,22,36,.98);box-shadow:0 25px 70px rgba(0,0,0,.45);display:none;color:#fff;font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
#ils-contact-panel.open{display:block}
#ils-contact-panel h3{margin:0 32px 4px 0;font-size:16px}
#ils-contact-panel p{margin:0 0 12px;color:#aebdcb;font-size:11px}
#ils-contact-panel .ils-close{position:absolute;right:9px;top:8px;width:30px;height:30px;border:0;border-radius:50%;background:rgba(255,255,255,.07);color:#fff;cursor:pointer;font-size:18px}
#ils-contact-panel .ils-label{display:block;margin:0 0 7px;color:#d9e3ec;font-size:11px;font-weight:800}
#ils-contact-panel .ils-categories{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:11px}
#ils-contact-panel .ils-category{padding:9px 8px;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:rgba(255,255,255,.035);color:#fff;font:700 11px/1.2 system-ui,-apple-system,Segoe UI,sans-serif;cursor:pointer}
#ils-contact-panel .ils-category.selected{border-color:rgba(242,189,85,.75);background:rgba(242,189,85,.12)}
#ils-contact-panel textarea{width:100%;min-height:76px;box-sizing:border-box;resize:vertical;padding:10px;border:1px solid rgba(255,255,255,.12);border-radius:11px;outline:0;background:rgba(255,255,255,.045);color:#fff;font:12px/1.4 system-ui,-apple-system,Segoe UI,sans-serif}
#ils-contact-panel textarea:focus{border-color:rgba(242,189,85,.7)}
#ils-contact-panel .ils-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px}
#ils-contact-panel .ils-send{display:flex;align-items:center;justify-content:center;gap:7px;padding:10px 8px;border:1px solid rgba(255,255,255,.1);border-radius:11px;text-decoration:none;color:#fff;background:rgba(255,255,255,.045);font-weight:800;font-size:11px;cursor:pointer}
#ils-contact-panel .ils-send:disabled{opacity:.45;cursor:not-allowed}
#ils-contact-panel small{display:block;margin-top:10px;color:#71869a;font-size:9px}
@media(max-width:560px){#ils-contact-fab{right:12px;bottom:12px;padding:10px 12px}#ils-contact-panel{right:12px;bottom:66px}}
`;
const s=document.createElement("style");s.id="ils-contact-widget-style";s.textContent=css;document.head.appendChild(s);
const path=location.pathname||"/";
const rawLabel=path.replace(/\/+$/,"").split("/").filter(Boolean).pop()||"";const label=(!rawLabel||rawLabel==="index.html"||rawLabel==="index")?"Homepage":rawLabel.replace(/\.html?$/i,"").replace(/[-_]+/g," ").replace(/\b\w/g,c=>c.toUpperCase());
const title=(document.title||"ILS website").replace(/[<>]/g,"").slice(0,90);
const root=document.createElement("div");
root.innerHTML=`<button id="ils-contact-fab" type="button" aria-expanded="false" aria-controls="ils-contact-panel"><span class="ils-ci">💬</span><span>Contact ILS</span></button>
<div id="ils-contact-panel" role="dialog" aria-label="Contact Instant Legal Services">
<button class="ils-close" type="button" aria-label="Close">×</button>
<h3>How can we help?</h3>
<p>Please select the nature of your enquiry and provide a brief description. We will receive it through WhatsApp or Email.</p>
<span class="ils-label">What do you need?</span>
<div class="ils-categories">
<button class="ils-category" type="button" data-type="Suggestion">💡 Suggestion</button>
<button class="ils-category" type="button" data-type="Complaint">⚠️ Complaint</button>
<button class="ils-category" type="button" data-type="Client Help">🧑‍⚖️ Client Help</button>
<button class="ils-category" type="button" data-type="General Enquiry">ℹ️ General Enquiry</button>
</div>
<label class="ils-label" for="ils-contact-message">Your message</label>
<textarea id="ils-contact-message" maxlength="600" placeholder="Please describe your enquiry or concern in a few words..."></textarea>
<div class="ils-actions">
<button class="ils-send" id="ils-whatsapp" type="button" disabled>💬 WhatsApp</button>
<button class="ils-send" id="ils-email" type="button" disabled>✉️ Email</button>
</div>
<small id="ils-contact-reference"></small>
</div>`;
document.body.appendChild(root);
root.querySelector("#ils-contact-reference").textContent="Reference page: "+title;
const fab=root.querySelector("#ils-contact-fab"),panel=root.querySelector("#ils-contact-panel");
const message=root.querySelector("#ils-contact-message"),wa=root.querySelector("#ils-whatsapp"),email=root.querySelector("#ils-email");
const categories=[...root.querySelectorAll(".ils-category")];let selected="";
const close=()=>{panel.classList.remove("open");fab.setAttribute("aria-expanded","false")};
const update=()=>{const ready=Boolean(selected&&message.value.trim());wa.disabled=!ready;email.disabled=!ready};
categories.forEach(btn=>btn.addEventListener("click",()=>{categories.forEach(x=>x.classList.remove("selected"));btn.classList.add("selected");selected=btn.dataset.type||"";message.focus();update()}));
message.addEventListener("input",update);
const build=()=>{const text=message.value.trim().slice(0,600);return "Hello Instant Legal Services Team,\n\nI would like to contact you regarding a website enquiry.\n\nEnquiry Type: "+selected+"\n\nMessage: "+text+"\n\nPage: "+label+"\n\nKindly review my enquiry and assist me accordingly.\n\nRegards";};
wa.addEventListener("click",()=>{if(wa.disabled)return;window.open("https://wa.me/"+WA+"?text="+encodeURIComponent(build()),"_blank","noopener,noreferrer")});
email.addEventListener("click",()=>{if(email.disabled)return;location.href="mailto:"+EMAIL+"?subject="+encodeURIComponent("ILS Website - "+selected)+"&body="+encodeURIComponent(build())});
fab.addEventListener("click",()=>{const open=panel.classList.toggle("open");fab.setAttribute("aria-expanded",String(open));if(open)message.focus()});
if(location.hash==="#contact-ils"){requestAnimationFrame(()=>{panel.classList.add("open");fab.setAttribute("aria-expanded","true");message.focus()})}
root.querySelector(".ils-close").addEventListener("click",close);
document.addEventListener("keydown",e=>{if(e.key==="Escape")close()});
document.addEventListener("click",e=>{if(panel.classList.contains("open")&&!root.contains(e.target))close()});
})();