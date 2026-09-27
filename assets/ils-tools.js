window.ILS_TOOLS = (() => {
  const esc = v => window.ILS?.esc ? ILS.esc(v) : String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const workspace = () => document.getElementById('toolWorkspace');

  const toolCopy = {
    'gst-calculator': ['GST Calculator','Calculate GST from a user-supplied rate and choose inclusive or exclusive pricing.'],
    'tds-calculator': ['TDS Calculator','Estimate TDS from a payment amount and a user-supplied applicable rate.'],
    'gst-interest-calculator': ['GST Interest Calculator','Calculate indicative simple interest from tax amount, annual rate and delay days.'],
    'professional-fee-calculator': ['Professional Fee Calculator','Create a transparent planning estimate from base fee, complexity, urgency and document load.'],
    'invoice-total-calculator': ['Invoice Total Calculator','Calculate discount, taxable value, GST and final invoice amount.'],
    'mca-compliance-checklist': ['MCA / CS Compliance Checklist','Organise common company-secretarial tasks for professional review.'],
    'tax-payment-planner': ['Tax Payment Planner','Plan remaining tax payment from estimated liability and amounts already paid.'],
    'compliance-deadline-planner': ['Compliance Deadline Planner','Create a planning date from an event date, period and optional buffer.'],
    'legal-deadline-calculator': ['Legal Deadline Calculator','Add or subtract calendar days from an event date. This is a date-planning aid, not a statutory limitation determination.'],
    'interest-calculator': ['Interest Calculator','Simple-interest calculation using principal, annual rate and time.'],
    'case-timeline': ['Case Timeline','Add dated events and generate a chronological case timeline.'],
    'case-checklist': ['Case Checklist','Create a practical document and preparation checklist.'],
    'cheque-bounce-timeline': ['Cheque Bounce Timeline','Organise the key Section 138 NI Act dates. The result is an indicative planning timeline and must be verified against the facts and applicable law.'],
    'limitation-calculator': ['Limitation Calculator','Apply a user-supplied limitation period to a start date. The tool does not determine the legally applicable limitation period or exclusions.'],
    'court-fee-calculator': ['Court Fee Estimator','Estimate a fee using a user-supplied rate/fixed amount. Court fees vary by court, state and proceeding.'],
    'stamp-duty-calculator': ['Stamp Duty Estimator','Estimate stamp duty using a user-supplied rate/fixed amount. State-specific stamp laws and transaction details must be verified.'],
    'maintenance-estimator': ['Maintenance Estimator','A financial-planning aid based on user inputs. It does not predict or recommend a court-ordered maintenance amount.'],
    'legal-problem-diagnostic': ['Legal Problem Diagnostic','Structured intake to identify possible legal routes for professional review; it is not a legal opinion.'],
    'case-preparation-tool': ['Case Preparation Tool','Organise facts, chronology, documents and questions for professional review.'],
    'property-document-checklist': ['Property Document Checklist','Organise common property documents before professional due diligence. Requirements vary by property, transaction and jurisdiction.'],
    'accounting-computation': ['Accounting Computation','Basic accounting computation from user-supplied figures. This is a calculation aid, not an audit, tax opinion or statutory accounts preparation.'],
    'balance-sheet-tool': ['Balance Sheet Tool','Prepare a basic balance sheet from user-supplied assets, liabilities and equity figures. The tool checks the accounting equation but does not certify accounts.'],
    'profit-loss-tool': ['Profit & Loss (P&L) Tool','Calculate revenue, cost of sales, gross profit, operating profit and net profit from user-supplied figures.']
  };

  const sources = {
    'cheque-bounce-timeline': '<a href="https://www.indiacode.nic.in/" target="_blank" rel="noopener">India Code — Negotiable Instruments Act, 1881</a> (Sections 138 and 142).',
    'limitation-calculator': '<a href="https://www.indiacode.nic.in/" target="_blank" rel="noopener">India Code — Limitation Act, 1963</a>.',
    'court-fee-calculator': '<a href="https://www.indiacode.nic.in/" target="_blank" rel="noopener">India Code — Court-Fees Act, 1870</a>; state/court rules may apply.',
    'maintenance-estimator': '<a href="https://www.indiacode.nic.in/" target="_blank" rel="noopener">India Code — Hindu Marriage Act, 1955</a> (Sections 24–25) and other applicable laws.',
    'stamp-duty-calculator': '<a href="https://www.indiacode.nic.in/" target="_blank" rel="noopener">India Code</a>; applicable stamp law and state amendments/rules must be verified.'
  };

  const serviceMap = {
    'legal-deadline-calculator':'legal-consultation',
    'interest-calculator':'legal-consultation',
    'case-timeline':'case-preparation-pack',
    'case-checklist':'case-preparation-pack',
    'cheque-bounce-timeline':'legal-notice-draft',
    'limitation-calculator':'legal-research-report',
    'court-fee-calculator':'legal-consultation',
    'stamp-duty-calculator':'property-due-diligence',
    'maintenance-estimator':'legal-consultation',
    'legal-problem-diagnostic':'legal-consultation',
    'case-preparation-tool':'case-preparation-pack',
    'property-document-checklist':'property-due-diligence',
    'accounting-print-basic':'accounting-print-basic',
    'accounting-print-guided':'accounting-print-guided',
    'accounting-print-professional':'professional-report',
    'gst-calculator':'professional-report-basic','tds-calculator':'professional-report-basic','gst-interest-calculator':'professional-report-basic','professional-fee-calculator':'professional-report-basic','invoice-total-calculator':'professional-report-basic','mca-compliance-checklist':'professional-report-basic','tax-payment-planner':'professional-report-basic','compliance-deadline-planner':'professional-report-basic',
    'tool-output-micro-9':'tool-output-micro-9','tool-output-micro-19':'tool-output-micro-19','tool-output-micro-29':'tool-output-micro-29','tool-output-micro-39':'tool-output-micro-39'
  };

  async function createOrder(slug, details, toolRunId=null, onPaid=null, options={}){
    const sb=window.ILS?.ready?.();
    if(!sb){ status('Service connection unavailable.'); return; }

    const {data:{user}}=await sb.auth.getUser();

    if(!user){
      status('Please sign in to start this paid service.');
      setTimeout(()=>{ window.location.href='portal.html#login'; },700);
      return;
    }

    const service=serviceMap[slug];
    if(!service){
      status('Paid service is not configured yet.');
      return;
    }

    const {data,error}=await sb.rpc('ils_create_service_order',{
      p_service_slug:service,
      p_details:details||{},
      p_tool_run_id:toolRunId
    });

    if(error||!data?.ok){
      status(error?.message||'Unable to create the service order.');
      return;
    }

    const box=document.getElementById('toolStatus');

    if(box){
      box.className='status ok';
      box.innerHTML=`Order <strong>${esc(data.order_number)}</strong> created for <strong>₹${Number(data.amount).toLocaleString('en-IN')}</strong>. <button type="button" class="btn btn-primary btn-small" id="payNowBtn" style="margin-left:8px">Pay Securely</button>`;
      document.getElementById('payNowBtn').onclick=()=>startRazorpay(data,onPaid,options.forceQr===true);
    }
  }

async function startRazorpay(data,onPaid=null,forceQr=false){
  try {
    const sb = window.ILS?.ready?.();

    if (!sb) {
      status('Service connection unavailable.');
      return;
    }

    if (!data?.order_id) {
      status('Internal order ID missing. Please try again.');
      return;
    }

    // Create Razorpay gateway order from our internal order
    status('Preparing secure payment…');

    let paymentData = null;
    let paymentError = null;

    if(forceQr){
      paymentError = { message: 'QR_PAYMENT_MODE' };
    }else{
      ({ data: paymentData, error: paymentError } =
        await sb.functions.invoke('razorpay-payments', {
          body: {
            action: 'create',
            order_id: data.order_id
          }
        }));
    }

    if (paymentError || !paymentData?.ok) {

  console.warn(
    'Razorpay unavailable. Using temporary UPI payment fallback.',
    paymentError || paymentData
  );

  const box = document.getElementById('toolStatus');
  const amount = Number(data.amount || 0);
  const upiId = '8445609837@axl';

  if (!box) {
    status('Payment screen could not be opened. Please try again.');
    return;
  }

  const upiLink =
    'upi://pay?pa=' + encodeURIComponent(upiId) +
    '&pn=' + encodeURIComponent('Instant Legal Services') +
    '&am=' + encodeURIComponent(amount.toFixed(2)) +
    '&cu=INR' +
    '&tn=' + encodeURIComponent(
      data.order_number || 'ILS Legal Service'
    );

  box.className = 'status ok';

  box.innerHTML = `
    <div style="text-align:center;padding:18px">

      <h3>Secure Payment</h3>

      <p>${forceQr ? 'Pay using the existing Instant Legal Services UPI QR.' : 'Razorpay is temporarily unavailable. The existing ILS UPI QR payment option is available.'}</p>

      <p style="font-size:24px;font-weight:700">
        ₹${amount.toLocaleString('en-IN')}
      </p>

      <img
        src="assets/ils-upi-qr.jpg"
        alt="Instant Legal Services UPI QR"
        style="
          width:min(280px,85vw);
          max-width:100%;
          background:#fff;
          padding:10px;
          border-radius:14px;
        "
      >

      <p style="margin-top:12px">
        <strong>UPI ID:</strong> ${esc(upiId)}
      </p>

      <a
        href="${upiLink}"
        class="btn btn-primary"
        style="
          display:inline-block;
          margin-top:10px;
          text-decoration:none;
        "
      >
        Pay via UPI App
      </a>

      <div id="upiProofPanel" style="margin-top:14px;padding:14px;border:1px solid rgba(255,255,255,.12);border-radius:12px;text-align:left">
        <strong>After payment: submit proof</strong>
        <p style="margin:6px 0 10px;opacity:.82">
          Upload the successful-payment screenshot showing <strong>Instant Legal Services</strong> as the payee and the exact payment amount.
        </p>
        <label for="upiTransactionRef">UPI Transaction ID / UTR</label>
        <input id="upiTransactionRef" type="text" maxlength="40" autocomplete="off" placeholder="Enter transaction ID / UTR">
        <label for="upiPayeeName" style="margin-top:10px">Payee name shown in screenshot</label>
        <input id="upiPayeeName" type="text" maxlength="120" autocomplete="off" placeholder="e.g. Instant Legal Services">
        <label for="upiPaymentScreenshot" style="margin-top:10px">Payment-success screenshot</label>
        <input id="upiPaymentScreenshot" type="file" accept="image/jpeg,image/png,image/webp">
        <small style="display:block;margin-top:7px;opacity:.75">
          JPG/PNG/WEBP only, maximum 5 MB. Do not upload your UPI PIN, password, OTP or other unrelated banking credentials.
        </small>
        <button type="button" class="btn btn-primary" id="upiPaidBtn" style="margin-top:12px;width:100%">
          Submit Payment Proof
        </button>
      </div>

      <div id="upiPaidNote" style="display:none;margin-top:14px;padding:12px;border-radius:10px"></div>

      <small style="display:block;margin-top:14px;opacity:.75;line-height:1.5">
        A screenshot is evidence, not an independent bank confirmation. Access is unlocked only after the proof is verified.
      </small>

    </div>
  `;

  const paidBtn = document.getElementById('upiPaidBtn');
  const paidNote = document.getElementById('upiPaidNote');
  const proofPanel = document.getElementById('upiProofPanel');

  if (paidBtn && paidNote && proofPanel) {
    let checking = false;
    let timer = null;
    let attempts = 0;
    const maxAttempts = 30;

    const stopWatch = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const showStatus = (message, kind='info') => {
      paidNote.style.display = 'block';
      paidNote.className = 'status ' + (kind === 'ok' ? 'ok' : '');
      paidNote.innerHTML = message;
    };

    const checkVerified = async () => {
      if (checking || !data?.order_id) return;
      checking = true;
      attempts++;

      try {
        const current = window.ILS?.ready?.();
        if (!current) return;

        const { data: result, error } = await current.rpc(
          'ils_get_upi_proof_status',
          { p_order_id: data.order_id }
        );

        if (error) {
          console.debug('UPI proof status check failed.', error);
          return;
        }

        if (result?.order_status === 'paid' || result?.proof_status === 'verified') {
          stopWatch();
          showStatus(
            'Payment proof verified. Order <strong>' +
            esc(result.order_number || data.order_number || '') +
            '</strong> is paid. Your requested access/report is now unlocked.',
            'ok'
          );
          if (typeof onPaid === 'function') onPaid();
          return;
        }

        if (result?.proof_status === 'rejected') {
          stopWatch();
          paidBtn.disabled = false;
          proofPanel.style.display = 'block';
          showStatus(
            'Payment proof was not verified. ' +
            esc(result.message || 'Please check the screenshot and transaction reference, then submit a new proof.')
          );
          return;
        }

        if (result?.proof_status === 'pending') {
          showStatus(
            'Payment proof submitted for order <strong>' +
            esc(result.order_number || data.order_number || '') +
            '</strong>. Verification is still pending; access remains locked.'
          );
        }

        if (attempts >= maxAttempts) {
          stopWatch();
          showStatus(
            'Verification is still pending. You can leave this page and return later; the order remains locked until the proof is verified.'
          );
        }
      } finally {
        checking = false;
      }
    };

    paidBtn.onclick = async () => {
      if (timer) return;

      const refInput = document.getElementById('upiTransactionRef');
      const payeeInput = document.getElementById('upiPayeeName');
      const fileInput = document.getElementById('upiPaymentScreenshot');
      const file = fileInput?.files?.[0];
      const transactionRef = (refInput?.value || '').trim().replace(/[^A-Za-z0-9]/g, '');
      const payeeName = (payeeInput?.value || '').trim();

      if (!file) {
        showStatus('Please upload the payment-success screenshot first.');
        return;
      }

      if (!['image/jpeg','image/png','image/webp'].includes(file.type)) {
        showStatus('Only JPG, PNG or WEBP payment screenshots are accepted.');
        return;
      }

      if (file.size <= 0 || file.size > 5 * 1024 * 1024) {
        showStatus('Payment screenshot must be smaller than 5 MB.');
        return;
      }

      if (transactionRef.length < 8 || transactionRef.length > 40) {
        showStatus('Enter the UPI Transaction ID / UTR shown in your payment history.');
        return;
      }

      if (!payeeName) {
        showStatus('Enter the payee name exactly as shown in the payment screenshot.');
        return;
      }

      paidBtn.disabled = true;
      paidBtn.textContent = 'Submitting proof…';

      try {
        const current = window.ILS?.ready?.();
        if (!current) throw new Error('Service connection unavailable.');

        const { data: authData, error: authError } = await current.auth.getUser();
        if (authError || !authData?.user) {
          throw new Error('Please sign in before submitting payment proof.');
        }

        const arrayBuffer = await file.arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const sha256 = Array.from(new Uint8Array(digest))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');

        const ext = file.type === 'image/png'
          ? 'png'
          : file.type === 'image/webp'
            ? 'webp'
            : 'jpg';

        const uniquePart = (crypto.randomUUID
          ? crypto.randomUUID()
          : Date.now() + '-' + Math.random().toString(36).slice(2));

        const path =
          authData.user.id + '/' +
          data.order_id + '/' +
          Date.now() + '-' + uniquePart + '.' + ext;

        const upload = await current.storage
          .from('payment-proofs')
          .upload(path, file, {
            cacheControl: '3600',
            contentType: file.type,
            upsert: false
          });

        if (upload.error) {
          throw new Error(upload.error.message || 'Payment screenshot upload failed.');
        }

        const { data: submitted, error: submitError } = await current.rpc(
          'ils_submit_upi_payment_proof',
          {
            p_order_id: data.order_id,
            p_amount: Number(data.amount || 0),
            p_upi_id: '8445609837@axl',
            p_transaction_ref: transactionRef,
            p_payee_name_claimed: payeeName,
            p_screenshot_path: path,
            p_screenshot_sha256: sha256,
            p_mime_type: file.type,
            p_file_size_bytes: file.size
          }
        );

        if (submitError || !submitted?.ok) {
          await current.storage.from('payment-proofs').remove([path]);
          throw new Error(
            submitError?.message ||
            submitted?.message ||
            'Payment proof could not be submitted.'
          );
        }

        proofPanel.style.display = 'none';
        paidBtn.textContent = 'Proof Submitted';
        showStatus(
          'Payment proof submitted for order <strong>' +
          esc(submitted.order_number || data.order_number || '') +
          '</strong>. The system has checked the order, amount, UPI destination, file type/size and proof linkage. Final access remains locked until the payment proof is verified.',
          'ok'
        );

        attempts = 0;
        await checkVerified();
        timer = setInterval(checkVerified, 10000);
      } catch (err) {
        console.error('UPI payment proof submission failed:', err);
        paidBtn.disabled = false;
        paidBtn.textContent = 'Submit Payment Proof';
        showStatus(err?.message || 'Unable to submit payment proof. Please try again.');
      }
    };
  }

  return;
}

    // Load Razorpay Checkout if not already loaded
    if (!window.Razorpay) {
      await new Promise((resolve, reject) => {
        const sc = document.createElement('script');
        sc.src = 'https://checkout.razorpay.com/v1/checkout.js';
        sc.onload = resolve;
        sc.onerror = reject;
        document.head.appendChild(sc);
      });
    }

    if (!window.Razorpay) {
      status('Payment checkout could not be loaded. Please try again.');
      return;
    }

    const options = {
      key: paymentData.key_id,
      amount: Math.round(Number(paymentData.amount) * 100),
      currency: paymentData.currency || 'INR',
      name: 'Instant Legal Services',
      description: data.service_name || 'ILS Legal Service',
      order_id: paymentData.razorpay_order_id,

      handler: async function(response) {
        status('Verifying payment securely…');

        const verifyResult =
          await sb.functions.invoke('razorpay-payments', {
            body: {
              action: 'verify',
              order_id: data.order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            }
          });

        const verified = verifyResult.data;
        const verifyError = verifyResult.error;

        if (verifyError || !verified?.ok) {
          console.error(
            'Payment verification error:',
            verifyError || verified
          );

          status(
            verifyError?.message ||
            verified?.error ||
            'Payment verification failed. Please check your order status before paying again.'
          );
          return;
        }

        const box = document.getElementById('toolStatus');

        if (box) {
          box.className = 'status ok';
          box.innerHTML =
            `Payment verified successfully. ` +
            `Order <strong>${esc(
              verified.order_number || data.order_number
            )}</strong> is now paid.`;
        }

        if(typeof onPaid === 'function') onPaid();
      },

      modal: {
        ondismiss: function() {
          status(
            'Payment window closed. Your order remains pending.'
          );
        }
      },

      theme: {
        color: '#0b5cff'
      }
    };

    const rzp = new Razorpay(options);

    rzp.on('payment.failed', function(r) {
      console.error('Razorpay payment failed:', r);

      status(
        r?.error?.description ||
        'Payment failed. Your order remains pending.'
      );
    });

    rzp.open();

  } catch (err) {
    console.error('startRazorpay error:', err);
    status(
      err?.message ||
      'Unable to start payment. Please try again.'
    );
  }
}

  const exportServices = {
    micro9: { slug:'tool-output-micro-9', name:'Quick Output', price:9, desc:'Simple result sheet + print / PDF' },
    micro19: { slug:'tool-output-micro-19', name:'Guided Output', price:19, desc:'Result + guided explanation + print / PDF' },
    micro29: { slug:'tool-output-micro-29', name:'Detailed Output', price:29, desc:'Detailed result + assumptions + print / PDF' },
    micro39: { slug:'tool-output-micro-39', name:'Professional Output', price:39, desc:'Professional result pack + print / PDF' },
    basic: { slug:'professional-report-basic', name:'Basic Report', price:45, desc:'Calculation summary + print / Save as PDF' },
    guided: { slug:'professional-report-guided', name:'Guided Report', price:85, desc:'Summary + step-by-step explanation + assumptions' },
    professional: { slug:'professional-report-professional', name:'Professional Report', price:125, desc:'Detailed inputs + formulas + guidance + print / PDF' }
  };
  const exportJobs = new Map();
  let exportJobSeq = 0;

  function exportRows(obj){
    return Object.entries(obj||{}).map(([k,v])=>`<tr><td>${esc(String(k).replace(/([A-Z])/g," $1"))}</td><td>${esc(String(v))}</td></tr>`).join("");
  }

  function exportCTA(toolSlug,input,result,title){
    const catalogTool=window.ILS_TOOL_CATALOG?.find(x=>x.slug===toolSlug);
    if(catalogTool?.category==='advocate'){
      return '<div class="notice" style="margin-top:16px"><strong>Tool is FREE — professional help is paid.</strong><p style="margin:6px 0">Use the result first. If you need advocate review, bail / arrest consultation, or complete case preparation, continue below.</p><div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="btn btn-primary tool-buy" data-service="legal-consultation">Legal Review / Consultation</button><button type="button" class="btn btn-primary tool-buy" data-service="legal-consultation">Bail / Arrest Consultation</button><button type="button" class="btn btn-primary tool-buy" data-service="case-preparation-tool">Case Preparation</button></div></div>';
    }
    const jobId=`accounting-export-${++exportJobSeq}`;
    exportJobs.set(jobId,{toolSlug,input,result,title});
    const cards=Object.entries(exportServices).map(([key,p])=>`<div class="card" style="padding:14px;flex:1;min-width:190px"><strong>${esc(p.name)}</strong><div style="font-size:1.25rem;font-weight:800;margin:6px 0">₹${p.price}</div><small>${esc(p.desc)}</small><button type="button" class="btn btn-primary tool-export-buy" data-export-job="${jobId}" data-export-service="${esc(p.slug)}" style="width:100%;margin-top:10px">Pay ₹${p.price} &amp; Unlock</button></div>`).join("");
    return `<div class="notice" style="margin-top:16px"><strong>Print / Save as PDF — Paid</strong><p style="margin:6px 0">Your calculation is free. Choose a report format only if you want a clean printable/PDF-ready copy.</p><div style="display:flex;gap:10px;flex-wrap:wrap">${cards}</div><small style="display:block;margin-top:10px">Payment is verified before the print/PDF option is unlocked. The report is an information/calculation aid and is not a statutory account or audit certificate.</small><div id="${jobId}-ready" style="margin-top:10px"></div></div>`;
  }

  function unlockExport(jobId){
    const job=exportJobs.get(jobId);
    const box=document.getElementById(`${jobId}-ready`);
    if(!job||!box)return;
    box.innerHTML=`<div class="status ok"><strong>Report unlocked.</strong><br><button type="button" class="btn btn-primary" id="${jobId}-print">Print / Save as PDF</button></div>`;
    document.getElementById(`${jobId}-print`).onclick=()=>printExport(job);
  }

  function printExport(job){
    const w=window.open("","_blank","width=900,height=700");
    if(!w){ status("Please allow pop-ups to print or save the PDF."); return; }
    const inputRows=exportRows(job.input);
    const resultRows=exportRows(job.result);
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(job.title)} — ILS Report</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#111;line-height:1.5}h1{margin-bottom:4px}h2{margin-top:24px}table{width:100%;border-collapse:collapse;margin:10px 0 18px}td{border:1px solid #ccc;padding:8px}td:first-child{font-weight:700;width:45%}.note{background:#f4f4f4;padding:12px;border-radius:8px}small{color:#555}@media print{body{padding:18px}}</style></head><body><h1>${esc(job.title)}</h1><small>Instant Legal Services • Accounting Tool Report • ${esc(new Date().toLocaleString("en-IN"))}</small><h2>Inputs</h2><table>${inputRows}</table><h2>Results</h2><table>${resultRows}</table><div class="note"><strong>Guidance:</strong> This report reproduces the figures entered and the calculations performed by the ILS tool. Verify accounting treatment, GST, depreciation, tax, adjustments and applicable accounting standards before filing or reporting. This is not an audit, statutory financial statement or professional certification.</div><p><small>Generated from Instant Legal Services accounting tools.</small></p></body></html>`);
    w.document.close();
    setTimeout(()=>w.print(),250);
  }

  function paidCTA(slug, details={}){
    const service=serviceMap[slug];
    if(!service)return '';

    return `<div class="actions" style="margin-top:14px"><button class="btn btn-primary tool-buy" data-service="${esc(slug)}">Get Professional Service</button></div>`;
  }
    function shell(title, description, body, sourceKey){
    workspace().innerHTML =
      `<div class="section-head">
        <div>
          <h2>${esc(title)}</h2>
          <p>${esc(description)}</p>
        </div>
        <button class="btn btn-ghost" id="toolBack">Back to Tools</button>
      </div>
      ${body}
      ${sourceKey && sources[sourceKey]
        ? `<div class="notice" style="margin-top:14px;font-size:.9rem">
             <strong>Source / legal basis:</strong> ${sources[sourceKey]}
           </div>`
        : ''}
      <div id="toolStatus" class="status"></div>`;

    document.getElementById('toolBack').onclick = () => {
      workspace().innerHTML =
        '<div class="empty">Select a tool above to begin.</div>';
      window.scrollTo({
        top:document.querySelector('.section').offsetTop-20,
        behavior:'smooth'
      });
    };
  }

  function status(message, ok=false){
    const el=document.getElementById('toolStatus');
    if(!el)return;
    el.textContent=message;
    el.className='status '+(ok?'ok':'err');
  }

  async function logRun(slug,input,result){
    try{
      const sb=window.ILS?.ready?.();
      if(!sb)return;

      const {data:{user}}=await sb.auth.getUser();
      if(!user)return;

      const {data:tool}=await sb
        .from('tool_catalog')
        .select('id')
        .eq('slug',slug)
        .eq('is_active',true)
        .maybeSingle();

      if(!tool)return;

      await sb.from('tool_runs').insert({
        tool_id:tool.id,
        user_id:user.id,
        input_data:input,
        result_data:result
      });
    }catch(e){
      console.debug('Tool history was not saved.',e);
    }
  }

  const dateObj = s => new Date(`${s}T12:00:00`);

  const fmt = d => d.toLocaleDateString('en-IN',{
    day:'2-digit',
    month:'long',
    year:'numeric'
  });

  function addDays(date, days){
    const d=new Date(date);
    d.setDate(d.getDate()+days);
    return d;
  }

  function addMonths(date, months){
    const d=new Date(date);
    const day=d.getDate();

    d.setDate(1);
    d.setMonth(d.getMonth()+months);

    const last=new Date(
      d.getFullYear(),
      d.getMonth()+1,
      0
    ).getDate();

    d.setDate(Math.min(day,last));
    return d;
  }

  function deadline(){
    const [t,d]=toolCopy['legal-deadline-calculator'];

    shell(
      t,
      d,
      `<div class="form-row">
        <div>
          <label for="dlDate">Event date</label>
          <input id="dlDate" type="date">
        </div>

        <div>
          <label for="dlDays">Calendar days</label>
          <input id="dlDays" type="number" min="0" step="1" placeholder="e.g. 30">
        </div>
      </div>

      <div class="actions" style="margin-top:14px">
        <button class="btn btn-primary" id="dlCalc">
          Calculate Date
        </button>
      </div>

      <div id="dlResult" class="notice" style="margin-top:14px;display:none"></div>`
    );

    document.getElementById('dlCalc').onclick=async()=>{
      const date=document.getElementById('dlDate').value;
      const days=Number(document.getElementById('dlDays').value);

      if(!date||!Number.isInteger(days)||days<0){
        status('Enter a valid event date and a whole number of days.');
        return;
      }

      const result=fmt(addDays(dateObj(date),days));

      const box=document.getElementById('dlResult');
      box.style.display='block';

      box.innerHTML=
        `<strong>Planned date: ${esc(result)}</strong>
        <br>
        <span>
          This adds ${days} calendar day${days===1?'':'s'}.
          Statutory exclusions, holidays, filing rules and
          jurisdiction-specific computation are not automatically applied.
        </span>
        ${paidCTA('legal-deadline-calculator',{date,days})}`;

      status('Calculation completed.',true);

      await logRun(
        'legal-deadline-calculator',
        {date,days},
        {planned_date:result}
      );
    };
  }

  function interest(){
    const [t,d]=toolCopy['interest-calculator'];

    shell(
      t,
      d,
      `<div class="form-row">
        <div>
          <label for="principal">Principal (₹)</label>
          <input id="principal" type="number" min="0" step="0.01">
        </div>

        <div>
          <label for="rate">Annual rate (%)</label>
          <input id="rate" type="number" min="0" step="0.01">
        </div>
      </div>

      <div>
        <label for="years">Time (years)</label>
        <input id="years" type="number" min="0" step="0.01">
      </div>

      <div class="actions" style="margin-top:14px">
        <button class="btn btn-primary" id="intCalc">
          Calculate Interest
        </button>
      </div>

      <div id="intResult" class="notice" style="margin-top:14px;display:none"></div>`
    );

    document.getElementById('intCalc').onclick=async()=>{
      const p=Number(principal.value);
      const r=Number(rate.value);
      const y=Number(years.value);

      if(![p,r,y].every(Number.isFinite)||p<0||r<0||y<0){
        status('Enter valid non-negative numbers.');
        return;
      }

      const interest=p*r*y/100;
      const total=p+interest;

      const money=n=>n.toLocaleString('en-IN',{
        style:'currency',
        currency:'INR',
        maximumFractionDigits:2
      });

      intResult.style.display='block';

      intResult.innerHTML=
        `<strong>Simple interest: ${money(interest)}</strong>
        <br>
        Total: ${money(total)}
        <br>
        <small>
          This is simple interest only; agreements, statutes
          and court awards may use different rules.
        </small>
        ${paidCTA('interest-calculator',{principal:p,rate:r,years:y})}`;

      status('Calculation completed.',true);

      await logRun(
        'interest-calculator',
        {principal:p,rate:r,years:y},
        {interest,total}
      );
    };
  }

  function timeline(){
    const [t,d]=toolCopy['case-timeline'];

    shell(
      t,
      d,
      `<div id="tlRows"></div>

      <div class="actions" style="margin-top:12px">
        <button class="btn btn-ghost" id="tlAdd">+ Add Event</button>
        <button class="btn btn-primary" id="tlMake">Generate Timeline</button>
      </div>

      <div id="tlResult" class="notice" style="margin-top:14px;display:none"></div>`
    );

    const rows=document.getElementById('tlRows');
    let n=0;

    const add=()=>{
      n++;

      const div=document.createElement('div');
      div.className='form-row';
      div.style.marginBottom='9px';

      div.innerHTML=
        `<div>
          <label>Event ${n} date</label>
          <input class="tl-date" type="date">
        </div>

        <div>
          <label>Event ${n} description</label>
          <input class="tl-desc" maxlength="200" placeholder="e.g. FIR filed">
        </div>`;

      rows.appendChild(div);
    };

    add();
    add();

    tlAdd.onclick=add;

    tlMake.onclick=async()=>{
      const data=[...rows.querySelectorAll('.form-row')]
        .map(r=>({
          date:r.querySelector('.tl-date').value,
          description:r.querySelector('.tl-desc').value.trim()
        }))
        .filter(x=>x.date&&x.description)
        .sort((a,b)=>a.date.localeCompare(b.date));

      if(!data.length){
        status('Add at least one dated event.');
        return;
      }

      tlResult.style.display='block';

      tlResult.innerHTML=data.map((x,i)=>
        `<div style="padding:7px 0;border-bottom:1px solid var(--line)">
          <strong>${i+1}. ${esc(new Date(x.date+'T12:00:00').toLocaleDateString('en-IN'))}</strong>
          — ${esc(x.description)}
        </div>`
      ).join('');

      status('Timeline generated.',true);

      await logRun(
        'case-timeline',
        {events:data},
        {events:data}
      );
    };
  }

  function checklist(){
    const [t,d]=toolCopy['case-checklist'];

    shell(
      t,
      d,
      `<label for="clMatter">Matter / case type</label>
      <input id="clMatter" maxlength="120" placeholder="e.g. Property dispute">

      <label for="clItems">Checklist items (one per line)</label>
      <textarea id="clItems" placeholder="Agreement / deed
Identity documents
Previous orders"></textarea>

      <div class="actions" style="margin-top:12px">
        <button class="btn btn-primary" id="clMake">
          Create Checklist
        </button>
      </div>

      <div id="clResult" class="notice" style="margin-top:14px;display:none"></div>`
    );

    clMake.onclick=async()=>{
      const matter=clMatter.value.trim();

      const items=clItems.value
        .split(/\n+/)
        .map(x=>x.trim())
        .filter(Boolean);

      if(!matter||!items.length){
        status('Enter a matter type and at least one checklist item.');
        return;
      }

      clResult.style.display='block';

      clResult.innerHTML=
        `<strong>${esc(matter)}</strong>
        <ul>
          ${items.map(x=>`<li>${esc(x)}</li>`).join('')}
        </ul>`;

      status('Checklist created.',true);

      await logRun(
        'case-checklist',
        {matter,items},
        {matter,items}
      );
    };
  }
    function cheque(){
    const [t,d]=toolCopy['cheque-bounce-timeline'];

    shell(
      t,
      d,
      `<div class="form-row">
        <div>
          <label for="cbDish">Bank dishonour / return information date</label>
          <input id="cbDish" type="date">
        </div>

        <div>
          <label for="cbNotice">Notice date (optional)</label>
          <input id="cbNotice" type="date">
        </div>
      </div>

      <div class="actions" style="margin-top:14px">
        <button class="btn btn-primary" id="cbCalc">
          Build Timeline
        </button>
      </div>

      <div id="cbResult" class="notice" style="margin-top:14px;display:none"></div>`,
      'cheque-bounce-timeline'
    );

    cbCalc.onclick=async()=>{
      if(!cbDish.value){
        status('Enter the bank dishonour / return information date.');
        return;
      }

      const dis=dateObj(cbDish.value);
      const noticeDate=cbNotice.value
        ? dateObj(cbNotice.value)
        : addDays(dis,30);

      const payment=addDays(noticeDate,15);
      const cause=addMonths(payment,1);

      cbResult.style.display='block';

      cbResult.innerHTML=
        `<strong>Indicative timeline</strong>
        <ul>
          <li>30-day notice window:
            <strong>${esc(fmt(addDays(dis,30)))}</strong>
          </li>
          <li>Notice date used:
            <strong>${esc(fmt(noticeDate))}</strong>
          </li>
          <li>15-day payment period ends:
            <strong>${esc(fmt(payment))}</strong>
          </li>
          <li>Indicative complaint timing:
            <strong>${esc(fmt(cause))}</strong>
          </li>
        </ul>
        <small>
          Section 138/142 computation depends on valid service,
          cause of action, jurisdiction and other facts.
          This is not a filing deadline determination.
        </small>
        ${paidCTA('cheque-bounce-timeline',{
          dishonour_date:cbDish.value,
          notice_date:cbNotice.value||null
        })}`;

      status('Timeline prepared.',true);

      await logRun(
        'cheque-bounce-timeline',
        {
          dishonour_date:cbDish.value,
          notice_date:cbNotice.value||null
        },
        {
          notice_window_end:fmt(addDays(dis,30)),
          payment_period_end:fmt(payment),
          indicative_complaint_date:fmt(cause)
        }
      );
    };
  }

  function limitation(){
    const [t,d]=toolCopy['limitation-calculator'];

    shell(
      t,
      d,
      `<div class="form-row">
        <div>
          <label for="limStart">Starting date</label>
          <input id="limStart" type="date">
        </div>

        <div>
          <label for="limPeriod">Period</label>
          <input id="limPeriod" type="number" min="0" step="1" placeholder="e.g. 3">
        </div>
      </div>

      <div>
        <label for="limUnit">Unit</label>
        <select id="limUnit">
          <option value="years">Years</option>
          <option value="months">Months</option>
          <option value="days">Days</option>
        </select>
      </div>

      <div class="actions" style="margin-top:14px">
        <button class="btn btn-primary" id="limCalc">
          Calculate Planning Date
        </button>
      </div>

      <div id="limResult" class="notice" style="margin-top:14px;display:none"></div>`,
      'limitation-calculator'
    );

    limCalc.onclick=async()=>{
      const p=Number(limPeriod.value);

      if(!limStart.value||!Number.isInteger(p)||p<0){
        status('Enter a valid date and whole-number period.');
        return;
      }

      const d0=dateObj(limStart.value);

      const unit=limUnit.value;

      const res=
        unit==='years'
          ? addMonths(d0,p*12)
          : unit==='months'
            ? addMonths(d0,p)
            : addDays(d0,p);

      limResult.style.display='block';

      limResult.innerHTML=
        `<strong>Planning date: ${esc(fmt(res))}</strong>
        <br>
        <small>
          This simply applies the period you entered.
          The Limitation Act and procedural rules can involve
          different starting points, exclusions, acknowledgements,
          extensions/condonation and other facts.
        </small>
        ${paidCTA('limitation-calculator',{
          start:limStart.value,
          period:p,
          unit:unit
        })}`;

      status('Planning calculation completed.',true);

      await logRun(
        'limitation-calculator',
        {
          start:limStart.value,
          period:p,
          unit
        },
        {
          planning_date:fmt(res)
        }
      );
    };
  }

  function rateEstimator(
    slug,
    title,
    desc,
    rateLabel,
    disclaimer
  ){
    shell(
      title,
      desc,
      `<div class="form-row">
        <div>
          <label for="estValue">Base amount / value (₹)</label>
          <input id="estValue" type="number" min="0" step="0.01">
        </div>

        <div>
          <label for="estRate">${esc(rateLabel)} (%)</label>
          <input id="estRate" type="number" min="0" step="0.01">
        </div>
      </div>

      <div>
        <label for="estFixed">Fixed fee (₹), if any</label>
        <input id="estFixed" type="number" min="0" step="0.01" value="0">
      </div>

      <div class="actions" style="margin-top:14px">
        <button class="btn btn-primary" id="estCalc">
          Estimate
        </button>
      </div>

      <div id="estResult" class="notice" style="margin-top:14px;display:none"></div>`,
      slug
    );

    estCalc.onclick=async()=>{
      const v=Number(estValue.value);
      const r=Number(estRate.value);
      const f=Number(estFixed.value);

      if(![v,r,f].every(Number.isFinite)||v<0||r<0||f<0){
        status('Enter valid non-negative numbers.');
        return;
      }

      const fee=v*r/100+f;

      estResult.style.display='block';

      estResult.innerHTML=
        `<strong>
          Estimated amount:
          ${fee.toLocaleString('en-IN',{
            style:'currency',
            currency:'INR'
          })}
        </strong>
        <br>
        <small>${esc(disclaimer)}</small>
        ${paidCTA(slug,{
          base_value:v,
          rate:r,
          fixed_fee:f
        })}`;

      status('Estimate completed.',true);

      await logRun(
        slug,
        {
          base_value:v,
          rate:r,
          fixed_fee:f
        },
        {
          estimated_fee:fee
        }
      );
    };
  }

  function maintenance(){
    const [t,d]=toolCopy['maintenance-estimator'];

    shell(
      t,
      d,
      `<div class="form-row">
        <div>
          <label for="mIncome">Applicant monthly net income (₹)</label>
          <input id="mIncome" type="number" min="0">
        </div>

        <div>
          <label for="mOther">Other monthly income/resources (₹)</label>
          <input id="mOther" type="number" min="0" value="0">
        </div>
      </div>

      <div class="form-row">
        <div>
          <label for="mDepend">Number of dependants</label>
          <input id="mDepend" type="number" min="1" step="1" value="1">
        </div>

        <div>
          <label for="mNeed">Monthly essential household needs (₹)</label>
          <input id="mNeed" type="number" min="0" value="0">
        </div>
      </div>

      <div class="actions" style="margin-top:14px">
        <button class="btn btn-primary" id="mCalc">
          Show Budget Snapshot
        </button>
      </div>

      <div id="mResult" class="notice" style="margin-top:14px;display:none"></div>`,
      'maintenance-estimator'
    );

    mCalc.onclick=async()=>{
      const i=Number(mIncome.value);
      const o=Number(mOther.value);
      const dep=Number(mDepend.value);
      const need=Number(mNeed.value);

      if(
        ![i,o,dep,need].every(Number.isFinite)||
        i<0||o<0||dep<1||need<0
      ){
        status('Enter valid values.');
        return;
      }

      const available=i+o-need;
      const per=available>0?available/dep:0;

      mResult.style.display='block';

      mResult.innerHTML=
        `<strong>
          Available monthly amount after stated needs:
          ₹${Math.max(0,available).toLocaleString('en-IN')}
        </strong>
        <br>
        Indicative amount per dependant:
        ₹${per.toLocaleString('en-IN',{
          maximumFractionDigits:2
        })}
        <br>
        <small>
          This is only a budgeting snapshot.
          Courts consider facts, income, needs, status,
          liabilities and the applicable law; there is no
          universal percentage formula.
        </small>
        ${paidCTA('maintenance-estimator',{
          income:i,
          other_income:o,
          dependants:dep,
          needs:need
        })}`;

      status('Budget snapshot completed.',true);

      await logRun(
        'maintenance-estimator',
        {
          income:i,
          other_income:o,
          dependants:dep,
          needs:need
        },
        {
          available,
          per_dependant:per
        }
      );
    };
  }

  function diagnostic(){
    const [t,d]=toolCopy['legal-problem-diagnostic'];

    shell(
      t,
      d,
      `<label for="diagCategory">Problem category</label>
      <select id="diagCategory">
        <option value="">Select</option>
        <option>Money / Recovery</option>
        <option>Cheque Bounce</option>
        <option>Property</option>
        <option>Criminal / FIR</option>
        <option>Matrimonial / Family</option>
        <option>Consumer</option>
        <option>Labour / Employment</option>
        <option>Cyber Fraud</option>
        <option>Contract / Business</option>
        <option>Other</option>
      </select>

      <label for="diagState">State / jurisdiction</label>
      <input id="diagState" maxlength="80">

      <label for="diagFacts">Brief facts</label>
      <textarea id="diagFacts" maxlength="3000" placeholder="What happened, when, and what outcome do you need?"></textarea>

      <div class="actions" style="margin-top:14px">
        <button class="btn btn-primary" id="diagMake">
          Create Diagnostic Summary
        </button>
      </div>

      <div id="diagResult" class="notice" style="margin-top:14px;display:none"></div>`
    );

    diagMake.onclick=async()=>{
      const c=diagCategory.value;
      const s=diagState.value.trim();
      const f=diagFacts.value.trim();

      if(!c||!s||f.length<10){
        status(
          'Select a category, enter jurisdiction and provide at least a short factual summary.'
        );
        return;
      }

      const routes={
        "Money / Recovery":"Recovery / civil or commercial remedy review",
        "Cheque Bounce":"NI Act Section 138 timeline and notice review",
        "Property":"Title / possession / document due-diligence review",
        "Criminal / FIR":"FIR, arrest, bail and criminal-procedure review",
        "Matrimonial / Family":"Family-law remedy and documentation review",
        "Consumer":"Consumer-law forum and limitation review",
        "Labour / Employment":"Employment / labour-law remedy review",
        "Cyber Fraud":"Bank/cyber reporting and legal-assistance review",
        "Contract / Business":"Contract, notice and recovery/commercial review",
        "Other":"Issue-specific professional review"
      };

      diagResult.style.display='block';

      diagResult.innerHTML=
        `<strong>Possible route for review:</strong>
        ${esc(routes[c])}
        <br>
        <strong>Jurisdiction:</strong> ${esc(s)}
        <br>
        <strong>Next step:</strong>
        organise documents, dates and evidence before professional assessment.
        ${paidCTA('legal-problem-diagnostic',{
          category:c,
          state:s,
          facts:f
        })}`;

      status('Diagnostic summary created.',true);

      await logRun(
        'legal-problem-diagnostic',
        {
          category:c,
          state:s,
          facts:f
        },
        {
          possible_route:routes[c]
        }
      );
    };
  }

  function casePrep(){
    const [t,d]=toolCopy['case-preparation-tool'];

    shell(
      t,
      d,
      `<label for="cpTitle">Matter title</label>
      <input id="cpTitle" maxlength="150">

      <label for="cpFacts">Key facts / chronology</label>
      <textarea id="cpFacts" maxlength="5000"></textarea>

      <label for="cpIssues">Issues / questions to resolve</label>
      <textarea id="cpIssues" maxlength="3000"></textarea>

      <label for="cpDocs">Documents available (one per line)</label>
      <textarea id="cpDocs" maxlength="3000"></textarea>

      <div class="actions" style="margin-top:14px">
        <button class="btn btn-primary" id="cpMake">
          Prepare Case Pack
        </button>
      </div>

      <div id="cpResult" class="notice" style="margin-top:14px;display:none"></div>`
    );

    cpMake.onclick=async()=>{
      const title=cpTitle.value.trim();
      const facts=cpFacts.value.trim();
      const issues=cpIssues.value.trim();

      const docs=cpDocs.value
        .split(/\n+/)
        .map(x=>x.trim())
        .filter(Boolean);

      if(!title||facts.length<10){
        status('Enter a matter title and meaningful facts.');
        return;
      }

      cpResult.style.display='block';

      cpResult.innerHTML=
        `<strong>${esc(title)}</strong>
        <h4>Facts</h4>
        <p>${esc(facts).replace(/\n/g,'<br>')}</p>

        <h4>Issues</h4>
        <p>${esc(issues||'Not provided').replace(/\n/g,'<br>')}</p>

        <h4>Documents</h4>
        <ul>
          ${(docs.length?docs:['No documents listed'])
            .map(x=>`<li>${esc(x)}</li>`).join('')}
        </ul>

        <small>
          Preparation aid only; it is not a legal opinion
          or substitute for professional review.
        </small>
        ${paidCTA('case-preparation-tool',{
          title,
          facts,
          issues,
          documents:docs
        })}`;

      status('Case preparation pack created.',true);

      await logRun(
        'case-preparation-tool',
        {
          title,
          facts,
          issues,
          documents:docs
        },
        {
          title,
          facts,
          issues,
          documents:docs
        }
      );
    };
  }


  function accountingComputation(){
    const [t,d]=toolCopy['accounting-computation'];
    shell(t,d,`
      <div class="notice" style="margin-bottom:14px"><strong>Easy guide:</strong> 1) Revenue = total sales. 2) Direct cost = cost directly linked to goods/services. 3) Operating expenses = rent, salary, electricity etc. 4) Other income/expense = items outside normal operations.<br><strong>Example:</strong> Sales ₹1,00,000 − direct cost ₹60,000 = Gross Profit ₹40,000; − expenses ₹20,000 = Operating Profit ₹20,000.</div><label for="acRevenue">Revenue / Sales (₹)</label><input id="acRevenue" type="number" min="0" step="0.01" value="0">
      <label for="acCost">Cost of goods / direct cost (₹)</label><input id="acCost" type="number" min="0" step="0.01" value="0">
      <label for="acOperating">Operating expenses (₹)</label><input id="acOperating" type="number" min="0" step="0.01" value="0">
      <label for="acOtherIncome">Other income (₹)</label><input id="acOtherIncome" type="number" min="0" step="0.01" value="0">
      <label for="acOtherExpense">Other expenses / finance cost (₹)</label><input id="acOtherExpense" type="number" min="0" step="0.01" value="0">
      <div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="acMake">Compute</button></div>
      <div id="acResult" class="notice" style="margin-top:14px;display:none"></div>`);
    acMake.onclick=async()=>{
      const revenue=Number(acRevenue.value)||0,cost=Number(acCost.value)||0,operating=Number(acOperating.value)||0,otherIncome=Number(acOtherIncome.value)||0,otherExpense=Number(acOtherExpense.value)||0;
      const gross=revenue-cost, operatingProfit=gross-operating, net=operatingProfit+otherIncome-otherExpense;
      const money=x=>`₹${x.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
      acResult.style.display='block';
      acResult.innerHTML=`<strong>Accounting Computation</strong><p>Revenue: ${money(revenue)}<br>Gross Profit: ${money(gross)}<br>Operating Profit: ${money(operatingProfit)}<br><strong>Net Profit / (Loss): ${money(net)}</strong></p><small>Calculation aid only. Verify accounting treatment, GST, depreciation, tax and applicable accounting standards with a qualified professional.</small>${exportCTA('accounting-computation',{revenue,cost,operating,otherIncome,otherExpense},{gross,operatingProfit,net},'Accounting Computation')}`;
      status('Accounting computation completed.',true);
      await logRun('accounting-computation',{revenue,cost,operating,otherIncome,otherExpense},{gross,operatingProfit,net});
    };
  }

  function balanceSheetTool(){
    const [t,d]=toolCopy['balance-sheet-tool'];
    shell(t,d,`
      <h4>Assets</h4>
      <div class="notice" style="margin-bottom:14px"><strong>Easy guide:</strong> Assets are what the business owns/controls. Liabilities are what it owes. Equity is the owner's capital/interest.<br><strong>Rule:</strong> Assets must equal Liabilities + Equity.<br><strong>Example:</strong> Assets ₹1,00,000 and liabilities ₹60,000 means equity should be ₹40,000.</div><label for="bsCash">Cash &amp; bank (₹)</label><input id="bsCash" type="number" min="0" step="0.01" value="0">
      <label for="bsReceivables">Receivables (₹)</label><input id="bsReceivables" type="number" min="0" step="0.01" value="0">
      <label for="bsInventory">Inventory (₹)</label><input id="bsInventory" type="number" min="0" step="0.01" value="0">
      <label for="bsFixed">Fixed / other assets (₹)</label><input id="bsFixed" type="number" min="0" step="0.01" value="0">
      <h4>Liabilities &amp; Equity</h4>
      <label for="bsPayables">Payables / current liabilities (₹)</label><input id="bsPayables" type="number" min="0" step="0.01" value="0">
      <label for="bsDebt">Loans / borrowings (₹)</label><input id="bsDebt" type="number" min="0" step="0.01" value="0">
      <label for="bsEquity">Capital / equity (₹)</label><input id="bsEquity" type="number" min="0" step="0.01" value="0">
      <div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="bsMake">Prepare Balance Sheet</button></div>
      <div id="bsResult" class="notice" style="margin-top:14px;display:none"></div>`);
    bsMake.onclick=async()=>{
      const vals=[bsCash,bsReceivables,bsInventory,bsFixed,bsPayables,bsDebt,bsEquity].map(x=>Number(x.value)||0);
      const [cash,receivables,inventory,fixedAssets,payables,debt,equity]=vals;
      const assets=cash+receivables+inventory+fixedAssets, liabEquity=payables+debt+equity, difference=assets-liabEquity;
      const money=x=>`₹${x.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
      bsResult.style.display='block';
      bsResult.innerHTML=`<strong>Balance Sheet Check</strong><p>Total Assets: ${money(assets)}<br>Total Liabilities + Equity: ${money(liabEquity)}<br>Difference: ${money(difference)}</p><strong>${Math.abs(difference)<0.01?'✓ Accounting equation balances':'⚠️ Difference remains — review the entered figures.'}</strong><br><small>This tool does not certify or prepare statutory financial statements.</small>${exportCTA('balance-sheet-tool',{cash,receivables,inventory,fixedAssets,payables,debt,equity},{assets,liabEquity,difference},'Balance Sheet Report')}`;
      status('Balance sheet calculation completed.',true);
      await logRun('balance-sheet-tool',{cash,receivables,inventory,fixedAssets,payables,debt,equity},{assets,liabEquity,difference});
    };
  }

  function profitLossTool(){
    const [t,d]=toolCopy['profit-loss-tool'];
    shell(t,d,`
      <div class="notice" style="margin-bottom:14px"><strong>Easy guide:</strong> Revenue − Cost of Sales = Gross Profit; Gross Profit − Operating Expenses = Operating Profit; then add other income, subtract finance cost and tax as shown.<br><strong>Example:</strong> Sales ₹1,00,000 − cost ₹60,000 − expenses ₹20,000 = Operating Profit ₹20,000.</div><label for="plRevenue">Revenue / Sales (₹)</label><input id="plRevenue" type="number" min="0" step="0.01" value="0">
      <label for="plCOGS">Cost of sales / direct expenses (₹)</label><input id="plCOGS" type="number" min="0" step="0.01" value="0">
      <label for="plOperating">Operating expenses (₹)</label><input id="plOperating" type="number" min="0" step="0.01" value="0">
      <label for="plFinance">Finance cost / interest (₹)</label><input id="plFinance" type="number" min="0" step="0.01" value="0">
      <label for="plOtherIncome">Other income (₹)</label><input id="plOtherIncome" type="number" min="0" step="0.01" value="0">
      <label for="plTax">Income tax provision (₹)</label><input id="plTax" type="number" min="0" step="0.01" value="0">
      <div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="plMake">Calculate P&amp;L</button> <button class="btn btn-secondary" type="button" id="plAccountingMode">Simple Accounting Computation</button></div>
      <div id="plResult" class="notice" style="margin-top:14px;display:none"></div>`);
    plAccountingMode.onclick=()=>accountingComputation();
    plMake.onclick=async()=>{
      const revenue=Number(plRevenue.value)||0,cogs=Number(plCOGS.value)||0,operating=Number(plOperating.value)||0,finance=Number(plFinance.value)||0,otherIncome=Number(plOtherIncome.value)||0,tax=Number(plTax.value)||0;
      const gross=revenue-cogs, operatingProfit=gross-operating, profitBeforeTax=operatingProfit+otherIncome-finance, netProfit=profitBeforeTax-tax;
      const money=x=>`₹${x.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
      plResult.style.display='block';
      plResult.innerHTML=`<strong>Profit &amp; Loss Statement</strong><p>Revenue: ${money(revenue)}<br>Gross Profit: ${money(gross)}<br>Operating Profit: ${money(operatingProfit)}<br>Profit Before Tax: ${money(profitBeforeTax)}<br><strong>Profit After Tax / (Loss): ${money(netProfit)}</strong></p><small>Tax and accounting treatment are illustrative only; verify applicable tax rules, accounting standards and adjustments before filing or reporting.</small>${exportCTA('profit-loss-tool',{revenue,cogs,operating,finance,otherIncome,tax},{gross,operatingProfit,profitBeforeTax,netProfit},'Profit & Loss Report')}`;
      status('P&amp;L calculation completed.',true);
      await logRun('profit-loss-tool',{revenue,cogs,operating,finance,otherIncome,tax},{gross,operatingProfit,profitBeforeTax,netProfit});
    };
  }

  function propertyChecklist(){
    const [t,d]=toolCopy['property-document-checklist'];

    const common=[
      'Title / sale deed',
      'Previous chain documents',
      'Mutation / revenue records',
      'Latest property tax receipts',
      'Encumbrance / search report where applicable',
      'Approved map / sanctioned plan where applicable',
      'Identity and authority documents of parties',
      'Possession / handover evidence',
      'Existing loan / mortgage release documents where applicable',
      'Litigation / notice information if any'
    ];

    shell(
      t,
      d,
      `<label for="pcType">Transaction / property type</label>
      <select id="pcType">
        <option>Sale / Purchase</option>
        <option>Gift</option>
        <option>Inheritance</option>
        <option>Mortgage / Loan</option>
        <option>Commercial Property</option>
        <option>Other</option>
      </select>

      <p>Select the documents you have:</p>

      <div id="pcItems">
        ${common.map((x,i)=>
          `<label style="display:block;margin:8px 0">
            <input type="checkbox" value="${esc(x)}">
            ${esc(x)}
          </label>`
        ).join('')}
      </div>

      <div class="actions" style="margin-top:14px">
        <button class="btn btn-primary" id="pcMake">
          Create Checklist
        </button>
      </div>

      <div id="pcResult" class="notice" style="margin-top:14px;display:none"></div>`,
      'property-document-checklist'
    );

    pcMake.onclick=async()=>{
      const type=pcType.value;

      const have=[
        ...pcItems.querySelectorAll('input:checked')
      ].map(x=>x.value);

      const missing=common.filter(
        x=>!have.includes(x)
      );

      pcResult.style.display='block';

      pcResult.innerHTML=
        `<strong>${esc(type)}</strong>
        <h4>Documents to organise / verify</h4>
        <ul>
          ${
            missing.map(x=>`<li>${esc(x)}</li>`).join('')
            ||
            '<li>All common checklist items selected.</li>'
          }
        </ul>

        <small>
          This is a general checklist, not a title-clearance opinion.
          Requirements vary by state, property and transaction.
        </small>

        ${paidCTA('property-document-checklist',{
          type:type,
          available:have
        })}`;

      status('Property checklist created.',true);

      await logRun(
        'property-document-checklist',
        {
          type,
          available:have
        },
        {
          missing
        }
      );
    };
  }


  function professionalResult(title,description,body,sourceKey){
    shell(title,description,body,sourceKey);
  }

  function gstCalculator(){
    const [t,d]=toolCopy['gst-calculator'];
    shell(t,d,`<div class="notice"><strong>Guide:</strong> Select whether your entered amount includes GST. Enter the applicable GST rate. Verify the rate/HSN-SAC and place-of-supply treatment before invoicing.</div>
      <label>Price mode</label><select id="gstMode"><option value="exclusive">Amount before GST</option><option value="inclusive">Amount including GST</option></select>
      <div class="form-row"><div><label>Amount (₹)</label><input id="gstAmount" type="number" min="0" step="0.01"></div><div><label>GST rate (%)</label><input id="gstRate" type="number" min="0" step="0.01" placeholder="e.g. 18"></div></div>
      <label>Tax type</label><select id="gstType"><option value="cgstsgst">CGST + SGST</option><option value="igst">IGST</option></select>
      <div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="gstCalc">Calculate GST</button></div><div id="gstResult" class="notice" style="margin-top:14px;display:none"></div>`);
    gstCalc.onclick=async()=>{const a=Number(gstAmount.value),r=Number(gstRate.value);if(!Number.isFinite(a)||!Number.isFinite(r)||a<0||r<0){status('Enter valid non-negative values.');return;}const inclusive=gstMode.value==='inclusive';const base=inclusive?a/(1+r/100):a;const tax=base*r/100;const total=inclusive?a:base+tax;const type=gstType.value;const half=tax/2;gstResult.style.display='block';gstResult.innerHTML=`<strong>Taxable value: ₹${base.toLocaleString('en-IN',{maximumFractionDigits:2})}</strong><br>GST: ₹${tax.toLocaleString('en-IN',{maximumFractionDigits:2})}<br>${type==='igst'?'IGST':'CGST: ₹'+half.toLocaleString('en-IN',{maximumFractionDigits:2})+' · SGST: ₹'+half.toLocaleString('en-IN',{maximumFractionDigits:2})}<br><strong>Invoice total: ₹${total.toLocaleString('en-IN',{maximumFractionDigits:2})}</strong><br><small>Rate and tax treatment are user inputs; verify current GST law, HSN/SAC and place of supply.</small>${exportCTA('gst-calculator',{mode:gstMode.value,amount:a,rate:r,type},{base,tax,total},'GST Calculator Report')}`;status('GST calculation completed.',true);await logRun('gst-calculator',{mode:gstMode.value,amount:a,rate:r,type},{base,tax,total});};
  }

  function tdsCalculator(){
    const [t,d]=toolCopy['tds-calculator'];
    shell(t,d,`<div class="notice"><strong>Guide:</strong> Enter the gross payment and the applicable TDS rate after checking the relevant section, threshold, PAN status and current rules.</div>
      <div class="form-row"><div><label>Gross payment (₹)</label><input id="tdsAmount" type="number" min="0" step="0.01"></div><div><label>Applicable TDS rate (%)</label><input id="tdsRate" type="number" min="0" step="0.01"></div></div>
      <div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="tdsCalc">Calculate TDS</button></div><div id="tdsResult" class="notice" style="margin-top:14px;display:none"></div>`);
    tdsCalc.onclick=async()=>{const a=Number(tdsAmount.value),r=Number(tdsRate.value);if(!Number.isFinite(a)||!Number.isFinite(r)||a<0||r<0){status('Enter valid non-negative values.');return;}const tax=a*r/100,net=a-tax;tdsResult.style.display='block';tdsResult.innerHTML=`<strong>TDS: ₹${tax.toLocaleString('en-IN',{maximumFractionDigits:2})}</strong><br>Net amount: ₹${net.toLocaleString('en-IN',{maximumFractionDigits:2})}<br><small>This is a calculation aid, not a determination of the legally applicable TDS rate or threshold.</small>${exportCTA('tds-calculator',{amount:a,rate:r},{tds:tax,net},'TDS Calculator Report')}`;status('TDS calculation completed.',true);await logRun('tds-calculator',{amount:a,rate:r},{tds:tax,net});};
  }

  function gstInterestCalculator(){
    const [t,d]=toolCopy['gst-interest-calculator'];
    shell(t,d,`<div class="notice"><strong>Guide:</strong> Use the applicable annual interest rate and actual delay days. This tool does not determine whether interest is legally payable.</div>
      <div class="form-row"><div><label>Tax amount (₹)</label><input id="giTax" type="number" min="0" step="0.01"></div><div><label>Annual rate (%)</label><input id="giRate" type="number" min="0" step="0.01"></div></div><label>Delay days</label><input id="giDays" type="number" min="0" step="1">
      <div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="giCalc">Calculate Interest</button></div><div id="giResult" class="notice" style="margin-top:14px;display:none"></div>`);
    giCalc.onclick=async()=>{const tax=Number(giTax.value),rate=Number(giRate.value),days=Number(giDays.value);if(![tax,rate,days].every(Number.isFinite)||tax<0||rate<0||days<0){status('Enter valid non-negative values.');return;}const interest=tax*rate*days/36500;giResult.style.display='block';giResult.innerHTML=`<strong>Indicative interest: ₹${interest.toLocaleString('en-IN',{maximumFractionDigits:2})}</strong><br><small>365-day simple-interest convention used for this calculation.</small>${exportCTA('gst-interest-calculator',{tax,rate,days},{interest},'GST Interest Report')}`;status('GST interest calculation completed.',true);await logRun('gst-interest-calculator',{tax,rate,days},{interest});};
  }

  function professionalFeeCalculator(){
    const [t,d]=toolCopy['professional-fee-calculator'];
    shell(t,d,`<div class="notice"><strong>Guide:</strong> Start with a base professional fee, then transparently adjust for complexity, urgency and document load. This is a planning estimate, not a mandated fee schedule.</div>
      <div class="form-row"><div><label>Base fee (₹)</label><input id="pfBase" type="number" min="0" step="0.01"></div><div><label>Complexity (%)</label><input id="pfComplexity" type="number" min="0" step="0.01" value="0"></div></div>
      <div class="form-row"><div><label>Urgency (%)</label><input id="pfUrgency" type="number" min="0" step="0.01" value="0"></div><div><label>Document / workload (%)</label><input id="pfDocs" type="number" min="0" step="0.01" value="0"></div></div>
      <div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="pfCalc">Build Estimate</button></div><div id="pfResult" class="notice" style="margin-top:14px;display:none"></div>`);
    pfCalc.onclick=async()=>{const b=Number(pfBase.value),c=Number(pfComplexity.value)||0,u=Number(pfUrgency.value)||0,dg=Number(pfDocs.value)||0;if(![b,c,u,dg].every(Number.isFinite)||b<0||c<0||u<0||dg<0){status('Enter valid non-negative values.');return;}const total=b*(1+(c+u+dg)/100);pfResult.style.display='block';pfResult.innerHTML=`<strong>Estimated professional fee: ₹${total.toLocaleString('en-IN',{maximumFractionDigits:2})}</strong><br><small>Formula: base fee + user-selected adjustment percentages. Taxes, court fees and third-party expenses are separate unless expressly included.</small>${exportCTA('professional-fee-calculator',{base:b,complexity:c,urgency:u,documents:dg},{estimated_fee:total},'Professional Fee Estimate')}`;status('Fee estimate completed.',true);await logRun('professional-fee-calculator',{base:b,complexity:c,urgency:u,documents:dg},{estimated_fee:total});};
  }

  function invoiceTotalCalculator(){
    const [t,d]=toolCopy['invoice-total-calculator'];
    shell(t,d,`<div class="form-row"><div><label>Subtotal (₹)</label><input id="invSub" type="number" min="0" step="0.01"></div><div><label>Discount (%)</label><input id="invDisc" type="number" min="0" max="100" step="0.01" value="0"></div></div><div class="form-row"><div><label>GST rate (%)</label><input id="invGst" type="number" min="0" step="0.01" value="0"></div><div><label>Other charges (₹)</label><input id="invOther" type="number" min="0" step="0.01" value="0"></div></div><div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="invCalc">Calculate Invoice</button></div><div id="invResult" class="notice" style="margin-top:14px;display:none"></div>`);
    invCalc.onclick=async()=>{const s=Number(invSub.value),disc=Number(invDisc.value)||0,g=Number(invGst.value)||0,other=Number(invOther.value)||0;if(![s,disc,g,other].every(Number.isFinite)||s<0||disc<0||disc>100||g<0||other<0){status('Enter valid values.');return;}const discount=s*disc/100,taxable=s-discount,tax=taxable*g/100,total=taxable+tax+other;invResult.style.display='block';invResult.innerHTML=`Discount: ₹${discount.toLocaleString('en-IN',{maximumFractionDigits:2})}<br>Taxable value: ₹${taxable.toLocaleString('en-IN',{maximumFractionDigits:2})}<br>GST: ₹${tax.toLocaleString('en-IN',{maximumFractionDigits:2})}<br><strong>Final invoice amount: ₹${total.toLocaleString('en-IN',{maximumFractionDigits:2})}</strong>${exportCTA('invoice-total-calculator',{subtotal:s,discount_rate:disc,gst_rate:g,other_charges:other},{discount,taxable,tax,total},'Invoice Calculation Report')}`;status('Invoice calculation completed.',true);await logRun('invoice-total-calculator',{subtotal:s,discount_rate:disc,gst_rate:g,other_charges:other},{discount,taxable,tax,total});};
  }

  function mcaComplianceChecklist(){
    const [t,d]=toolCopy['mca-compliance-checklist'];
    const items=['Board meeting / minutes review','AGM / annual compliance review','Financial statements filing review','Annual return filing review','Director KYC / related annual requirements','Registered office / statutory registers review','Charges / loans / security review','Beneficial ownership / significant ownership review','MSME / other applicable periodic filings','Event-based ROC filings review'];
    shell(t,d,`<div class="notice"><strong>Guidance:</strong> Select the tasks completed. The remaining list can be used as a professional review checklist; applicability and due dates must be verified for the specific company and financial year.</div><div id="mcaItems">${items.map(x=>`<label style="display:block;margin:8px 0"><input type="checkbox" value="${esc(x)}"> ${esc(x)}</label>`).join('')}</div><div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="mcaMake">Build Checklist</button></div><div id="mcaResult" class="notice" style="margin-top:14px;display:none"></div>`);
    mcaMake.onclick=async()=>{const done=[...mcaItems.querySelectorAll('input:checked')].map(x=>x.value),remaining=items.filter(x=>!done.includes(x));mcaResult.style.display='block';mcaResult.innerHTML=`<strong>Remaining review items: ${remaining.length}</strong><ul>${remaining.map(x=>`<li>${esc(x)}</li>`).join('')||'<li>All listed items marked complete.</li>'}</ul>${exportCTA('mca-compliance-checklist',{completed:done},{remaining},'MCA / CS Compliance Checklist')}`;status('Checklist prepared.',true);await logRun('mca-compliance-checklist',{completed:done},{remaining});};
  }

  function taxPaymentPlanner(){
    const [t,d]=toolCopy['tax-payment-planner'];
    shell(t,d,`<div class="form-row"><div><label>Estimated total tax liability (₹)</label><input id="tpLiability" type="number" min="0" step="0.01"></div><div><label>TDS / TCS already credited (₹)</label><input id="tpTds" type="number" min="0" step="0.01" value="0"></div></div><label>Other tax paid / credit (₹)</label><input id="tpOther" type="number" min="0" step="0.01" value="0"><div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="tpCalc">Calculate Balance</button></div><div id="tpResult" class="notice" style="margin-top:14px;display:none"></div>`);
    tpCalc.onclick=async()=>{const l=Number(tpLiability.value),t=Number(tpTds.value)||0,o=Number(tpOther.value)||0;if(![l,t,o].every(Number.isFinite)||l<0||t<0||o<0){status('Enter valid non-negative values.');return;}const balance=Math.max(0,l-t-o),excess=Math.max(0,t+o-l);tpResult.style.display='block';tpResult.innerHTML=`Estimated balance payable: <strong>₹${balance.toLocaleString('en-IN',{maximumFractionDigits:2})}</strong><br>Potential excess credit: ₹${excess.toLocaleString('en-IN',{maximumFractionDigits:2})}${exportCTA('tax-payment-planner',{liability:l,tds:t,other:o},{balance,excess},'Tax Payment Planning Report')}`;status('Tax payment plan calculated.',true);await logRun('tax-payment-planner',{liability:l,tds:t,other:o},{balance,excess});};
  }

  function complianceDeadlinePlanner(){
    const [t,d]=toolCopy['compliance-deadline-planner'];
    shell(t,d,`<div class="form-row"><div><label>Reference date</label><input id="cdDate" type="date"></div><div><label>Period / days</label><input id="cdDays" type="number" min="0" step="1" placeholder="e.g. 30"></div></div><label>Extra buffer days</label><input id="cdBuffer" type="number" min="0" step="1" value="0"><div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="cdCalc">Plan Date</button></div><div id="cdResult" class="notice" style="margin-top:14px;display:none"></div>`);
    cdCalc.onclick=async()=>{const date=cdDate.value,days=Number(cdDays.value),buffer=Number(cdBuffer.value)||0;if(!date||!Number.isInteger(days)||days<0||!Number.isInteger(buffer)||buffer<0){status('Enter a valid date and whole-number days.');return;}const result=fmt(addDays(dateObj(date),days+buffer));cdResult.style.display='block';cdResult.innerHTML=`<strong>Planning date: ${esc(result)}</strong><br><small>This is a planning calculation only; it does not determine a statutory due date.</small>${exportCTA('compliance-deadline-planner',{date,days,buffer},{planned_date:result},'Compliance Deadline Report')}`;status('Planning date calculated.',true);await logRun('compliance-deadline-planner',{date,days,buffer},{planned_date:result});};
  }


  function incomeTax2026(mode='new'){
    const title=mode==='compare'?'Old vs New Tax Regime Comparison':'Income Tax Calculator';
    shell(title,'AY 2026-27 individual slab-tax estimate using official published slab rates. Enter taxable income after applicable deductions/exemptions. Special-rate income, MAT and certain marginal-relief cases need separate verification.',
      `<label>Taxable income (₹)</label><input id="itIncome" type="number" min="0" step="1" placeholder="e.g. 1200000">
      <label>Age category</label><select id="itAge"><option value="normal">Below 60</option><option value="senior">60–79</option><option value="super">80+</option></select>
      <div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="itCalc">Calculate</button></div>
      <div id="itResult" class="notice" style="margin-top:14px;display:none"></div>`);
    const calc=(income,age,regime)=>{
      const slabs=regime==='new'?
        [[400000,0],[800000,.05],[1200000,.10],[1600000,.15],[2000000,.20],[2400000,.25],[Infinity,.30]]:
        (age==='normal'?[[250000,0],[500000,.05],[1000000,.20],[Infinity,.30]]:age==='senior'?[[300000,0],[500000,.05],[1000000,.20],[Infinity,.30]]:[[500000,0],[1000000,.20],[Infinity,.30]]);
      let tax=0,prev=0;
      for(const [limit,rate] of slabs){const part=Math.max(0,Math.min(income,limit)-prev);tax+=part*rate;if(income<=limit)break;prev=limit;}
      const rebateLimit=regime==='new'?1200000:500000, rebateMax=regime==='new'?60000:12500;
      const rebate=income<=rebateLimit?Math.min(tax,rebateMax):0;
      const afterRebate=Math.max(0,tax-rebate);
      const cess=afterRebate*.04;
      return {regime,base_tax:tax,rebate,cess,total_tax:afterRebate+cess};
    };
    itCalc.onclick=async()=>{
      const income=Number(itIncome.value),age=itAge.value;
      if(!Number.isFinite(income)||income<0){status('Enter valid taxable income.');return;}
      const n=calc(income,age,'new'),o=calc(income,age,'old');
      const rows=mode==='compare'?[n,o]:[mode==='new'?n:o];
      itResult.style.display='block';
      itResult.innerHTML=rows.map(x=>`<strong>${x.regime==='new'?'New':'Old'} regime</strong><br>Base tax: ₹${x.base_tax.toLocaleString('en-IN',{maximumFractionDigits:0})}<br>87A rebate: ₹${x.rebate.toLocaleString('en-IN',{maximumFractionDigits:0})}<br>4% cess: ₹${x.cess.toLocaleString('en-IN',{maximumFractionDigits:0})}<br><strong>Estimated tax: ₹${x.total_tax.toLocaleString('en-IN',{maximumFractionDigits:0})}</strong>`).join('<hr>')+`<small>For AY 2026-27. Verify surcharge/marginal relief and special-rate income separately where applicable.</small>${exportCTA(mode==='compare'?'old-new-tax-regime-comparison':'income-tax-calculator',{income,age},{old:o,new:n},title)}`;
      status('Income-tax calculation completed.',true); await logRun(mode==='compare'?'old-new-tax-regime-comparison':'income-tax-calculator',{income,age},{old:o,new:n});
    };
  }

  function advanceTaxCalculator(){
    shell('Advance Tax Calculator','Estimate annual tax payable and the four instalment targets from the calculated tax liability. This is a planning aid.',
      `<label>Estimated annual tax liability after TDS/credits (₹)</label><input id="atTax" type="number" min="0" step="1">
      <div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="atCalc">Calculate instalments</button></div><div id="atResult" class="notice" style="margin-top:14px;display:none"></div>`);
    atCalc.onclick=async()=>{const tax=Number(atTax.value);if(!Number.isFinite(tax)||tax<0){status('Enter a valid amount.');return;}const r={annual:tax,june:tax*.15,sept:tax*.45,dec:tax*.75,march:tax};atResult.style.display='block';atResult.innerHTML=`15% by June • cumulative 45% by September • cumulative 75% by December • 100% by March.<br><strong>Targets:</strong> ₹${r.june.toLocaleString('en-IN')} / ₹${r.sept.toLocaleString('en-IN')} / ₹${r.dec.toLocaleString('en-IN')} / ₹${r.march.toLocaleString('en-IN')}${exportCTA('advance-tax-calculator',{},r,'Advance Tax Planning Report')}`;status('Advance-tax targets calculated.',true);await logRun('advance-tax-calculator',{},r);};
  }

  function selfAssessmentTaxCalculator(){
    shell('Self-Assessment Tax Calculator','Calculate the remaining balance after subtracting tax already paid/credited from estimated total liability.',
      `<label>Total estimated tax liability (₹)</label><input id="saLiab" type="number" min="0" step="1"><label>Advance tax paid (₹)</label><input id="saAdv" type="number" min="0" step="1"><label>TDS/TCS credit (₹)</label><input id="saTds" type="number" min="0" step="1"><div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="saCalc">Calculate balance</button></div><div id="saResult" class="notice" style="margin-top:14px;display:none"></div>`);
    saCalc.onclick=async()=>{const liability=Number(saLiab.value),advance=Number(saAdv.value)||0,tds=Number(saTds.value)||0;if(![liability,advance,tds].every(Number.isFinite)||liability<0||advance<0||tds<0){status('Enter valid non-negative amounts.');return;}const balance=Math.max(0,liability-advance-tds),excess=Math.max(0,advance+tds-liability);const r={liability,advance,tds,balance,excess};saResult.style.display='block';saResult.innerHTML=`Balance payable: <strong>₹${balance.toLocaleString('en-IN')}</strong><br>Potential excess credit: ₹${excess.toLocaleString('en-IN')}${exportCTA('self-assessment-tax-calculator',r,r,'Self-Assessment Tax Report')}`;status('Self-assessment balance calculated.',true);await logRun('self-assessment-tax-calculator',r,r);};
  }

  function tdsInterest2026(){
    shell('TDS Interest Calculator','Indicative interest under section 201(1A): 1% per month/fraction for delay in deduction and 1.5% per month/fraction after deduction where tax remains unpaid. Verify facts and statutory applicability.',
      `<label>TDS amount (₹)</label><input id="tiTax" type="number" min="0" step="1"><label>Months/fractions delayed before deduction</label><input id="tiPre" type="number" min="0" step="1"><label>Months/fractions delayed after deduction</label><input id="tiPost" type="number" min="0" step="1"><div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="tiCalc">Calculate interest</button></div><div id="tiResult" class="notice" style="margin-top:14px;display:none"></div>`);
    tiCalc.onclick=async()=>{const tax=Number(tiTax.value),pre=Number(tiPre.value)||0,post=Number(tiPost.value)||0;if(!Number.isFinite(tax)||tax<0||pre<0||post<0){status('Enter valid values.');return;}const r={tax,pre_months:pre,post_months:post,interest:tax*(pre*.01+post*.015)};tiResult.style.display='block';tiResult.innerHTML=`Estimated interest: <strong>₹${r.interest.toLocaleString('en-IN',{maximumFractionDigits:2})}</strong>${exportCTA('tds-interest-calculator',r,r,'TDS Interest Report')}`;status('TDS interest calculated.',true);await logRun('tds-interest-calculator',r,r);};
  }

  function tdsLateFee2026(){
    shell('TDS Late Filing Fee Calculator','Section 234E planning calculation: ₹200 per day, capped at the amount of TDS deductible/collectible. Verify the applicable statement and period.',
      `<label>TDS amount (₹)</label><input id="tlTax" type="number" min="0" step="1"><label>Days of delay</label><input id="tlDays" type="number" min="0" step="1"><div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="tlCalc">Calculate late fee</button></div><div id="tlResult" class="notice" style="margin-top:14px;display:none"></div>`);
    tlCalc.onclick=async()=>{const tax=Number(tlTax.value),days=Number(tlDays.value);if(!Number.isFinite(tax)||!Number.isFinite(days)||tax<0||days<0){status('Enter valid values.');return;}const fee=Math.min(tax,days*200);const r={tax,days,late_fee:fee};tlResult.style.display='block';tlResult.innerHTML=`Estimated late fee: <strong>₹${fee.toLocaleString('en-IN')}</strong>${exportCTA('tds-late-filing-fee-calculator',r,r,'TDS Late Fee Report')}`;status('TDS late fee calculated.',true);await logRun('tds-late-filing-fee-calculator',r,r);};
  }


  function gstCoreCalculator(mode='gst'){
    const title=mode==='split'?'CGST / SGST / IGST Calculator':mode==='inclusive'?'GST Inclusive / Exclusive Calculator':'GST Calculator';
    shell(title,'Calculate GST from taxable value, rate and supply type. This is a calculation aid; verify the applicable GST rate and place-of-supply treatment.',
      `<label>Amount (₹)</label><input id="gcAmount" type="number" min="0" step="0.01" placeholder="10000"><label>GST rate (%)</label><input id="gcRate" type="number" min="0" step="0.01" placeholder="18"><label>Mode</label><select id="gcMode"><option value="exclusive">GST extra (exclusive)</option><option value="inclusive">GST included (inclusive)</option></select><label>Supply</label><select id="gcSupply"><option value="intra">Intra-state — CGST + SGST/UTGST</option><option value="inter">Inter-state — IGST</option></select><div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="gcCalc">Calculate</button></div><div id="gcResult" class="notice" style="margin-top:14px;display:none"></div>`);
    gcCalc.onclick=async()=>{
      const amount=Number(gcAmount.value),rate=Number(gcRate.value),calcMode=gcMode.value,supply=gcSupply.value;
      if(!Number.isFinite(amount)||!Number.isFinite(rate)||amount<0||rate<0){status('Enter valid non-negative values.');return;}
      const taxable=calcMode==='inclusive'?amount/(1+rate/100):amount;
      const gst=calcMode==='inclusive'?amount-taxable:taxable*rate/100;
      const total=taxable+gst, half=gst/2;
      const r={amount,rate,mode:calcMode,supply,taxable,gst,total,cgst:supply==='intra'?half:0,sgst:supply==='intra'?half:0,igst:supply==='inter'?gst:0};
      gcResult.style.display='block';gcResult.innerHTML=`Taxable value: <strong>₹${taxable.toLocaleString('en-IN',{maximumFractionDigits:2})}</strong><br>GST: <strong>₹${gst.toLocaleString('en-IN',{maximumFractionDigits:2})}</strong><br>Total: <strong>₹${total.toLocaleString('en-IN',{maximumFractionDigits:2})}</strong><br>${supply==='intra'?`CGST: ₹${half.toLocaleString('en-IN',{maximumFractionDigits:2})} • SGST/UTGST: ₹${half.toLocaleString('en-IN',{maximumFractionDigits:2})}`:`IGST: ₹${gst.toLocaleString('en-IN',{maximumFractionDigits:2})}`}${exportCTA(mode==='split'?'cgst-sgst-igst-calculator':'gst-calculator',r,r,title)}`;status('GST calculation completed.',true);await logRun('gst-calculator',r,r);
    };
  }

  function gstInterest2026(){
    shell('GST Interest Calculator','Planning calculation for delayed GST tax payment. From January 2026, GSTR-3B system computation incorporates minimum Electronic Cash Ledger balance under the Rule 88B(1) proviso; use the inputs below for an indicative estimate and verify portal-computed interest.',
      `<label>Net tax liability paid in cash (₹)</label><input id="giTax" type="number" min="0" step="0.01"><label>Minimum cash balance available during delay (₹)</label><input id="giCash" type="number" min="0" step="0.01" value="0"><label>Days delayed</label><input id="giDays" type="number" min="0" step="1"><label>Annual interest rate (%)</label><input id="giRate" type="number" min="0" step="0.01" value="18"><div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="giCalc">Calculate</button></div><div id="giResult" class="notice" style="margin-top:14px;display:none"></div>`);
    giCalc.onclick=async()=>{const tax=Number(giTax.value),cash=Number(giCash.value)||0,days=Number(giDays.value),rate=Number(giRate.value);if(![tax,cash,days,rate].every(Number.isFinite)||tax<0||cash<0||days<0||rate<0){status('Enter valid values.');return;}const base=Math.max(0,tax-cash),interest=base*rate/100*days/365,r={tax,cash,days,rate,interest};giResult.style.display='block';giResult.innerHTML=`Indicative interest: <strong>₹${interest.toLocaleString('en-IN',{maximumFractionDigits:2})}</strong><br><small>GSTN portal may compute differently based on return period, liability breakup and applicable law.</small>${exportCTA('gst-interest-calculator',r,r,'GST Interest Report')}`;status('GST interest estimate calculated.',true);await logRun('gst-interest-calculator',r,r);};
  }

  function gstPaymentCalculator(){
    shell('GST Payment / Interest Calculator','Plan net GST cash payment after considering eligible ITC and estimate interest on delayed cash liability.',
      `<label>Output tax liability (₹)</label><input id="gpOut" type="number" min="0" step="0.01"><label>Eligible ITC to use (₹)</label><input id="gpItc" type="number" min="0" step="0.01"><label>Days delayed</label><input id="gpDays" type="number" min="0" step="1" value="0"><label>Interest rate (%)</label><input id="gpRate" type="number" min="0" step="0.01" value="18"><div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="gpCalc">Calculate payment</button></div><div id="gpResult" class="notice" style="margin-top:14px;display:none"></div>`);
    gpCalc.onclick=async()=>{const out=Number(gpOut.value),itc=Number(gpItc.value)||0,days=Number(gpDays.value)||0,rate=Number(gpRate.value)||0;if(![out,itc,days,rate].every(Number.isFinite)||out<0||itc<0||days<0||rate<0){status('Enter valid values.');return;}const cash=Math.max(0,out-itc),interest=cash*rate/100*days/365,r={out,itc,cash,days,rate,interest,total_cash_with_interest:cash+interest};gpResult.style.display='block';gpResult.innerHTML=`Net cash tax: <strong>₹${cash.toLocaleString('en-IN',{maximumFractionDigits:2})}</strong><br>Indicative interest: ₹${interest.toLocaleString('en-IN',{maximumFractionDigits:2})}<br>Total planning amount: ₹${(cash+interest).toLocaleString('en-IN',{maximumFractionDigits:2})}${exportCTA('gst-payment-interest-calculator',r,r,'GST Payment Report')}`;status('GST payment plan calculated.',true);await logRun('gst-payment-interest-calculator',r,r);};
  }

  function itcCalculator(){
    shell('ITC Calculator','Calculate eligible ITC from tax components. Eligibility itself depends on the CGST Act/rules and facts; this tool only performs the supplied arithmetic.',
      `<label>IGST ITC (₹)</label><input id="icIgst" type="number" min="0" step="0.01" value="0"><label>CGST ITC (₹)</label><input id="icCgst" type="number" min="0" step="0.01" value="0"><label>SGST/UTGST ITC (₹)</label><input id="icSgst" type="number" min="0" step="0.01" value="0"><label>Less: reversals (₹)</label><input id="icRev" type="number" min="0" step="0.01" value="0"><div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="icCalc">Calculate ITC</button></div><div id="icResult" class="notice" style="margin-top:14px;display:none"></div>`);
    icCalc.onclick=async()=>{const i=Number(icIgst.value),c=Number(icCgst.value),s=Number(icSgst.value),rev=Number(icRev.value);if(![i,c,s,rev].every(Number.isFinite)||Math.min(i,c,s,rev)<0){status('Enter valid values.');return;}const r={igst:i,cgst:c,sgst:s,reversals:rev,net_itc:Math.max(0,i+c+s-rev)};icResult.style.display='block';icResult.innerHTML=`Net ITC: <strong>₹${r.net_itc.toLocaleString('en-IN',{maximumFractionDigits:2})}</strong>${exportCTA('itc-calculator',r,r,'ITC Working Report')}`;status('ITC calculated.',true);await logRun('itc-calculator',r,r);};
  }


  function gstCsvRows(text){
    const lines=String(text||'').trim().split(/\\r?\\n/).filter(Boolean); if(!lines.length)return [];
    const split=line=>{const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(ch===','&&!q){out.push(cur.trim());cur='';}else cur+=ch;}out.push(cur.trim());return out;};
    const headers=split(lines[0]).map(x=>x.toLowerCase().replace(/[^a-z0-9]+/g,'_'));
    return lines.slice(1).map(line=>{const v=split(line),o={};headers.forEach((h,i)=>o[h]=v[i]??'');return o;}).filter(o=>Object.values(o).some(Boolean));
  }
  function gstNum(o,keys){for(const k of keys){if(o[k]!==undefined&&o[k]!==''){const n=Number(String(o[k]).replace(/[,₹ ]/g,''));if(Number.isFinite(n))return n;}}return 0;}
  function gstKey(o){return String(o.invoice_number||o.invoice_no||o.document_number||o.doc_no||o.invoice||o.bill_no||'').trim().toUpperCase();}
  function gstReconcile(mode='itc'){
    const titles={itc:'ITC Reconciliation Tool',gstr2b:'GSTR-2B Reconciliation',purchase2b:'Purchase vs GSTR-2B Difference Finder',sales1:'Sales vs GSTR-1 Reconciliation',turnover:'GST-to-Turnover Reconciliation'};
    const descriptions={itc:'Compare two datasets document-by-document and identify missing, matched and amount-mismatched records.',gstr2b:'Reconcile your purchase register against downloaded GSTR-2B records.',purchase2b:'Find purchase invoices missing from GSTR-2B and tax/value mismatches.',sales1:'Compare your sales register with GSTR-1 data using invoice number and tax amounts.',turnover:'Compare books turnover against GST return turnover and quantify the difference.'};
    const title=titles[mode],desc=descriptions[mode];
    shell(title,desc+' Upload CSV files exported from your records/GST portal. This is a reconciliation aid, not a determination of ITC eligibility.',
      `<label>Books / primary CSV</label><input id="grA" type="file" accept=".csv,text/csv"><label>GST / comparison CSV</label><input id="grB" type="file" accept=".csv,text/csv"><div class="notice"><small>Recommended columns: invoice_number, invoice_date, gstin, taxable_value, igst, cgst, sgst, cess. Invoice number is the primary match key.</small></div><div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="grRun">Run reconciliation</button></div><div id="grResult" class="notice" style="margin-top:14px;display:none"></div>`);
    const read=file=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(gstCsvRows(r.result));r.onerror=rej;r.readAsText(file);});
    grRun.onclick=async()=>{
      if(!grA.files[0]||!grB.files[0]){status('Upload both CSV files.');return;}
      try{
        const [a,b]=await Promise.all([read(grA.files[0]),read(grB.files[0])]), bm=new Map(b.map(x=>[gstKey(x),x])), am=new Map(a.map(x=>[gstKey(x),x]));
        let matched=0,missing=0,mismatch=0,unmatchedGST=0,taxDiff=0,valueDiff=0; const details=[];
        for(const [k,x] of am){if(!k){details.push({status:'NO_INVOICE_KEY'});continue;}const y=bm.get(k);if(!y){missing++;details.push({invoice:k,status:'Missing in GST dataset'});continue;}matched++;const xv=gstNum(x,['taxable_value','taxable','taxable_amount']),yv=gstNum(y,['taxable_value','taxable','taxable_amount']);const xt=gstNum(x,['igst'])+gstNum(x,['cgst'])+gstNum(x,['sgst'])+gstNum(x,['cess']),yt=gstNum(y,['igst'])+gstNum(y,['cgst'])+gstNum(y,['sgst'])+gstNum(y,['cess']);const vd=xv-yv,td=xt-yt;valueDiff+=vd;taxDiff+=td;if(Math.abs(vd)>0.01||Math.abs(td)>0.01){mismatch++;details.push({invoice:k,status:'Mismatch',taxable_difference:vd,tax_difference:td});}}
        for(const [k] of bm)if(k&&!am.has(k))unmatchedGST++;
        const r={mode,books_rows:a.length,gst_rows:b.length,matched,missing_from_gst:missing,unmatched_gst:unmatchedGST,mismatches:mismatch,total_taxable_difference:valueDiff,total_tax_difference:taxDiff};
        grResult.style.display='block';grResult.innerHTML=`Books rows: <strong>${a.length}</strong> • GST rows: <strong>${b.length}</strong><br>Matched: <strong>${matched}</strong> • Missing in GST: <strong>${missing}</strong> • GST-only: <strong>${unmatchedGST}</strong> • Mismatched: <strong>${mismatch}</strong><br>Taxable difference: <strong>₹${valueDiff.toLocaleString('en-IN',{maximumFractionDigits:2})}</strong><br>Tax difference: <strong>₹${taxDiff.toLocaleString('en-IN',{maximumFractionDigits:2})}</strong><br><small>Review invoice keys, amendments, credit/debit notes and eligibility separately before filing or claiming ITC.</small>${exportCTA(mode+'-reconciliation',r,details,title+' Report')}`;
        status('Reconciliation completed.',true);await logRun(mode+'-reconciliation',r,details);
      }catch(e){status('Could not read CSV files. Please use valid UTF-8 CSV exports.');}
    };
  }


  function gstComplianceChecklist(type='registration'){
    const cfg={
      registration:{title:'GST Registration Eligibility & Checklist',intro:'Pre-screen registration facts and prepare the core REG-01 information/documents.',items:['PAN and legal-name details','Mobile number and email for OTP verification','State/UT and principal place of business details','Nature of business and goods/services supplied','Bank-account details as required in the application','Authorised signatory details and supporting documents','Additional place(s) of business, if applicable','Review compulsory-registration triggers separately','Verify current portal requirements before submission']},
      regdocs:{title:'GST Registration Document Checklist',intro:'Prepare a document pack for GST REG-01. Exact documents vary by constitution and premises.',items:['PAN of applicant/entity','Proof of constitution of business','Photograph and authorised signatory proof','Principal place of business proof','Additional place of business proof, where applicable','Authorisation/board or partner documentation, where applicable','Bank-account proof when required by the portal','Review state-specific/current portal requirements']},
      gstr1:{title:'GSTR-1 Checklist',intro:'Pre-filing checklist for outward-supply reporting. Reconcile source records before filing.',items:['Sales register reconciled for the tax period','B2B invoices checked with GSTIN and invoice numbers','B2C and other applicable outward supplies reviewed','Credit/debit notes reviewed','Exports/SEZ/deemed-export data checked where applicable','HSN/SAC and tax-rate classification reviewed','Amendments from earlier periods reviewed','GSTR-1A availability/need considered where applicable','Final liability and reconciliation reviewed before filing']},
      gstr3b:{title:'GSTR-3B Checklist',intro:'Pre-filing checklist for summary liability, ITC and payment.',items:['Outward taxable supplies reconciled','Reverse-charge liabilities checked','Eligible ITC reconciled with available records/GSTR-2B','ITC reversals and ineligible credit reviewed','Interest/late fee, if applicable, checked','Electronic credit/cash ledger balances reviewed','Tax payment funding confirmed','Portal-generated interest and liability figures verified before filing']},
      gstr9:{title:'GSTR-9 Checklist',intro:'Annual-return preparation checklist. Applicability and exemptions must be checked for the relevant financial year.',items:['Annual sales and books reconciled with returns','ITC as per books reconciled with returns/GSTR-2B records','Tax paid and liability reconciliation completed','Amendments/credit-debit notes reviewed','HSN summary data prepared where applicable','Previous-period adjustments reviewed','Differences explained and working papers retained','Applicability of GSTR-9 for the relevant year verified']},
      gstr9c:{title:'GSTR-9C Checklist',intro:'Reconciliation-statement preparation checklist; applicability depends on the relevant law/notification and period.',items:['Turnover reconciliation prepared','Taxable turnover reconciliation prepared','Tax paid reconciliation prepared','ITC reconciliation prepared','Unreconciled differences documented','Books and audited/reconciliation data aligned','Applicable certification requirements verified for the relevant year','Current portal/form applicability confirmed before filing']},
      notice:{title:'GST Notice Response Checklist',intro:'Organise the notice, facts, evidence and deadline before preparing a response.',items:['Notice/DRC/FORM number and issue date recorded','Reply deadline calculated from the actual notice','Allegations/issues mapped point-by-point','Returns, invoices and ledgers supporting the response collected','Reconciliation statement prepared where relevant','Payment/interest/penalty position independently checked','Authorisation and supporting affidavit/declaration prepared if required','Response proof/acknowledgement retained']},
      refund:{title:'GST Refund Checklist',intro:'RFD-01 refund preparation checklist; category-specific evidence is required.',items:['Refund category identified','Relevant tax period and limitation checked','RFD-01 application data prepared','Invoice/statement evidence assembled','Export/SEZ evidence assembled where applicable','Unjust-enrichment declaration/certificate requirement checked','Electronic credit ledger debit requirement checked where applicable','Bank-account details verified','Pending demand/litigation impact reviewed','Portal acknowledgement and subsequent notices tracked']},
      lut:{title:'LUT Checklist / Generator',intro:'Prepare the information needed for an LUT-based zero-rated supply workflow; verify current portal/form requirements.',items:['GST registration/GSTIN details confirmed','Authorised signatory details confirmed','Business address and constitution details confirmed','Export/zero-rated supply facts documented','Required witnesses/undertaking information prepared','Previous LUT/reference details reviewed where applicable','Current financial-year LUT filing requirement verified on portal']},
      amendment:{title:'GST Amendment Checklist',intro:'Identify changed registration particulars and prepare supporting evidence.',items:['Exact registration field requiring change identified','Effective date of change recorded','Supporting document for the change collected','Principal/additional place change checked','Legal-name/constitution/partner-director change checked','Authorised signatory details checked','REG amendment workflow and current portal requirements verified']},
      cancellation:{title:'GST Cancellation Checklist',intro:'Prepare cancellation facts, stock/liability details and final-return actions.',items:['Reason/event triggering cancellation recorded','Effective cancellation date identified','Stock/capital-goods details prepared','Tax/liability payable on cancellation reviewed','Electronic ledger balances reviewed','REG cancellation application information prepared','Final return/compliance obligations identified','Current portal cancellation requirements verified']}
    }[type]||null;
    if(!cfg)return genericGuided({name:'GST Compliance'});
    shell(cfg.title,cfg.intro+` Official-source basis: CBIC/GST portal rules; verify the relevant period, taxpayer category and latest portal instructions before acting.`,
      cfg.items.map((x,i)=>`<label style="display:block;margin:9px 0"><input type="checkbox" id="gcc${i}"> ${x}</label>`).join('')+`<div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="gccExport">Create checklist report</button></div><div id="gccResult" class="notice" style="margin-top:14px;display:none"></div>`);
    gccExport.onclick=async()=>{const done=cfg.items.filter((_,i)=>document.getElementById('gcc'+i)?.checked).length;const r={type,completed:done,total:cfg.items.length,completion_percent:Math.round(done/cfg.items.length*100),items:cfg.items.map((x,i)=>({item:x,done:!!document.getElementById('gcc'+i)?.checked}))};gccResult.style.display='block';gccResult.innerHTML=`Completed: <strong>${done}/${cfg.items.length}</strong> (${r.completion_percent}%)<br><small>This report is a preparation aid; it does not replace the applicable GST Act, Rules, notification, form instructions or professional verification.</small>${exportCTA('gst-compliance-checklist',r,r,cfg.title)}`;status('GST checklist prepared.',true);await logRun('gst-compliance-checklist',r,r);};
  }

  function gstReturnDueDatePlanner(){
    shell('GST Return Due-Date Planner','Calculate planning dates from the filer pattern and tax period. These are planning dates; government extensions/notifications can change the actual due date.',
      `<label>Return</label><select id="gdReturn"><option value="gstr1">GSTR-1</option><option value="gstr3b">GSTR-3B</option></select><label>Filing pattern</label><select id="gdPattern"><option value="monthly">Monthly</option><option value="quarterly">Quarterly / QRMP</option></select><label>Tax period end month (1-12)</label><input id="gdMonth" type="number" min="1" max="12" value="8"><label>Tax period end year</label><input id="gdYear" type="number" min="2020" max="2100" value="2026"><div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="gdCalc">Calculate planning date</button></div><div id="gdResult" class="notice" style="margin-top:14px;display:none"></div>`);
    gdCalc.onclick=async()=>{const ret=gdReturn.value,p=gdPattern.value,m=Number(gdMonth.value),y=Number(gdYear.value);if(![m,y].every(Number.isFinite)||m<1||m>12){status('Enter a valid period.');return;}let month=m+1,year=y;if(month===13){month=1;year++;}let day;if(ret==='gstr1')day=p==='monthly'?11:13;else day=p==='monthly'?20:22;const d=new Date(year,month-1,day),date=d.toISOString().slice(0,10);const r={return:ret,pattern:p,period_end_month:m,period_end_year:y,planning_due_date:date};gdResult.style.display='block';gdResult.innerHTML=`Planning date: <strong>${date}</strong><br><small>22/24th QRMP GSTR-3B variations and state/period-specific extensions can apply. Verify the current GST portal notification before filing.</small>${exportCTA('gst-return-due-date',r,r,'GST Return Due-Date Planning Report')}`;status('Planning date calculated.',true);await logRun('gst-return-due-date',r,r);};
  }


  function gstDocumentGenerator(type='invoice'){
    const cfg=type==='invoice'?{title:'GST Invoice Generator',kind:'Tax Invoice'}:{title:type==='credit'?'GST Credit Note Generator':'GST Debit Note Generator',kind:type==='credit'?'Credit Note':'Debit Note'};
    shell(cfg.title,'Create a structured GST document draft. Verify rate, place of supply, e-invoice applicability and all particulars before issuing.',
      `<label>Document number</label><input id="gdNo" placeholder="INV/2026-27/001"><label>Issue date</label><input id="gdDate" type="date"><label>Supplier name</label><input id="gdSupplier"><label>Supplier GSTIN</label><input id="gdSgstin"><label>Supplier address</label><input id="gdSaddr"><label>Recipient name</label><input id="gdRecipient"><label>Recipient GSTIN/UIN</label><input id="gdRgstin"><label>Recipient address</label><input id="gdRaddr"><label>Original invoice no. (for credit/debit note)</label><input id="gdOrig"><label>Place of supply</label><input id="gdPos" placeholder="State / code"><label>Description</label><input id="gdDesc"><label>HSN/SAC</label><input id="gdHsn"><label>Quantity</label><input id="gdQty" type="number" min="0" step="0.001" value="1"><label>Taxable value (₹)</label><input id="gdTaxable" type="number" min="0" step="0.01"><label>GST rate (%)</label><input id="gdRate" type="number" min="0" step="0.01"><label>Supply type</label><select id="gdSupply"><option value="intra">Intra-state</option><option value="inter">Inter-state</option></select><label>Reverse charge?</label><select id="gdRCM"><option value="no">No</option><option value="yes">Yes</option></select><div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="gdBuild">Create draft</button></div><div id="gdOut" class="notice" style="margin-top:14px;display:none"></div>`);
    gdBuild.onclick=async()=>{const taxable=Number(gdTaxable.value),rate=Number(gdRate.value),qty=Number(gdQty.value)||0;if(![taxable,rate,qty].every(Number.isFinite)||taxable<0||rate<0||qty<0){status('Enter valid numeric values.');return;}const tax=taxable*rate/100,r={type:cfg.kind,number:gdNo.value,date:gdDate.value,supplier:{name:gdSupplier.value,gstin:gdSgstin.value,address:gdSaddr.value},recipient:{name:gdRecipient.value,gstin:gdRgstin.value,address:gdRaddr.value},original_invoice:gdOrig.value,place_of_supply:gdPos.value,description:gdDesc.value,hsn_sac:gdHsn.value,quantity:qty,taxable_value:taxable,gst_rate:rate,supply_type:gdSupply.value,reverse_charge:gdRCM.value,total:taxable+tax,tax_components:gdSupply.value==='intra'?{cgst:tax/2,sgst:tax/2,igst:0}:{cgst:0,sgst:0,igst:tax}};gdOut.style.display='block';gdOut.innerHTML=`<strong>${cfg.kind} draft created</strong><br>Taxable: ₹${taxable.toLocaleString('en-IN',{maximumFractionDigits:2})} • GST: ₹${tax.toLocaleString('en-IN',{maximumFractionDigits:2})} • Total: ₹${(taxable+tax).toLocaleString('en-IN',{maximumFractionDigits:2})}<br><small>CBIC Rule 46 requires prescribed particulars; for credit/debit notes the original invoice reference is required. Verify current rules/notifications before issue.</small>${exportCTA(type==='invoice'?'gst-invoice-generator':'gst-'+type+'-note-generator',r,r,cfg.title)}`;status('GST document draft created.',true);await logRun(type+'-gst-document',r,r);};
  }
  function gstClassificationFinder(){
    shell('GST HSN / SAC & Rate Finder','Enter a known HSN/SAC or a product/service description. This tool deliberately does not invent a current rate or classification from memory.',
      `<label>HSN/SAC (optional)</label><input id="gfCode" placeholder="Enter known code"><label>Product / service description</label><input id="gfDesc" placeholder="Describe the supply"><div class="notice"><strong>Classification safety:</strong> final HSN/SAC and GST rate must be verified against the current official tariff/notification/portal source applicable to the supply.</div><div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="gfPrepare">Prepare verification record</button></div><div id="gfOut" class="notice" style="margin-top:14px;display:none"></div>`);
    gfPrepare.onclick=async()=>{const r={hsn_sac:gfCode.value.trim(),description:gfDesc.value.trim(),verification_required:true};if(!r.hsn_sac&&!r.description){status('Enter a code or description.');return;}gfOut.style.display='block';gfOut.innerHTML=`Verification record prepared for <strong>${r.hsn_sac||'classification search'}</strong>.<br><small>No rate has been guessed. Verify the current CBIC/GST tariff and applicable notification before billing.</small>${exportCTA('gst-classification-verification',r,r,'GST Classification Verification')}`;status('Verification record prepared.',true);await logRun('gst-classification-verification',r,r);};
  }


  function eInvoiceChecker(){
    shell('E-Invoice Calculator / Checker','Check key e-invoice reporting inputs and calculate the 30-day reporting deadline for AATO ₹10 Cr+ cases. Final applicability and IRP acceptance must be verified on the current portal.',
      `<label>AATO category</label><select id="eiAato"><option value="10cr">₹10 Cr or above</option><option value="below">Below ₹10 Cr</option><option value="unknown">Need to verify applicability</option></select><label>Document type</label><select id="eiType"><option>Invoice</option><option>Credit Note</option><option>Debit Note</option></select><label>Document date</label><input id="eiDate" type="date"><label>IRN already generated?</label><select id="eiIrn"><option value="no">No</option><option value="yes">Yes</option></select><div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="eiCheck">Check</button></div><div id="eiOut" class="notice" style="margin-top:14px;display:none"></div>`);
    eiCheck.onclick=async()=>{const d=eiDate.value?new Date(eiDate.value+'T00:00:00'):null;if(!d||Number.isNaN(d.getTime())){status('Enter document date.');return;}const deadline=new Date(d);deadline.setDate(deadline.getDate()+30);const r={aato_category:eiAato.value,document_type:eiType.value,document_date:eiDate.value,reporting_deadline_30_day_rule:deadline.toISOString().slice(0,10),irn_generated:eiIrn.value==='yes'};eiOut.style.display='block';eiOut.innerHTML=`30-day planning deadline: <strong>${r.reporting_deadline_30_day_rule}</strong><br><small>From 1 April 2025, the 30-day restriction applies to AATO ₹10 Cr+ taxpayers for invoices, credit notes and debit notes. This tool is not a substitute for IRP validation or applicability checks.</small>${exportCTA('einvoice-checker',r,r,'E-Invoice Check Report')}`;status('E-invoice check completed.',true);await logRun('einvoice-checker',r,r);};
  }
  function ewayValidityCalculator(){
    shell('E-Way Bill Distance / Validity Calculator','Calculate planning validity from approximate distance. Current official E-Way Bill guidance uses 200 km per day for regular transport and 20 km per day for ODC; the validity starts from the first Part-B entry.',
      `<label>Approx. distance (km)</label><input id="ewKm" type="number" min="0" step="0.1"><label>Transport category</label><select id="ewMode"><option value="regular">Regular transport — 200 km/day</option><option value="odc">Over Dimensional Cargo — 20 km/day</option></select><label>Part-B first entry date/time</label><input id="ewStart" type="datetime-local"><div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="ewCalc">Calculate validity</button></div><div id="ewOut" class="notice" style="margin-top:14px;display:none"></div>`);
    ewCalc.onclick=async()=>{const km=Number(ewKm.value),start=ewStart.value?new Date(ewStart.value):null,div=ewMode.value==='odc'?20:200;if(!Number.isFinite(km)||km<0||!start||Number.isNaN(start.getTime())){status('Enter distance and Part-B date/time.');return;}const days=Math.max(1,Math.ceil(km/div)),expiry=new Date(start.getTime()+days*24*60*60*1000),r={distance_km:km,mode:ewMode.value,km_per_day:div,validity_days:days,start:start.toISOString(),planning_expiry:expiry.toISOString()};ewOut.style.display='block';ewOut.innerHTML=`Planning validity: <strong>${days} day(s)</strong><br>Planning expiry: <strong>${expiry.toLocaleString('en-IN')}</strong><br><small>Official EWB FAQ says validity is distance-based and starts with the first Part-B entry. Portal calculation/exception handling should be treated as authoritative.</small>${exportCTA('eway-validity-calculator',r,r,'E-Way Bill Validity Report')}`;status('E-way bill validity calculated.',true);await logRun('eway-validity-calculator',r,r);};
  }

  function gstCompositionCalculator(){
    shell('GST Composition Scheme Calculator','Indicative composition-tax planning. Eligibility and notified rates depend on taxpayer category, State/UT and current law; verify before opting or filing.',
      `<label>Annual aggregate turnover (₹)</label><input id="gcTurn" type="number" min="0" step="0.01"><label>Tax rate (%)</label><input id="gcCompRate" type="number" min="0" step="0.01" placeholder="Enter applicable rate"><label>Eligible turnover for composition (₹)</label><input id="gcEligible" type="number" min="0" step="0.01"><div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="gcCompCalc">Calculate</button></div><div id="gcCompOut" class="notice" style="margin-top:14px;display:none"></div>`);
    gcCompCalc.onclick=async()=>{const turn=Number(gcTurn.value),rate=Number(gcCompRate.value),eligible=Number(gcEligible.value);if(![turn,rate,eligible].every(Number.isFinite)||turn<0||rate<0||eligible<0){status('Enter valid values.');return;}const tax=eligible*rate/100,r={aggregate_turnover:turn,eligible_turnover:eligible,rate_percent:rate,indicative_tax:tax};gcCompOut.style.display='block';gcCompOut.innerHTML=`Indicative composition tax: <strong>₹${tax.toLocaleString('en-IN',{maximumFractionDigits:2})}</strong><br><small>Current GST portal material states a ₹1.5 crore goods threshold and ₹50 lakh services/mixed-supply threshold in the cited scheme; special-category State rules and eligibility restrictions must be checked.</small>${exportCTA('gst-composition-calculator',r,r,'Composition Scheme Planning Report')}`;status('Composition estimate calculated.',true);await logRun('gst-composition-calculator',r,r);};
  }
  function gstLateFeeCalculator(){
    shell('GST Late Fee Calculator','Planning estimate for late filing. Enter the applicable daily rate and statutory cap for the relevant return/period rather than relying on a hard-coded rate.',
      `<label>Days late</label><input id="glDays" type="number" min="0" step="1"><label>Applicable late fee per day (₹)</label><input id="glRate" type="number" min="0" step="0.01"><label>Statutory maximum late fee (₹)</label><input id="glCap" type="number" min="0" step="0.01"><label>Taxpayer/return context</label><input id="glContext" placeholder="e.g. GSTR-3B / GSTR-1 / NIL return"><div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="glCalc">Calculate</button></div><div id="glOut" class="notice" style="margin-top:14px;display:none"></div>`);
    glCalc.onclick=async()=>{const days=Number(glDays.value),rate=Number(glRate.value),cap=Number(glCap.value);if(![days,rate,cap].every(Number.isFinite)||days<0||rate<0||cap<0){status('Enter valid values.');return;}const fee=Math.min(days*rate,cap),r={days_late:days,daily_rate:rate,cap,context:glContext.value,late_fee:fee};glOut.style.display='block';glOut.innerHTML=`Indicative late fee: <strong>₹${fee.toLocaleString('en-IN',{maximumFractionDigits:2})}</strong><br><small>Rates/caps vary by return, period and notifications. Verify the applicable rule/notification before payment.</small>${exportCTA('gst-late-fee-calculator',r,r,'GST Late Fee Report')}`;status('Late fee estimate calculated.',true);await logRun('gst-late-fee-calculator',r,r);};
  }
  function gstDemandCalculator(){
    shell('GST Demand Calculator','Break a demand notice into tax, interest, penalty and other amounts. The tool helps reconcile the notice; it does not determine the legal basis or final penalty.',
      `<label>Tax demand (₹)</label><input id="gqTax" type="number" min="0" step="0.01"><label>Interest (₹)</label><input id="gqInt" type="number" min="0" step="0.01"><label>Penalty (₹)</label><input id="gqPen" type="number" min="0" step="0.01"><label>Late fee / other dues (₹)</label><input id="gqOther" type="number" min="0" step="0.01"><label>Notice / order reference</label><input id="gqRef"><div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="gqCalc">Total demand</button></div><div id="gqOut" class="notice" style="margin-top:14px;display:none"></div>`);
    gqCalc.onclick=async()=>{const vals=[gqTax,gqInt,gqPen,gqOther].map(x=>Number(x.value)||0);if(vals.some(x=>x<0)){status('Enter valid values.');return;}const total=vals.reduce((a,b)=>a+b,0),r={reference:gqRef.value,tax:vals[0],interest:vals[1],penalty:vals[2],other:vals[3],total};gqOut.style.display='block';gqOut.innerHTML=`Total demand: <strong>₹${total.toLocaleString('en-IN',{maximumFractionDigits:2})}</strong><br><small>Verify the section, order, interest period and penalty provisions in the actual notice/order. CGST Act demand provisions can differ by facts and statutory section.</small>${exportCTA('gst-demand-calculator',r,r,'GST Demand Reconciliation Report')}`;status('Demand total calculated.',true);await logRun('gst-demand-calculator',r,r);};
  }
  function gstRefundCalculator(){
    shell('GST Refund Calculator','Prepare a refund-planning worksheet. RFD-01 refund eligibility and formula depend on the refund category; this tool captures category inputs without pretending one formula applies to all claims.',
      `<label>Refund category</label><select id="grfCat"><option>Excess cash ledger</option><option>Exports / zero-rated supplies</option><option>Inverted duty structure</option><option>Order / excess tax payment</option><option>Other</option></select><label>Refundable tax/ITC base (₹)</label><input id="grfBase" type="number" min="0" step="0.01"><label>Other refundable amount (₹)</label><input id="grfOther" type="number" min="0" step="0.01"><label>Amount already adjusted/paid (₹)</label><input id="grfAdj" type="number" min="0" step="0.01" value="0"><div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="grfCalc">Prepare estimate</button></div><div id="grfOut" class="notice" style="margin-top:14px;display:none"></div>`);
    grfCalc.onclick=async()=>{const base=Number(grfBase.value)||0,other=Number(grfOther.value)||0,adj=Number(grfAdj.value)||0;if(base<0||other<0||adj<0){status('Enter valid values.');return;}const estimated=Math.max(0,base+other-adj),r={category:grfCat.value,base,other,adjustment:adj,indicative_refund:estimated};grfOut.style.display='block';grfOut.innerHTML=`Indicative worksheet amount: <strong>₹${estimated.toLocaleString('en-IN',{maximumFractionDigits:2})}</strong><br><small>Actual refund depends on category-specific statutory formula, unjust-enrichment/eligibility checks, documentation and officer/portal processing.</small>${exportCTA('gst-refund-calculator',r,r,'GST Refund Planning Report')}`;status('Refund worksheet prepared.',true);await logRun('gst-refund-calculator',r,r);};
  }


  function mcaComplianceChecklist(type='annual'){
    const cfg={
      incorporation:{title:'Company Incorporation Checklist',items:['Select company type and eligibility','Name reservation / name availability checked','Registered-office requirements prepared','Subscriber/director KYC details prepared','Constitutional documents and declarations prepared','DSC and MCA V3 business-user readiness checked','Current SPICe+ / linked-form requirements verified']},
      director:{title:'Director Eligibility Checklist',items:['DIN status verified','Consent/declaration requirements checked','Disqualification provisions reviewed','Interest/disclosure requirements reviewed','Current DIR-related form requirement verified','DSC and MCA V3 access checked']},
      din:{title:'DIN-related Checklist',items:['DIN identified and status verified','PAN and personal details match MCA records','Email/mobile details verified','KYC requirement for relevant year checked','DSC/OTP readiness checked','Current MCA form and fee requirement verified']},
      dsc:{title:'DSC Expiry Tracker',items:['Director/authorised signatory identified','DSC expiry date recorded','Linked MCA user/DSC association checked','Renewal lead time planned','Post-renewal MCA association/test planned']},
      annual:{title:'Annual Filing Checklist',items:['Financial statements finalised','Board approval completed','AGM requirement/date checked','AOC-4 applicability/form variant verified','MGT-7/MGT-7A applicability verified','Director/KMP disclosures reviewed','Auditor details and related filings checked','MSME/other applicable periodic filings checked','MCA V3 form versions and instruction kits verified']},
      roc:{title:'ROC Filing Checklist',items:['Form and event identified','Statutory due date calculated from actual event','Supporting board/shareholder resolution prepared','Attachments and certifications checked','DSC/signatory validity checked','MCA V3 form/instruction kit verified','SRN/payment/resubmission status tracked']},
      msmE:{title:'MSME Compliance Checklist',items:['Applicable vendor/payment reporting period identified','Outstanding eligible supplier dues reconciled','Required data collected','MSME form applicability for the period verified','Current MCA portal instructions checked']},
      beneficial:{title:'Beneficial Ownership Compliance Checklist',items:['Ownership/control structure mapped','Significant beneficial ownership facts identified','Declarations/supporting evidence collected','BEN-1/BEN-2 applicability checked','Current thresholds/forms verified']},
      closure:{title:'Company Closure / Strike-off Checklist',items:['Eligibility and outstanding proceedings reviewed','Liabilities/dues status checked','Bank/asset/operations position documented','Member/director approvals prepared where required','STK-2 and supporting documents/applicability verified','Final tax/other statutory compliance reviewed','Current C-PACE/MCA requirements verified']}
    }[type];
    if(!cfg)return genericGuided({name:'MCA/ROC Compliance'});
    shell(cfg.title,'Interactive preparation checklist based on the Companies Act/MCA framework. Verify the relevant company class, event date and current MCA V3 form/instruction kit before filing.',
      cfg.items.map((x,i)=>`<label style="display:block;margin:9px 0"><input type="checkbox" id="mcc${i}"> ${x}</label>`).join('')+`<div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="mccExport">Create checklist report</button></div><div id="mccOut" class="notice" style="margin-top:14px;display:none"></div>`);
    mccExport.onclick=async()=>{const done=cfg.items.filter((_,i)=>document.getElementById('mcc'+i)?.checked).length,r={type,completed:done,total:cfg.items.length,completion_percent:Math.round(done/cfg.items.length*100),items:cfg.items.map((x,i)=>({item:x,done:!!document.getElementById('mcc'+i)?.checked}))};mccOut.style.display='block';mccOut.innerHTML=`Completed: <strong>${done}/${cfg.items.length}</strong> (${r.completion_percent}%)${exportCTA('mca-compliance-checklist',r,r,cfg.title)}`;status('MCA checklist prepared.',true);await logRun('mca-compliance-checklist',r,r);};
  }
  function boardMeetingCalculator(){
    shell('Board Meeting Compliance Calculator','Calculate planning dates from an actual Board meeting date. The Companies Act section 173 framework generally requires the first meeting within 30 days of incorporation and minimum four meetings a year with no more than 120 days between consecutive meetings, subject to specified exceptions.',
      `<label>Company type</label><select id="bmType"><option value="regular">Regular company</option><option value="opc">OPC / small / dormant (check applicability)</option></select><label>Incorporation date</label><input id="bmInc" type="date"><label>Last Board meeting</label><input id="bmLast" type="date"><div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="bmCalc">Calculate planning dates</button></div><div id="bmOut" class="notice" style="margin-top:14px;display:none"></div>`);
    bmCalc.onclick=async()=>{const inc=bmInc.value?new Date(bmInc.value+'T00:00:00'):null,last=bmLast.value?new Date(bmLast.value+'T00:00:00'):null;if(!inc&&!last){status('Enter incorporation date or last meeting date.');return;}const first=new Date(inc?.getTime()||Date.now());first.setDate(first.getDate()+30);const next=last?new Date(last.getTime()):null;if(next)next.setDate(next.getDate()+120);const r={company_type:bmType.value,first_meeting_planning_date:inc?first.toISOString().slice(0,10):null,max_gap_planning_date:last?next.toISOString().slice(0,10):null};bmOut.style.display='block';bmOut.innerHTML=`First-meeting planning date: <strong>${r.first_meeting_planning_date||'—'}</strong><br>120-day gap planning date: <strong>${r.max_gap_planning_date||'—'}</strong><br><small>Section 173 contains exceptions for specified classes; this is a planning aid, not a filing/meeting legal opinion.</small>${exportCTA('board-meeting-calculator',r,r,'Board Meeting Planning Report')}`;status('Board meeting dates calculated.',true);await logRun('board-meeting-calculator',r,r);};
  }

  function mcaResolutionGenerator(type='board'){
    const cfg={board:{title:'Board Resolution Generator',heading:'Board Resolution'},special:{title:'Special Resolution Generator',heading:'Special Resolution'},general:{title:'General Meeting Notice Generator',heading:'General Meeting Notice'},notice:{title:'Board Meeting Notice Generator',heading:'Notice of Board Meeting'}}[type];
    shell(cfg.title,'Create a structured draft with placeholders. Verify notice period, quorum, section/rule, explanatory statement, authority and filing requirement for the specific matter.',
      `<label>Company name</label><input id="mrCompany"><label>Registered office</label><input id="mrOffice"><label>Meeting date</label><input id="mrDate" type="date"><label>Meeting time</label><input id="mrTime" type="time"><label>Subject / agenda</label><textarea id="mrSubject" rows="3" placeholder="Describe the matter"></textarea><label>Resolution / notice text</label><textarea id="mrText" rows="5" placeholder="Enter matter-specific wording"></textarea><label>Authorised person / chair</label><input id="mrChair"><div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="mrBuild">Create draft</button></div><div id="mrOut" class="notice" style="margin-top:14px;display:none"></div>`);
    mrBuild.onclick=async()=>{if(!mrCompany.value||!mrDate.value||!mrSubject.value){status('Enter company, date and subject.');return;}const r={document_type:cfg.heading,company:mrCompany.value,registered_office:mrOffice.value,date:mrDate.value,time:mrTime.value,subject:mrSubject.value,text:mrText.value,chair:mrChair.value,verification_required:true};mrOut.style.display='block';mrOut.innerHTML=`<strong>${cfg.heading} draft prepared</strong><br>Company: ${r.company}<br>Meeting: ${r.date} ${r.time||''}<br>Subject: ${r.subject}<br><small>Draft only. Verify applicable Companies Act sections, Articles, notice period, quorum and filing requirements before use.</small>${exportCTA('mca-resolution-generator',r,r,cfg.title)}`;status('MCA draft prepared.',true);await logRun('mca-resolution-generator',r,r);};
  }
  function mcaCapitalCalculator(type='shareholding'){
    const title={shareholding:'Shareholding Calculator',paidup:'Paid-up Capital Calculator',authorised:'Authorised Capital Calculator',sharetransfer:'Share Transfer Calculator'}[type];
    shell(title,'Arithmetic planning tool. It does not determine stamp duty, valuation, pricing rules, securities-law compliance or filing fees.',
      `<label>Total shares</label><input id="mcShares" type="number" min="0" step="1"><label>Face value per share (₹)</label><input id="mcFace" type="number" min="0" step="0.01"><label>Investor / holder shares (optional)</label><input id="mcHolder" type="number" min="0" step="1"><label>Transfer / issue price per share (optional)</label><input id="mcPrice" type="number" min="0" step="0.01"><div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="mcCalc">Calculate</button></div><div id="mcOut" class="notice" style="margin-top:14px;display:none"></div>`);
    mcCalc.onclick=async()=>{const shares=Number(mcShares.value)||0,face=Number(mcFace.value)||0,holder=Number(mcHolder.value)||0,price=Number(mcPrice.value)||0;if([shares,face,holder,price].some(x=>x<0)||holder>shares){status('Enter valid share counts.');return;}const capital=shares*face,holderPct=shares?holder/shares*100:0,holderFace=holder*face,consideration=holder*price,r={total_shares:shares,face_value:face,capital,holder_shares:holder,holder_percentage:holderPct,holder_face_value:holderFace,transfer_or_issue_price:price,consideration};mcOut.style.display='block';mcOut.innerHTML=`Capital: <strong>₹${capital.toLocaleString('en-IN',{maximumFractionDigits:2})}</strong><br>Holder percentage: <strong>${holderPct.toFixed(2)}%</strong><br>Holder face value: ₹${holderFace.toLocaleString('en-IN',{maximumFractionDigits:2})}<br>Consideration at entered price: ₹${consideration.toLocaleString('en-IN',{maximumFractionDigits:2})}${exportCTA('mca-capital-calculator',r,r,title+' Report')}`;status('Capital calculation completed.',true);await logRun('mca-capital-calculator',r,r);};
  }
  function mcaEventDueDate(){
    shell('MCA Event Due-Date Planner','Calculate a planning deadline from an actual event date and an entered statutory day-count. This avoids hard-coding one universal deadline across different MCA forms.',
      `<label>Event date</label><input id="medDate" type="date"><label>Days allowed</label><input id="medDays" type="number" min="0" step="1" placeholder="Enter applicable days"><label>Form / event</label><input id="medForm" placeholder="e.g. DIR-12 / charge / appointment"><div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="medCalc">Calculate</button></div><div id="medOut" class="notice" style="margin-top:14px;display:none"></div>`);
    medCalc.onclick=async()=>{const d=medDate.value?new Date(medDate.value+'T00:00:00'):null,days=Number(medDays.value);if(!d||Number.isNaN(d.getTime())||!Number.isFinite(days)||days<0){status('Enter event date and applicable days.');return;}const due=new Date(d);due.setDate(due.getDate()+days);const r={event:medForm.value,event_date:medDate.value,days_allowed:days,planning_due_date:due.toISOString().slice(0,10)};medOut.style.display='block';medOut.innerHTML=`Planning due date: <strong>${r.planning_due_date}</strong><br><small>Enter the day-count from the current applicable Act/rule/form instruction; extensions and event-specific rules can alter the deadline.</small>${exportCTA('mca-event-due-date',r,r,'MCA Due-Date Planning Report')}`;status('MCA planning date calculated.',true);await logRun('mca-event-due-date',r,r);};
  }

  function mcaSecretarialWorkflow(type='director'){
    const cfg={director:{title:'Director Appointment / Resignation Checklist',items:['Event date recorded','Board/shareholder approval requirement checked','DIR-2 consent / resignation notice evidence collected','DIN and DSC status verified','DIR-12 purpose and particulars prepared','Current MCA V3 form/instruction kit verified','Filing deadline calculated from the actual event','SRN and approval evidence retained']},charge:{title:'Charge Creation / Modification Checklist',items:['Charge type and secured amount identified','Instrument/creation date recorded','Charge-holder details verified','Board/authorisation documents collected','CHG form and current instruction kit verified','Execution/DSC requirements checked','Applicable filing deadline calculated from actual event','SRN/certificate of registration retained']},closure:{title:'Company Closure / Strike-off Workflow',items:['Eligibility and disqualifying proceedings checked','Assets/liabilities and outstanding dues reviewed','Bank account/operations status documented','Member/director approvals prepared','STK-2 applicability and attachments verified','Current C-PACE/MCA requirements checked','Tax and other statutory obligations reviewed','Post-approval records retained']}}[type];
    shell(cfg.title,'Structured MCA workflow. Verify the current MCA V3 form, applicable section/rule, company class and event-specific deadline before filing.',
      cfg.items.map((x,i)=>`<label style="display:block;margin:9px 0"><input type="checkbox" id="msw${i}"> ${x}</label>`).join('')+`<div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="mswExport">Create workflow report</button></div><div id="mswOut" class="notice" style="margin-top:14px;display:none"></div>`);
    mswExport.onclick=async()=>{const done=cfg.items.filter((_,i)=>document.getElementById('msw'+i)?.checked).length,r={workflow:type,completed:done,total:cfg.items.length,completion_percent:Math.round(done/cfg.items.length*100),items:cfg.items.map((x,i)=>({item:x,done:!!document.getElementById('msw'+i)?.checked}))};mswOut.style.display='block';mswOut.innerHTML=`Completed: <strong>${done}/${cfg.items.length}</strong> (${r.completion_percent}%)${exportCTA('mca-secretarial-workflow',r,r,cfg.title)}`;status('MCA workflow prepared.',true);await logRun('mca-secretarial-workflow',r,r);};
  }
  function mcaComplianceCalendar(){
    shell('MCA Secretarial Compliance Calendar','Build a planning calendar from events and your applicable day-counts. This avoids stale universal deadlines and supports company-specific compliance tracking.',
      `<label>Compliance item</label><input id="mcalItem" placeholder="e.g. DIR-12 / annual filing / MSME"><label>Event / reference date</label><input id="mcalDate" type="date"><label>Applicable days</label><input id="mcalDays" type="number" min="0" step="1"><label>Notes</label><textarea id="mcalNotes" rows="3"></textarea><div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="mcalAdd">Add compliance item</button></div><div id="mcalOut" class="notice" style="margin-top:14px;display:none"></div>`);
    const rows=[];
    mcalAdd.onclick=async()=>{const d=mcalDate.value?new Date(mcalDate.value+'T00:00:00'):null,days=Number(mcalDays.value);if(!mcalItem.value||!d||Number.isNaN(d.getTime())||!Number.isFinite(days)||days<0){status('Enter item, date and applicable days.');return;}const due=new Date(d);due.setDate(due.getDate()+days);rows.push({item:mcalItem.value,event_date:mcalDate.value,days_allowed:days,due_date:due.toISOString().slice(0,10),notes:mcalNotes.value});mcalOut.style.display='block';mcalOut.innerHTML=rows.map((x,i)=>`<div><strong>${i+1}. ${x.item}</strong> — due ${x.due_date}<br><small>${x.notes||''}</small></div>`).join('')+`<br>${exportCTA('mca-compliance-calendar',rows,rows,'MCA Secretarial Compliance Calendar')}`;status('Compliance item added.',true);await logRun('mca-compliance-calendar',rows,rows);};
  }
  async function aiLegalWorkflow(tool){
    const slug=tool.slug,name=tool.name;
    const modes={
      'ai-legal-notice-assistant':['Legal Notice','Draft/review a legal notice from facts and documents.'], 'ai-agreement-reviewer':['Agreement Review','Review an agreement for clauses, obligations, ambiguities and missing protections.'], 'ai-contract-risk-finder':['Contract Risk Finder','Identify text-level contractual risk signals and questions for professional review.'], 'ai-case-summary':['Case Summary','Convert supplied case facts into a structured case summary.'], 'ai-judgment-summary':['Judgment Summary','Summarise a supplied judgment or verified judgment details without inventing citations.'], 'ai-judgment-comparison':['Judgment Comparison','Compare two supplied judgment summaries/texts and identify factual/legal differences.'], 'ai-case-law-finder':['Case-Law Finder','Formulate and research an Indian-law issue using authoritative-source AI search.'], 'ai-legal-research-assistant':['Legal Research Assistant','Research an Indian-law question with authoritative-source AI search.'], 'ai-gst-notice-analyzer':['GST Notice Analyzer','Organise a GST notice, issues, dates and response questions for professional review.'], 'ai-income-tax-notice-analyzer':['Income-Tax Notice Analyzer','Organise an income-tax notice and identify response/research questions.'], 'ai-roc-notice-analyzer':['ROC Notice Analyzer','Organise an ROC/MCA notice and identify response/research questions.'], 'ai-document-checklist-generator':['AI Document Checklist Generator','Generate a matter-specific document checklist from the facts supplied.'], 'ai-client-query-professional-answer':['Client Query → Professional Answer','Turn a client query into a structured, cautious professional-information response.'], 'ai-chronology-generator':['AI Chronology Generator','Convert supplied events into a chronological case timeline.'], 'ai-facts-to-issues-generator':['Facts → Issues','Identify potential legal issues from supplied facts for verification.'], 'ai-issues-to-law-research':['Issues → Law Research','Turn identified issues into authoritative Indian-law research questions.'], 'ai-draft-improvement':['AI Draft Improvement','Improve clarity and structure of supplied legal drafting without changing intended facts.'], 'ai-document-error-finder':['AI Document Error Finder','Identify apparent inconsistencies, missing fields and drafting errors in supplied text.'], 'ai-compliance-risk-scanner':['AI Compliance Risk Scanner','Scan supplied compliance facts for possible risk areas and verification questions.']};
    const cfg=modes[slug]||[name,'AI-assisted legal information workflow.'];
    shell(cfg[0],cfg[1],'<div class="notice"><strong>Source-first AI:</strong> The AI is not a lawyer. For current Indian-law propositions it must rely on authoritative sources available to the AI service; if verification is unavailable, it should say so instead of guessing.</div><div class="grid"><div><label>Question / matter</label><textarea id="aiQuestion" rows="7" maxlength="6000" placeholder="Describe the matter, issue, notice, agreement or research question…"></textarea><label>Supporting context / text (optional)</label><textarea id="aiContext" rows="10" maxlength="8000" placeholder="Paste relevant facts or document text. Remove unnecessary personal identifiers."></textarea><div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="aiRun">Run AI</button><button class="btn btn-ghost" id="aiClear" type="button">Clear</button></div></div><div id="aiResult" class="card" style="padding:18px"><strong>Ready</strong><p>Enter the minimum information needed for this task.</p></div></div>');
    const q=document.getElementById('aiQuestion'),ctx=document.getElementById('aiContext');
    document.getElementById('aiClear').onclick=()=>{q.value='';ctx.value='';document.getElementById('aiResult').innerHTML='<strong>Ready</strong><p>Enter the minimum information needed for this task.</p>';};
    document.getElementById('aiRun').onclick=async()=>{const question=q.value.trim(),context=ctx.value.trim();if(!question&&!context){status('Enter a question or supporting text.');return;}const finalQ=question||cfg[0];status('Researching with source-first AI…');const mode='public';const data=await ILS.ai(finalQ,'Tool: '+cfg[0]+'\nUser context:\n'+context,mode);if(!data?.ok){document.getElementById('aiResult').innerHTML='<strong>AI could not complete verification</strong><div class="notice">'+esc(data?.message||'AI service unavailable.')+'</div><p>Do not treat an unverified response as a legal conclusion.</p>';status(data?.message||'AI service unavailable.');return;}const sourceHtml=(data.sources||[]).map(s=>'<li><a href="'+esc(s.url)+'" target="_blank" rel="noopener">'+esc(s.title||s.url)+'</a></li>').join('');const result={tool:name,question:finalQ,answer:data.answer,sources:data.sources||[]};document.getElementById('aiResult').innerHTML='<strong>Verified-source AI response</strong><div style="white-space:pre-wrap;margin-top:12px">'+esc(data.answer)+'</div><div class="notice" style="margin-top:14px"><strong>Authoritative sources returned</strong><ul>'+sourceHtml+'</ul></div><div class="notice"><strong>Professional verification:</strong> Check the linked primary sources and facts before relying on this output.</div>'+exportCTA(slug,{question:finalQ,context},result,name+' — AI Research Output');status('AI response returned with authoritative sources.',true);await logRun(slug,{question:finalQ,context},result);};
  }

  function officeConversionCTA(slug,input,result,title){
    const caseTools=new Set(['client-matter-summary-generator','document-checklist-generator','document-missing-tracker','client-onboarding-form','kyc-checklist']);
    const serviceSlug=caseTools.has(slug)?'case-preparation-tool':'legal-problem-diagnostic';
    const label=caseTools.has(slug)?'Need Case Preparation / Document Review?':'Need Legal Review?';
    return '<div class="notice" style="margin-top:16px"><strong>Tool is free.</strong><p style="margin:6px 0">Use the result first. If you need advocate-level review, case preparation or a matter-specific legal assessment, you can continue to the paid professional service.</p><button type="button" class="btn btn-primary tool-buy" data-service="'+esc(serviceSlug)+'">'+esc(label)+'</button></div>';
  }

  function professionalClientWorkflow(tool){
    const slug=tool.slug, name=tool.name;
    const configs={
      'client-invoice-generator':['Client Invoice Generator','Build a clean client invoice from line items, discount and tax.','invoice'],
      'quotation-generator':['Quotation Generator','Prepare a professional quotation with validity, line items and optional tax.','quote'],
      'engagement-letter-generator':['Engagement Letter Generator','Create an editable engagement-letter brief with scope, fee and payment terms.','engagement'],
      'client-onboarding-form':['Client Onboarding Form','Capture the minimum client and matter information in a structured onboarding sheet.','onboarding'],
      'kyc-checklist':['KYC Checklist','Create a client KYC checklist and track missing items.','kyc'],
      'document-checklist-generator':['Document Checklist Generator','Build a matter-specific document checklist with required and optional items.','documents'],
      'document-missing-tracker':['Document Missing Tracker','Track requested, received and missing documents for a matter.','missing'],
      'deadline-calculator':['Deadline Calculator','Plan a date from an event date and user-supplied days. Verify the applicable rule.','deadline'],
      'compliance-calendar':['Compliance Calendar','Create a simple event calendar from user-supplied compliance dates. Verify current rules.','calendar'],
      'reminder-generator':['Reminder Generator','Create reusable reminders for client, case or compliance follow-up.','reminder'],
      'client-follow-up-tracker':['Client Follow-up Tracker','Track follow-ups locally in this browser so pending actions are easy to revisit.','followup'],
      'payment-due-tracker':['Payment Due Tracker','Track payment due dates locally and identify overdue items.','payment'],
      'outstanding-fee-calculator':['Outstanding Fee Calculator','Calculate outstanding professional fees from agreed fee, payments and adjustments.','outstanding'],
      'interest-on-delayed-payment-calculator':['Interest on Delayed Payment Calculator','Calculate indicative interest using the applicable agreement, order or law rate.','delayinterest'],
      'professional-time-billing-calculator':['Professional Time / Billing Calculator','Convert hours, minutes and an hourly rate into a transparent billing estimate.','billing'],
      'work-allocation-tracker':['Work Allocation Tracker','Organise tasks, owners, priority and status for a matter or office workflow.','work'],
      'client-matter-summary-generator':['Client Matter Summary Generator','Turn matter facts, status, next steps and documents into a concise summary.','summary'],
      'document-naming-generator':['Document Naming Generator','Generate consistent, searchable document names from matter, type and date.','naming']
    };
    const cfg=configs[slug]||[name,'Prepare a structured professional workflow.','generic'];
    const presets={
      invoice:['Client / Matter','Invoice number','Issue date','Due date','Discount %','GST / tax %','Line items (description | qty | rate, one per line)'],
      quote:['Client / Matter','Quotation number','Quote date','Valid until','Discount %','GST / tax %','Line items (description | qty | rate, one per line)'],
      engagement:['Client name','Matter / scope','Start date','Fee / billing basis','Payment terms','Key exclusions / assumptions'],
      onboarding:['Client name','Phone / email','Matter type','Opposite party / counterparty','Matter summary','Documents currently available'],
      kyc:['Client / entity name','Matter type','KYC items (one per line)'],
      documents:['Matter / case type','Required documents (one per line)','Optional documents (one per line)'],
      missing:['Matter / client','Requested documents (one per line)','Received documents (one per line)'],
      deadline:['Event date','Days to add','Purpose / rule note'],
      calendar:['Matter / entity','Events (YYYY-MM-DD | event name | owner, one per line)'],
      reminder:['Reminder title','Reminder date','Owner','Message / action'],
      followup:['Client / matter','Follow-ups (YYYY-MM-DD | action | owner | status, one per line)'],
      payment:['Client / matter','Payments/due items (due date | description | amount | paid amount, one per line)'],
      outstanding:['Agreed / billed fee (₹)','Payments received (₹)','Adjustments / credit (₹)'],
      delayinterest:['Outstanding amount (₹)','Annual interest rate (%)','Delay days','Rate / legal basis note'],
      billing:['Hourly rate (₹)','Hours','Minutes','Other billable amount (₹)'],
      work:['Matter / project','Tasks (task | owner | priority | status, one per line)'],
      summary:['Client / matter','Facts / background','Current status','Next steps','Documents / issues'],
      naming:['Client / matter','Document type','Document date','Version / reference']
    };
    const labels=presets[cfg[2]]||['Context','Details'];
    const inputHtml=labels.map((l,i)=>{
      const multi=((cfg[2]==='invoice'||cfg[2]==='quote')&&i===6)||(['calendar','followup','payment','work'].includes(cfg[2])&&i===1)||(['kyc','documents','missing'].includes(cfg[2])&&i>0);
      return '<label>'+esc(l)+'</label>'+(multi?'<textarea id="pcf'+i+'" rows="6" placeholder="One item per line"></textarea>':'<input id="pcf'+i+'" type="'+(/date|valid until|start date|due date/i.test(l)?'date':'text')+'" maxlength="1000" placeholder="'+esc(l)+'">');
    }).join('');
    shell(cfg[0],cfg[1],'<div class="notice"><strong>Workflow:</strong> Enter the minimum facts → generate a structured result → verify/edit it → optionally buy a clean printable/PDF output.</div><div class="grid"><div>'+inputHtml+'<div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="pcfRun">Generate</button><button class="btn btn-ghost" id="pcfClear" type="button">Clear</button></div></div><div id="pcfResult" class="card" style="padding:18px"><strong>Ready</strong><p>Complete the relevant fields to generate your result.</p></div></div>');
    const vals=()=>labels.map((_,i)=>document.getElementById('pcf'+i)?.value?.trim()||'');
    const key='ils-tool-'+slug;
    try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(Array.isArray(saved))saved.forEach((v,i)=>{const el=document.getElementById('pcf'+i);if(el)el.value=v;});}catch(e){}
    document.getElementById('pcfClear').onclick=()=>{labels.forEach((_,i)=>{const el=document.getElementById('pcf'+i);if(el)el.value='';});try{localStorage.removeItem(key);}catch(e){}};
    document.getElementById('pcfRun').onclick=async()=>{
      const v=vals(); if(!v.some(Boolean)){status('Enter at least one relevant detail.');return;}
      try{localStorage.setItem(key,JSON.stringify(v));}catch(e){}
      let result={tool:name,fields:Object.fromEntries(labels.map((l,i)=>[l,v[i]||'Not supplied']))};
      if(cfg[2]==='invoice'||cfg[2]==='quote'){
        const lines=(v[6]||'').split(/\n+/).map(x=>x.split('|').map(y=>y.trim())).filter(x=>x.length>=3&&x[0]);
        const rows=lines.map(x=>({description:x[0],qty:Number(x[1])||0,rate:Number(x[2])||0,amount:(Number(x[1])||0)*(Number(x[2])||0)}));
        const subtotal=rows.reduce((a,x)=>a+x.amount,0),discount=subtotal*(Number(v[4])||0)/100,taxable=subtotal-discount,tax=taxable*(Number(v[5])||0)/100;
        result={...result,lines,subtotal,discount,taxable,tax,total:taxable+tax};
      } else if(cfg[2]==='deadline'){
        const d=new Date(v[0]+'T12:00:00'),days=Number(v[1]); if(!v[0]||!Number.isInteger(days)||days<0){status('Enter a valid event date and whole number of days.');return;} d.setDate(d.getDate()+days);result.planned_date=d.toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'});result.note='Calendar-day planning only; verify statutory computation, exclusions and jurisdiction.';
      } else if(cfg[2]==='outstanding'){
        const billed=Number(v[0])||0,paid=Number(v[1])||0,adj=Number(v[2])||0;result.outstanding=Math.max(0,billed-paid-adj);
      } else if(cfg[2]==='delayinterest'){
        const amount=Number(v[0])||0,rate=Number(v[1])||0,days=Number(v[2])||0;result.interest=amount*rate*days/36500;result.total=amount+result.interest;result.note='Indicative simple interest; use the legally/contractually applicable rate and day-count convention.';
      } else if(cfg[2]==='billing'){
        const hourly=Number(v[0])||0,hours=Number(v[1])||0,minutes=Number(v[2])||0,other=Number(v[3])||0,totalHours=hours+minutes/60;result.billable_hours=totalHours;result.time_fee=totalHours*hourly;result.total=result.time_fee+other;
      } else if(cfg[2]==='naming'){
        const clean=x=>(x||'').replace(/[^A-Za-z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase();result.suggested_name=[clean(v[0]),clean(v[1]),v[2]||'undated',clean(v[3])].filter(Boolean).join('_')+'.pdf';
      }
      const pretty=Object.entries(result).filter(([k])=>k!=='fields'&&k!=='lines').map(([k,x])=>'<tr><td><strong>'+esc(k.replace(/_/g,' '))+'</strong></td><td>'+esc(typeof x==='object'?JSON.stringify(x):String(x))+'</td></tr>').join('');
      const lineHtml=result.lines?'<h4>Line items</h4><ul>'+result.lines.map(x=>'<li>'+esc(x.description)+' — '+esc(String(x.qty))+' × ₹'+esc(String(x.rate))+' = ₹'+esc(String(x.amount))+'</li>').join('')+'</ul>':'';
      document.getElementById('pcfResult').innerHTML='<strong>Free result ready</strong><table style="width:100%;margin-top:12px">'+pretty+'</table>'+lineHtml+'<div class="notice" style="margin-top:12px"><strong>Free-use note:</strong> This tool is available without a report fee. Verify names, dates, amounts, tax treatment, contractual terms and applicable law before use.</div>'+officeConversionCTA(slug,v,result,cfg[0]);
      status('Professional workflow completed.',true); await logRun(slug,{fields:v},result);
    };
  }


  async function pdfDocumentWorkflow(tool){
    const slug=tool.slug, name=tool.name;
    const cfg={
      'pdf-merge-compress-split':['PDF Merge / Compress / Split','Combine PDFs, extract selected pages, or download a processed PDF in your browser.','merge'],
      'pdf-to-image':['PDF to Image','Render selected PDF pages to PNG images in your browser.','toimage'],
      'image-to-pdf':['Image to PDF','Convert JPG/PNG/WEBP images into a single PDF in your browser.','fromimage'],
      'pdf-page-numbering':['PDF Page Numbering','Add page numbers to every page of a PDF.','number'],
      'pdf-watermark':['PDF Watermark','Add a text watermark to each PDF page.','watermark'],
      'document-comparison':['Document Comparison','Compare extracted text from two PDFs and highlight added/removed lines.','compare'],
      'digital-signature-placement':['Digital Signature Placement','Place a signature image on a selected PDF page. This is visual placement, not a cryptographic e-signature.','signature'],
      'document-redaction-tool':['Document Redaction Tool','Create a flattened image-based PDF with a user-defined redaction rectangle. This removes selectable text from the output page, but the source file is never changed.','redact']
    }[slug]||[name,'Browser document utility.','generic'];
    const escH=window.ILS?.esc||esc;
    const acceptPdf='.pdf',acceptImg='image/jpeg,image/png,image/webp';
    let fields='';
    if(cfg[2]==='merge') fields='<label>PDF files</label><input id="pdfFiles" type="file" accept=".pdf,application/pdf" multiple><label>Mode</label><select id="pdfMode"><option value="merge">Merge all</option><option value="extract">Extract pages from first PDF</option></select><label>Pages (extract mode)</label><input id="pdfPages" placeholder="e.g. 1,3-5,8"><small>Pages are 1-based. Leave blank to merge.</small>';
    if(cfg[2]==='toimage') fields='<label>PDF</label><input id="pdfFile" type="file" accept="'+acceptPdf+'"><label>Page number</label><input id="pdfPage" type="number" min="1" value="1"><label>Scale</label><input id="pdfScale" type="number" min="1" max="4" step=".5" value="2">';
    if(cfg[2]==='fromimage') fields='<label>Images</label><input id="imgFiles" type="file" accept="'+acceptImg+'" multiple><label>Page orientation</label><select id="imgOrient"><option value="auto">Auto</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select>';
    if(cfg[2]==='number') fields='<label>PDF</label><input id="pdfFile" type="file" accept="'+acceptPdf+'"><label>Position</label><select id="pdfPos"><option value="bottom-center">Bottom center</option><option value="bottom-right">Bottom right</option><option value="bottom-left">Bottom left</option></select>';
    if(cfg[2]==='watermark') fields='<label>PDF</label><input id="pdfFile" type="file" accept="'+acceptPdf+'"><label>Watermark text</label><input id="pdfText" maxlength="100"><label>Opacity (0.05–0.5)</label><input id="pdfOpacity" type="number" min=".05" max=".5" step=".05" value=".18">';
    if(cfg[2]==='compare') fields='<label>Original PDF</label><input id="pdfA" type="file" accept="'+acceptPdf+'"><label>New PDF</label><input id="pdfB" type="file" accept="'+acceptPdf+'">';
    if(cfg[2]==='signature') fields='<label>PDF</label><input id="pdfFile" type="file" accept="'+acceptPdf+'"><label>Signature image</label><input id="sigFile" type="file" accept="'+acceptImg+'"><label>Page number</label><input id="sigPage" type="number" min="1" value="1"><label>X / Y / Width / Height (PDF points)</label><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px"><input id="sigX" type="number" value="60"><input id="sigY" type="number" value="60"><input id="sigW" type="number" value="180"><input id="sigH" type="number" value="70"></div>';
    if(cfg[2]==='redact') fields='<label>PDF</label><input id="pdfFile" type="file" accept="'+acceptPdf+'"><label>Page number</label><input id="redPage" type="number" min="1" value="1"><label>Redaction rectangle — X / Y / Width / Height (PDF points)</label><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px"><input id="redX" type="number" value="60"><input id="redY" type="number" value="60"><input id="redW" type="number" value="180"><input id="redH" type="number" value="70"></div><small>Output is flattened to an image-based PDF for the selected page. Verify the rectangle visually before sharing.</small>';
    shell(cfg[0],cfg[1],'<div class="notice"><strong>Privacy:</strong> Files are processed in the browser. Do not upload confidential documents to a tool unless you are comfortable with the browser/network environment and your own device security.</div><div class="grid"><div>'+fields+'<div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="pdfRun">Process</button></div></div><div id="pdfResult" class="card" style="padding:18px"><strong>Ready</strong><p>Select the required file(s) and process.</p></div></div>');
    const documentConversionCTA=()=>'<div class="notice" style="margin-top:16px"><strong>Need professional help with this document?</strong><p style="margin:6px 0">The document tool is free. If you want an advocate to review the document, prepare the case, or advise on the next legal step, continue below.</p><div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="btn btn-primary tool-buy" data-service="legal-problem-diagnostic">Legal Consultation / Review</button><button type="button" class="btn btn-primary tool-buy" data-service="case-preparation-tool">Case Preparation</button></div></div>';
    const out=(blob,name)=>{const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.textContent='Download '+name;a.className='btn btn-primary';a.style.display='inline-block';a.style.marginTop='10px';document.getElementById('pdfResult').innerHTML='<strong>Completed</strong><p>Your processed file is ready.</p>';document.getElementById('pdfResult').appendChild(a);document.getElementById('pdfResult').insertAdjacentHTML('beforeend',documentConversionCTA());};
    const read=async file=>new Uint8Array(await file.arrayBuffer());
    const getPdf=async file=>PDFLib.PDFDocument.load(await read(file),{ignoreEncryption:false});
    async function renderPage(file,pageNo,scale=2){
      const data=await read(file), pdf=await window.pdfjsLib?.getDocument({data}).promise;
      if(!pdf)throw new Error('PDF renderer is not available. Please reload the page.');
      const page=await pdf.getPage(pageNo), vp=page.getViewport({scale});
      const canvas=document.createElement('canvas');canvas.width=vp.width;canvas.height=vp.height;
      await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;return canvas;
    }
    document.getElementById('pdfRun').onclick=async()=>{
      try{
        status('Processing document…');
        if(!window.PDFLib)throw new Error('PDF engine is still loading. Please wait a moment and try again.');
        if(cfg[2]==='merge'){
          const files=[...(document.getElementById('pdfFiles').files||[])];if(!files.length)throw new Error('Select at least one PDF.');
          const mode=document.getElementById('pdfMode').value,target=await PDFLib.PDFDocument.create();
          if(mode==='merge'){for(const file of files){const src=await getPdf(file);const pages=await target.copyPages(src,src.getPageIndices());pages.forEach(p=>target.addPage(p));}}
          else{const src=await getPdf(files[0]),range=(document.getElementById('pdfPages').value||'').split(',').flatMap(part=>{const [a,b]=part.split('-').map(Number);if(!a)return[];return b?Array.from({length:b-a+1},(_,i)=>a+i):[a];}).filter(n=>n>0&&n<=src.getPageCount());if(!range.length)throw new Error('Enter valid page numbers.');const pages=await target.copyPages(src,range.map(n=>n-1));pages.forEach(p=>target.addPage(p));}
          out(new Blob([await target.save()],{type:'application/pdf'}),'ils-processed.pdf');
        } else if(cfg[2]==='fromimage'){
          const files=[...(document.getElementById('imgFiles').files||[])];if(!files.length)throw new Error('Select at least one image.');
          const pdf=await PDFLib.PDFDocument.create();
          for(const file of files){const bytes=await read(file),img=file.type==='image/png'?await pdf.embedPng(bytes):await pdf.embedJpg(bytes),orient=document.getElementById('imgOrient').value;let w=img.width,h=img.height;if(orient==='portrait'&&w>h)[w,h]=[h,w];if(orient==='landscape'&&h>w)[w,h]=[h,w];const page=pdf.addPage([w,h]);page.drawImage(img,{x:0,y:0,width:w,height:h});}
          out(new Blob([await pdf.save()],{type:'application/pdf'}),'ils-images.pdf');
        } else if(cfg[2]==='toimage'){
          const file=document.getElementById('pdfFile').files[0],page=Number(document.getElementById('pdfPage').value),scale=Number(document.getElementById('pdfScale').value)||2;if(!file)throw new Error('Select a PDF.');const canvas=await renderPage(file,page,scale);canvas.toBlob(blob=>out(blob,'ils-page-'+page+'.png'),'image/png');
        } else if(cfg[2]==='number'||cfg[2]==='watermark'||cfg[2]==='signature'){
          const file=document.getElementById('pdfFile').files[0];if(!file)throw new Error('Select a PDF.');const pdf=await getPdf(file),font=await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
          if(cfg[2]==='number'){const pos=document.getElementById('pdfPos').value;pdf.getPages().forEach((p,i)=>{const {width}=p.getSize();const txt=String(i+1),tw=font.widthOfTextAtSize(txt,10);const x=pos==='bottom-right'?width-tw-30:pos==='bottom-left'?30:(width-tw)/2;p.drawText(txt,{x,y:20,size:10,font});});}
          if(cfg[2]==='watermark'){const txt=document.getElementById('pdfText').value.trim();if(!txt)throw new Error('Enter watermark text.');const op=Math.min(.5,Math.max(.05,Number(document.getElementById('pdfOpacity').value)||.18));pdf.getPages().forEach(p=>{const {width,height}=p.getSize();p.drawText(txt,{x:width*.2,y:height*.45,size:34,font,opacity:op,rotate:PDFLib.degrees(35)});});}
          if(cfg[2]==='signature'){const sf=document.getElementById('sigFile').files[0],pg=Number(document.getElementById('sigPage').value);if(!sf)throw new Error('Select a signature image.');const img=sf.type==='image/png'?await pdf.embedPng(await read(sf)):await pdf.embedJpg(await read(sf));const p=pdf.getPages()[pg-1];if(!p)throw new Error('Invalid page number.');p.drawImage(img,{x:Number(sigX.value),y:Number(sigY.value),width:Number(sigW.value),height:Number(sigH.value)});}
          out(new Blob([await pdf.save()],{type:'application/pdf'}),'ils-edited.pdf');
        } else if(cfg[2]==='compare'){
          const a=document.getElementById('pdfA').files[0],bb=document.getElementById('pdfB').files[0];if(!a||!bb)throw new Error('Select both PDFs.');
          if(!window.pdfjsLib)throw new Error('PDF text engine is still loading. Please reload.');
          const textOf=async file=>{const data=await read(file),pdf=await window.pdfjsLib.getDocument({data}).promise,arr=[];for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i),tc=await p.getTextContent();arr.push(tc.items.map(x=>x.str).join(' '));}return arr.join('\\n');};
          const [ta,tb]=await Promise.all([textOf(a),textOf(bb)]),al=ta.split(/\\n+/),bl=tb.split(/\\n+/),as=new Set(al),bs=new Set(bl),added=bl.filter(x=>x.trim()&&!as.has(x)),removed=al.filter(x=>x.trim()&&!bs.has(x));document.getElementById('pdfResult').innerHTML='<strong>Text comparison completed</strong><p>Added lines: '+added.length+' • Removed lines: '+removed.length+'</p><h4>Added</h4><pre style="white-space:pre-wrap">'+escH(added.join('\\n')||'None')+'</pre><h4>Removed</h4><pre style="white-space:pre-wrap">'+escH(removed.join('\\n')||'None')+'</pre>'+documentConversionCTA();
        } else if(cfg[2]==='redact'){
          const file=document.getElementById('pdfFile').files[0],pg=Number(document.getElementById('redPage').value);if(!file)throw new Error('Select a PDF.');const canvas=await renderPage(file,pg,2),ctx=canvas.getContext('2d');const sx=canvas.width/(await getPdf(file)).getPages()[pg-1].getWidth(),sy=canvas.height/(await getPdf(file)).getPages()[pg-1].getHeight();ctx.fillStyle='#000';ctx.fillRect(Number(redX.value)*sx,canvas.height-(Number(redY.value)+Number(redH.value))*sy,Number(redW.value)*sx,Number(redH.value)*sy);const png=await new Promise(res=>canvas.toBlob(res,'image/png'));const pdf=await PDFLib.PDFDocument.create(),img=await pdf.embedPng(await png.arrayBuffer());pdf.addPage([canvas.width/2,canvas.height/2]).drawImage(img,{x:0,y:0,width:canvas.width/2,height:canvas.height/2});out(new Blob([await pdf.save()],{type:'application/pdf'}),'ils-redacted-page-'+pg+'.pdf');
        }
        status('Document operation completed.',true);
      }catch(e){console.error(e);status(e?.message||'Document operation failed.');}
    };
  }


  function genericGuided(tool){
    const w=workspace(); if(!w)return;
    const price=Number(tool.price||0);
    const paid=price>0;
    w.innerHTML=`<div class="tool-head"><div><span class="eyebrow">${esc(tool.category.toUpperCase())} • TOOL ${tool.id}</span><h2>${esc(tool.name)}</h2><p>Free guidance first. This guided workflow helps you organise inputs and prepare a review-ready task brief; it does not independently determine legal, tax, accounting or regulatory outcomes.</p></div><div class="tool-badges"><span class="tool-badge">${paid?'₹'+price+' output':'FREE'}</span><span class="tool-mode">Guided workflow</span></div></div><div class="grid"><div><label>Context / matter</label><input id="gtContext" placeholder="What are you trying to do?"><label>Amount / value (optional)</label><input id="gtAmount" type="number" min="0" step="0.01" placeholder="Enter amount if relevant"><label>Date / deadline (optional)</label><input id="gtDate" type="date"><label>Key details / documents</label><textarea id="gtNotes" rows="5" placeholder="Enter facts, documents available, questions or assumptions…"></textarea><button type="button" class="btn btn-primary" id="gtRun">Prepare Free Guidance</button></div><div id="gtResult" class="card" style="padding:18px"><strong>Free guidance</strong><p>Enter the minimum details you have. ILS will organise them into a practical task brief.</p><ul><li>Check the applicable law / authority before relying on a legal or compliance result.</li><li>Keep supporting documents ready for professional review.</li><li>Use the paid output only if you need a printable / PDF-ready report.</li></ul></div></div>`;
    const run=document.getElementById('gtRun');
    run.onclick=()=>{
      const input={context:document.getElementById('gtContext').value.trim(),amount:document.getElementById('gtAmount').value,date:document.getElementById('gtDate').value,notes:document.getElementById('gtNotes').value.trim()};
      if(!input.context&&!input.notes&&!input.amount&&!input.date){status('Add at least one detail for the guided result.');return;}
      const result={tool:tool.name,category:tool.category,task_brief:input.context||tool.name,amount:input.amount||'Not supplied',date:input.date||'Not supplied',details:input.notes||'Not supplied',guidance:'Verify the applicable law, authority, filing rule, jurisdiction, tax treatment or professional standard before relying on this output.'};
      const legalConversion=tool.category==='advocate'?'<div class="notice" style="margin-top:16px"><strong>Tool is FREE — professional help is paid.</strong><p style="margin:6px 0">Use this result first. If you need advocate review, bail / arrest consultation, or complete case preparation, continue below.</p><div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="btn btn-primary tool-buy" data-service="legal-consultation">Legal Review / Consultation</button><button type="button" class="btn btn-primary tool-buy" data-service="legal-consultation">Bail / Arrest Consultation</button><button type="button" class="btn btn-primary tool-buy" data-service="case-preparation-tool">Case Preparation</button></div></div>':exportCTA(tool.slug,input,result,tool.name+' — Professional Output');
      document.getElementById('gtResult').innerHTML=`<strong>Free guidance prepared</strong><table style="width:100%;margin-top:12px"><tr><td><strong>Task</strong></td><td>${esc(result.task_brief)}</td></tr><tr><td><strong>Amount</strong></td><td>${esc(result.amount)}</td></tr><tr><td><strong>Date</strong></td><td>${esc(result.date)}</td></tr><tr><td><strong>Details</strong></td><td>${esc(result.details)}</td></tr></table><div class="notice" style="margin-top:12px">${esc(result.guidance)}</div>${legalConversion}`;
      status('Free guidance prepared.',true); logRun(tool.slug,input,result);
    };
  }

  function open(slug){
    const map={
      'legal-deadline-calculator':deadline,
      'interest-calculator':interest,
      'case-timeline':timeline,
      'case-checklist':checklist,
      'cheque-bounce-timeline':cheque,
      'limitation-calculator':limitation,

      'court-fee-calculator':()=>rateEstimator(
        'court-fee-calculator',
        'Court Fee Estimator',
        toolCopy['court-fee-calculator'][1],
        'Rate',
        'This estimate uses only the rate and fixed amount you supplied. Actual court fee may be governed by state amendments, schedules, court rules and case valuation.'
      ),

      'stamp-duty-calculator':()=>rateEstimator(
        'stamp-duty-calculator',
        'Stamp Duty Estimator',
        toolCopy['stamp-duty-calculator'][1],
        'Rate',
        'This estimate uses only the rate and fixed amount you supplied. Actual stamp duty depends on the applicable state law, instrument, consideration, market value and other facts.'
      ),

      'maintenance-estimator':maintenance,
      'legal-problem-diagnostic':diagnostic,
      'case-preparation-tool':casePrep,
      'property-document-checklist':propertyChecklist,
      'accounting-computation':accountingComputation,
      'balance-sheet-tool':balanceSheetTool,
      'profit-loss-tool':profitLossTool,'client-invoice-generator':()=>professionalClientWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='client-invoice-generator')),'quotation-generator':()=>professionalClientWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='quotation-generator')),'engagement-letter-generator':()=>professionalClientWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='engagement-letter-generator')),'client-onboarding-form':()=>professionalClientWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='client-onboarding-form')),'kyc-checklist':()=>professionalClientWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='kyc-checklist')),'document-checklist-generator':()=>professionalClientWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='document-checklist-generator')),'document-missing-tracker':()=>professionalClientWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='document-missing-tracker')),'deadline-calculator':()=>professionalClientWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='deadline-calculator')),'compliance-calendar':()=>professionalClientWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='compliance-calendar')),'reminder-generator':()=>professionalClientWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='reminder-generator')),'client-follow-up-tracker':()=>professionalClientWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='client-follow-up-tracker')),'payment-due-tracker':()=>professionalClientWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='payment-due-tracker')),'outstanding-fee-calculator':()=>professionalClientWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='outstanding-fee-calculator')),'interest-on-delayed-payment-calculator':()=>professionalClientWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='interest-on-delayed-payment-calculator')),'professional-time-billing-calculator':()=>professionalClientWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='professional-time-billing-calculator')),'work-allocation-tracker':()=>professionalClientWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='work-allocation-tracker')),'client-matter-summary-generator':()=>professionalClientWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='client-matter-summary-generator')),'document-naming-generator':()=>professionalClientWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='document-naming-generator')),'pdf-merge-compress-split':()=>pdfDocumentWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='pdf-merge-compress-split')),'pdf-to-image':()=>pdfDocumentWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='pdf-to-image')),'image-to-pdf':()=>pdfDocumentWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='image-to-pdf')),'pdf-page-numbering':()=>pdfDocumentWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='pdf-page-numbering')),'pdf-watermark':()=>pdfDocumentWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='pdf-watermark')),'document-comparison':()=>pdfDocumentWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='document-comparison')),'digital-signature-placement':()=>pdfDocumentWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='digital-signature-placement')),'document-redaction-tool':()=>pdfDocumentWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='document-redaction-tool')),'ai-legal-notice-assistant':()=>aiLegalWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='ai-legal-notice-assistant')),'ai-agreement-reviewer':()=>aiLegalWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='ai-agreement-reviewer')),'ai-contract-risk-finder':()=>aiLegalWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='ai-contract-risk-finder')),'ai-case-summary':()=>aiLegalWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='ai-case-summary')),'ai-judgment-summary':()=>aiLegalWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='ai-judgment-summary')),'ai-judgment-comparison':()=>aiLegalWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='ai-judgment-comparison')),'ai-case-law-finder':()=>aiLegalWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='ai-case-law-finder')),'ai-legal-research-assistant':()=>aiLegalWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='ai-legal-research-assistant')),'ai-gst-notice-analyzer':()=>aiLegalWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='ai-gst-notice-analyzer')),'ai-income-tax-notice-analyzer':()=>aiLegalWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='ai-income-tax-notice-analyzer')),'ai-roc-notice-analyzer':()=>aiLegalWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='ai-roc-notice-analyzer')),'ai-document-checklist-generator':()=>aiLegalWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='ai-document-checklist-generator')),'ai-client-query-professional-answer':()=>aiLegalWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='ai-client-query-professional-answer')),'ai-chronology-generator':()=>aiLegalWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='ai-chronology-generator')),'ai-facts-to-issues-generator':()=>aiLegalWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='ai-facts-to-issues-generator')),'ai-issues-to-law-research':()=>aiLegalWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='ai-issues-to-law-research')),'ai-draft-improvement':()=>aiLegalWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='ai-draft-improvement')),'ai-document-error-finder':()=>aiLegalWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='ai-document-error-finder')),'ai-compliance-risk-scanner':()=>aiLegalWorkflow(window.ILS_TOOL_CATALOG.find(x=>x.slug==='ai-compliance-risk-scanner')),
      'gst-calculator':gstCalculator,'tds-calculator':tdsCalculator,'gst-interest-calculator':gstInterestCalculator,'professional-fee-calculator':professionalFeeCalculator,'invoice-total-calculator':invoiceTotalCalculator,'mca-compliance-checklist':mcaComplianceChecklist,'tax-payment-planner':taxPaymentPlanner,'compliance-deadline-planner':complianceDeadlinePlanner,'income-tax-calculator':()=>incomeTax2026('new'),'old-new-tax-regime-comparison':()=>incomeTax2026('compare'),'advance-tax-calculator':advanceTaxCalculator,'self-assessment-tax-calculator':selfAssessmentTaxCalculator,'tds-interest-calculator':tdsInterest2026,'tds-late-filing-fee-calculator':tdsLateFee2026,'gst-inclusive-exclusive-calculator':()=>gstCoreCalculator('inclusive'),'cgst-sgst-igst-calculator':()=>gstCoreCalculator('split'),'gst-payment-interest-calculator':gstPaymentCalculator,'itc-reconciliation-tool':()=>gstReconcile('itc'),'gst-registration-eligibility':()=>gstComplianceChecklist('registration'),'gst-registration-documents':()=>gstComplianceChecklist('regdocs'),'gst-return-due-date':gstReturnDueDatePlanner,'gstr1-checklist':()=>gstComplianceChecklist('gstr1'),'gstr3b-checklist':()=>gstComplianceChecklist('gstr3b'),'gstr9-checklist':()=>gstComplianceChecklist('gstr9'),'gstr9c-checklist':()=>gstComplianceChecklist('gstr9c'),'gst-notice-checklist':()=>gstComplianceChecklist('notice'),'gst-refund-checklist':()=>gstComplianceChecklist('refund'),'lut-checklist':()=>gstComplianceChecklist('lut'),'gst-amendment-checklist':()=>gstComplianceChecklist('amendment'),'gst-cancellation-checklist':()=>gstComplianceChecklist('cancellation'),'gst-invoice-generator':()=>gstDocumentGenerator('invoice'),'gst-credit-debit-note-generator':()=>gstDocumentGenerator('credit'),'gst-hsn-sac-finder':gstClassificationFinder,'gst-rate-finder':gstClassificationFinder,'einvoice-checker':eInvoiceChecker,'eway-validity-calculator':ewayValidityCalculator,'gst-composition-calculator':gstCompositionCalculator,'gst-late-fee-calculator':gstLateFeeCalculator,'gst-demand-calculator':gstDemandCalculator,'gst-refund-calculator':gstRefundCalculator,'company-incorporation-checklist':()=>mcaComplianceChecklist('incorporation'),'director-eligibility-checklist':()=>mcaComplianceChecklist('director'),'din-related-checklist':()=>mcaComplianceChecklist('din'),'dsc-expiry-tracker':()=>mcaComplianceChecklist('dsc'),'annual-filing-due-date':()=>mcaComplianceChecklist('annual'),'roc-filing-checklist':()=>mcaComplianceChecklist('roc'),'msme-compliance-checklist':()=>mcaComplianceChecklist('msmE'),'beneficial-ownership-checklist':()=>mcaComplianceChecklist('beneficial'),'company-closure-checklist':()=>mcaComplianceChecklist('closure'),'strike-off-checklist':()=>mcaComplianceChecklist('closure'),'board-meeting-calculator':boardMeetingCalculator,'board-meeting-notice':()=>mcaResolutionGenerator('notice'),'board-resolution':()=>mcaResolutionGenerator('board'),'special-resolution':()=>mcaResolutionGenerator('special'),'general-meeting-notice':()=>mcaResolutionGenerator('general'),'share-transfer-calculator':()=>mcaCapitalCalculator('sharetransfer'),'shareholding-calculator':()=>mcaCapitalCalculator('shareholding'),'paid-up-capital-calculator':()=>mcaCapitalCalculator('paidup'),'authorised-capital-calculator':()=>mcaCapitalCalculator('authorised'),'director-appointment-checklist':()=>mcaComplianceChecklist('director'),'director-resignation-checklist':()=>mcaComplianceChecklist('director'),'charge-checklist':()=>mcaComplianceChecklist('roc'),'agm-due-date':mcaEventDueDate,'aoc4-checklist':()=>mcaComplianceChecklist('annual'),'mgt7-checklist':()=>mcaComplianceChecklist('annual'),'dir3-kyc-checklist':()=>mcaComplianceChecklist('din'),'director-appointment-workflow':()=>mcaSecretarialWorkflow('director'),'director-resignation-workflow':()=>mcaSecretarialWorkflow('director'),'charge-workflow':()=>mcaSecretarialWorkflow('charge'),'company-closure-workflow':()=>mcaSecretarialWorkflow('closure'),'strike-off-workflow':()=>mcaSecretarialWorkflow('closure'),'mca-compliance-calendar':mcaComplianceCalendar,'gstr-2b-reconciliation':()=>gstReconcile('gstr2b'),'purchase-vs-2b-difference-finder':()=>gstReconcile('purchase2b'),'sales-vs-gstr-1-reconciliation':()=>gstReconcile('sales1'),'gst-to-turnover-reconciliation':()=>gstReconcile('turnover'),'itc-calculator':itcCalculator
    };

    if(map[slug]){
      map[slug]();
    }else if(window.ILS_TOOL_CATALOG){
      const tool=window.ILS_TOOL_CATALOG.find(x=>x.slug===slug);
      if(tool) genericGuided(tool);
    }
    const target=workspace();
    if(target){
      requestAnimationFrame(()=>{const behavior=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';const top=Math.max(0,window.scrollY+target.getBoundingClientRect().top-16);window.scrollTo({top,behavior});});
    }
  }

  function renderCatalog(){
    const grid=document.getElementById('toolCatalogGrid');
    if(!grid||!Array.isArray(window.ILS_TOOL_CATALOG))return;
    const icons={advocate:'⚖️',ca:'📊',gst:'🧾',cs:'🏢',common:'👥',ai:'🤖',compliance:'📅',finance:'💰'};
    const labels={advocate:'Advocate',ca:'CA',gst:'GST',cs:'CS / MCA',common:'Common',ai:'AI',compliance:'Compliance',finance:'Finance'};
    grid.innerHTML=window.ILS_TOOL_CATALOG.map(t=>{const price=t.price?'<span class="tool-price">₹'+t.price+'</span>':'<span class="tool-badge">FREE</span>';const popular=t.popular?'<span class="tool-popular">MOST USED</span>':'';const desc=t.mode==='full'?'Working ILS tool with guided inputs and result flow.':'Guided starter: organise inputs, free guidance and optional printable output.';return '<article class="card tool-card" data-category="'+t.category+'" data-profession="'+t.category+'" data-popular="'+t.popular+'" data-price="'+t.price+'" data-mode="'+t.mode+'" data-tool-name="'+(t.name+' '+labels[t.category]+' '+desc).toLowerCase()+'"><div class="tool-card-top"><span class="tool-icon">'+icons[t.category]+'</span><div class="tool-badges">'+popular+price+'</div></div><h3>'+esc(t.name)+'</h3><p>'+esc(desc)+'</p><div class="tool-mode">'+labels[t.category]+' • '+(t.mode==='full'?'Fully wired':'Guided workflow')+'</div><button class="btn btn-primary tool-open" data-tool="'+t.slug+'">Open Tool</button></article>';}).join('');
  }

  function initToolHub(){
    renderCatalog();
    const search=document.getElementById('toolSearch');
    const cards=()=>[...document.querySelectorAll('.tool-card')];
    const count=document.getElementById('toolCount');
    let profession='all',sort='smart';
    const apply=()=>{const q=(search?.value||'').trim().toLowerCase();let rows=cards().filter(c=>(profession==='all'||c.dataset.profession===profession)&&(!q||c.dataset.toolName.includes(q)));if(sort==='smart')rows.sort((a,b)=>Number(b.dataset.popular)-Number(a.dataset.popular)||Number(a.dataset.price)-Number(b.dataset.price));if(sort==='free')rows=rows.filter(c=>Number(c.dataset.price)===0);if(sort==='paid')rows=rows.filter(c=>Number(c.dataset.price)>0);const visible=new Set(rows);cards().forEach(c=>c.hidden=!visible.has(c));if(count)count.textContent=rows.length+' tools';};
    search?.addEventListener('input',apply);
    document.querySelectorAll('[data-profession]').forEach(b=>b.addEventListener('click',()=>{profession=b.dataset.profession||'all';document.querySelectorAll('[data-profession]').forEach(x=>x.classList.toggle('active',x===b));apply();const grid=document.getElementById('toolCatalogGrid');if(grid&&b.classList.contains('tool-category-card'))requestAnimationFrame(()=>grid.scrollIntoView({behavior:'smooth',block:'start'}));}));
    document.querySelectorAll('[data-sort]').forEach(b=>b.addEventListener('click',()=>{sort=b.dataset.sort||'smart';document.querySelectorAll('[data-sort]').forEach(x=>x.classList.toggle('active',x===b));apply();}));
    document.querySelectorAll('.tool-open').forEach(b=>b.addEventListener('click',()=>open(b.dataset.tool)));
    apply();
  }

  document.addEventListener(
    'DOMContentLoaded',
    ()=>{
      document.querySelectorAll('.tool-open')
        .forEach(b=>
          b.addEventListener(
            'click',
            ()=>open(b.dataset.tool)
          )
        );

      initToolHub();
    }
  );

  document.addEventListener(
    'click',
    async e=>{
      const eb=e.target.closest('.tool-export-buy');
      if(eb){
        const job=exportJobs.get(eb.dataset.exportJob);
        if(!job)return;

        eb.disabled=true;
        try{
          await createOrder(
            eb.dataset.exportService,
            {
              tool_slug:job.toolSlug,
              report_format:eb.dataset.exportService,
              inputs:job.input,
              results:job.result
            },
            null,
            ()=>unlockExport(eb.dataset.exportJob),
            {forceQr:true}
          );
        }finally{
          eb.disabled=false;
        }
        return;
      }
      const b=e.target.closest('.tool-buy');
      if(!b)return;
      createOrder(b.dataset.service,{});
    }
  );

  return {
    open,
    createOrder
  };
})();
