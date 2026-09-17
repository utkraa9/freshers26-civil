import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import './config.js';

const cfg = window.CIVIL_CONFIG || {};
const supabase = createClient(cfg.supabaseUrl || 'https://placeholder.invalid', cfg.supabaseAnonKey || 'placeholder');
const $ = (s) => document.querySelector(s);
let registrations = [];
let selected = null;

const loginSection = $('#loginSection'), dashboard = $('#dashboard');
const loginMessage = $('#loginMessage'), tableMessage = $('#tableMessage');
function message(el, text, error=false) { el.textContent = text; el.classList.toggle('error-message', error); }
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function statusLabel(s) { return s === 'submitted' ? 'Proof submitted' : s === 'verified' ? 'Verified' : s === 'rejected' ? 'Rejected' : 'Pending'; }

async function isOrganizer() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase.from('organizers').select('user_id').eq('user_id', user.id).eq('active', true).maybeSingle();
  return !error && !!data;
}

async function loadConfig() {
  const { data, error } = await supabase.from('event_config').select('*').eq('id', true).maybeSingle();
  if (error || !data) return;
  $('#configContribution').value = data.contribution ?? 0;
  $('#configDate').value = data.event_date ?? '';
  $('#configVenue').value = data.venue ?? '';
  $('#configSupport').value = data.support_text ?? '';
}
function renderStats() {
  $('#statTotal').textContent = registrations.length;
  $('#statPending').textContent = registrations.filter(r => r.payment_status === 'submitted').length;
  $('#statVerified').textContent = registrations.filter(r => r.payment_status === 'verified').length;
  $('#statRejected').textContent = registrations.filter(r => r.payment_status === 'rejected').length;
}
function renderRows() {
  const q = $('#searchInput').value.trim().toLowerCase(), filter = $('#statusFilter').value;
  const rows = registrations.filter(r => {
    const hay = `${r.reference_id} ${r.full_name} ${r.entry_number} ${r.phone} ${r.email}`.toLowerCase();
    return (!q || hay.includes(q)) && (filter === 'all' || r.payment_status === filter);
  });
  $('#registrationRows').innerHTML = rows.length ? rows.map(r => `<tr><td><strong>${esc(r.reference_id)}</strong></td><td><strong>${esc(r.full_name)}</strong><small>${esc(r.email)}</small></td><td>${esc(r.entry_number)}</td><td>${esc(r.year)}</td><td>₹${esc(r.contribution ?? 0)}</td><td><span class="status status-${esc(r.payment_status)}">${esc(statusLabel(r.payment_status))}</span></td><td>${new Date(r.created_at).toLocaleString()}</td><td><button class="mini-btn" data-open="${esc(r.reference_id)}">Open</button></td></tr>`).join('') : `<tr><td colspan="8" class="empty-row">No registrations match this filter.</td></tr>`;
  document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openStudent(b.dataset.open)));
}
async function loadRegistrations() {
  message(tableMessage, 'Loading registrations…');
  const { data, error } = await supabase.from('registrations').select('*').order('created_at', { ascending: false });
  if (error) { message(tableMessage, error.message, true); return; }
  registrations = data || []; renderStats(); renderRows(); message(tableMessage, `${registrations.length} registration${registrations.length === 1 ? '' : 's'} loaded.`);
}
async function openStudent(reference) {
  selected = registrations.find(r => r.reference_id === reference); if (!selected) return;
  $('#modalTitle').textContent = selected.full_name;
  $('#studentDetails').innerHTML = [['Reference',selected.reference_id],['Entry number',selected.entry_number],['Phone',selected.phone],['Email',selected.email],['Year',selected.year],['Contribution',`₹${selected.contribution ?? 0}`],['Payment',statusLabel(selected.payment_status)],['Registered',new Date(selected.created_at).toLocaleString()]].map(([k,v]) => `<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('');
  $('#actionMessage').textContent = ''; $('#verifyBtn').disabled = selected.payment_status === 'verified'; $('#rejectBtn').disabled = selected.payment_status === 'rejected';
  $('#proofArea').innerHTML = '<p class="muted">Loading latest payment proof…</p>'; $('#studentModal').hidden = false;
  const { data: proofs, error } = await supabase.from('payment_proofs').select('*').eq('reference_id', reference).order('submitted_at', { ascending: false }).limit(1);
  if (error || !proofs?.length) { $('#proofArea').innerHTML = '<div class="proof-empty">No payment proof has been uploaded yet.</div>'; return; }
  const proof = proofs[0];
  const { data: signed, error: signError } = await supabase.storage.from('civil-payment-proofs').createSignedUrl(proof.storage_path, 600);
  if (signError) { $('#proofArea').innerHTML = `<div class="proof-empty">Could not open proof: ${esc(signError.message)}</div>`; return; }
  $('#proofArea').innerHTML = `<div class="proof-head"><span>Latest payment proof</span><a href="${esc(signed.signedUrl)}" target="_blank" rel="noopener">Open full image ↗</a></div><img class="proof-image" src="${esc(signed.signedUrl)}" alt="Payment proof for ${esc(reference)}">`;
}
async function setPaymentStatus(status) {
  if (!selected) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { message($('#actionMessage'), 'Session expired. Please sign in again.', true); return; }
  const now = new Date().toISOString();
  const { error: regError } = await supabase.from('registrations').update({ payment_status: status }).eq('reference_id', selected.reference_id);
  if (regError) { message($('#actionMessage'), regError.message, true); return; }
  const { data: proof } = await supabase.from('payment_proofs').select('id').eq('reference_id', selected.reference_id).order('submitted_at', { ascending: false }).limit(1).maybeSingle();
  if (proof) await supabase.from('payment_proofs').update({ status, reviewed_at: now, reviewed_by: user.id }).eq('id', proof.id);
  selected.payment_status = status; const local = registrations.find(r => r.reference_id === selected.reference_id); if (local) local.payment_status = status;
  renderStats(); renderRows(); $('#verifyBtn').disabled = status === 'verified'; $('#rejectBtn').disabled = status === 'rejected';
  message($('#actionMessage'), status === 'verified' ? 'Payment verified. Pass is now ready.' : 'Payment marked as rejected.');
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const d = Object.fromEntries(new FormData(e.currentTarget)); message(loginMessage, 'Signing in…');
  const { error } = await supabase.auth.signInWithPassword({ email: d.email, password: d.password });
  if (error) { message(loginMessage, error.message, true); return; }
  if (!(await isOrganizer())) { await supabase.auth.signOut(); message(loginMessage, 'This account is not authorized as a Civil organizer.', true); return; }
  loginSection.hidden = true; dashboard.hidden = false; await Promise.all([loadRegistrations(), loadConfig()]);
});
$('#refreshBtn').addEventListener('click', loadRegistrations); $('#searchInput').addEventListener('input', renderRows); $('#statusFilter').addEventListener('change', renderRows);
$('#verifyBtn').addEventListener('click', () => setPaymentStatus('verified')); $('#rejectBtn').addEventListener('click', () => setPaymentStatus('rejected'));
$('#logoutBtn').addEventListener('click', async () => { await supabase.auth.signOut(); dashboard.hidden = true; loginSection.hidden = false; });
document.querySelectorAll('[data-close-modal]').forEach(el => el.addEventListener('click', () => { $('#studentModal').hidden = true; }));
$('#configForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const payload = { id:true, contribution:Number($('#configContribution').value || 0), event_date:$('#configDate').value.trim() || 'To be announced', venue:$('#configVenue').value.trim() || 'SMVDU Campus', support_text:$('#configSupport').value.trim() || 'Contact Civil organizers' };
  const { error } = await supabase.from('event_config').update(payload).eq('id', true); message($('#configMessage'), error ? error.message : 'Event configuration saved.', !!error);
});
async function checkSession() {
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) { message(loginMessage, 'Configure Civil Supabase in config.js first.', true); return; }
  const { data: { session } } = await supabase.auth.getSession(); if (!session) return;
  if (!(await isOrganizer())) { await supabase.auth.signOut(); message(loginMessage, 'This account is not authorized as a Civil organizer.', true); return; }
  loginSection.hidden = true; dashboard.hidden = false; await Promise.all([loadRegistrations(), loadConfig()]);
}
checkSession();