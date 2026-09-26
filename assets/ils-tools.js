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
      <div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="plMake">Calculate P&amp;L</button></div>
      <div id="plResult" class="notice" style="margin-top:14px;display:none"></div>`);
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
      document.getElementById('gtResult').innerHTML=`<strong>Free guidance prepared</strong><table style="width:100%;margin-top:12px"><tr><td><strong>Task</strong></td><td>${esc(result.task_brief)}</td></tr><tr><td><strong>Amount</strong></td><td>${esc(result.amount)}</td></tr><tr><td><strong>Date</strong></td><td>${esc(result.date)}</td></tr><tr><td><strong>Details</strong></td><td>${esc(result.details)}</td></tr></table><div class="notice" style="margin-top:12px">${esc(result.guidance)}</div>${exportCTA(tool.slug,input,result,tool.name+' — Professional Output')}`;
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
      'profit-loss-tool':profitLossTool,
      'gst-calculator':gstCalculator,'tds-calculator':tdsCalculator,'gst-interest-calculator':gstInterestCalculator,'professional-fee-calculator':professionalFeeCalculator,'invoice-total-calculator':invoiceTotalCalculator,'mca-compliance-checklist':mcaComplianceChecklist,'tax-payment-planner':taxPaymentPlanner,'compliance-deadline-planner':complianceDeadlinePlanner
    };

    if(map[slug]){
      map[slug]();
    }else if(window.ILS_TOOL_CATALOG){
      const tool=window.ILS_TOOL_CATALOG.find(x=>x.slug===slug);
      if(tool) genericGuided(tool);
    }
    const target=workspace();
    if(target){
      requestAnimationFrame(()=>target.scrollIntoView({behavior:'smooth',block:'start'}));
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
    document.querySelectorAll('[data-profession]').forEach(b=>b.addEventListener('click',()=>{profession=b.dataset.profession||'all';document.querySelectorAll('[data-profession]').forEach(x=>x.classList.toggle('active',x===b));apply();}));
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
