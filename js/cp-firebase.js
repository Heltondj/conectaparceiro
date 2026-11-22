/* ConectaParceiro – ponte com o Firebase
   Substitui os serviços que o app usava no Claude (banco, login, arquivos, IA e downloads)
   por Firebase Auth, Firestore, Storage e Cloud Functions. O app em si não muda. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, query, where, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getStorage, ref, uploadBytes, deleteObject } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';

const CFG = window.CP_CONFIG || {};
const app = initializeApp(CFG.firebase);
const auth = getAuth(app), st = getStorage(app);
// cache local: reabrir o portal lê do aparelho e só baixa o que mudou (economiza a cota gratuita)
const fs = initializeFirestore(app, {localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})});
// 'banco' = PDFs e fotos guardados no próprio banco (plano gratuito); 'storage' = Cloud Storage (plano Blaze)
const ARMAZ = CFG.armazenamento === 'storage' ? 'storage' : 'banco';
auth.languageCode = 'pt';
const fn = getFunctions(app, CFG.regiaoFuncoes || 'southamerica-east1');
const ADMINS = (CFG.administradores || []).map(e => String(e).trim().toLowerCase());
const BUCKET = CFG.firebase.storageBucket;
const ctx = {user:null, email:'', dono:false, papel:null, alupar:false, tec:false, vinc:''};

/* ---------- utilidades ---------- */
const limpar = v => v === undefined ? null : JSON.parse(JSON.stringify(v));
const codigoErro = e => {
  const c = (e && e.code || '').replace(/^(firestore|storage|functions|auth)\//, '');
  return ({'permission-denied':'invalid_argument', 'unauthorized':'invalid_argument', 'resource-exhausted':'rate_limited', 'quota-exceeded':'quota_exceeded',
    'unauthenticated':'session_expired', 'unavailable':'upstream_error'})[c] || c || 'upstream_error';
};
const comCodigo = e => { const x = new Error(e && e.message || 'erro'); x.code = codigoErro(e); return x; };
const snapDocs = docs => ({docs: docs.map(d => ({id:d.id, data:() => d.data()}))});
const vazio = cb => { setTimeout(() => cb(snapDocs([])), 0); return () => {}; };
const hex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
const blobUrl = id => `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent('arquivos/' + id)}?alt=media`;

/* ---------- tela de entrada (sem nenhuma marca de terceiros) ---------- */
const css = `
#cp-login{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:16px;background:linear-gradient(160deg,#0A2A52 0%,#0A3A78 55%,#12508F 100%);font-family:Inter,'Segoe UI',system-ui,sans-serif}
#cp-login[hidden]{display:none}
#cp-login .cx{width:100%;max-width:420px;background:#fff;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden}
#cp-login .tp{background:#0A3A78;color:#fff;padding:22px 24px 18px;border-bottom:4px solid #1E9A4A;display:flex;gap:14px;align-items:center}
#cp-login .tp img{height:40px}
#cp-login .tp b{display:block;font-size:20px;letter-spacing:-.01em}
#cp-login .tp span{font-size:12px;opacity:.85}
#cp-login .cp{padding:22px 24px 24px;display:flex;flex-direction:column;gap:12px;color:#0E1B2E}
#cp-login h2{margin:0;font-size:17px}
#cp-login p{margin:0;font-size:13.5px;color:#56667C;line-height:1.5}
#cp-login button{font:600 14.5px inherit;font-family:inherit;border-radius:10px;padding:12px 16px;cursor:pointer;border:1px solid #0A3A78}
#cp-login .pri{background:#0A3A78;color:#fff}
#cp-login .sec{background:#fff;color:#0A3A78}
#cp-login input{font:15px inherit;font-family:inherit;padding:11px 13px;border:1px solid #CBD5E1;border-radius:10px;background:#fff!important;color:#0E1B2E!important}
#cp-login .div{display:flex;align-items:center;gap:10px;color:#94A3B8;font-size:12px}
#cp-login .div::before,#cp-login .div::after{content:'';flex:1;height:1px;background:#E2E8F0}
#cp-login .msg{font-size:13px;color:#B42318;min-height:1em}
#cp-login .ok{font-size:13.5px;color:#157F3F;background:#E5F4EA;border-radius:10px;padding:10px 12px}
#cp-sair{position:fixed;right:12px;bottom:12px;z-index:50;font:500 12px Inter,system-ui,sans-serif;background:#fff;border:1px solid #CBD5E1;border-radius:8px;padding:6px 10px;color:#0A3A78;cursor:pointer;opacity:.85}
@media print{#cp-sair{display:none}}`;
function telaLogin(){
  let el = document.getElementById('cp-login');
  if (el){ el.hidden = false; return el; }
  const st0 = document.createElement('style'); st0.textContent = css; document.head.appendChild(st0);
  el = document.createElement('div'); el.id = 'cp-login';
  const logo = (typeof LOGO_SVG !== 'undefined') ? LOGO_SVG : '';
  el.innerHTML = `<div class="cx"><div class="tp">${logo ? `<img src="${logo}" alt="Alupar">` : ''}<div><b>ConectaParceiro</b><span>Gestão de terceiros · Segurança do Trabalho</span></div></div>
    <div class="cp">
      <h2>Entrar</h2>
      <p><b>Equipe Alupar:</b> entre com o seu e-mail corporativo.</p>
      <button class="pri" id="cp-google">Entrar com o e-mail Alupar (Google)</button>
      <div class="div">ou</div>
      <p><b>Empresa parceira:</b> informe o seu e-mail. Enviamos um link de acesso, sem senha.</p>
      <input type="email" id="cp-email" placeholder="seu.email@empresa.com.br" autocomplete="email">
      <button class="sec" id="cp-link">Receber link de acesso</button>
      <div class="msg" id="cp-msg"></div>
    </div></div>`;
  document.body.appendChild(el);
  const msg = t => { el.querySelector('#cp-msg').textContent = t || ''; };
  el.querySelector('#cp-google').onclick = async () => {
    msg(''); try { const p = new GoogleAuthProvider(); p.setCustomParameters({prompt:'select_account'}); await signInWithPopup(auth, p); }
    catch (e){ if (!/popup-closed|cancelled/.test(e.code || '')) msg('Não foi possível entrar com o Google. Tente de novo.'); }
  };
  el.querySelector('#cp-link').onclick = async () => {
    const em = el.querySelector('#cp-email').value.trim().toLowerCase(); msg('');
    if (!/^\S+@\S+\.\S+$/.test(em)){ msg('Informe um e-mail válido.'); return; }
    try {
      await sendSignInLinkToEmail(auth, em, {url: location.origin + location.pathname + location.hash, handleCodeInApp:true});
      try { localStorage.setItem('cp.emailLink', em); } catch {}
      el.querySelector('.cp').insertAdjacentHTML('beforeend', `<div class="ok">Enviamos um link para <b>${em.replace(/[<>&"]/g, '')}</b>. Abra o e-mail neste aparelho e clique no link para entrar. Confira também a caixa de spam.</div>`);
    } catch { msg('Não foi possível enviar o link agora. Tente de novo em alguns minutos.'); }
  };
  return el;
}
async function concluirLinkEmail(){
  if (!isSignInWithEmailLink(auth, location.href)) return;
  let em = ''; try { em = localStorage.getItem('cp.emailLink') || ''; } catch {}
  if (!em) em = (prompt('Confirme o seu e-mail para entrar:') || '').trim().toLowerCase();
  try { await signInWithEmailLink(auth, em, location.href); try { localStorage.removeItem('cp.emailLink'); } catch {} }
  catch { alert('O link de acesso expirou ou já foi usado. Peça um novo link.'); }
  history.replaceState(null, '', location.pathname + location.hash);
}

/* ---------- perfil de quem entrou ---------- */
async function carregarPerfil(u){
  ctx.user = u; ctx.email = String(u.email || '').toLowerCase();
  ctx.dono = !!u.emailVerified && ADMINS.includes(ctx.email);
  ctx.papel = null; ctx.vinc = '';
  try { const p = await getDoc(doc(fs, 'papeis', ctx.email)); if (p.exists() && p.data().ativo !== false) ctx.papel = p.data(); } catch {}
  ctx.alupar = ctx.dono || !!ctx.papel;
  ctx.tec = ctx.dono || (!!ctx.papel && ctx.papel.papel === 'tecnico');
  if (!ctx.alupar){
    try { const v = await getDoc(doc(fs, 'vinculos', u.uid)); if (v.exists()) ctx.vinc = v.data().empresaId || ''; } catch {}
    // empresa já vinculada a este login: abre direto, mesmo em outro aparelho
    try { if (ctx.vinc && typeof S !== 'undefined' && !S.empresaId){ S.empresaId = ctx.vinc; localStorage.setItem('sst.empresa', ctx.vinc); } } catch {}
  }
}

let pronto; const prontoP = new Promise(r => { pronto = r; });
await concluirLinkEmail();
onAuthStateChanged(auth, async u => {
  if (!u){ telaLogin(); return; }
  if (ctx.user && ctx.user.uid !== u.uid){ location.reload(); return; }
  await carregarPerfil(u);
  const el = document.getElementById('cp-login'); if (el) el.hidden = true;
  if (!document.getElementById('cp-sair')){
    const b = document.createElement('button'); b.id = 'cp-sair'; b.textContent = 'Sair (' + ctx.email + ')';
    b.onclick = async () => { try { localStorage.removeItem('sst.empresa'); } catch {} await signOut(auth); location.reload(); };
    document.body.appendChild(b);
  }
  pronto();
});

/* ---------- banco de dados ---------- */
const POR_EMPRESA = new Set(['funcionarios', 'ativos', 'documentos', 'analises', 'notificacoes']);
function assinar(c, cb, err){
  const ok = s => cb(snapDocs(s.docs)), falha = e => err && err({code: codigoErro(e)});
  if (ctx.alupar) return onSnapshot(collection(fs, c), ok, falha);
  // empresa parceira: só os dados da própria empresa
  if (c === 'empresas') return ctx.vinc ? onSnapshot(doc(fs, 'empresas', ctx.vinc), s => cb(snapDocs(s.exists() ? [s] : [])), falha) : vazio(cb);
  if (POR_EMPRESA.has(c)) return ctx.vinc ? onSnapshot(query(collection(fs, c), where('empresaId', '==', ctx.vinc)), ok, falha) : vazio(cb);
  if (c === 'config' || c === 'acessos') return onSnapshot(collection(fs, c), ok, falha);
  if (c === 'pedidos') return onSnapshot(doc(fs, 'pedidos', ctx.user.uid), s => cb(snapDocs(s.exists() ? [s] : [])), falha);
  return vazio(cb);
}
const dbApi = {
  collection: c => ({
    onSnapshot: (cb, err) => assinar(c, cb, err),
    add: async data => { try { const r = await addDoc(collection(fs, c), limpar(data)); return {id:r.id}; } catch (e){ throw comCodigo(e); } },
    doc: id => dbApi.doc(c + '/' + id),
  }),
  doc: path => {
    const r = doc(fs, ...String(path).split('/'));
    return {
      id: r.id,
      get: async () => { try { const s = await getDoc(r); return {id:s.id, exists:s.exists(), data:() => s.data()}; } catch (e){ throw comCodigo(e); } },
      set: async d => { try { await setDoc(r, limpar(d)); } catch (e){ throw comCodigo(e); } },
      update: async d => { try { await updateDoc(r, limpar(d)); } catch (e){ throw comCodigo(e); } },
      delete: async () => { try { await deleteDoc(r); } catch (e){ throw comCodigo(e); } },
    };
  },
};

/* ---------- usuário ---------- */
const userApi = {
  isOwner: async () => ctx.dono,
  canEdit: async () => ctx.tec,
  can: async n => n === 'data.write' ? true : null,
  id: async () => ctx.user ? ctx.user.uid : null,
  email: async () => ctx.email || null,
  name: async () => (ctx.user && ctx.user.displayName) || '',
  me: async () => ({id:ctx.user && ctx.user.uid, email:ctx.email, name:(ctx.user && ctx.user.displayName) || '', isOwner:ctx.dono}),
  search: async () => [],
  profiles: async () => ({}),
};

/* ---------- arquivos (Firebase Storage) ---------- */
const assetsApi = {
  upload: async (blob, o = {}) => {
    const id = hex(16), type = o.type || blob.type || 'application/octet-stream';
    if (blob.size > 25 * 1024 * 1024){ const e = new Error('grande'); e.code = 'too_large'; throw e; }
    try { await uploadBytes(ref(st, 'arquivos/' + id), blob, {contentType:type}); } catch (e){ throw comCodigo(e); }
    return {id, url:blobUrl(id), sizeBytes:blob.size, contentType:type};
  },
  delete: async id => { try { await deleteObject(ref(st, 'arquivos/' + id)); } catch (e){ if (!/object-not-found/.test(e.code || '')) throw comCodigo(e); } },
  list: async () => ({assets:[], usage:{}}),
};

/* ---------- downloads ---------- */
const downloadsApi = {
  save: async ({filename, data}) => {
    const b = data instanceof Blob ? data : new Blob([data]);
    const u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = filename || 'arquivo';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
  },
};

/* ---------- IA (Cloud Function "ia", chave da API fica no servidor) ---------- */
const b64 = blob => new Promise((ok, er) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = er; r.readAsDataURL(blob); });
async function chamarIA(input, opts = {}){
  const prompt = typeof input === 'string' ? input : (input || []).map(m => (m.role === 'assistant' ? 'Resposta anterior: ' : '') + m.content).join('\n\n');
  const images = [];
  for (const im of (opts.images || []).slice(0, 8)) images.push({type: im.type || 'image/jpeg', data: await b64(im)});
  try { const r = await httpsCallable(fn, 'ia', {timeout:300000})({prompt, images, tier: opts.modelTier || 'default', json: !!opts.json}); return r.data || {text:''}; }
  catch (e){ const x = comCodigo(e); if (x.code === 'invalid_argument') x.code = 'not_granted'; throw x; }
}
function sampleApi(){
  const f = async (input, opts) => { const r = await chamarIA(input, opts); if (opts && opts.onText) try { opts.onText({text:r.text, delta:r.text}); } catch {} return {text:r.text, truncated:false}; };
  f.json = async (input, opts = {}) => {
    const r = await chamarIA(input, {...opts, json:true}); const t = String(r.text || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    const i = t.indexOf('{'), j = t.lastIndexOf('}');
    try { return JSON.parse(i >= 0 && j > i ? t.slice(i, j + 1) : t); } catch { const e = new Error('json'); e.code = 'bad_output'; throw e; }
  };
  f.limits = async () => ({images:{maxCount:8}});
  return f;
}

/* ---------- ponte com o app ---------- */
async function use(nome){
  await prontoP;
  if (nome === 'db') return dbApi;
  if (nome === 'user') return userApi;
  if (nome === 'assets') return ARMAZ === 'storage' ? assetsApi : null;
  if (nome === 'downloads') return downloadsApi;
  if (nome === 'sample') return (CFG.ia !== false && ctx.tec) ? sampleApi() : null;
  return null;
}

/* Parceiro informa o código: o servidor confere o código e vincula este login à empresa */
async function vincular(codigo){
  const cod = String(codigo || '').trim().toUpperCase();
  const c = await getDoc(doc(fs, 'codigos', cod));
  if (!c.exists()){ const e = new Error('Código não encontrado'); e.code = 'nao_encontrado'; throw e; }
  const empresaId = c.data().empresaId;
  await setDoc(doc(fs, 'vinculos', ctx.user.uid), {empresaId, codigo:cod, email:ctx.email, em:new Date().toISOString()});
  ctx.vinc = empresaId; return empresaId;
}

/* O gestor (dono) mantém as tabelas de permissão que as regras do servidor usam */
let _sinc = null, _sincAssin = '';
function sincronizar(equipe, empresas){
  if (!ctx.dono || !equipe || !empresas) return;
  const pap = {}, cod = {};
  for (const t of equipe.values()) if (t.email) pap[String(t.email).trim().toLowerCase()] = {papel:t.papel || 'tecnico', ativo:t.ativo !== false, usinas:t.usinas || [], nome:t.nome || ''};
  for (const e of empresas.values()) if (e.codigo && e.ativo !== false) cod[String(e.codigo).toUpperCase()] = {empresaId:e.id};
  const assin = JSON.stringify([pap, cod]); if (assin === _sincAssin) return;
  clearTimeout(_sinc);
  _sinc = setTimeout(async () => {
    try {
      const [pS, cS] = await Promise.all([getDocs(collection(fs, 'papeis')), getDocs(collection(fs, 'codigos'))]);
      const b = writeBatch(fs); let n = 0;
      const dif = (snap, alvo, col) => {
        const tem = new Map(snap.docs.map(d => [d.id, d.data()]));
        for (const [k, v] of Object.entries(alvo)) if (JSON.stringify(tem.get(k)) !== JSON.stringify(v)){ b.set(doc(fs, col, k), v); n++; }
        for (const k of tem.keys()) if (!(k in alvo)){ b.delete(doc(fs, col, k)); n++; }
      };
      dif(pS, pap, 'papeis'); dif(cS, cod, 'codigos');
      if (n) await b.commit();
      _sincAssin = assin;
    } catch (e){ console.error('sincronizar', e); }
  }, 800);
}

/* Importação do backup gerado no Claude (só o dono) */
async function importar(zipFile, progresso = () => {}){
  if (!ctx.dono) throw new Error('Somente o gestor responsável pode importar.');
  if (!window.JSZip) throw new Error('JSZip não carregado.');
  const zip = await window.JSZip.loadAsync(zipFile);
  const dados = JSON.parse(await zip.file('dados.json').async('string'));
  const arqs = Object.keys(zip.files).filter(n => n.startsWith('arquivos/') && !zip.files[n].dir);
  const tipos = dados.tiposArquivos || {};
  let i = 0; const noBanco = {};
  for (const n of arqs){
    const id = n.slice(9);
    if (ARMAZ === 'storage'){
      const blob = await zip.file(n).async('blob');
      await uploadBytes(ref(st, 'arquivos/' + id), blob, {contentType: tipos[id] || 'application/octet-stream'});
    } else {
      // plano gratuito: o arquivo vira partes de 180 KB na coleção "arquivos", no mesmo formato que o app usa
      const buf = await zip.file(n).async('uint8array'), CH = 180000, fid = 'm' + id.slice(0, 20), np = Math.ceil(buf.length / CH) || 1;
      let b = writeBatch(fs), k = 0;
      for (let j = 0; j < np; j++){
        const parte = buf.subarray(j * CH, (j + 1) * CH); let bin = '';
        for (let q = 0; q < parte.length; q += 8192) bin += String.fromCharCode.apply(null, parte.subarray(q, q + 8192));
        b.set(doc(fs, 'arquivos', fid + '_' + j), {fid, i:j, n:np, data:btoa(bin)}); k++;
        if (k === 3){ await b.commit(); b = writeBatch(fs); k = 0; }
      }
      if (k) await b.commit();
      noBanco[id] = {fid, n:np, tam:buf.length, tipo: tipos[id] || 'application/pdf', buf: (tipos[id] || '').startsWith('image/') && buf.length < 300000 ? buf : null};
    }
    progresso(`Arquivos: ${++i} de ${arqs.length}`);
  }
  // aponta os cadastros para as partes no banco
  const conv = f => { if (!f || !f.id || !noBanco[f.id]) return f; const x = noBanco[f.id]; const {id, ...resto} = f; return {...resto, db:true, fid:x.fid, n:x.n, tam:resto.tam || x.tam, tipo:resto.tipo || x.tipo}; };
  const fotoData = f => { const x = f && f.id && noBanco[f.id]; if (!x || !x.buf) return f; let bin = ''; for (let q = 0; q < x.buf.length; q += 8192) bin += String.fromCharCode.apply(null, x.buf.subarray(q, q + 8192)); return {data:'data:' + (x.tipo || 'image/jpeg') + ';base64,' + btoa(bin), em:f.em || null}; };
  if (ARMAZ !== 'storage'){
    for (const d of (dados.colecoes.documentos || [])) d.data = {...d.data, arquivo:conv(d.data.arquivo), carta:conv(d.data.carta)};
    for (const d of (dados.colecoes.funcionarios || [])) if (d.data.foto) d.data = {...d.data, foto:fotoData(d.data.foto)};
  }
  const cols = Object.keys(dados.colecoes || {}); let tot = 0;
  for (const c of cols){
    const lista = dados.colecoes[c]; let b = writeBatch(fs), k = 0;
    for (const d of lista){
      let v = d.data;
      if (c === 'config' && v && typeof v.texto === 'string') v = {...v, texto: v.texto.replace(/Você vai receber um convite do Claude no seu e-mail\. Abra o link e entre com esse mesmo e-mail \(se ainda não tiver conta, crie na hora\)\./g, 'Abra o link do portal e entre com o seu e-mail (você recebe um link de acesso, sem senha).')};
      b.set(doc(fs, c, d.id), limpar(v)); k++; tot++;
      if (k === 400){ await b.commit(); b = writeBatch(fs); k = 0; }
    }
    if (k) await b.commit();
    progresso(`Dados: ${c} (${lista.length})`);
  }
  return {arquivos:arqs.length, registros:tot};
}

window.__cp = {use, vincular, sincronizar, importar, blobUrl, ctx, pronto: prontoP, sair: async () => { await signOut(auth); location.reload(); }};
window.__cpPronto && window.__cpPronto(window.__cp);
