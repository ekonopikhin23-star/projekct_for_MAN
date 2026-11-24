// supabase-client.js — обгортка над Supabase JS SDK
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

// --- API для пакетів (майстерня) ---
export const packsApi = {
  // Отримати схвалені пакети для каталогу
  async getApproved({ kind, search, sort = 'new', limit = 50, offset = 0 } = {}) {
    let query = supabase
      .from('packs')
      .select(`*, profiles:author_id (username, github_login, avatar_url)`, { count: 'exact' })
      .eq('status', 'approved')
      .order(sort === 'az' ? 'title' : 'created_at', { ascending: sort === 'az' })
      .range(offset, offset + limit - 1);
    if (kind && kind !== 'all') query = query.eq('kind', kind);
    if (search) {
      // екрануємо символи-шаблони LIKE, щоб пошук шукав саме введений текст
      const term = search.replace(/[%_\\]/g, '\\$&');
      query = query.ilike('title', `%${term}%`);
    }
    const { data, error, count } = await query;
    if (error) throw error;
    return { packs: data || [], total: count };
  },

  // Отримати пакети поточного користувача (всі статуси)
  async getMine() {
    const { data, error } = await supabase
      .from('packs')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  // Створити новий пакет (status = 'pending')
  async create(pack) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Не авторизований');
    const { data, error } = await supabase
      .from('packs')
      .insert([{ ...pack, author_id: user.id }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Оновити власний пакет
  async update(id, updates) {
    const { data, error } = await supabase
      .from('packs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Видалити власний пакет
  async delete(id) {
    const { error } = await supabase.from('packs').delete().eq('id', id);
    if (error) throw error;
  },

  // Лайк / прибрати лайк
  async toggleLike(packId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Авторизуйтесь для лайків');
    const { data: existing } = await supabase
      .from('pack_likes')
      .select('id')
      .eq('pack_id', packId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (existing) {
      await supabase.from('pack_likes').delete().eq('id', existing.id);
      return { liked: false };
    } else {
      await supabase.from('pack_likes').insert({ pack_id: packId, user_id: user.id });
      return { liked: true };
    }
  },

  // Перевірити чи лайкнув юзер (для списку пакетів)
  async getLikesForPacks(packIds) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !packIds.length) return new Set();
    const { data } = await supabase
      .from('pack_likes')
      .select('pack_id')
      .eq('user_id', user.id)
      .in('pack_id', packIds);
    return new Set((data || []).map(d => d.pack_id));
  }
};

// --- API для авторизації ---
export const authApi = {
  async signUp(email, password, username) {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { user_name: username } }
    });
    if (error) throw error;
    return data;
  },

  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signInWithOAuth(provider) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      // після входу через GitHub/Google повертаємо користувача на головну сторінку застосунку
      options: { redirectTo: new URL('app.html', window.location.href).href }
    });
    if (error) throw error;
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async getUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  async getProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async updateProfile(updates) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Не авторизований');
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback);
  }
};

// --- Адмін / модератор API ---
export const adminApi = {
  async getPending(limit = 100) {
    const { data, error } = await supabase
      .from('packs')
      .select(`*, profiles:author_id (username, github_login, avatar_url)`)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) throw error;
    return data || [];
  },

  async moderate(packId, action, reason = '') {
    const updates = action === 'approve'
      ? { status: 'approved' }
      : { status: 'rejected', rejection_reason: reason };
    const { data, error } = await supabase
      .from('packs')
      .update(updates)
      .eq('id', packId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
};

