/* ILS Global Language + Interface Layer
   Additive only: preserves page-specific functionality.
   Languages: English, Hindi, Hinglish, Urdu, Bengali.
*/
(function(){
"use strict";
const LANGS={
 "en-IN":"English","hi-IN":"हिन्दी","hinglish":"Hinglish","ur-IN":"اردو","bn-IN":"বাংলা"
};
const T={
"Home":{hi:"होम",hinglish:"Home",ur:"ہوم",bn:"হোম"},
"Find Advocate":{hi:"वकील खोजें",hinglish:"Advocate dhoondein",ur:"وکیل تلاش کریں",bn:"আইনজীবী খুঁজুন"},
"Judgments":{hi:"निर्णय",hinglish:"Judgments",ur:"فیصلے",bn:"রায়"},
"Law Guide":{hi:"कानून गाइड",hinglish:"Law Guide",ur:"قانون گائیڈ",bn:"আইন গাইড"},
"AI Assistant":{hi:"AI सहायक",hinglish:"AI Assistant",ur:"AI معاون",bn:"AI সহকারী"},
"About":{hi:"हमारे बारे में",hinglish:"About",ur:"ہمارے بارے میں",bn:"আমাদের সম্পর্কে"},
"FAQ":{hi:"सामान्य प्रश्न",hinglish:"FAQ",ur:"سوالات",bn:"প্রশ্নোত্তর"},
"Get Legal Help":{hi:"कानूनी मदद लें",hinglish:"Legal help lein",ur:"قانونی مدد لیں",bn:"আইনি সহায়তা নিন"},
"Legal Search":{hi:"कानूनी खोज",hinglish:"Legal Search",ur:"قانونی تلاش",bn:"আইনি অনুসন্ধান"},
"Free Tools":{hi:"मुफ़्त टूल्स",hinglish:"Free Tools",ur:"مفت ٹولز",bn:"ফ্রি টুলস"},
"Human Help":{hi:"मानवीय मदद",hinglish:"Human Help",ur:"انسانی مدد",bn:"মানব সহায়তা"},
"Advocates":{hi:"अधिवक्ता",hinglish:"Advocates",ur:"وکلاء",bn:"আইনজীবী"},
"Services":{hi:"सेवाएँ",hinglish:"Services",ur:"خدمات",bn:"সেবা"},
"Explore":{hi:"एक्सप्लोर करें",hinglish:"Explore",ur:"دریافت کریں",bn:"অন্বেষণ"},
"Search":{hi:"खोजें",hinglish:"Search",ur:"تلاش",bn:"অনুসন্ধান"},
"View":{hi:"देखें",hinglish:"View",ur:"دیکھیں",bn:"দেখুন"},
"Read more":{hi:"और पढ़ें",hinglish:"Aur padhein",ur:"مزید پڑھیں",bn:"আরও পড়ুন"},
"Open":{hi:"खोलें",hinglish:"Open",ur:"کھولیں",bn:"খুলুন"},
"Submit":{hi:"जमा करें",hinglish:"Submit",ur:"جمع کریں",bn:"জমা দিন"},
"Cancel":{hi:"रद्द करें",hinglish:"Cancel",ur:"منسوخ",bn:"বাতিল"},
"Back":{hi:"वापस",hinglish:"Back",ur:"واپس",bn:"ফিরে যান"},
"Next":{hi:"आगे",hinglish:"Next",ur:"اگلا",bn:"পরবর্তী"},
"Important":{hi:"महत्वपूर्ण",hinglish:"Important",ur:"اہم",bn:"গুরুত্বপূর্ণ"},
"General legal information only.":{hi:"केवल सामान्य कानूनी जानकारी।",hinglish:"Sirf general legal information.",ur:"صرف عمومی قانونی معلومات۔",bn:"শুধুমাত্র সাধারণ আইনি তথ্য।"},
"Legal information, research access and professional network coordination.":{hi:"कानूनी जानकारी, शोध सुविधा और पेशेवर नेटवर्क समन्वय।",hinglish:"Legal information, research access aur professional network coordination.",ur:"قانونی معلومات، تحقیق اور پیشہ ورانہ نیٹ ورک رابطہ۔",bn:"আইনি তথ্য, গবেষণা সুবিধা এবং পেশাদার নেটওয়ার্ক সমন্বয়।"},
"Install App":{hi:"ऐप इंस्टॉल करें",hinglish:"Install App",ur:"ایپ انسٹال کریں",bn:"অ্যাপ ইনস্টল করুন"},
"Client Account":{hi:"क्लाइंट अकाउंट",hinglish:"Client Account",ur:"کلائنٹ اکاؤنٹ",bn:"ক্লায়েন্ট অ্যাকাউন্ট"},
"Legal Assistance":{hi:"कानूनी सहायता",hinglish:"Legal Assistance",ur:"قانونی معاونت",bn:"আইনি সহায়তা"},
"Official portal":{hi:"सरकारी पोर्टल",hinglish:"Official portal",ur:"سرکاری پورٹل",bn:"সরকারি পোর্টাল"},
"View profile":{hi:"प्रोफ़ाइल देखें",hinglish:"Profile dekhein",ur:"پروفائل دیکھیں",bn:"প্রোফাইল দেখুন"},
"Ask ILS AI":{hi:"ILS AI से पूछें",hinglish:"ILS AI se poochhein",ur:"ILS AI سے پوچھیں",bn:"ILS AI-কে জিজ্ঞাসা করুন"},
"Search Verified Judgments":{hi:"सत्यापित निर्णय खोजें",hinglish:"Verified judgments search karein",ur:"مصدقہ فیصلے تلاش کریں",bn:"যাচাইকৃত রায় খুঁজুন"}
};
function get(){return localStorage.getItem("ils-language")||localStorage.getItem("ils-home-lang")||"en-IN"}
function set(v){localStorage.setItem("ils-language",v);localStorage.setItem("ils-home-lang",v);apply(v);location.reload()}
function translateText(v,lang){
 if(lang==="en-IN")return null;
 const row=T[v.trim()]; if(!row)return null;
 return row[lang==="hi-IN"?"hi":lang]||null;
}
function apply(lang){
 document.documentElement.lang=lang==="hinglish"?"en-IN":lang;
 document.documentElement.dir=lang==="ur-IN"?"rtl":"ltr";
 document.querySelectorAll("[data-ils-original]").forEach(el=>{
   const original=el.getAttribute("data-ils-original");
   const translated=translateText(original,lang);
   if(translated) el.textContent=translated; else if(lang==="en-IN") el.textContent=original;
 });
 document.querySelectorAll("[data-ils-lang-select]").forEach(s=>s.value=lang);
}
function mark(){
 document.querySelectorAll("body *:not(script):not(style):not(option):not(input):not(textarea):not(select)").forEach(el=>{
   if(el.children.length===0){
     const text=el.textContent.trim();
     if(text && text.length<120 && T[text] && !el.hasAttribute("data-ils-original")){
       el.setAttribute("data-ils-original",text);
     }
   }
 });
}
function inject(){
 if(document.querySelector("[data-ils-lang-select]"))return;
 const host=document.querySelector(".navbar");
 if(!host)return;
 const s=document.createElement("select");
 s.className="ils-language-switcher";
 s.setAttribute("data-ils-lang-select","");
 s.setAttribute("aria-label","Website language");
 Object.entries(LANGS).forEach(([v,n])=>{const o=document.createElement("option");o.value=v;o.textContent=n;s.appendChild(o)});
 s.value=get();s.addEventListener("change",e=>set(e.target.value));
 const nav=host.querySelector(".navlinks");
 if(nav)nav.appendChild(s);else host.appendChild(s);
}
function boot(){mark();inject();apply(get())}
window.ILSLanguage={get,set,apply,LANGS};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();
