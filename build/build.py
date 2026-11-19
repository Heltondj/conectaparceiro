"""Gera o index.html do site a partir do app do Claude (build/app-fonte.html).

Uso:  python build/build.py
Para atualizar o site depois de mudanças no app do Claude: substitua build/app-fonte.html
pelo HTML novo e rode este script de novo. Se algum trecho mudou, o script avisa qual.
"""
import pathlib, re, sys

AQUI = pathlib.Path(__file__).resolve().parent
src = (AQUI / 'app-fonte.html').read_text(encoding='utf-8')
s = src
falhas = []

def rep(velho, novo, n=1):
    global s
    c = s.count(velho)
    if c != n:
        falhas.append(f'esperava {n}, achei {c}: {velho[:90]!r}')
        return
    s = s.replace(velho, novo)

# 1) ponte com o Firebase (antes do app)
rep('<title>ConectaParceiro</title>', '''<title>ConectaParceiro – Alupar</title>
<meta name="description" content="ConectaParceiro – gestão da documentação de SST das empresas parceiras da Alupar">
<link rel="icon" href="img/icone.svg" type="image/svg+xml">
<script src="js/firebase-config.js"></script>
<script>
window.claude = {use: n => new Promise(r => { const ir = cp => r(cp.use(n)); if (window.__cp) ir(window.__cp); else (window.__cpFila = window.__cpFila || []).push(ir); })};
window.__cpPronto = cp => (window.__cpFila || []).splice(0).forEach(f => f(cp));
</script>''')
s = s.rstrip()
s = ('<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
     '<style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0}</style>\n</head>\n<body>\n'
     + s + '\n<script type="module" src="js/cp-firebase.js"></script>\n</body>\n</html>\n')

# 2) o app espera o login (que pode demorar) em vez de desistir em 3 s
rep("while (!(window.claude && window.claude.use) && tries < 20)", "while (!(window.claude && window.claude.use) && tries < 200)")

# 3) endereço do site (QR dos crachás e convites)
rep("const APP_URL = 'https://claude.ai/artifact/LFvLkVCESoboCrPZtahCo2';", "const APP_URL = location.origin + location.pathname;")
# 4) arquivos no Firebase Storage
rep("const blobUrl = id => '/_blob/' + id;", "const blobUrl = id => window.__cp ? window.__cp.blobUrl(id) : '/_blob/' + id;")

# 5) parceiro: o código é conferido no servidor e vincula o login à empresa
rep("""  const e = [...S.empresas.values()].find(x => x.codigo === code);
  if (!e){ setErr('ob-code', 'Código não encontrado. Confira com o gestor de SST.'); return; }""",
"""  if (window.__cp && !S.gestor){
    const bt = document.querySelector('#ob-form [type=submit]'); if (bt){ bt.disabled = true; bt.textContent = 'Conferindo…'; }
    window.__cp.vincular(code).then(id => { lsSet('sst.empresa', id); location.reload(); })
      .catch(err => { if (bt){ bt.disabled = false; bt.textContent = 'Acessar o portal'; } setErr('ob-code', err && err.code === 'nao_encontrado' ? 'Código não encontrado. Confira com o gestor de SST.' : 'Não foi possível conferir o código agora. Tente de novo.'); });
    return;
  }
  const e = [...S.empresas.values()].find(x => x.codigo === code);
  if (!e){ setErr('ob-code', 'Código não encontrado. Confira com o gestor de SST.'); return; }""")

# 6) o gestor mantém as permissões do servidor (papéis da equipe e códigos das empresas)
rep("if (col === 'pedidos' || col === 'equipe') vincularPedidos(); schedule();",
    "if (col === 'pedidos' || col === 'equipe') vincularPedidos(); if (S.dono && window.__cp && (col === 'equipe' || col === 'empresas') && S.loaded.equipe && S.loaded.empresas) window.__cp.sincronizar(S.equipe, S.empresas); schedule();")

# 7) textos
T = [
 ("b.textContent = 'Confirme na janela do Claude…';", "b.textContent = 'Baixando…';"),
 ("toast('Confirme o download na janela que o Claude abriu (pode aparecer no topo ou embaixo da tela).');", "toast('Preparando o download…');"),
 ('precisa ser aberto pelo link publicado no Claude, com login. Abra o link novamente ou peça acesso ao gestor de SST.', 'precisa de conexão com a internet. Recarregue a página. Se continuar, avise o gestor de SST.'),
 ('Entre no Claude com o e-mail cadastrado.', 'Entre com o e-mail cadastrado.'),
 ('1. Você vai receber um convite do Claude no seu e-mail. Abra o link e entre com esse mesmo e-mail (se ainda não tiver conta, crie na hora).',
  '1. Abra o link do portal (abaixo) e informe o seu e-mail. Você recebe um link de acesso, sem senha.'),
 ('2. Entre no Claude com "Continuar com Google" usando esse mesmo e-mail (${t.email}).', '2. Entre com esse mesmo e-mail (${t.email}): use "Entrar com o e-mail Alupar (Google)" ou peça o link de acesso por e-mail.', 2),
 ('''1. Abra o link do ConectaParceiro que vou te enviar (ou o convite que chegou no seu e-mail ${t.email}).
2. Entre no Claude com "Continuar com Google" usando o seu e-mail @alupar.com.br.
3. Na tela inicial, clique em "Sou técnico de SST da Alupar: pedir acesso de gestão".
4. Informe o seu nome e o código de acesso: ${t.codigo}

O acesso é liberado automaticamente. Depois é só recarregar a página.''',
  '''1. Abra o link do ConectaParceiro que vou te enviar.
2. Clique em "Entrar com o e-mail Alupar (Google)" usando ${t.email}.
3. Pronto: o acesso de gestão abre sozinho.

Se aparecer a tela das empresas parceiras, use o código de acesso ${t.codigo} no botão "Sou técnico de SST da Alupar".'''),
 ('(ou o convite que chegou no seu e-mail ${t.email})', '', 2),
 ('analisados automaticamente pelo Claude', 'analisados automaticamente pela IA'),
 ('O uso do Claude não está disponível neste acesso. Os documentos ficam na fila para análise manual.', 'A análise por IA não está disponível neste acesso. Os documentos ficam na fila para análise manual.'),
 ('A IA usa a sua conta do Claude e trabalha enquanto o sistema estiver aberto no seu computador.', 'A IA trabalha enquanto o sistema estiver aberto no seu computador.'),
 ('O uso do Claude não foi autorizado. Recarregue a página e clique em "Permitir" quando o Claude pedir.', 'A IA não está liberada para este login. Confira com o gestor de SST.'),
 ('O limite de uso da sua conta do Claude foi atingido.', 'O limite de uso da IA foi atingido.'),
 ('Sua sessão expirou. Entre de novo no Claude e recarregue a página.', 'Sua sessão expirou. Entre de novo e recarregue a página.'),
 ('O uso do Claude está desativado para esta conta.', 'A IA está desativada.'),
 ('A conexão com o Claude falhou.', 'A conexão com a IA falhou.'),
 ('Ao clicar, o Claude pede sua confirmação antes de salvar o arquivo.', 'Ao clicar, o arquivo é baixado para o seu computador.'),
 ('Recarregue a página e permita o uso do Claude.', 'Recarregue a página.'),
 ("toast('Entre no Claude com o e-mail convidado e tente de novo.', 'err')", "toast('Entre com o e-mail cadastrado e tente de novo.', 'err')"),
 # sem botão Compartilhar: o acesso vale pelo e-mail cadastrado
 ('Convide o e-mail do técnico no botão Compartilhar e tente de novo.', 'Digite o nome e o e-mail do técnico.'),
 ('o app gera um código de acesso e a mensagem pronta; convide o e-mail como <b>Editor</b> no botão Compartilhar. <b>Somente leitura:</b> convide o e-mail como <b>Leitor</b> no botão Compartilhar; a pessoa é reconhecida pelo e-mail ao entrar, sem código.',
  'o app gera a mensagem pronta. <b>Todos os perfis</b> são reconhecidos pelo e-mail cadastrado ao entrar no portal, sem convite e sem senha.'),
 ('Agora convide ${email} como Editor no botão Compartilhar.', 'O acesso vale pelo e-mail ${email}.'),
 ("<li>Convide <b>${esc(t.email)}</b> no botão Compartilhar do app${t.papel === 'portaria' ? ' com permissão de <b>interagir</b> (acima de só visualizar), para que as consultas fiquem registradas' : ' como <b>Leitor</b>'}.</li>",
  "<li>O acesso vale pelo e-mail <b>${esc(t.email)}</b>: a pessoa entra no portal com ele.</li>"),
 ('<li>Convide <b>${esc(t.email)}</b> como <b>Editor</b> no botão Compartilhar do app.</li>', '<li>O acesso vale pelo e-mail <b>${esc(t.email)}</b>.</li>'),
 (' Não esqueça de convidar o e-mail do responsável pelo botão Compartilhar, como Editor.', ' O responsável entra no portal com o e-mail dele e informa o código de acesso.'),
 ("Retire também o acesso dele no botão Compartilhar.", "O acesso dele foi encerrado."),
]
for t in T:
    rep(t[0], t[1], t[2] if len(t) > 2 else 1)

if falhas:
    print('ATENÇÃO – trechos não encontrados (o app mudou):'); print('\n'.join(falhas)); sys.exit(1)

sobra = re.findall(r'.{40}Claude.{40}', re.sub(r'data:image/[a-z+]+;base64,[A-Za-z0-9+/=]+', '', s))
if sobra:
    print('Ainda há menções ao Claude:'); print('\n'.join(sobra)); sys.exit(1)

(AQUI.parent / 'index.html').write_text(s, encoding='utf-8')
print('OK – index.html gerado,', len(s), 'caracteres')
