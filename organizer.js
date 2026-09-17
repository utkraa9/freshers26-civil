import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import './config.js';

const cfg = window.CIVIL_CONFIG || {};
const loginSection = document.querySelector('#loginSection');
const dashboard = document.querySelector('#dashboard');
const loginMessage = document.querySelector('#loginMessage');
const tableWrap = document.querySelector('#tableWrap');

if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
  loginMessage.textContent = 'Configure the NEW Civil Supabase URL and anon key in config.js first.';
}
const supabase = createClient(cfg.supabaseUrl || 'https://placeholder.invalid', cfg.supabaseAnonKey || 'placeholder');

function msg(text, error=false){ loginMessage.textContent=text; loginMessage.style.color=error?'#ff9c9c':''; }

async function loadDashboard(){
  const {data, error} = await supabase.from('registrations').select('*').order('created_at',{ascending:false});
  if(error){ tableWrap.textContent=error.message; return; }
  tableWrap.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr><th>Reference</th><th>Name</th><th>Entry</th><th>Phone</th><th>Year</th><th>Amount</th><th>Status</th><th>Created</th></tr></thead><tbody>${data.map(r=>`<tr><td>${r.reference_id}</td><td>${r.full_name}</td><td>${r.entry_number}</td><td>${r.phone}</td><td>${r.year}</td><td>₹${r.contribution||0}</td><td>${r.payment_status}</td><td>${new Date(r.created_at).toLocaleString()}</td></tr>`).join('')}</tbody></table>`;
}

async function checkSession(){
  const {data:{session}}=await supabase.auth.getSession();
  if(session){loginSection.hidden=true;dashboard.hidden=false;await loadDashboard();}
}

document.querySelector('#loginForm').addEventListener('submit',async e=>{
 e.preventDefault(); const d=Object.fromEntries(new FormData(e.currentTarget));
 const {error}=await supabase.auth.signInWithPassword({email:d.email,password:d.password});
 if(error){msg(error.message,true);return;} loginSection.hidden=true;dashboard.hidden=false;await loadDashboard();
});
document.querySelector('#refreshBtn').addEventListener('click',loadDashboard);
document.querySelector('#logoutBtn').addEventListener('click',async()=>{await supabase.auth.signOut();dashboard.hidden=true;loginSection.hidden=false;});
checkSession();
