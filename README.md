# ConectaParceiro – site próprio (GitHub Pages + Firebase)

Portal de gestão da documentação de SST das empresas parceiras da Alupar Geração.
Esta versão roda no seu próprio endereço, **sem nenhuma marca de terceiros**: as empresas parceiras
entram com o e-mail (link de acesso, sem senha) e o código da empresa; a equipe Alupar entra com o Google corporativo.

| Peça | Onde fica | Para quê |
|---|---|---|
| Site (telas) | GitHub Pages | `index.html`, `js/`, `img/`, `importar.html` |
| Login | Firebase Authentication | Google (Alupar) e link por e-mail (parceiros) |
| Banco de dados | Cloud Firestore | empresas, funcionários, documentos, análises… |
| Arquivos | Cloud Storage | PDFs dos documentos e fotos 3x4 |
| IA | Cloud Functions (`functions/`) | análise automática; a chave da API fica no servidor |

---

## Passo a passo da publicação (≈ 1 hora, uma única vez)

### 1. Criar o projeto no Firebase
1. Acesse **console.firebase.google.com** com a conta Google da Alupar e clique em **Criar projeto** (ex.: `conectaparceiro-alupar`). O Google Analytics pode ficar desligado.
2. Em **Upgrade** escolha o plano **Blaze** (pago por uso). Ele é exigido para guardar arquivos e para a função de IA; o uso do ConectaParceiro costuma ficar dentro da cota gratuita. **Crie um alerta de orçamento** (ex.: R$ 50/mês) em *Uso e faturamento*.

### 2. Login
1. **Authentication > Começar > Método de login**: ative **Google** e **E-mail/senha** com a opção **Link do e-mail (login sem senha)** ligada.
2. **Authentication > Configurações > Domínios autorizados**: adicione `SEU-USUARIO.github.io` (e o domínio próprio, se houver).
3. **Authentication > Modelos**: mude o idioma para **Português** e, se quiser, o nome do remetente para "ConectaParceiro – Alupar".

### 3. Banco de dados
1. **Firestore Database > Criar banco de dados** → modo **produção**, local **southamerica-east1 (São Paulo)**.
2. Aba **Regras**: apague o conteúdo, cole o arquivo `firestore.rules` inteiro e clique em **Publicar**.

### 4. Arquivos
1. **Storage > Começar** → mesma região.
2. Aba **Regras**: cole o arquivo `storage.rules` e **Publicar**.

### 5. Ligar o site ao Firebase
1. **Configurações do projeto (engrenagem) > Seus apps > Web (`</>`)** → registre o app "ConectaParceiro".
2. Copie os valores do `firebaseConfig` para o arquivo **`js/firebase-config.js`** (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId).
   Esses valores não são senhas: podem ficar públicos. Quem protege os dados são as regras.

### 6. Publicar no GitHub Pages
1. Em **github.com**, crie um repositório (ex.: `conectaparceiro`).
2. **Add file > Upload files**: arraste todo o conteúdo desta pasta (menos `node_modules`, se existir) e confirme.
3. **Settings > Pages > Build and deployment**: *Deploy from a branch*, branch **main**, pasta **/ (root)** → **Save**.
4. Em 1–2 minutos o site fica em `https://SEU-USUARIO.github.io/conectaparceiro/`.

> No GitHub gratuito o repositório do Pages precisa ser **público** (o código fica visível, os dados não: eles ficam no Firebase, protegidos pelas regras). Para repositório privado é preciso o GitHub Pro/Team.

### 7. Função de IA (análise de documentos)
1. Crie uma chave em **console.anthropic.com > API Keys** (e cadastre um meio de pagamento lá).
2. No Firebase, abra o **Google Cloud Shell** (ícone `>_` no console do Google Cloud do mesmo projeto) e rode:
   ```bash
   git clone https://github.com/SEU-USUARIO/conectaparceiro.git && cd conectaparceiro
   cd functions && npm install && cd ..
   npx firebase-tools login --no-localhost
   npx firebase-tools functions:secrets:set ANTHROPIC_API_KEY --project SEU-PROJETO   # cole a chave
   npx firebase-tools deploy --only functions --project SEU-PROJETO
   ```
3. Sem esta etapa o portal funciona normalmente; os documentos só ficam para análise manual.
   Para desligar a IA de vez, use `ia: false` em `js/firebase-config.js`.

### 8. Trazer os dados do app atual
1. No ConectaParceiro atual, aba **Relatórios > Backup completo > Baixar backup completo** (gera `conectaparceiro-backup-AAAA-MM-DD.zip` com cadastros, análises e todos os PDFs e fotos).
2. Abra `https://SEU-USUARIO.github.io/conectaparceiro/importar.html`, entre com o e-mail do gestor responsável, escolha o .zip e clique em **Importar**.
3. Abra o portal (`index.html`) com o seu login **uma vez**: o app gera sozinho as permissões da equipe (técnicos, coordenadores, portaria) e os códigos das empresas no servidor.

### 9. Avisar as empresas e a equipe
- **Parceiros:** novo link; entram com o e-mail (recebem um link de acesso) e informam **o mesmo código de acesso** de antes. O login fica vinculado à empresa, também em outros aparelhos.
- **Equipe Alupar:** entra com "Entrar com o e-mail Alupar (Google)". O perfil (técnico, leitura, portaria) vem do cadastro em **Gestores de Contratos**.
- Atualize a mensagem de convite das empresas (aba Empresas) com o novo link.

---

## Quem vê o quê (regras do servidor)
| Perfil | Lê | Grava |
|---|---|---|
| Gestor responsável (`administradores`) | tudo | tudo, inclusive equipe e permissões |
| Técnico de SST | tudo | cadastros, análises, notificações |
| Coordenador, supervisor, administrativo | tudo | nada |
| Portaria | tudo (consulta) | só o registro de consultas |
| Empresa parceira | **somente a própria empresa** | cadastros e documentos da própria empresa |

O código de acesso da empresa é conferido no servidor (`codigos/`), e os códigos das outras empresas não ficam visíveis para os parceiros.

## Trocar ou incluir o gestor responsável
O e-mail aparece em 4 lugares: `js/firebase-config.js` (administradores), `firestore.rules` (função `dono`), `storage.rules` e `functions/index.js` (ADMINISTRADORES). Altere nos quatro e publique de novo as regras e a função.

## Atualizar o portal no futuro
O `index.html` é gerado a partir do app (`build/app-fonte.html`) pelo script `build/build.py`, que troca a ligação com o Claude pela ligação com o Firebase e tira as menções ao Claude:
```bash
python build/build.py
```
Depois envie o `index.html` novo para o GitHub. Se o script avisar que algum trecho não foi encontrado, o app mudou naquele ponto e o script precisa de ajuste.

## Domínio próprio (opcional)
Peça à TI um registro CNAME (ex.: `conectaparceiro.alupar.com.br` → `SEU-USUARIO.github.io`), informe o domínio em **Settings > Pages > Custom domain** e inclua-o nos domínios autorizados do Firebase.

## LGPD e segurança
- Dados pessoais (CPF, ASO, fotos) ficam no Firestore/Storage na região de São Paulo, protegidos pelas regras de acesso.
- Os arquivos têm nomes aleatórios de 32 caracteres; o link de um arquivo só é exibido a quem pode ver o documento.
- Recomenda-se validar a solução com a TI/Segurança da Informação e registrar o tratamento no inventário de dados da Alupar.
