import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg = window.CIVIL_CONFIG || {};
const registrationForm = document.querySelector('#registrationForm');
const proofForm = document.querySelector('#proofForm');
const lookupForm = document.querySelector('#lookupForm');
const registrationMessage = document.querySelector('#registrationMessage');
const proofMessage = document.querySelector('#proofMessage');
const lookupResult = document.querySelector('#lookupResult');
const amountLabel = document.querySelector('#amountLabel');
const amountHint = document.querySelector('#amountHint');
const upiText = document.querySelector('#upiText');
const qrPlaceholder = document.querySelector('#qrPlaceholder');
const eventDate = document.querySelector('#eventDate');
const eventVenue = document.querySelector('#eventVenue');
const eventSupport = document.querySelector('#eventSupport');

const configured = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
const supabase = configured ? createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

function setMessage(el, text, error = false) { el.textContent = text; el.style.color = error ? '#ff9c9c' : ''; }
function escapeHtml(value='') { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

function renderQR() {
  if (!cfg.upiId) { qrPlaceholder.textContent = 'Civil UPI is not configured yet.'; upiText.textContent = 'UPI ID: not configured'; return; }
  const amount = Number(cfg.contribution || 0);
  const uri = `upi://pay?pa=${encodeURIComponent(cfg.upiId)}&pn=${encodeURIComponent('Civil Engineering Freshers 26')}${amount ? `&am=${amount.toFixed(2)}` : ''}&cu=INR`;
  qrPlaceholder.innerHTML = `<img class="qr-image" alt="Civil UPI payment QR" src="https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=8&data=${encodeURIComponent(uri)}"><small>Scan to pay</small>`;
  upiText.textContent = `UPI ID: ${cfg.upiId}`;
}

amountLabel.textContent = cfg.contribution ? `₹${Number(cfg.contribution).toLocaleString('en-IN')}` : 'Not configured';
amountHint.textContent = cfg.contribution ? 'Civil department contribution amount.' : 'Add the Civil event configuration in config.js.';
renderQR();

async function loadConfig() {
  if (!supabase) return;
  const { data, error } = await supabase.from('event_config').select('*').eq('id', true).maybeSingle();
  if (error || !data) return;
  if (data.contribution) { amountLabel.textContent = `₹${Number(data.contribution).toLocaleString('en-IN')}`; cfg.contribution = data.contribution; }
  if (data.upi_id) { cfg.upiId = data.upi_id; renderQR(); }
  eventDate.textContent = data.event_date || 'To be announced';
  eventVenue.textContent = data.venue || 'SMVDU Campus';
  eventSupport.textContent = data.support_text || 'Contact Civil organizers';
}

registrationForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!supabase) { setMessage(registrationMessage, 'Civil Supabase is not connected yet. Configure config.js first.', true); return; }
  const data = Object.fromEntries(new FormData(registrationForm));
  if (!/^\d{10}$/.test(data.phone)) { setMessage(registrationMessage, 'Enter a valid 10-digit phone number.', true); return; }
  setMessage(registrationMessage, 'Creating your Civil registration…');
  const { data: ref, error: refError } = await supabase.rpc('next_civil_reference');
  if (refError) { setMessage(registrationMessage, refError.message, true); return; }
  const reference = ref;
  const { error } = await supabase.from('registrations').insert({ ...data, reference_id: reference, contribution: Number(cfg.contribution || 0) });
  if (error) { setMessage(registrationMessage, error.message, true); return; }
  setMessage(registrationMessage, `Registration successful. Your reference ID is ${reference}. Save it for payment proof and pass lookup.`);
  registrationForm.reset();
  document.querySelector('#lookup').scrollIntoView({ behavior: 'smooth', block: 'center' });
});

proofForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!supabase) { setMessage(proofMessage, 'Civil Supabase is not connected yet.', true); return; }
  const form = new FormData(proofForm);
  const reference = String(form.get('reference_id') || '').trim().toUpperCase();
  const file = form.get('screenshot');
  if (!reference || !(file instanceof File) || !file.size) { setMessage(proofMessage, 'Enter your reference ID and choose a screenshot.', true); return; }
  if (file.size > 5 * 1024 * 1024) { setMessage(proofMessage, 'Screenshot must be 5 MB or smaller.', true); return; }
  setMessage(proofMessage, 'Uploading payment proof…');
  const { data: reg, error: regError } = await supabase.from('registrations').select('reference_id').eq('reference_id', reference).maybeSingle();
  if (regError || !reg) { setMessage(proofMessage, 'Reference ID not found. Check it and try again.', true); return; }
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${reference}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from('civil-payment-proofs').upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) { setMessage(proofMessage, uploadError.message, true); return; }
  const { error: proofError } = await supabase.from('payment_proofs').insert({ reference_id: reference, storage_path: path });
  if (proofError) { setMessage(proofMessage, proofError.message, true); return; }
  const { error: statusError } = await supabase.from('registrations').update({ payment_status: 'submitted' }).eq('reference_id', reference);
  if (statusError) { setMessage(proofMessage, 'Proof uploaded, but status update failed. Organizer can review the uploaded proof.', true); return; }
  setMessage(proofMessage, 'Payment proof submitted successfully. Wait for Civil organizer verification.');
  proofForm.reset();
});

lookupForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!supabase) { lookupResult.textContent = 'Civil Supabase is not connected yet.'; return; }
  const reference = String(new FormData(lookupForm).get('reference_id') || '').trim();
  lookupResult.textContent = 'Checking…';
  const { data, error } = await supabase.rpc('lookup_civil_pass', { p_reference_id: reference });
  if (error) { lookupResult.textContent = error.message; return; }
  if (!data?.length) { lookupResult.textContent = 'No Civil registration found for that reference ID.'; return; }
  const r = data[0];
  const status = r.payment_status;
  const statusText = status === 'verified' ? 'VERIFIED — PASS READY' : status === 'submitted' ? 'PAYMENT PROOF SUBMITTED — AWAITING VERIFICATION' : status === 'rejected' ? 'PAYMENT PROOF REJECTED — CONTACT ORGANIZERS' : 'REGISTRATION RECEIVED — PAYMENT PROOF PENDING';
  lookupResult.innerHTML = `<strong>${escapeHtml(r.reference_id)}</strong><br>${escapeHtml(r.full_name)}<br><span>${statusText}</span>`;
});

loadConfig();
