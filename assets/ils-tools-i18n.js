/* ILS Tools language layer
   Display-only localization. Canonical tool names/slugs, pricing, data attributes,
   execution handlers, Supabase calls and payment flows remain unchanged.
*/
(function(){
  "use strict";
  const packs={
    "en-IN":{
      nav:{
        "Home":"Home","Legal Search":"Legal Search","Acts":"Acts","Find Advocate":"Find Advocate","Judgments":"Judgments","Law Guide":"Law Guide","AI Assistant":"AI Assistant","Tools":"Tools","About":"About","FAQ":"FAQ","Get Legal Help":"Get Legal Help","Install App":"Install App"
      },
      shell:{
        "ILS Legal Tools":"ILS Legal Tools","Useful legal planning tools.":"Useful legal planning tools.",
        "Free tools to organise dates, calculations and case information. Results are informational and should be verified for the specific law, court and jurisdiction before reliance.":"Free tools to organise dates, calculations and case information. Results are informational and should be verified for the specific law, court and jurisdiction before reliance.",
        "Search legal tools":"Search legal tools","Search calculator, deadline, property, case…":"Search calculator, deadline, property, case…",
        "Smart access:":"Smart access:","Pick a category, use Most Used for high-frequency tasks, or search any of the 208 tools.":"Pick a category, use Most Used for high-frequency tasks, or search any of the 208 tools.",
        "Smart guidance:":"Smart guidance:","Choose your profession/category, search a task, enter the guided inputs, and review the result.":"Choose your profession/category, search a task, enter the guided inputs, and review the result.",
        "Calculation is free.":"Calculation is free.","Pay only when you want a clean professional report / Print / Save as PDF.":"Pay only when you want a clean professional report / Print / Save as PDF.",
        "208-tool professional suite":"208-tool professional suite","Find the exact task":"Find the exact task",
        "Category → Most Used → Search → Open Tool → Result → Optional professional output.":"Category → Most Used → Search → Open Tool → Result → Optional professional output.",
        "All Tools":"All Tools","See all 208 tools":"See all 208 tools","Legal & Court":"Legal & Court","Cases, notices, drafting":"Cases, notices, drafting",
        "Tax & Accounts":"Tax & Accounts","Income tax, TDS, accounts":"Income tax, TDS, accounts","GST":"GST","Returns, ITC, invoices":"Returns, ITC, invoices",
        "Company / MCA":"Company / MCA","ROC, directors, filings":"ROC, directors, filings","Office & Documents":"Office & Documents","Client, PDF, documents":"Client, PDF, documents",
        "AI Legal":"AI Legal","Research, review, drafting":"Research, review, drafting","Compliance":"Compliance","Due dates & reminders":"Due dates & reminders",
        "Finance":"Finance","Loans, payroll, business":"Loans, payroll, business","Most Used":"Most Used","All":"All","Free":"Free","Paid Output":"Paid Output",
        "Select a tool above to begin.":"Select a tool above to begin.","Important:":"Important:",
        "ILS tools are planning and information aids. A calculated date is not a determination of a statutory limitation/deadline, and an estimate does not predict a court order. Always verify the applicable law, procedural rule, jurisdiction and facts, or seek professional advice.":"ILS tools are planning and information aids. A calculated date is not a determination of a statutory limitation/deadline, and an estimate does not predict a court order. Always verify the applicable law, procedural rule, jurisdiction and facts, or seek professional advice.",
        "Legal information, research access and professional network coordination.":"Legal information, research access and professional network coordination.",
        "Explore":"Explore","Acts Library":"Acts Library","Professional Network":"Professional Network","Join ILS Network":"Join ILS Network","Professional Portal":"Professional Portal"
      },
      cats:{advocate:"Advocate",ca:"CA",gst:"GST",cs:"CS / MCA",common:"Common",ai:"AI",compliance:"Compliance",finance:"Finance"},
      modes:{full:"Fully wired",guided:"Guided workflow"},
      desc:{full:"Working ILS tool with guided inputs and result flow.",guided:"Guided starter: organise inputs, free guidance and optional printable output."},
      generic:{
        "Tool":"Tool","Calculator":"Calculator","Checklist":"Checklist","Generator":"Generator","Assistant":"Assistant","Tracker":"Tracker","Planner":"Planner","Finder":"Finder","Comparison":"Comparison","Reconciliation":"Reconciliation","Notice":"Notice","Application":"Application","Agreement":"Agreement","Draft":"Draft","Review":"Review","Risk":"Risk","Scanner":"Scanner","Calendar":"Calendar","Reminder":"Reminder","Report":"Report","Output":"Output","Case":"Case","Date":"Date","Court":"Court","Fee":"Fee","Stamp Duty":"Stamp Duty","Bail":"Bail","Bond":"Bond","Appeal":"Appeal","Revision":"Revision","Execution":"Execution","Period":"Period","Hearing":"Hearing","Status":"Status","Property":"Property","Document":"Document","Documents":"Documents","Tax":"Tax","Income Tax":"Income Tax","Interest":"Interest","Payment":"Payment","Invoice":"Invoice","Company":"Company","Director":"Director","Share":"Share","Capital":"Capital","Compliance":"Compliance","Professional":"Professional","Client":"Client","Loan":"Loan","Salary":"Salary","Payroll":"Payroll","Profit":"Profit","Loss":"Loss","Cash Flow":"Cash Flow","Margin":"Margin","Discount":"Discount","Return":"Return","Due Date":"Due Date","Renewal":"Renewal","Search":"Search","Legal":"Legal","Office":"Office","Accounts":"Accounts","Finance":"Finance"
      }
    },
    "hi-IN":{
      nav:{"Home":"होम","Legal Search":"कानूनी खोज","Acts":"कानून","Find Advocate":"अधिवक्ता खोजें","Judgments":"निर्णय","Law Guide":"कानून गाइड","AI Assistant":"एआई सहायक","Tools":"टूल्स","About":"हमारे बारे में","FAQ":"सामान्य प्रश्न","Get Legal Help":"कानूनी सहायता लें","Install App":"ऐप इंस्टॉल करें"},
      shell:{
        "ILS Legal Tools":"आईएलएस कानूनी टूल्स","Useful legal planning tools.":"उपयोगी कानूनी योजना टूल्स।",
        "Free tools to organise dates, calculations and case information. Results are informational and should be verified for the specific law, court and jurisdiction before reliance.":"तारीखों, गणनाओं और मामले की जानकारी व्यवस्थित करने के लिए निःशुल्क टूल्स। परिणाम केवल सूचनात्मक हैं और भरोसा करने से पहले संबंधित कानून, अदालत और अधिकार-क्षेत्र से सत्यापित किए जाने चाहिए।",
        "Search legal tools":"कानूनी टूल्स खोजें","Search calculator, deadline, property, case…":"कैलकुलेटर, समय-सीमा, संपत्ति, मामला… खोजें",
        "Smart access:":"स्मार्ट उपयोग:","Pick a category, use Most Used for high-frequency tasks, or search any of the 208 tools.":"श्रेणी चुनें, अधिक उपयोग किए जाने वाले टूल्स देखें या 208 टूल्स में खोजें।",
        "Smart guidance:":"स्मार्ट मार्गदर्शन:","Choose your profession/category, search a task, enter the guided inputs, and review the result.":"अपना पेशा/श्रेणी चुनें, कार्य खोजें, निर्देशित जानकारी भरें और परिणाम देखें।",
        "Calculation is free.":"गणना निःशुल्क है।","Pay only when you want a clean professional report / Print / Save as PDF.":"केवल साफ़ पेशेवर रिपोर्ट / प्रिंट / PDF के लिए भुगतान करें।",
        "208-tool professional suite":"208-टूल पेशेवर संग्रह","Find the exact task":"सटीक कार्य खोजें","Category → Most Used → Search → Open Tool → Result → Optional professional output.":"श्रेणी → अधिक उपयोग → खोज → टूल खोलें → परिणाम → वैकल्पिक पेशेवर आउटपुट।",
        "All Tools":"सभी टूल्स","See all 208 tools":"सभी 208 टूल्स देखें","Legal & Court":"कानून और अदालत","Cases, notices, drafting":"मामले, नोटिस, ड्राफ्टिंग",
        "Tax & Accounts":"कर और लेखांकन","Income tax, TDS, accounts":"आयकर, TDS, लेखांकन","GST":"GST","Returns, ITC, invoices":"रिटर्न, ITC, चालान",
        "Company / MCA":"कंपनी / MCA","ROC, directors, filings":"ROC, निदेशक, फाइलिंग","Office & Documents":"कार्यालय और दस्तावेज़","Client, PDF, documents":"क्लाइंट, PDF, दस्तावेज़",
        "AI Legal":"एआई कानून","Research, review, drafting":"शोध, समीक्षा, ड्राफ्टिंग","Compliance":"अनुपालन","Due dates & reminders":"नियत तिथियाँ और रिमाइंडर",
        "Finance":"वित्त","Loans, payroll, business":"ऋण, वेतन-प्रबंधन, व्यवसाय","Most Used":"अधिक उपयोग","All":"सभी","Free":"निःशुल्क","Paid Output":"भुगतान योग्य आउटपुट",
        "Select a tool above to begin.":"शुरू करने के लिए ऊपर कोई टूल चुनें।","Important:":"महत्वपूर्ण:",
        "ILS tools are planning and information aids. A calculated date is not a determination of a statutory limitation/deadline, and an estimate does not predict a court order. Always verify the applicable law, procedural rule, jurisdiction and facts, or seek professional advice.":"ILS टूल्स योजना और सूचना सहायता हैं। गणना की गई तारीख वैधानिक परिसीमा/समय-सीमा का निर्धारण नहीं है और अनुमान अदालत के आदेश की भविष्यवाणी नहीं करता। संबंधित कानून, प्रक्रिया, अधिकार-क्षेत्र और तथ्यों का सत्यापन करें या पेशेवर सलाह लें।",
        "Legal information, research access and professional network coordination.":"कानूनी जानकारी, शोध सुविधा और पेशेवर नेटवर्क समन्वय।","Explore":"अन्वेषण","Acts Library":"कानून संग्रह","Professional Network":"पेशेवर नेटवर्क","Join ILS Network":"ILS नेटवर्क से जुड़ें","Professional Portal":"पेशेवर पोर्टल"
      },
      cats:{advocate:"अधिवक्ता",ca:"CA",gst:"GST",cs:"CS / MCA",common:"सामान्य",ai:"एआई",compliance:"अनुपालन",finance:"वित्त"},
      modes:{full:"पूरी तरह सक्रिय",guided:"निर्देशित कार्यप्रवाह"},
      desc:{full:"निर्देशित जानकारी और परिणाम प्रवाह वाला सक्रिय ILS टूल।",guided:"निर्देशित प्रारंभिक टूल: जानकारी व्यवस्थित करें, निःशुल्क मार्गदर्शन लें और वैकल्पिक प्रिंट योग्य आउटपुट तैयार करें।"},
      generic:{"Tool":"टूल","Calculator":"कैलकुलेटर","Checklist":"चेकलिस्ट","Generator":"जनरेटर","Assistant":"सहायक","Tracker":"ट्रैकर","Planner":"प्लानर","Finder":"खोजक","Comparison":"तुलना","Reconciliation":"मिलान","Notice":"नोटिस","Application":"आवेदन","Agreement":"समझौता","Draft":"ड्राफ्ट","Review":"समीक्षा","Risk":"जोखिम","Scanner":"स्कैनर","Calendar":"कैलेंडर","Reminder":"रिमाइंडर","Report":"रिपोर्ट","Output":"आउटपुट","Case":"मामला","Date":"तारीख","Court":"अदालत","Fee":"शुल्क","Stamp Duty":"स्टाम्प शुल्क","Bail":"जमानत","Bond":"बंधपत्र","Appeal":"अपील","Revision":"पुनरीक्षण","Execution":"निष्पादन","Period":"अवधि","Hearing":"सुनवाई","Status":"स्थिति","Property":"संपत्ति","Document":"दस्तावेज़","Documents":"दस्तावेज़","Tax":"कर","Income Tax":"आयकर","Interest":"ब्याज","Payment":"भुगतान","Invoice":"चालान","Company":"कंपनी","Director":"निदेशक","Share":"हिस्सा","Capital":"पूंजी","Compliance":"अनुपालन","Professional":"पेशेवर","Client":"क्लाइंट","Loan":"ऋण","Salary":"वेतन","Payroll":"वेतन-प्रबंधन","Profit":"लाभ","Loss":"हानि","Cash Flow":"नकदी प्रवाह","Margin":"मार्जिन","Discount":"छूट","Return":"रिटर्न","Due Date":"नियत तिथि","Renewal":"नवीनीकरण","Search":"खोज","Legal":"कानूनी","Office":"कार्यालय","Accounts":"लेखांकन","Finance":"वित्त"}
    },
    "hinglish":{
      nav:{"Home":"Home","Legal Search":"Legal Search","Acts":"Acts","Find Advocate":"Advocate dhoondein","Judgments":"Judgments","Law Guide":"Law Guide","AI Assistant":"AI Assistant","Tools":"Tools","About":"About","FAQ":"FAQ","Get Legal Help":"Legal help lein","Install App":"App install karein"},
      shell:{
        "ILS Legal Tools":"ILS Legal Tools","Useful legal planning tools.":"Useful legal planning tools.",
        "Free tools to organise dates, calculations and case information. Results are informational and should be verified for the specific law, court and jurisdiction before reliance.":"Dates, calculations aur case information ko organise karne ke liye free tools. Results sirf information ke liye hain; use karne se pehle applicable law, court aur jurisdiction verify karein.",
        "Search legal tools":"Legal tools search karein","Search calculator, deadline, property, case…":"Calculator, deadline, property ya case search karein…",
        "Smart access:":"Smart access:","Pick a category, use Most Used for high-frequency tasks, or search any of the 208 tools.":"Category choose karein, Most Used dekhein ya 208 tools me se koi bhi task search karein.",
        "Smart guidance:":"Smart guidance:","Choose your profession/category, search a task, enter the guided inputs, and review the result.":"Profession/category choose karein, task search karein, guided inputs bharein aur result review karein.",
        "Calculation is free.":"Calculation free hai.","Pay only when you want a clean professional report / Print / Save as PDF.":"Sirf clean professional report / Print / Save as PDF chahiye to payment karein.",
        "208-tool professional suite":"208-tool professional suite","Find the exact task":"Exact task dhoondein","Category → Most Used → Search → Open Tool → Result → Optional professional output.":"Category → Most Used → Search → Open Tool → Result → Optional professional output.",
        "All Tools":"Saare Tools","See all 208 tools":"Saare 208 tools dekhein","Legal & Court":"Legal & Court","Cases, notices, drafting":"Cases, notices, drafting",
        "Tax & Accounts":"Tax & Accounts","Income tax, TDS, accounts":"Income tax, TDS, accounts","GST":"GST","Returns, ITC, invoices":"Returns, ITC, invoices",
        "Company / MCA":"Company / MCA","ROC, directors, filings":"ROC, directors, filings","Office & Documents":"Office & Documents","Client, PDF, documents":"Client, PDF, documents",
        "AI Legal":"AI Legal","Research, review, drafting":"Research, review, drafting","Compliance":"Compliance","Due dates & reminders":"Due dates aur reminders",
        "Finance":"Finance","Loans, payroll, business":"Loans, payroll, business","Most Used":"Most Used","All":"All","Free":"Free","Paid Output":"Paid Output",
        "Select a tool above to begin.":"Shuru karne ke liye upar koi tool select karein.","Important:":"Important:",
        "ILS tools are planning and information aids. A calculated date is not a determination of a statutory limitation/deadline, and an estimate does not predict a court order. Always verify the applicable law, procedural rule, jurisdiction and facts, or seek professional advice.":"ILS tools planning aur information aids hain. Calculated date statutory limitation/deadline ka final determination nahi hai aur estimate court order predict nahi karta. Applicable law, procedure, jurisdiction aur facts verify karein ya professional advice lein.",
        "Legal information, research access and professional network coordination.":"Legal information, research access aur professional network coordination.","Explore":"Explore","Acts Library":"Acts Library","Professional Network":"Professional Network","Join ILS Network":"ILS Network join karein","Professional Portal":"Professional Portal"
      },
      cats:{advocate:"Advocate",ca:"CA",gst:"GST",cs:"CS / MCA",common:"Common",ai:"AI",compliance:"Compliance",finance:"Finance"},
      modes:{full:"Fully wired",guided:"Guided workflow"},
      desc:{full:"Working ILS tool hai, jisme guided inputs aur result flow hai.",guided:"Guided starter hai: inputs organise karein, free guidance lein aur optional printable output use karein."},
      generic:{"Tool":"Tool","Calculator":"Calculator","Checklist":"Checklist","Generator":"Generator","Assistant":"Assistant","Tracker":"Tracker","Planner":"Planner","Finder":"Finder","Comparison":"Comparison","Reconciliation":"Reconciliation","Notice":"Notice","Application":"Application","Agreement":"Agreement","Draft":"Draft","Review":"Review","Risk":"Risk","Scanner":"Scanner","Calendar":"Calendar","Reminder":"Reminder","Report":"Report","Output":"Output","Case":"Case","Date":"Date","Court":"Court","Fee":"Fee","Stamp Duty":"Stamp Duty","Bail":"Bail","Bond":"Bond","Appeal":"Appeal","Revision":"Revision","Execution":"Execution","Period":"Period","Hearing":"Hearing","Status":"Status","Property":"Property","Document":"Document","Documents":"Documents","Tax":"Tax","Income Tax":"Income Tax","Interest":"Interest","Payment":"Payment","Invoice":"Invoice","Company":"Company","Director":"Director","Share":"Share","Capital":"Capital","Compliance":"Compliance","Professional":"Professional","Client":"Client","Loan":"Loan","Salary":"Salary","Payroll":"Payroll","Profit":"Profit","Loss":"Loss","Cash Flow":"Cash Flow","Margin":"Margin","Discount":"Discount","Return":"Return","Due Date":"Due Date","Renewal":"Renewal","Search":"Search","Legal":"Legal","Office":"Office","Accounts":"Accounts","Finance":"Finance"}
    },
    "ur-IN":{
      nav:{"Home":"ہوم","Legal Search":"قانونی تلاش","Acts":"قوانین","Find Advocate":"وکیل تلاش کریں","Judgments":"فیصلے","Law Guide":"قانون گائیڈ","AI Assistant":"AI معاون","Tools":"ٹولز","About":"ہمارے بارے میں","FAQ":"سوالات","Get Legal Help":"قانونی مدد لیں","Install App":"ایپ انسٹال کریں"},
      shell:{
        "ILS Legal Tools":"آئی ایل ایس قانونی ٹولز","Useful legal planning tools.":"مفید قانونی منصوبہ بندی کے ٹولز۔",
        "Free tools to organise dates, calculations and case information. Results are informational and should be verified for the specific law, court and jurisdiction before reliance.":"تاریخوں، حسابات اور مقدمے کی معلومات کو منظم کرنے کے لیے مفت ٹولز۔ نتائج صرف معلوماتی ہیں، استعمال سے پہلے متعلقہ قانون، عدالت اور دائرۂ اختیار سے تصدیق کریں۔",
        "Search legal tools":"قانونی ٹولز تلاش کریں","Search calculator, deadline, property, case…":"کیلکولیٹر، آخری تاریخ، جائیداد یا مقدمہ تلاش کریں…",
        "Smart access:":"آسان رسائی:","Pick a category, use Most Used for high-frequency tasks, or search any of the 208 tools.":"زمرہ منتخب کریں، زیادہ استعمال ہونے والے ٹولز دیکھیں یا 208 ٹولز میں تلاش کریں۔",
        "Smart guidance:":"سمارٹ رہنمائی:","Choose your profession/category, search a task, enter the guided inputs, and review the result.":"اپنا پیشہ/زمرہ منتخب کریں، کام تلاش کریں، مطلوبہ معلومات درج کریں اور نتیجہ دیکھیں۔",
        "Calculation is free.":"حساب مفت ہے۔","Pay only when you want a clean professional report / Print / Save as PDF.":"صرف صاف پیشہ ورانہ رپورٹ، پرنٹ یا PDF کے لیے ادائیگی کریں۔",
        "208-tool professional suite":"208 ٹولز کا پیشہ ورانہ مجموعہ","Find the exact task":"درست کام تلاش کریں","Category → Most Used → Search → Open Tool → Result → Optional professional output.":"زمرہ → زیادہ استعمال → تلاش → ٹول کھولیں → نتیجہ → اختیاری پیشہ ورانہ آؤٹ پٹ۔",
        "All Tools":"تمام ٹولز","See all 208 tools":"تمام 208 ٹولز دیکھیں","Legal & Court":"قانون اور عدالت","Cases, notices, drafting":"مقدمات، نوٹس، ڈرافٹنگ",
        "Tax & Accounts":"ٹیکس اور حسابات","Income tax, TDS, accounts":"انکم ٹیکس، TDS، حسابات","GST":"GST","Returns, ITC, invoices":"ریٹرنز، ITC، انوائسز",
        "Company / MCA":"کمپنی / MCA","ROC, directors, filings":"ROC، ڈائریکٹرز، فائلنگ","Office & Documents":"دفتر اور دستاویزات","Client, PDF, documents":"کلائنٹ، PDF، دستاویزات",
        "AI Legal":"AI قانونی","Research, review, drafting":"تحقیق، جائزہ، ڈرافٹنگ","Compliance":"تعمیل","Due dates & reminders":"مقررہ تاریخیں اور یاد دہانیاں",
        "Finance":"مالیات","Loans, payroll, business":"قرضے، پے رول، کاروبار","Most Used":"زیادہ استعمال","All":"تمام","Free":"مفت","Paid Output":"ادا شدہ آؤٹ پٹ",
        "Select a tool above to begin.":"شروع کرنے کے لیے اوپر کوئی ٹول منتخب کریں۔","Important:":"اہم:",
        "ILS tools are planning and information aids. A calculated date is not a determination of a statutory limitation/deadline, and an estimate does not predict a court order. Always verify the applicable law, procedural rule, jurisdiction and facts, or seek professional advice.":"ILS ٹولز منصوبہ بندی اور معلوماتی معاونت ہیں۔ حساب کی گئی تاریخ قانونی مدت یا آخری تاریخ کا حتمی تعین نہیں ہے اور اندازہ عدالتی حکم کی پیش گوئی نہیں کرتا۔ متعلقہ قانون، طریقۂ کار، دائرۂ اختیار اور حقائق کی تصدیق کریں یا پیشہ ورانہ مشورہ لیں۔",
        "Legal information, research access and professional network coordination.":"قانونی معلومات، تحقیقی سہولت اور پیشہ ورانہ نیٹ ورک رابطہ۔","Explore":"دریافت کریں","Acts Library":"قوانین کا ذخیرہ","Professional Network":"پیشہ ورانہ نیٹ ورک","Join ILS Network":"ILS نیٹ ورک سے جڑیں","Professional Portal":"پیشہ ورانہ پورٹل"
      },
      cats:{advocate:"وکیل",ca:"CA",gst:"GST",cs:"CS / MCA",common:"عام",ai:"AI",compliance:"تعمیل",finance:"مالیات"},
      modes:{full:"مکمل طور پر فعال",guided:"رہنمائی والا طریقۂ کار"},
      desc:{full:"مطلوبہ معلومات اور نتیجہ کے بہاؤ کے ساتھ فعال ILS ٹول۔",guided:"رہنمائی والا آغاز: معلومات منظم کریں، مفت رہنمائی لیں اور اختیاری پرنٹ کے قابل آؤٹ پٹ تیار کریں۔"},
      generic:{"Tool":"ٹول","Calculator":"کیلکولیٹر","Checklist":"چیک لسٹ","Generator":"جنریٹر","Assistant":"معاون","Tracker":"ٹریکر","Planner":"منصوبہ ساز","Finder":"تلاش","Comparison":"موازنہ","Reconciliation":"مصالحت","Notice":"نوٹس","Application":"درخواست","Agreement":"معاہدہ","Draft":"مسودہ","Review":"جائزہ","Risk":"خطرہ","Scanner":"اسکینر","Calendar":"کیلنڈر","Reminder":"یاد دہانی","Report":"رپورٹ","Output":"آؤٹ پٹ","Case":"مقدمہ","Date":"تاریخ","Court":"عدالت","Fee":"فیس","Stamp Duty":"اسٹامپ ڈیوٹی","Bail":"ضمانت","Bond":"مچلکہ","Appeal":"اپیل","Revision":"نظر ثانی","Execution":"عملدرآمد","Period":"مدت","Hearing":"سماعت","Status":"حیثیت","Property":"جائیداد","Document":"دستاویز","Documents":"دستاویزات","Tax":"ٹیکس","Income Tax":"انکم ٹیکس","Interest":"سود","Payment":"ادائیگی","Invoice":"انوائس","Company":"کمپنی","Director":"ڈائریکٹر","Share":"حصہ","Capital":"سرمایہ","Compliance":"تعمیل","Professional":"پیشہ ورانہ","Client":"کلائنٹ","Loan":"قرض","Salary":"تنخواہ","Payroll":"پے رول","Profit":"منافع","Loss":"نقصان","Cash Flow":"نقد بہاؤ","Margin":"مارجن","Discount":"رعایت","Return":"ریٹرن","Due Date":"مقررہ تاریخ","Renewal":"تجدید","Search":"تلاش","Legal":"قانونی","Office":"دفتر","Accounts":"حسابات","Finance":"مالیات"}
    },
    "bn-IN":{
      nav:{"Home":"হোম","Legal Search":"আইনি অনুসন্ধান","Acts":"আইন","Find Advocate":"আইনজীবী খুঁজুন","Judgments":"রায়","Law Guide":"আইন গাইড","AI Assistant":"AI সহায়ক","Tools":"টুলস","About":"আমাদের সম্পর্কে","FAQ":"প্রশ্নোত্তর","Get Legal Help":"আইনি সহায়তা নিন","Install App":"অ্যাপ ইনস্টল করুন"},
      shell:{
        "ILS Legal Tools":"ILS আইনি টুলস","Useful legal planning tools.":"উপকারী আইনি পরিকল্পনা টুলস।",
        "Free tools to organise dates, calculations and case information. Results are informational and should be verified for the specific law, court and jurisdiction before reliance.":"তারিখ, হিসাব এবং মামলার তথ্য সাজানোর জন্য বিনামূল্যের টুলস। ফলাফল শুধুমাত্র তথ্যের জন্য; ব্যবহারের আগে প্রযোজ্য আইন, আদালত ও এখতিয়ার যাচাই করুন।",
        "Search legal tools":"আইনি টুলস খুঁজুন","Search calculator, deadline, property, case…":"ক্যালকুলেটর, সময়সীমা, সম্পত্তি বা মামলা খুঁজুন…",
        "Smart access:":"সহজ অ্যাক্সেস:","Pick a category, use Most Used for high-frequency tasks, or search any of the 208 tools.":"একটি বিভাগ বেছে নিন, বেশি ব্যবহৃত টুল দেখুন অথবা ২০৮টি টুলের যেকোনোটি খুঁজুন।",
        "Smart guidance:":"স্মার্ট নির্দেশনা:","Choose your profession/category, search a task, enter the guided inputs, and review the result.":"পেশা/বিভাগ বেছে নিন, কাজ খুঁজুন, নির্দেশিত তথ্য দিন এবং ফলাফল পর্যালোচনা করুন।",
        "Calculation is free.":"হিসাব বিনামূল্যে।","Pay only when you want a clean professional report / Print / Save as PDF.":"পরিষ্কার পেশাদার রিপোর্ট, প্রিন্ট বা PDF চাইলে তবেই পেমেন্ট করুন।",
        "208-tool professional suite":"২০৮-টুল পেশাদার সংগ্রহ","Find the exact task":"সঠিক কাজ খুঁজুন","Category → Most Used → Search → Open Tool → Result → Optional professional output.":"বিভাগ → বেশি ব্যবহৃত → অনুসন্ধান → টুল খুলুন → ফলাফল → ঐচ্ছিক পেশাদার আউটপুট।",
        "All Tools":"সব টুল","See all 208 tools":"সব ২০৮টি টুল দেখুন","Legal & Court":"আইন ও আদালত","Cases, notices, drafting":"মামলা, নোটিশ, খসড়া",
        "Tax & Accounts":"কর ও হিসাব","Income tax, TDS, accounts":"আয়কর, TDS, হিসাব","GST":"GST","Returns, ITC, invoices":"রিটার্ন, ITC, ইনভয়েস",
        "Company / MCA":"কোম্পানি / MCA","ROC, directors, filings":"ROC, ডিরেক্টর, ফাইলিং","Office & Documents":"অফিস ও নথি","Client, PDF, documents":"ক্লায়েন্ট, PDF, নথি",
        "AI Legal":"AI আইন","Research, review, drafting":"গবেষণা, পর্যালোচনা, খসড়া","Compliance":"অনুবর্তিতা","Due dates & reminders":"নির্ধারিত তারিখ ও অনুস্মারক",
        "Finance":"অর্থনীতি","Loans, payroll, business":"ঋণ, পেরোল, ব্যবসা","Most Used":"বেশি ব্যবহৃত","All":"সব","Free":"বিনামূল্যে","Paid Output":"পেইড আউটপুট",
        "Select a tool above to begin.":"শুরু করতে উপরের একটি টুল নির্বাচন করুন।","Important:":"গুরুত্বপূর্ণ:",
        "ILS tools are planning and information aids. A calculated date is not a determination of a statutory limitation/deadline, and an estimate does not predict a court order. Always verify the applicable law, procedural rule, jurisdiction and facts, or seek professional advice.":"ILS টুলগুলি পরিকল্পনা ও তথ্য সহায়তা মাত্র। গণনা করা তারিখ কোনো আইনি সীমা বা সময়সীমার চূড়ান্ত নির্ধারণ নয় এবং কোনো অনুমান আদালতের আদেশের পূর্বাভাস নয়। প্রযোজ্য আইন, প্রক্রিয়া, এখতিয়ার ও তথ্য যাচাই করুন অথবা পেশাদার পরামর্শ নিন।",
        "Legal information, research access and professional network coordination.":"আইনি তথ্য, গবেষণা সুবিধা এবং পেশাদার নেটওয়ার্ক সমন্বয়।","Explore":"অন্বেষণ","Acts Library":"আইন সংগ্রহ","Professional Network":"পেশাদার নেটওয়ার্ক","Join ILS Network":"ILS নেটওয়ার্কে যোগ দিন","Professional Portal":"পেশাদার পোর্টাল"
      },
      cats:{advocate:"আইনজীবী",ca:"CA",gst:"GST",cs:"CS / MCA",common:"সাধারণ",ai:"AI",compliance:"অনুবর্তিতা",finance:"অর্থনীতি"},
      modes:{full:"সম্পূর্ণ সক্রিয়",guided:"নির্দেশিত কার্যপ্রবাহ"},
      desc:{full:"নির্দেশিত ইনপুট ও ফলাফল প্রবাহসহ সক্রিয় ILS টুল।",guided:"নির্দেশিত শুরু: তথ্য সাজান, বিনামূল্যে নির্দেশনা নিন এবং ঐচ্ছিক প্রিন্টযোগ্য আউটপুট তৈরি করুন।"},
      generic:{"Tool":"টুল","Calculator":"ক্যালকুলেটর","Checklist":"চেকলিস্ট","Generator":"জেনারেটর","Assistant":"সহায়ক","Tracker":"ট্র্যাকার","Planner":"পরিকল্পনাকারী","Finder":"অনুসন্ধান","Comparison":"তুলনা","Reconciliation":"মিল","Notice":"নোটিশ","Application":"আবেদন","Agreement":"চুক্তি","Draft":"খসড়া","Review":"পর্যালোচনা","Risk":"ঝুঁকি","Scanner":"স্ক্যানার","Calendar":"ক্যালেন্ডার","Reminder":"অনুস্মারক","Report":"রিপোর্ট","Output":"আউটপুট","Case":"মামলা","Date":"তারিখ","Court":"আদালত","Fee":"ফি","Stamp Duty":"স্ট্যাম্প ডিউটি","Bail":"জামিন","Bond":"বন্ড","Appeal":"আপিল","Revision":"পুনর্বিবেচনা","Execution":"বাস্তবায়ন","Period":"সময়কাল","Hearing":"শুনানি","Status":"অবস্থা","Property":"সম্পত্তি","Document":"নথি","Documents":"নথিপত্র","Tax":"কর","Income Tax":"আয়কর","Interest":"সুদ","Payment":"পেমেন্ট","Invoice":"ইনভয়েস","Company":"কোম্পানি","Director":"ডিরেক্টর","Share":"শেয়ার","Capital":"মূলধন","Compliance":"অনুবর্তিতা","Professional":"পেশাদার","Client":"ক্লায়েন্ট","Loan":"ঋণ","Salary":"বেতন","Payroll":"পেরোল","Profit":"লাভ","Loss":"ক্ষতি","Cash Flow":"নগদ প্রবাহ","Margin":"মার্জিন","Discount":"ছাড়","Return":"রিটার্ন","Due Date":"নির্ধারিত তারিখ","Renewal":"নবীকরণ","Search":"অনুসন্ধান","Legal":"আইনি","Office":"অফিস","Accounts":"হিসাব","Finance":"অর্থনীতি"}
    }
  };

  const lang=()=>window.ILSLanguage?.get?.()||"en-IN";
  const pack=()=>packs[lang()]||packs["en-IN"];

  function replacePhrases(text,dict){
    let out=String(text||"");
    Object.keys(dict).sort((a,b)=>b.length-a.length).forEach(k=>{
      out=out.split(k).join(dict[k]);
    });
    return out;
  }

  function toolName(name){
    const p=pack();
    if(lang()==="en-IN")return name;
    return replacePhrases(name,p.generic);
  }

  function toolDescription(mode){
    const p=pack();
    return p.desc[mode]||p.desc.guided;
  }

  function localizeCatalog(){
    const p=pack();
    document.querySelectorAll(".tool-card").forEach(card=>{
      const slug=card.querySelector(".tool-open")?.dataset.tool;
      const tool=(window.ILS_TOOL_CATALOG||[]).find(x=>x.slug===slug);
      if(!tool)return;
      const h=card.querySelector("h3"); if(h)h.textContent=toolName(tool.name);
      const d=card.querySelector("p"); if(d)d.textContent=toolDescription(tool.mode);
      const mode=card.querySelector(".tool-mode"); if(mode)mode.textContent=(p.cats[tool.category]||tool.category)+" • "+(p.modes[tool.mode]||tool.mode);
      const open=card.querySelector(".tool-open"); if(open)open.textContent=lang()==="en-IN"?"Open Tool":lang()==="hi-IN"?"टूल खोलें":lang()==="hinglish"?"Tool kholein":lang()==="ur-IN"?"ٹول کھولیں":"টুল খুলুন";
      const pop=card.querySelector(".tool-popular"); if(pop)pop.textContent=lang()==="en-IN"?"MOST USED":lang()==="hi-IN"?"अधिक उपयोग":lang()==="hinglish"?"MOST USED":lang()==="ur-IN"?"زیادہ استعمال":"বেশি ব্যবহৃত";
      const price=card.querySelector(".tool-price"); if(price&&tool.price)price.textContent="₹"+tool.price;
      const free=card.querySelector(".tool-badge"); if(free)free.textContent=lang()==="en-IN"?"FREE":lang()==="hi-IN"?"निःशुल्क":lang()==="hinglish"?"FREE":lang()==="ur-IN"?"مفت":"বিনামূল্যে";
    });
    document.querySelectorAll("[data-ils-tools-shell]").forEach(el=>{
      const original=el.getAttribute("data-ils-tools-shell");
      const value=p.shell[original];
      if(value)el.textContent=value;
    });
    const labels={advocate:p.shell["Legal & Court"],ca:p.shell["Tax & Accounts"],gst:"GST",cs:p.shell["Company / MCA"],common:p.shell["Office & Documents"],ai:p.shell["AI Legal"],compliance:p.shell["Compliance"],finance:p.shell["Finance"]};
    document.querySelectorAll(".tool-category-card").forEach(card=>{
      const key=card.dataset.profession;
      const strong=card.querySelector("strong"); if(strong)strong.textContent=key==="all"?p.shell["All Tools"]:labels[key]||strong.textContent;
      const small=card.querySelector("small"); if(small){
        const map={all:"See all 208 tools",advocate:"Cases, notices, drafting",ca:"Income tax, TDS, accounts",gst:"Returns, ITC, invoices",cs:"ROC, directors, filings",common:"Client, PDF, documents",ai:"Research, review, drafting",compliance:"Due dates & reminders",finance:"Loans, payroll, business"};
        small.textContent=p.shell[map[key]]||small.textContent;
      }
    });
    document.querySelectorAll("[data-ils-tools-sort]").forEach(el=>{
      const key=el.getAttribute("data-ils-tools-sort");
      el.textContent=p.shell[key]||el.textContent;
    });
    const c=document.getElementById("toolCount"); if(c){const n=(window.ILS_TOOL_CATALOG||[]).filter(x=>!document.querySelector('.tool-card[data-tool-name="'+x.slug+'"]')).length; if(!c.textContent){}}
  }

  function translateStatic(){
    const p=pack();
    document.querySelectorAll("body *:not(script):not(style):not(option):not(input):not(textarea):not(select)").forEach(el=>{
      if(el.children.length!==0)return;
      const original=el.getAttribute("data-ils-tools-original")||el.textContent.trim();
      if(!original)return;
      if(!el.hasAttribute("data-ils-tools-original"))el.setAttribute("data-ils-tools-original",original);
      const value=p.shell[original]||p.nav[original]||p.generic[original];
      if(value)el.textContent=value;
    });
    document.querySelectorAll("[data-ils-tools-text]").forEach(el=>{
      const key=el.getAttribute("data-ils-tools-text");
      if(p.shell[key])el.textContent=p.shell[key];
    });
    const ph=document.querySelector("[data-ils-tools-placeholder]");
    if(ph)ph.placeholder=lang()==="en-IN"?"Search calculator, deadline, property, case…":lang()==="hi-IN"?"कैलकुलेटर, समय-सीमा, संपत्ति, मामला… खोजें":lang()==="hinglish"?"Calculator, deadline, property ya case search karein…":lang()==="ur-IN"?"کیلکولیٹر، آخری تاریخ، جائیداد یا مقدمہ تلاش کریں…":"ক্যালকুলেটর, সময়সীমা, সম্পত্তি বা মামলা খুঁজুন…";
  }

  function apply(){translateStatic();localizeCatalog();}
  window.ILSToolsLanguage={apply,toolName,toolDescription};
  const boot=()=>{
    apply();
    const grid=document.getElementById("toolCatalogGrid");
    if(grid&&window.MutationObserver){
      const mo=new MutationObserver(()=>apply());
      mo.observe(grid,{childList:true,subtree:true});
    }
    window.addEventListener("storage",e=>{if(e.key==="ils-language"||e.key==="ils-home-lang")apply();});
  };
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();