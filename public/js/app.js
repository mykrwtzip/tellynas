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
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch(API + '/auth/logout', { method: 'POST', credentials: 'include' });
  location.reload();
});

function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const icons = {
    pdf: 'file-text', doc: 'file-text', docx: 'file-text', txt: 'file-text',
    jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', svg: 'image',
    mp4: 'video', mov: 'video', avi: 'video', mkv: 'video', webm: 'video',
    mp3: 'music', wav: 'music', flac: 'music', aac: 'music',
    zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive',
  };
  return icons[ext] || 'file';
}

async function loadFiles(folder = 'root') {
  try {
    const res = await fetch(API + '/list?folder=' + encodeURIComponent(folder), { credentials: 'include' });
    const data = await res.json();
    const list = document.getElementById('fileList');
    list.innerHTML = '';

    if (data.files && data.files.length > 0) {
      data.files.forEach(file => {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.innerHTML = `
          <div class="file-icon">
            <i data-lucide="${getFileIcon(file.name)}" size="24"></i>
          </div>
          <div class="file-info">
            <div class="file-name">${file.name}</div>
            <div class="file-meta">${formatSize(file.size)} · ${file.type || 'file'}</div>
          </div>
          <div class="file-actions">
            <button class="btn-download" onclick="downloadFile('${file.telegramMessageId}', '${file.name}')">
              <i data-lucide="download" size="14"></i> Download
            </button>
            <button class="btn-delete" onclick="deleteFile('${file.telegramMessageId}')">
              <i data-lucide="trash-2" size="14"></i>
            </button>
          </div>
        `;
        list.appendChild(div);
      });
      lucide.createIcons();
    } else {
      list.innerHTML = `
        <div class="empty-state">
          <i data-lucide="inbox" size="48"></i>
          <p>No files yet. Upload your first file!</p>
        </div>
      `;
      lucide.createIcons();
    }
  } catch (e) {
    console.error('Load files error:', e);
  }
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
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
  if (!files.length) return;

  const progress = document.getElementById('uploadProgress');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');

  progress.classList.remove('hidden');
  progressFill.style.width = '10%';
  progressText.textContent = `Uploading ${files.length} file(s)...`;

  for (let i = 0; i < files.length; i++) {
    const formData = new FormData();
    formData.append('file', files[i]);

    try {
      const res = await fetch(API + '/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        progressFill.style.width = `${((i + 1) / files.length) * 100}%`;
      } else {
        alert('Error uploading ' + files[i].name + ': ' + (data.error || 'Unknown error'));
      }
    } catch (e) {
      alert('Upload failed: ' + e.message);
    }
  }

  progressFill.style.width = '100%';
  progressText.textContent = 'Done!';
  setTimeout(() => {
    progress.classList.add('hidden');
    progressFill.style.width = '0%';
  }, 1500);

  loadFiles();
  e.target.value = '';
});

checkAuth();
