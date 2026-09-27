/* ILS Advanced Accounting Layer — additive, browser-side, no replacement of existing tools/payment flow */
(() => {
  'use strict';

  const esc = v => window.ILS?.esc ? ILS.esc(v) : String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const money = n => '₹' + (Number(n)||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
  const num = v => { const n=Number(String(v??'').replace(/,/g,'')); return Number.isFinite(n)?n:0; };
  const workspace = () => document.getElementById('toolWorkspace');

  const newTools = [
    ['bank-reconciliation','Bank Reconciliation','Match book entries with bank statement entries, identify unmatched/duplicate items and calculate adjusted balance.','ca',29],
    ['trial-balance','Trial Balance','Prepare a debit/credit trial balance, detect imbalance and show the accounts needing review.','ca',29],
    ['inventory-valuation','Inventory Valuation & Stock Check','Calculate closing stock, stock movement and valuation using quantity × rate with variance checks.','ca',29],
    ['fixed-asset-register','Fixed Asset Register','Build an asset register with acquisition cost, useful life, depreciation and closing WDV.','ca',29],
    ['payroll-compliance-estimator','Payroll & Statutory Estimator','Estimate gross-to-net payroll with PF/ESI/PT/TDS planning fields and compliance warnings.','finance',29]
  ];

  const upgraded = new Set([
    'cash-flow-calculator','working-capital-calculator','depreciation-schedule-generator',
    'ratio-analysis-calculator','expense-categorisation-tool','receivable-ageing-calculator',
    'payable-ageing-calculator','gst-to-turnover-reconciliation'
  ]);

  function addCards(){
    const grid=document.getElementById('toolCatalogGrid');
    if(!grid) return;
    newTools.forEach(([slug,name,desc,cat,price])=>{
      if(grid.querySelector('[data-tool="'+slug+'"]')) return;
      const article=document.createElement('article');
      article.className='card tool-card';
      article.dataset.category=cat;
      article.dataset.profession=cat;
      article.dataset.popular='false';
      article.dataset.price=String(price);
      article.dataset.mode='full';
      article.dataset.toolName=(name+' '+cat+' '+desc).toLowerCase();
      article.innerHTML='<div class="tool-card-top"><span class="tool-icon">📊</span><div class="tool-badges"><span class="tool-price">₹'+price+'</span></div></div><h3>'+esc(name)+'</h3><p>'+esc(desc)+'</p><div class="tool-mode">CA • Fully wired</div><button class="btn btn-primary tool-open" data-tool="'+slug+'">Open Tool</button>';
      grid.appendChild(article);
    });
    const count=document.getElementById('toolCount'); if(count) count.textContent=(208+newTools.length)+' tools';
    const notes=document.querySelectorAll('.tool-profession-note,.tool-section-head .eyebrow');
    notes.forEach(el=>{ if(el.textContent.includes('208')) el.textContent=el.textContent.replace(/208/g,String(208+newTools.length)); });
  }

  function shell(title,desc,html){
    const w=workspace(); if(!w)return;
    w.innerHTML='<div><span class="eyebrow">Advanced Accounting</span><h2>'+esc(title)+'</h2><p>'+esc(desc)+'</p>'+html+'</div>';
    requestAnimationFrame(()=>w.scrollIntoView({behavior:'smooth',block:'start'}));
  }

  function field(id,label,type='number',value='0',extra=''){
    return '<label for="'+id+'">'+esc(label)+'</label><input id="'+id+'" type="'+type+'" value="'+esc(value)+'" '+extra+'>';
  }

  function resultBox(html,slug,input,result,title){
    const w=workspace();
    const details={tool_slug:slug,report_title:title,inputs:input,results:result};
    const box=document.createElement('div');
    box.className='notice';
    box.style.marginTop='16px';
    box.innerHTML='<strong>Professional report</strong><p>Calculation is free. For a clean professional report / print-ready PDF, use the existing ILS paid output flow.</p><button type="button" class="btn btn-primary" id="advPaidReport">Professional Report</button><span id="advPaidStatus" style="display:block;margin-top:8px"></span>';
    w.appendChild(box);
    box.querySelector('#advPaidReport').onclick=async()=>{
      const b=box.querySelector('#advPaidReport'), s=box.querySelector('#advPaidStatus');
      b.disabled=true; s.textContent='Preparing order…';
      try{
        if(!window.ILS_TOOLS?.createOrder) throw new Error('Existing ILS payment service is unavailable.');
        await ILS_TOOLS.createOrder('accounting-print-professional',details,null,()=>{
          s.innerHTML='Payment verified. <button type="button" class="btn btn-primary btn-small" id="advPrint">Print / Save as PDF</button>';
          box.querySelector('#advPrint').onclick=()=>window.print();
        },{forceQr:true});
      }catch(e){s.textContent=e.message||'Unable to start paid report.';b.disabled=false;}
    };
  }

  function guide(text){return '<div class="notice" style="margin-bottom:14px"><strong>How to use:</strong> '+esc(text)+'</div>';}
  function table(headers,rows){return '<div style="overflow:auto;margin-top:12px"><table style="width:100%;border-collapse:collapse"><thead><tr>'+headers.map(h=>'<th style="text-align:left;padding:7px;border-bottom:1px solid rgba(127,140,160,.25)">'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(x=>'<td style="padding:7px;border-bottom:1px solid rgba(127,140,160,.15)">'+esc(String(x))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'; }

  function bankReconciliation(){
    shell('Bank Reconciliation','Smartly compare book balance with bank statement items and isolate differences.',
      guide('Enter closing book balance and statement balance. Then list deposits/credits and payments/debits appearing in the bank statement but not yet in books. The tool highlights the adjusted-book position; it does not fetch bank data automatically.')+
      '<div class="grid">'+
      '<div>'+field('brBook','Closing balance as per books')+field('brBank','Closing balance as per bank statement')+
      '<label for="brCredits">Bank credits not yet recorded in books (one per line: description | amount)</label><textarea id="brCredits" rows="5" placeholder="Interest credited | 500\nCustomer deposit | 25000"></textarea>'+
      '<label for="brDebits">Bank debits not yet recorded in books (one per line: description | amount)</label><textarea id="brDebits" rows="5" placeholder="Bank charges | 250\nCheque presented | 12000"></textarea>'+
      '<label for="brDuplicates">Potential duplicate/uncleared items (one amount per line)</label><textarea id="brDuplicates" rows="4" placeholder="12000\n500"></textarea>'+
      '<button class="btn btn-primary" id="brRun">Reconcile</button></div><div id="brResult" class="card" style="padding:16px"><strong>Ready</strong><p>Enter statement differences to begin.</p></div></div>');
    document.getElementById('brRun').onclick=()=>{
      const parse=s=>(s||'').split(/\n+/).map(x=>x.split('|')).map(x=>({d:(x[0]||'').trim(),a:num(x[1])})).filter(x=>x.a>0);
      const credits=parse(document.getElementById('brCredits').value), debits=parse(document.getElementById('brDebits').value);
      const dup=(document.getElementById('brDuplicates').value||'').split(/\n+/).map(num).filter(x=>x>0);
      const book=num(document.getElementById('brBook').value), bank=num(document.getElementById('brBank').value);
      const adjusted=book+credits.reduce((a,x)=>a+x.a,0)-debits.reduce((a,x)=>a+x.a,0);
      const variance=bank-adjusted;
      const r={book_balance:book,bank_balance:bank,unrecorded_credits:credits.reduce((a,x)=>a+x.a,0),unrecorded_debits:debits.reduce((a,x)=>a+x.a,0),adjusted_book_balance:adjusted,bank_vs_adjusted_variance:variance,possible_duplicate_total:dup.reduce((a,x)=>a+x,0)};
      document.getElementById('brResult').innerHTML='<strong>Reconciliation result</strong>'+table(['Metric','Value'],[['Books',money(book)],['Bank statement',money(bank)],['Adjusted books',money(adjusted)],['Variance',money(variance)],['Potential duplicate total',money(r.possible_duplicate_total)]])+'<div class="notice" style="margin-top:12px">'+(Math.abs(variance)<0.01?'Balanced after supplied adjustments.':'Difference remains. Review timing items, bank charges, direct credits/debits, duplicates and omitted entries.')+'</div>';
      resultBox('', 'bank-reconciliation', r, r, 'Bank Reconciliation Report');
    };
  }

  function trialBalance(){
    shell('Trial Balance','Prepare a debit/credit trial balance and detect whether total debits equal total credits.',
      guide('Enter each ledger account as: Account | Debit | Credit. Use one line per account. A balanced trial balance is only a mathematical check; it does not prove that accounts are correct.')+
      '<label for="tbRows">Ledger accounts</label><textarea id="tbRows" rows="10" placeholder="Cash | 50000 | 0\nSales | 0 | 120000\nRent | 15000 | 0\nCapital | 0 | 100000"></textarea><button class="btn btn-primary" id="tbRun">Prepare Trial Balance</button><div id="tbResult" class="card" style="margin-top:14px;padding:16px"><strong>Ready</strong></div>');
    document.getElementById('tbRun').onclick=()=>{
      const rows=(document.getElementById('tbRows').value||'').split(/\n+/).map(x=>x.split('|').map(y=>y.trim())).filter(x=>x[0]);
      const parsed=rows.map(x=>({account:x[0],debit:num(x[1]),credit:num(x[2])}));
      const td=parsed.reduce((a,x)=>a+x.debit,0),tc=parsed.reduce((a,x)=>a+x.credit,0),diff=td-tc;
      document.getElementById('tbResult').innerHTML='<strong>Trial Balance</strong>'+table(['Account','Debit','Credit'],parsed.map(x=>[x.account,money(x.debit),money(x.credit)]))+table(['Total','Amount','Status'],[['Debits',money(td),diff===0?'OK':'Review'],['Credits',money(tc),diff===0?'OK':'Review'],['Difference',money(diff),Math.abs(diff)<0.01?'Balanced':'UNBALANCED']]);
      resultBox('', 'trial-balance', {rows:parsed}, {total_debit:td,total_credit:tc,difference:diff}, 'Trial Balance Report');
    };
  }

  function inventoryValuation(){
    shell('Inventory Valuation & Stock Check','Calculate stock quantities, values and movement with simple variance controls.',
      guide('Enter opening quantity/value and purchases/sales movement. For a full statutory valuation, apply the entity’s approved accounting policy and applicable standards; this tool is a planning aid.')+
      '<div class="grid"><div>'+field('ivOpenQty','Opening quantity')+field('ivOpenRate','Opening average rate')+field('ivPurchaseQty','Purchase quantity')+field('ivPurchaseRate','Purchase average rate')+field('ivSaleQty','Quantity sold')+field('ivCloseRate','Closing valuation rate')+'<button class="btn btn-primary" id="ivRun">Calculate Stock</button></div><div id="ivResult" class="card" style="padding:16px"><strong>Ready</strong></div></div>');
    document.getElementById('ivRun').onclick=()=>{
      const oq=num(ivOpenQty.value),or=num(ivOpenRate.value),pq=num(ivPurchaseQty.value),pr=num(ivPurchaseRate.value),sq=num(ivSaleQty.value),cr=num(ivCloseRate.value);
      const open=oq*or,purch=pq*pr,closeQty=Math.max(0,oq+pq-sq),close=closeQty*cr,cogs=open+purch-close;
      const r={opening_value:open,purchase_value:purch,closing_quantity:closeQty,closing_value:close,indicative_cost_of_goods_sold:cogs};
      ivResult.innerHTML='<strong>Stock position</strong>'+table(['Metric','Value'],[['Opening value',money(open)],['Purchases',money(purch)],['Closing quantity',closeQty],['Closing value',money(close)],['Indicative COGS',money(cogs)]])+'<div class="notice">Check rate selection against your approved inventory valuation policy before reporting.</div>';
      resultBox('', 'inventory-valuation', r, r, 'Inventory Valuation Report');
    };
  }

  function fixedAssets(){
    shell('Fixed Asset Register','Create an asset-by-asset register with straight-line planning depreciation and closing WDV.',
      guide('Enter one asset per line: Asset | Cost | Residual value | Useful life years | Age years. This is a planning schedule; tax depreciation and accounting depreciation can differ.')+
      '<label for="faRows">Assets</label><textarea id="faRows" rows="9" placeholder="Laptop | 60000 | 5000 | 3 | 1\nFurniture | 100000 | 10000 | 10 | 2"></textarea><button class="btn btn-primary" id="faRun">Build Register</button><div id="faResult" class="card" style="margin-top:14px;padding:16px"><strong>Ready</strong></div>');
    document.getElementById('faRun').onclick=()=>{
      const rows=(faRows.value||'').split(/\n+/).map(x=>x.split('|').map(y=>y.trim())).filter(x=>x[0]);
      const out=rows.map(x=>{const cost=num(x[1]),res=num(x[2]),life=Math.max(1,num(x[3])),age=Math.max(0,num(x[4])),annual=Math.max(0,(cost-res)/life),dep=Math.min(cost-res,annual*age),wdv=cost-dep;return {asset:x[0],cost,residual:res,useful_life:life,age,annual_depreciation:annual,accumulated_depreciation:dep,closing_wdv:wdv};});
      const total=out.reduce((a,x)=>a+x.closing_wdv,0);
      faResult.innerHTML='<strong>Fixed Asset Register</strong>'+table(['Asset','Cost','Annual dep.','Accumulated dep.','Closing WDV'],out.map(x=>[x.asset,money(x.cost),money(x.annual_depreciation),money(x.accumulated_depreciation),money(x.closing_wdv)]))+ '<p><strong>Total closing WDV: '+money(total)+'</strong></p>';
      resultBox('', 'fixed-asset-register', {assets:out}, {closing_wdv:total}, 'Fixed Asset Register Report');
    };
  }

  function payroll(){
    shell('Payroll & Statutory Estimator','Estimate payroll components with separate employee/employer contribution fields and compliance warnings.',
      guide('This tool separates payroll planning from statutory filing. Enter applicable rates used by your organisation and verify current thresholds, wage ceilings, state rules and employee eligibility before payroll processing.')+
      '<div class="grid"><div>'+field('prGross','Gross salary / wages')+field('prEmployeePf','Employee PF rate %','number','12')+field('prEmployerPf','Employer PF rate %','number','12')+field('prEmployeeEsi','Employee ESI rate %','number','0.75')+field('prEmployerEsi','Employer ESI rate %','number','3.25')+field('prPt','Professional tax / other statutory deduction')+field('prTds','TDS / income-tax deduction')+'<button class="btn btn-primary" id="prRun">Estimate Payroll</button></div><div id="prResult" class="card" style="padding:16px"><strong>Ready</strong></div></div>');
    document.getElementById('prRun').onclick=()=>{
      const gross=num(prGross.value),epf=gross*num(prEmployeePf.value)/100,erpf=gross*num(prEmployerPf.value)/100,eEsi=gross*num(prEmployeeEsi.value)/100,erEsi=gross*num(prEmployerEsi.value)/100,pt=num(prPt.value),tds=num(prTds.value),net=Math.max(0,gross-epf-eEsi-pt-tds),cost=gross+erpf+erEsi;
      const r={gross,employee_pf:epf,employee_esi:eEsi,professional_tax:pt,tds,net_pay:net,employer_pf:erpf,employer_esi:erEsi,employer_cost:cost};
      prResult.innerHTML='<strong>Payroll estimate</strong>'+table(['Component','Amount'],[['Gross',money(gross)],['Employee PF',money(epf)],['Employee ESI',money(eEsi)],['PT / other',money(pt)],['TDS',money(tds)],['Estimated net pay',money(net)],['Employer PF',money(erpf)],['Employer ESI',money(erEsi)],['Estimated employer cost',money(cost)]])+'<div class="notice">Rates are user-supplied planning inputs. Verify applicability, wage ceilings and current statutory rules before payroll finalisation.</div>';
      resultBox('', 'payroll-compliance-estimator', r, r, 'Payroll & Statutory Estimate');
    };
  }

  function advancedExisting(slug){
    const configs={
      'cash-flow-calculator':{title:'Cash Flow Forecast',desc:'Build a practical cash-in/cash-out forecast and closing cash position.',guide:'Enter expected receipts and payments by month. Use the result for planning, not as audited cash-flow statements.'},
      'working-capital-calculator':{title:'Working Capital Analyzer',desc:'Measure operating working capital and liquidity pressure.',guide:'Use current operating assets and liabilities. Interpret alongside business cycle and industry context.'},
      'ratio-analysis-calculator':{title:'Financial Ratio Dashboard',desc:'Calculate liquidity, leverage, profitability and efficiency ratios from supplied figures.',guide:'Enter consistent-period financial figures. Ratios are indicators, not standalone conclusions.'},
      'expense-categorisation-tool':{title:'Smart Expense Categorisation',desc:'Categorise expenses and surface concentration, missing categories and review flags.',guide:'Enter expense lines as Description | Amount | Category. Blank categories are flagged for review.'},
      'receivable-ageing-calculator':{title:'Receivable Ageing Analyzer',desc:'Bucket receivables by age and identify collection concentration.',guide:'Enter Customer | Amount | Days overdue. Review old balances and disputed items separately.'},
      'payable-ageing-calculator':{title:'Payable Ageing Analyzer',desc:'Bucket payables by age and highlight upcoming/overdue obligations.',guide:'Enter Supplier | Amount | Days overdue. Confirm credit terms before taking action.'},
      'depreciation-schedule-generator':{title:'Depreciation Schedule Generator',desc:'Generate a multi-year straight-line depreciation planning schedule.',guide:'Enter asset cost, residual value and useful life. Accounting and tax depreciation may differ.'},
      'gst-to-turnover-reconciliation':{title:'GST-to-Turnover Reconciliation',desc:'Compare declared GST turnover with books turnover and identify variance.',guide:'Enter period-wise books turnover and GST-reported turnover. Investigate timing, exempt, nil-rated and other reconciliation items.'}
    };
    const c=configs[slug]; if(!c)return false;
    let html=guide(c.guide);
    if(slug==='cash-flow-calculator') html+='<div class="grid"><div>'+field('cfOpening','Opening cash')+field('cfReceipts','Expected receipts')+field('cfOperating','Operating payments')+field('cfInvesting','Investing payments')+field('cfFinancing','Financing payments')+'<button class="btn btn-primary" id="advRun">Forecast</button></div><div id="advResult" class="card" style="padding:16px"><strong>Ready</strong></div></div>';
    if(slug==='working-capital-calculator') html+='<div class="grid"><div>'+field('wcInventory','Inventory')+field('wcReceivables','Receivables')+field('wcCash','Operating cash')+field('wcPayables','Payables')+field('wcOtherCL','Other current liabilities')+'<button class="btn btn-primary" id="advRun">Analyze</button></div><div id="advResult" class="card" style="padding:16px"><strong>Ready</strong></div></div>';
    if(slug==='ratio-analysis-calculator') html+='<div class="grid"><div>'+field('raCurrentAssets','Current assets')+field('raCurrentLiab','Current liabilities')+field('raDebt','Total debt')+field('raEquity','Equity')+field('raRevenue','Revenue')+field('raProfit','Net profit')+field('raCogs','COGS')+field('raAvgInventory','Average inventory')+'<button class="btn btn-primary" id="advRun">Calculate Ratios</button></div><div id="advResult" class="card" style="padding:16px"><strong>Ready</strong></div></div>';
    if(['expense-categorisation-tool','receivable-ageing-calculator','payable-ageing-calculator'].includes(slug)) html+='<label for="advRows">Entries</label><textarea id="advRows" rows="10" placeholder="Customer / Description | Amount | Days or Category"></textarea><button class="btn btn-primary" id="advRun">Analyze</button><div id="advResult" class="card" style="margin-top:14px;padding:16px"><strong>Ready</strong></div>';
    if(slug==='depreciation-schedule-generator') html+='<div class="grid"><div>'+field('dsCost','Asset cost')+field('dsResidual','Residual value')+field('dsLife','Useful life (years)','number','5')+'<button class="btn btn-primary" id="advRun">Build Schedule</button></div><div id="advResult" class="card" style="padding:16px"><strong>Ready</strong></div></div>';
    if(slug==='gst-to-turnover-reconciliation') html+='<div class="grid"><div>'+field('grBooks','Books turnover')+field('grGst','GST-reported turnover')+field('grAdjust','Known reconciliation adjustments')+'<button class="btn btn-primary" id="advRun">Reconcile</button></div><div id="advResult" class="card" style="padding:16px"><strong>Ready</strong></div></div>';
    shell(c.title,c.desc,html);
    document.getElementById('advRun').onclick=()=>{
      let r={}, html='';
      if(slug==='cash-flow-calculator'){const o=num(cfOpening.value),rct=num(cfReceipts.value),op=num(cfOperating.value),inv=num(cfInvesting.value),fin=num(cfFinancing.value),net=rct-op-inv+fin,close=o+net;r={opening:o,net_cash_change:net,closing_cash:close};html=table(['Metric','Value'],[['Opening',money(o)],['Net change',money(net)],['Closing',money(close)]])}
      if(slug==='working-capital-calculator'){const ca=num(wcInventory.value)+num(wcReceivables.value)+num(wcCash.value),cl=num(wcPayables.value)+num(wcOtherCL.value);r={current_operating_assets:ca,current_operating_liabilities:cl,working_capital:ca-cl};html=table(['Metric','Value'],[['Operating assets',money(ca)],['Operating liabilities',money(cl)],['Working capital',money(ca-cl)]])}
      if(slug==='ratio-analysis-calculator'){const ca=num(raCurrentAssets.value),cl=num(raCurrentLiab.value),debt=num(raDebt.value),eq=num(raEquity.value),rev=num(raRevenue.value),p=num(raProfit.value),cogs=num(raCogs.value),inv=num(raAvgInventory.value);r={current_ratio:cl?ca/cl:null,debt_equity:eq?debt/eq:null,net_margin:rev?p/rev*100:null,inventory_turnover:inv?cogs/inv:null};html=table(['Ratio','Result'],[['Current ratio',r.current_ratio?.toFixed(2)||'N/A'],['Debt / Equity',r.debt_equity?.toFixed(2)||'N/A'],['Net margin',r.net_margin!=null?r.net_margin.toFixed(2)+'%':'N/A'],['Inventory turnover',r.inventory_turnover?.toFixed(2)||'N/A']])}
      if(slug==='expense-categorisation-tool'){const rows=(advRows.value||'').split(/\n+/).map(x=>x.split('|').map(y=>y.trim())).filter(x=>x[0]);const uncat=rows.filter(x=>!x[2]);const total=rows.reduce((a,x)=>a+num(x[1]),0);r={entries:rows.length,total_expense:total,uncategorised:uncat.length};html=table(['Metric','Value'],[['Entries',rows.length],['Total expense',money(total)],['Needs category review',uncat.length]])}
      if(slug==='receivable-ageing-calculator'||slug==='payable-ageing-calculator'){const rows=(advRows.value||'').split(/\n+/).map(x=>x.split('|').map(y=>y.trim())).filter(x=>x[0]);const b={current:0,'1-30':0,'31-60':0,'61-90':0,'90+':0};rows.forEach(x=>{const a=num(x[1]),d=num(x[2]);if(d<=0)b.current+=a;else if(d<=30)b['1-30']+=a;else if(d<=60)b['31-60']+=a;else if(d<=90)b['61-90']+=a;else b['90+']+=a});r=b;html=table(['Age bucket','Amount'],Object.entries(b).map(x=>[x[0],money(x[1])]))}
      if(slug==='depreciation-schedule-generator'){const cost=num(dsCost.value),res=num(dsResidual.value),life=Math.max(1,Math.floor(num(dsLife.value))),annual=Math.max(0,(cost-res)/life);const rows=Array.from({length:life},(_,i)=>[i+1,money(annual),money(Math.max(res,cost-annual*(i+1)))]);r={cost,residual:res,useful_life:life,annual_depreciation:annual};html=table(['Year','Depreciation','Closing WDV'],rows)}
      if(slug==='gst-to-turnover-reconciliation'){const b=num(grBooks.value),g=num(grGst.value),a=num(grAdjust.value),variance=g-b-a;r={books_turnover:b,gst_turnover:g,known_adjustments:a,unexplained_variance:variance};html=table(['Metric','Value'],[['Books turnover',money(b)],['GST turnover',money(g)],['Known adjustments',money(a)],['Unexplained variance',money(variance)]])}
      document.getElementById('advResult').innerHTML='<strong>Advanced result</strong>'+html+'<div class="notice" style="margin-top:12px">Review source documents and applicable accounting/tax rules before filing, certification or statutory reporting.</div>';
      resultBox('',slug,r,r,c.title+' Report');
    };
    return true;
  }

  function openAdvanced(slug){
    if(slug==='bank-reconciliation')return bankReconciliation();
    if(slug==='trial-balance')return trialBalance();
    if(slug==='inventory-valuation')return inventoryValuation();
    if(slug==='fixed-asset-register')return fixedAssets();
    if(slug==='payroll-compliance-estimator')return payroll();
    // Existing catalog tools must continue through the authoritative core workflow.\n    // The additive layer owns only the five new accounting tools.\n    return false;
    return false;
  }

  function bind(){
    addCards();
    // The core catalog renderer runs first on DOMContentLoaded. Re-apply its
    // filter/count after the five additive cards are mounted so #toolCount
    // reflects the complete visible suite (213), without changing the
    // authoritative 208-item catalog.
    const search=document.getElementById('toolSearch');
    if(search) search.dispatchEvent(new Event('input',{bubbles:true}));
    document.addEventListener('click',e=>{
      const b=e.target.closest('.tool-open'); if(!b)return;
      const slug=b.dataset.tool;
      if(!openAdvanced(slug))return;
      e.preventDefault();
      e.stopImmediatePropagation();
    },true);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();
})();