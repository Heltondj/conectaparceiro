/* ConectaParceiro – configuração do site
   1) Cole aqui os dados do seu projeto Firebase (Console do Firebase > Configurações do projeto > Seus apps > Web).
   2) Em "administradores", deixe o(s) e-mail(s) com acesso total (gestor de SST responsável).
      O mesmo e-mail precisa estar nas regras (firestore.rules e storage.rules) e na função de IA (functions/index.js). */
window.CP_CONFIG = {
  firebase: {
    apiKey: "COLE_AQUI",
    authDomain: "SEU-PROJETO.firebaseapp.com",
    projectId: "SEU-PROJETO",
    storageBucket: "SEU-PROJETO.firebasestorage.app",
    messagingSenderId: "COLE_AQUI",
    appId: "COLE_AQUI"
  },
  administradores: ["hvieira@alupar.com.br"],
  regiaoFuncoes: "southamerica-east1",
  ia: true   // false = desliga a análise por IA (os documentos ficam para análise manual)
};
