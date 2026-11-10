// auth-ui.js
import { authApi, supabase } from './supabase-client.js';

let currentUser = null, currentProfile = null;
const listeners = new Set();
export function onAuthChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach(fn => fn(currentUser, currentProfile)); }

export async function initAuth() {
  const { data: { subscription } } = authApi.onAuthStateChange(async (event, session) => {
    currentUser = session?.user ?? null;
    currentProfile = currentUser ? await authApi.getProfile(currentUser.id).catch(() => null) : null;
    emit(); updateHeader();
  });
  const { data: { user } } = await supabase.auth.getUser();
  currentUser = user;
  currentProfile = user ? await authApi.getProfile(user.id).catch(() => null) : null;
  updateHeader();
  return () => subscription.unsubscribe();
}

function updateHeader() {
  const authArea = document.getElementById('auth-area');
  if (!authArea) return;
  if (currentUser) {
    const name = currentProfile?.username || currentUser.email?.split('@')[0] || 'Користувач';
    const avatar = currentProfile?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`;
    authArea.innerHTML = `
      <div class="user-menu" style="display:flex;align-items:center;gap:8px">
        <img src="${avatar}" style="width:28px;height:28px;border-radius:50%;border:2px solid var(--ink)">
        <span style="font-weight:600;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(name)}</span>
        <button id="btn-profile" class="btn ghost sm" style="padding:6px 10px;font-size:13px">Профіль</button>
        <button id="btn-logout" class="btn ghost sm" style="padding:6px 10px;font-size:13px">Вихід</button>
      </div>`;
    document.getElementById('btn-profile')?.addEventListener('click', showProfileModal);
    document.getElementById('btn-logout')?.addEventListener('click', () => authApi.signOut());
  } else {
    authArea.innerHTML = `
      <button id="btn-login" class="btn ghost sm">Увійти</button>
      <button id="btn-signup" class="btn sm">Реєстрація</button>`;
    document.getElementById('btn-login')?.addEventListener('click', () => showAuthModal('login'));
    document.getElementById('btn-signup')?.addEventListener('click', () => showAuthModal('signup'));
  }
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function showAuthModal(mode) {
  const isLogin = mode === 'login';
  const html = `<div class="stage" style="max-width:380px"><h2>${isLogin?'Увійти':'Реєстрація'}</h2>
    <div class="f"><label>Email <input type="email" id="auth-email" required autocomplete="email"></label>
    <label>Пароль <input type="password" id="auth-pass" required autocomplete="${isLogin?'current-password':'new-password'}"></label>
    ${!isLogin?'<label>Нікнейм <input type="text" id="auth-name" required minlength="2" maxlength="30" autocomplete="username"></label>':''}</div>
    <div class="row"><button class="btn" id="auth-submit">${isLogin?'Увійти':'Зареєструватися'}</button>
    <button class="btn ghost" id="auth-cancel">Скасувати</button></div>
    <div class="row" style="margin-top:12px"><button class="btn ghost sm" id="auth-github">GitHub</button>
    <button class="btn ghost sm" id="auth-google">Google</button></div>
    <p class="err" id="auth-err" hidden></p></div>`;
  showModal(html);
  document.getElementById('auth-submit').onclick = handleAuthSubmit;
  document.getElementById('auth-cancel').onclick = closeModal;
  document.getElementById('auth-github').onclick = () => authApi.signInWithOAuth('github');
  document.getElementById('auth-google').onclick = () => authApi.signInWithOAuth('google');
}

async function handleAuthSubmit() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-pass').value;
  const name = document.getElementById('auth-name')?.value.trim();
  const errEl = document.getElementById('auth-err'); errEl.hidden = true;
  try { name ? await authApi.signUp(email, password, name) : await authApi.signIn(email, password); closeModal(); }
  catch (e) { errEl.textContent = e.message; errEl.hidden = false; }
}

function showProfileModal() {
  const html = `<div class="stage" style="max-width:420px"><h2>Профіль</h2>
    ${currentProfile?.avatar_url?`<img src="${currentProfile.avatar_url}" style="width:80px;height:80px;border-radius:50%;border:2px solid var(--ink);margin-bottom:12px">`:''}
    <div class="f"><label>Нікнейм <input type="text" id="pf-name" value="${escapeHtml(currentProfile?.username||'')}" maxlength="30"></label>
    <label>GitHub нік <input type="text" id="pf-github" value="${escapeHtml(currentProfile?.github_login||'')}" maxlength="39" placeholder="без @"></label></div>
    <div class="row"><button class="btn" id="pf-save">Зберегти</button><button class="btn ghost" id="pf-close">Закрити</button></div>
    <p class="fm" id="pf-msg"></p></div>`;
  showModal(html);
  document.getElementById('pf-save').onclick = async () => {
    const msg = document.getElementById('pf-msg');
    try { await authApi.updateProfile({ username: document.getElementById('pf-name').value.trim()||null, github_login: document.getElementById('pf-github').value.trim()||null });
      msg.textContent = 'Збережено'; msg.style.color = 'var(--ok)'; setTimeout(closeModal, 800); }
    catch (e) { msg.textContent = e.message; msg.style.color = 'var(--bad)'; }
  };
  document.getElementById('pf-close').onclick = closeModal;
}

function showModal(html) { closeModal(); const o=document.createElement('div'); o.id='auth-modal-overlay'; o.style.cssText='position:fixed;inset:0;background:#0008;display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px'; o.innerHTML=`<div class="win" style="max-width:100%;width:100%"><div class="wbody">${html}</div></div>`; o.onclick=e=>{if(e.target===o)closeModal()}; document.body.appendChild(o); document.addEventListener('keydown',onEsc); }
function closeModal() { document.getElementById('auth-modal-overlay')?.remove(); document.removeEventListener('keydown',onEsc); }
function onEsc(e){if(e.key==='Escape')closeModal();}

export function getCurrentUser(){return currentUser;}
export function getCurrentProfile(){return currentProfile;}
export function requireAuth(){return currentUser?Promise.resolve(currentUser):Promise.reject(new Error('Не авторизований'));}
