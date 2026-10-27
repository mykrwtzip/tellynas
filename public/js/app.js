const API = '/api';

async function checkAuth() {
  try {
    const res = await fetch(API + '/auth/check', { credentials: 'include' });
    const data = await res.json();
    if (data.authenticated) {
      document.getElementById('loginScreen').classList.remove('active');
      document.getElementById('mainScreen').classList.add('active');
      loadFiles();
    }
  } catch (e) {
    console.error('Auth check failed:', e);
  }
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const errDiv = document.getElementById('loginError');
  errDiv.textContent = '';
  
  try {
    const res = await fetch(API + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success) {
      checkAuth();
    } else {
      errDiv.textContent = data.error || 'Login failed';
    }
  } catch (e) {
    errDiv.textContent = 'Network error: ' + e.message;
    console.error('Login error:', e);
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch(API + '/auth/logout', { method: 'POST', credentials: 'include' });
  location.reload();
});

async function loadFiles(folder = 'root') {
  try {
    const res = await fetch(API + '/list?folder=' + folder, { credentials: 'include' });
    const data = await res.json();
    const list = document.getElementById('fileList');
    list.innerHTML = '';

    if (data.files) {
      data.files.forEach(file => {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.innerHTML = `
          <div class="name">📄 ${file.name}</div>
          <div class="meta">${formatSize(file.size)} · ${file.type}</div>
          <div class="actions">
            <button onclick="downloadFile('${file.telegramMessageId}', '${file.name}')">Download</button>
            <button onclick="deleteFile('${file.telegramMessageId}')">Delete</button>
          </div>
        `;
        list.appendChild(div);
      });
    } else if (data.error) {
      console.error('List error:', data.error);
    }
  } catch (e) {
    console.error('Load files error:', e);
  }
}

function formatSize(bytes) {
  if (bytes > 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
  if (bytes > 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
  if (bytes > 1e3) return (bytes / 1e3).toFixed(1) + ' KB';
  return bytes + ' B';
}

async function downloadFile(id, name) {
  window.open(API + '/download?id=' + id, '_blank');
}

async function deleteFile(id) {
  if (!confirm('Delete this file?')) return;
  await fetch(API + '/metadata?id=' + id, {
    method: 'DELETE',
    credentials: 'include'
  });
  loadFiles();
}

document.getElementById('uploadBtn').addEventListener('click', () => {
  document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', async (e) => {
  const files = e.target.files;
  const formData = new FormData();
  for (let f of files) formData.append('file', f);

  try {
    const res = await fetch(API + '/upload', {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });
    const data = await res.json();
    if (data.success) {
      alert('Uploaded: ' + data.name);
      loadFiles();
    } else {
      alert('Error: ' + data.error);
    }
  } catch (e) {
    alert('Upload failed: ' + e.message);
  }
});

checkAuth();
