// 1. Dark/Light Mode Toggle
function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme') || 'dark';
  const target = current === 'dark' ? 'light' : 'dark';

  html.setAttribute('data-theme', target);
  const icon = document.getElementById('themeIcon');
  if (icon) {
    icon.textContent = target === 'dark' ? '☀️' : '🌙';
  }
  localStorage.setItem('theme_pref', target);
}

// 2. Search Filter in Projects
function filterProjects(query) {
  const q = (query || '').toLowerCase().trim();
  const entries = document.querySelectorAll('.project-entry');
  entries.forEach(entry => {
    const text = ((entry.getAttribute('data-name') || '') + ' ' + entry.textContent).toLowerCase();
    entry.style.display = text.includes(q) ? 'block' : 'none';
  });
}

// 3. Search Filter in Blog
function filterBlog(query) {
  const q = (query || '').toLowerCase().trim();
  const entries = document.querySelectorAll('.blog-entry');
  entries.forEach(entry => {
    const text = ((entry.getAttribute('data-name') || '') + ' ' + entry.textContent).toLowerCase();
    entry.style.display = text.includes(q) ? 'block' : 'none';
  });
}

// 4. Copy Email to Clipboard with Toast Notification
function copyEmailToClipboard(customEmail) {
  const email = customEmail || 'batchuyugasai@gmail.com';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(email).catch(err => {
      console.warn('Clipboard write failed:', err);
    });
  } else {
    // Fallback for older browsers
    const tempInput = document.createElement('input');
    tempInput.value = email;
    document.body.appendChild(tempInput);
    tempInput.select();
    try {
      document.execCommand('copy');
    } catch (e) {
      console.warn('Fallback copy failed:', e);
    }
    document.body.removeChild(tempInput);
  }

  const toast = document.getElementById('copyToast');
  if (toast) {
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }
}

// 5. Initialize Theme Icon on Load
document.addEventListener('DOMContentLoaded', () => {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const icon = document.getElementById('themeIcon');
  if (icon) {
    icon.textContent = currentTheme === 'dark' ? '☀️' : '🌙';
  }

  // 6. Responsive Table Wrapper in Posts
  document.querySelectorAll('.post-content table').forEach(table => {
    if (!table.parentElement.classList.contains('table-wrapper')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'table-wrapper';
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    }
  });
});

