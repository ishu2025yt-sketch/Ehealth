/* frontend app.js - talks to http://localhost:3000 */
const API_BASE = 'http://localhost:3000/api'; // if using emulator, use http://10.0.2.2:3000/api
const tokenKey = 'ehr_token';
const userKey = 'ehr_user';

function qs(id){ return document.getElementById(id); }
function showAlert(msg, type='green'){
  const el = qs('alert');
  el.textContent = msg;
  el.className = '';
  el.classList.add('p-2','rounded','mb-4');
  el.classList.add(type==='red' ? 'bg-red-100' : 'bg-green-100');
  el.style.display = 'block';
  setTimeout(()=> el.style.display='none', 3500);
}

async function api(path, opts = {}){
  opts.headers = opts.headers || {};
  opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
  const token = localStorage.getItem(tokenKey);
  if(token) opts.headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(API_BASE + path, opts);
  const j = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(j.error || j.message || 'API Error');
  return j;
}

function setAuthUI(){
  const user = JSON.parse(localStorage.getItem(userKey) || 'null');
  if(user){
    qs('loginPane').style.display = 'none';
    qs('dashboard').style.display = 'block';
    qs('welcome').textContent = 'Welcome, ' + user.name;
    qs('role').textContent = 'Role: ' + user.role;
    qs('logoutBtn').style.display = 'inline-block';
  } else {
    qs('loginPane').style.display = 'block';
    qs('dashboard').style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', ()=>{
  setAuthUI();

  qs('seedBtn').addEventListener('click', async ()=>{
    try{
      await fetch(API_BASE.replace('/api','') + '/api/seed', {method:'POST'});
      showAlert('Seeded admin: admin@demo.local / admin123');
    }catch(err){ showAlert(err.message, 'red'); }
  });

  qs('loginBtn').addEventListener('click', async ()=>{
    try{
      const email = qs('email').value;
      const password = qs('password').value;
      const res = await fetch(API_BASE.replace('/api','') + '/api/login', {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email,password})
      });
      const j = await res.json();
      if(!res.ok) throw new Error(j.error || j.message);
      localStorage.setItem(tokenKey, j.token);
      localStorage.setItem(userKey, JSON.stringify(j.user));
      setAuthUI();
      showAlert('Logged in');
      loadPatients();
    }catch(err){ showAlert(err.message, 'red'); }
  });

  qs('registerBtn').addEventListener('click', async ()=>{
    try{
      const name = prompt('Your name') || 'Demo';
      const email = qs('email').value;
      const password = qs('password').value || 'pass123';
      const r = await fetch(API_BASE.replace('/api','') + '/api/register', {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name,email,password, role:'doctor'})
      });
      const j = await r.json();
      if(!r.ok) throw new Error(j.error || j.message);
      showAlert('Registered. Now login.');
    }catch(err){ showAlert(err.message, 'red'); }
  });

  qs('logoutBtn').addEventListener('click', ()=>{
    localStorage.removeItem(tokenKey); localStorage.removeItem(userKey);
    setAuthUI();
  });

  qs('refreshBtn').addEventListener('click', loadPatients);
  qs('newPatientBtn').addEventListener('click', ()=> openPatientModal());
  qs('exportBtn').addEventListener('click', async ()=>{
    try{
      const token = localStorage.getItem(tokenKey);
      const res = await fetch(API_BASE.replace('/api','') + '/export', { headers: { Authorization: 'Bearer ' + token }});
      if(!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'patients_export.json'; a.click();
      URL.revokeObjectURL(url);
    }catch(err){ showAlert(err.message, 'red'); }
  });

  qs('appointmentsBtn').addEventListener('click', showAppointments);

  // show login state if already logged
  const token = localStorage.getItem(tokenKey);
  if(token) loadPatients();
});

async function loadPatients(){
  try{
    const q = qs('searchQ').value || '';
    const list = await api('/patients?q=' + encodeURIComponent(q));
    const root = qs('patientsList'); root.innerHTML = '';
    if(list.length===0) root.innerHTML = '<div class="text-sm text-gray-500">No patients</div>';
    list.forEach(p=>{
      const el = document.createElement('div');
      el.className = 'p-2 border rounded flex justify-between items-center';
      el.innerHTML = `
        <div>
          <div class="font-semibold">${p.fullName}</div>
          <div class="text-sm text-gray-600">${p.diagnosis || ''}</div>
        </div>
        <div class="flex gap-1">
          <button class="px-2 py-1 border text-sm" data-id="${p._id}" data-act="view">View</button>
          <button class="px-2 py-1 border text-sm" data-id="${p._id}" data-act="edit">Edit</button>
          <button class="px-2 py-1 border text-sm" data-id="${p._id}" data-act="upload">Upload</button>
          <button class="px-2 py-1 border text-sm" data-id="${p._id}" data-act="appt">Appt</button>
        </div>
      `;
      root.appendChild(el);
    });

    // add handlers
    root.querySelectorAll('button').forEach(b=>{
      b.addEventListener('click', async (e)=>{
        const id = e.target.dataset.id;
        const act = e.target.dataset.act;
        if(act === 'view') { viewPatient(id); }
        if(act === 'edit') { const p = await api('/patients/' + id); openPatientModal(p); }
        if(act === 'upload') { uploadFileModal(id); }
        if(act === 'appt') { appointmentModal(id); }
      });
    });
  }catch(err){ showAlert(err.message, 'red'); }
}

function openPatientModal(patient){
  const root = qs('modalRoot');
  const p = patient || {fullName:'', age:'', gender:'', contact:'', diagnosis:'', meds:[]};
  root.innerHTML = `
    <div class="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center p-4">
      <div class="bg-white p-4 rounded w-full max-w-md">
        <h3 class="font-semibold mb-2">${patient ? 'Edit' : 'New'} Patient</h3>
        <input id="m_name" class="w-full border p-2 mb-2" placeholder="Full name" value="${p.fullName || ''}" />
        <input id="m_age" class="w-full border p-2 mb-2" placeholder="Age" value="${p.age || ''}" />
        <input id="m_gender" class="w-full border p-2 mb-2" placeholder="Gender" value="${p.gender || ''}" />
        <input id="m_contact" class="w-full border p-2 mb-2" placeholder="Contact" value="${p.contact || ''}" />
        <textarea id="m_diag" class="w-full border p-2 mb-2" placeholder="Diagnosis">${p.diagnosis || ''}</textarea>
        <input id="m_meds" class="w-full border p-2 mb-2" placeholder="Meds (comma)" value="${(p.meds||[]).join(', ')}" />
        <div class="flex justify-end gap-2">
          <button id="m_cancel" class="px-3 py-1 border rounded">Cancel</button>
          <button id="m_save" class="px-3 py-1 bg-blue-600 text-white rounded">Save</button>
        </div>
      </div>
    </div>
  `;
  qs('m_cancel').addEventListener('click', ()=> qs('modalRoot').innerHTML = '');
  qs('m_save').addEventListener('click', async ()=>{
    try{
      const payload = {
        fullName: qs('m_name').value,
        age: qs('m_age').value,
        gender: qs('m_gender').value,
        contact: qs('m_contact').value,
        diagnosis: qs('m_diag').value,
        meds: qs('m_meds').value.split(',').map(s=>s.trim()).filter(Boolean)
      };
      if(patient && patient._id) {
        await api('/patients/' + patient._id, { method:'PUT', body: JSON.stringify(payload) });
        showAlert('Updated');
      } else {
        await api('/patients', { method:'POST', body: JSON.stringify(payload) });
        showAlert('Created');
      }
      qs('modalRoot').innerHTML = '';
      loadPatients();
    }catch(err){ showAlert(err.message, 'red'); }
  });
}

async function viewPatient(id){
  try{
    const p = await api('/patients/' + id);
    const root = qs('modalRoot');
    root.innerHTML = `
      <div class="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center p-4">
        <div class="bg-white p-4 rounded w-full max-w-md">
          <h3 class="font-semibold mb-2">${p.fullName}</h3>
          <div class="text-sm text-gray-600">Age: ${p.age || '-'} • ${p.gender || '-'}</div>
          <div class="mt-2"><strong>Diagnosis</strong><div>${p.diagnosis || '-'}</div></div>
          <div class="mt-2"><strong>Medications</strong><div>${(p.meds||[]).join(', ') || '-'}</div></div>
          <div class="mt-2"><strong>Files</strong>
            <div class="space-y-1 mt-1">
              ${(p.files||[]).map(f=>`<div class="text-sm"><a href="${location.origin.replace(location.pathname,'')}/uploads/${f.filename || f}" target="_blank" class="text-blue-600">${f.originalname || f.filename || f}</a></div>`).join('') || '<div class="text-sm text-gray-500">No files</div>'}
            </div>
          </div>
          <div class="mt-3 text-right">
            <button id="pv_close" class="px-3 py-1 border rounded">Close</button>
          </div>
        </div>
      </div>
    `;
    qs('pv_close').addEventListener('click', ()=> qs('modalRoot').innerHTML = '');
  }catch(err){ showAlert(err.message,'red'); }
}

function uploadFileModal(patientId){
  const root = qs('modalRoot');
  root.innerHTML = `
    <div class="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center p-4">
      <div class="bg-white p-4 rounded w-full max-w-md">
        <h3 class="font-semibold mb-2">Upload file</h3>
        <input id="fileInput" type="file" class="mb-2"/>
        <div class="flex justify-end gap-2">
          <button id="fu_cancel" class="px-3 py-1 border rounded">Cancel</button>
          <button id="fu_upload" class="px-3 py-1 bg-blue-600 text-white rounded">Upload</button>
        </div>
      </div>
    </div>
  `;
  qs('fu_cancel').addEventListener('click', ()=> qs('modalRoot').innerHTML = '');
  qs('fu_upload').addEventListener('click', async ()=>{
    const f = qs('fileInput').files[0];
    if(!f) return showAlert('Choose file', 'red');
    const fd = new FormData(); fd.append('file', f);
    try{
      const token = localStorage.getItem(tokenKey);
      const res = await fetch(API_BASE.replace('/api','') + '/patients/' + patientId + '/upload', { method:'POST', body: fd, headers: token ? { Authorization: 'Bearer ' + token } : {} });
      const j = await res.json();
      if(!res.ok) throw new Error(j.error || j.message || 'Upload failed');
      showAlert('Uploaded');
      qs('modalRoot').innerHTML = '';
      loadPatients();
    }catch(err){ showAlert(err.message, 'red'); }
  });
}

function appointmentModal(patientId){
  const root = qs('modalRoot');
  root.innerHTML = `
    <div class="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center p-4">
      <div class="bg-white p-4 rounded w-full max-w-md">
        <h3 class="font-semibold mb-2">Schedule Appointment</h3>
        <input id="a_date" type="date" class="w-full border p-2 mb-2"/>
        <input id="a_time" type="time" class="w-full border p-2 mb-2"/>
        <textarea id="a_notes" class="w-full border p-2 mb-2" placeholder="Reason/notes"></textarea>
        <div class="flex justify-end gap-2">
          <button id="a_cancel" class="px-3 py-1 border rounded">Cancel</button>
          <button id="a_save" class="px-3 py-1 bg-blue-600 text-white rounded">Save</button>
        </div>
      </div>
    </div>
  `;
  qs('a_cancel').addEventListener('click', ()=> qs('modalRoot').innerHTML = '');
  qs('a_save').addEventListener('click', async ()=>{
    try{
      const payload = {
        patientId,
        doctor: JSON.parse(localStorage.getItem(userKey) || 'null')?.name || 'Unknown',
        date: new Date(qs('a_date').value + 'T' + qs('a_time').value),
        notes: qs('a_notes').value
      };
      await api('/appointments', { method:'POST', body: JSON.stringify(payload) });
      showAlert('Appointment created');
      qs('modalRoot').innerHTML = '';
    }catch(err){ showAlert(err.message, 'red'); }
  });
}

async function showAppointments(){
  try{
    const list = await api('/appointments');
    const root = qs('modalRoot');
    root.innerHTML = `
      <div class="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center p-4">
        <div class="bg-white p-4 rounded w-full max-w-2xl">
          <h3 class="font-semibold mb-2">Appointments</h3>
          <div class="space-y-2 max-h-72 overflow-auto">
            ${list.map(a=>`<div class="p-2 border rounded"><div class="font-semibold">${a.patientId ? (a.patientId.fullName || 'Patient') : 'Patient'}</div><div class="text-sm">${new Date(a.date).toLocaleString()} • ${a.doctor || ''} • ${a.notes || ''}</div></div>`).join('')}
          </div>
          <div class="mt-3 text-right"><button id="ap_close" class="px-3 py-1 border rounded">Close</button></div>
        </div>
      </div>
    `;
    qs('ap_close').addEventListener('click', ()=> qs('modalRoot').innerHTML = '');
  }catch(err){ showAlert(err.message, 'red'); }
}
