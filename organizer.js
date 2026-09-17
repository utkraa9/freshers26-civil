import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import './config.js';

const cfg = window.CIVIL_CONFIG || {};
const supabase = createClient(cfg.supabaseUrl || 'https://placeholder.invalid', cfg.supabaseAnonKey || 'placeholder');
const $ = (s) => document.querySelector(s);
let registrations = [];
let selected = null;

const MAIN_ADMIN_EMAIL = 'pqdmshreeambasta@gmail.com';
const loginSection = $('#loginSection'), dashboard = $('#dashboard');
const loginMessage = $('#loginMessage'), tableMessage = $('#tableMessage');
const requestMessage = $('#requestMessage'), accessMessage = $('#accessMessage');
function message(el, text, error=false) { el.textContent = text; el.classList.toggle('error-message', error); }
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function statusLabel(s) { return s === 'submitted' ? 'Proof submitted' : s === 'verified' ? 'Verified' : s === 'rejected' ? 'Rejected' : 'Pending'; }

// Authorization is checked through a SECURITY DEFINER RPC so the browser does not
// need direct visibility into the organizer allowlist beyond the current user.
async function isOrganizer() {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, reason: userError?.message || 'No active session.' };
  const { data, error } = await supabase.rpc('is_civil_organizer');
  if (error) return { ok: false, reason: `Authorization check failed: ${error.message}` };
  return { ok: data === true, reason: data === true ? '' : 'This account is not authorized as a Civil organizer.' };
}

function isMissingAccessMigration(error) {
  const text = String(error?.message || '').toLowerCase();
  return text.includes('list_civil_organizer_requests') || text.includes('schema cache') || text.includes('could not find the function');
}
function showMigrationMessage(el) {
  if (!el) return;
  el.innerHTML = '<strong>Organizer approval system is not installed yet.</strong><br>Run <code>supabase-organizer-access.sql</code> once in the Civil Supabase SQL Editor, then refresh this page.';
  el.classList.add('error-message','setup-message');
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
  const verified = registrations.filter(r => r.payment_status === 'verified');
  const pending = registrations.filter(r => r.payment_status === 'submitted' || r.payment_status === 'pending');
  const rejected = registrations.filter(r => r.payment_status === 'rejected');
  const collected = verified.reduce((sum, r) => sum + Number(r.contribution || 0), 0);
  const pendingAmount = pending.reduce((sum, r) => sum + Number(r.contribution || 0), 0);
  const seniors = registrations.filter(r => String(r.year).toLowerCase().includes('senior') || r.year === '2nd Year').length;
  const juniors = registrations.filter(r => String(r.year).toLowerCase().includes('junior') || r.year === '1st Year').length;

  $('#statTotal').textContent = registrations.length;
  $('#statVerified').textContent = verified.length;
  $('#statCollected').textContent = '₹' + collected.toLocaleString('en-IN');
  $('#statPendingAmount').textContent = '₹' + pendingAmount.toLocaleString('en-IN');
  $('#summarySeniors').textContent = seniors;
  $('#summaryJuniors').textContent = juniors;
  $('#summaryPending').textContent = pending.length;
  $('#summaryRejected').textContent = rejected.length;
}
async function currentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user || null;
}
function isAdminUser(user) {
  return String(user?.email || '').toLowerCase() === MAIN_ADMIN_EMAIL;
}
async function loadOrganizerRequests() {
  const user = await currentUser();
  const panel = $('#organizerAccessPanel');
  if (!panel) return;
  if (!isAdminUser(user)) {
    panel.innerHTML = '<div class="access-header"><div><p class="eyebrow">ORGANIZER ACCESS</p><h3>Approval required</h3><p class="muted">New organizer accounts must be approved by the main admin before they can access the dashboard.</p></div></div>';
    return;
  }
  const { data, error } = await supabase.rpc('list_civil_organizer_requests');
  if (error) { if (isMissingAccessMigration(error)) showMigrationMessage(accessMessage); else message(accessMessage, error.message, true); return; }
  const rows = data || [];
  $('#accessRequests').innerHTML = rows.length ? rows.map(r => `
    <div class="access-request">
      <div><strong>${esc(r.name || 'Organizer')}</strong><small>${esc(r.email)}</small><span>${esc(r.status)} · ${new Date(r.requested_at).toLocaleString()}</span></div>
      ${r.status === 'pending' ? '<div class="access-actions"><button class="primary-btn approve-organizer" data-request="'+esc(r.id)+'">Approve</button><button class="danger-btn reject-organizer" data-request="'+esc(r.id)+'">Reject</button></div>' : '<span class="status status-'+esc(r.status)+'">'+esc(r.status)+'</span>'}
    </div>`).join('') : '<div class="access-empty">No organizer access requests.</div>';
  document.querySelectorAll('.approve-organizer').forEach(b => b.addEventListener('click', () => reviewOrganizer(b.dataset.request, 'approve')));
  document.querySelectorAll('.reject-organizer').forEach(b => b.addEventListener('click', () => reviewOrganizer(b.dataset.request, 'reject')));
}
async function reviewOrganizer(requestId, action) {
  message(accessMessage, action === 'approve' ? 'Approving organizer…' : 'Rejecting request…');
  const rpc = action === 'approve' ? 'approve_civil_organizer' : 'reject_civil_organizer';
  const { error } = await supabase.rpc(rpc, { p_request_id: requestId });
  if (error) { message(accessMessage, error.message, true); return; }
  message(accessMessage, action === 'approve' ? 'Organizer approved successfully.' : 'Organizer request rejected.');
  await loadOrganizerRequests();
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
  if (error) { message(tableMessage, error.message || 'Could not load registrations.', true); return; }
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
  const auth = await isOrganizer();
  if (!auth.ok) { await supabase.auth.signOut(); message(loginMessage, auth.reason, true); return; }
  loginSection.hidden = true; dashboard.hidden = false; await Promise.all([loadRegistrations(), loadOrganizerRequests()]);
});
$('#refreshBtn').addEventListener('click', loadRegistrations); $('#searchInput').addEventListener('input', renderRows); $('#statusFilter').addEventListener('change', renderRows);
$('#verifyBtn').addEventListener('click', () => setPaymentStatus('verified')); $('#rejectBtn').addEventListener('click', () => setPaymentStatus('rejected'));
$('#logoutBtn').addEventListener('click', async () => { await supabase.auth.signOut(); dashboard.hidden = true; loginSection.hidden = false; });
document.querySelectorAll('[data-close-modal]').forEach(el => el.addEventListener('click', () => { $('#studentModal').hidden = true; }));
$('#organizerRequestForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.currentTarget));
  message(requestMessage, 'Creating organizer account…');
  const { data, error } = await supabase.auth.signUp({ email:d.email.trim().toLowerCase(), password:d.password, options:{data:{full_name:d.name.trim()}} });
  if (error) { message(requestMessage, error.message, true); return; }
  const { error: requestError } = await supabase.rpc('request_civil_organizer', { p_email:d.email.trim().toLowerCase(), p_name:d.name.trim() });
  if (requestError) { if (isMissingAccessMigration(requestError)) showMigrationMessage(requestMessage); else message(requestMessage, requestError.message, true); return; }
  if (data?.session) await supabase.auth.signOut();
  message(requestMessage, 'Request submitted. The main admin must approve your organizer access.');
  e.currentTarget.reset();
});
async function checkSession() {
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) { message(loginMessage, 'Configure Civil Supabase in config.js first.', true); return; }
  const { data: { session } } = await supabase.auth.getSession(); if (!session) return;
  const auth = await isOrganizer();
  if (!auth.ok) { await supabase.auth.signOut(); message(loginMessage, auth.reason, true); return; }
  loginSection.hidden = true; dashboard.hidden = false; await Promise.all([loadRegistrations(), loadOrganizerRequests()]);
}
checkSession();
