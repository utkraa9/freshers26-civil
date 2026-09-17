const CONFIG = {
  // Fill these only with the NEW Civil Supabase project values.
  supabaseUrl: window.CIVIL_SUPABASE_URL || '',
  supabaseAnonKey: window.CIVIL_SUPABASE_ANON_KEY || '',
  upiId: window.CIVIL_UPI_ID || '',
  contribution: window.CIVIL_CONTRIBUTION || ''
};

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

amountLabel.textContent = CONFIG.contribution ? `₹${CONFIG.contribution}` : 'Configured by Civil admin';
amountHint.textContent = CONFIG.contribution ? 'Civil department contribution amount.' : 'Create the new Civil Supabase config to enable live amount/payment.';
upiText.textContent = CONFIG.upiId ? `UPI ID: ${CONFIG.upiId}` : 'UPI ID: not configured';
if (CONFIG.upiId) {
  qrPlaceholder.innerHTML = `<div class="qr-code">Generate QR using the configured Civil UPI ID:<br><strong>${CONFIG.upiId}</strong></div>`;
}

function setMessage(el, text, error = false) {
  el.textContent = text;
  el.style.color = error ? '#ff9c9c' : '';
}

function newReference() {
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
  return `CIV-26-${suffix}`;
}

registrationForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(registrationForm));
  const reference = newReference();
  sessionStorage.setItem(`civil_registration_${reference}`, JSON.stringify({ ...data, reference_id: reference }));
  setMessage(registrationMessage, `Registration created. Your reference ID is ${reference}. Save it for payment and pass lookup.`);
  registrationForm.reset();
});

proofForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey) {
    setMessage(proofMessage, 'Civil Supabase is not connected yet. Add the new Civil project configuration before accepting payment proofs.', true);
    return;
  }
  setMessage(proofMessage, 'Upload wiring is ready for the new Civil Supabase Storage bucket.');
});

lookupForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const reference = new FormData(lookupForm).get('reference_id')?.trim();
  const stored = sessionStorage.getItem(`civil_registration_${reference}`);
  if (!stored) {
    lookupResult.textContent = 'No local record found. Live lookup will be connected to the new Civil Supabase database.';
    return;
  }
  const data = JSON.parse(stored);
  lookupResult.innerHTML = `<strong>${data.reference_id}</strong> · ${data.full_name} · Registration received. Organizer verification is required before the event pass is issued.`;
});
