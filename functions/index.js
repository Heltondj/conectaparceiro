/* ConectaParceiro – função "ia": análise de documentos pela IA.
   A chave da API fica guardada no servidor (segredo ANTHROPIC_API_KEY) e nunca aparece no site.
   Só o gestor responsável e os técnicos de SST cadastrados podem usar. */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
admin.initializeApp();

const CHAVE = defineSecret('ANTHROPIC_API_KEY');
const ADMINISTRADORES = ['hvieira@alupar.com.br'];
// modelo usado em cada nível de exigência da análise
const MODELOS = { quick: 'claude-haiku-5-5', default: 'claude-sonnet-5-5', complex: 'claude-opus-5-5' };

exports.ia = onCall({ secrets: [CHAVE], region: 'southamerica-east1', timeoutSeconds: 300, memory: '512MiB', maxInstances: 5 }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Entre no portal de novo.');
  const email = String(req.auth.token.email || '').toLowerCase();
  let pode = req.auth.token.email_verified === true && ADMINISTRADORES.includes(email);
  if (!pode && req.auth.token.email_verified === true) {
    const p = await admin.firestore().doc('papeis/' + email).get();
    pode = p.exists && p.data().papel === 'tecnico' && p.data().ativo !== false;
  }
  if (!pode) throw new HttpsError('permission-denied', 'Somente a equipe de SST usa a análise por IA.');

  const { prompt = '', images = [], tier = 'default' } = req.data || {};
  if (!prompt || String(prompt).length > 400000) throw new HttpsError('invalid-argument', 'Pedido inválido.');
  const content = [
    ...images.slice(0, 8).map(i => ({ type: 'image', source: { type: 'base64', media_type: i.type || 'image/jpeg', data: i.data } })),
    { type: 'text', text: String(prompt) },
  ];
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': CHAVE.value(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODELOS[tier] || MODELOS.default, max_tokens: 4096, messages: [{ role: 'user', content }] }),
  });
  if (r.status === 429) throw new HttpsError('resource-exhausted', 'Limite de uso da IA atingido. Tente mais tarde.');
  if (!r.ok) { console.error('IA', r.status, await r.text()); throw new HttpsError('unavailable', 'A IA não respondeu agora.'); }
  const j = await r.json();
  return { text: (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('') };
});
