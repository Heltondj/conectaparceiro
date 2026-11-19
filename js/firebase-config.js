/* ConectaParceiro – configuração do site
   1) Cole aqui os dados do seu projeto Firebase (Console do Firebase > Configurações do projeto > Seus apps > Web).
   2) Em "administradores", deixe o(s) e-mail(s) com acesso total (gestor de SST responsável).
      O mesmo e-mail precisa estar nas regras (firestore.rules e storage.rules) e na função de IA (functions/index.js). */
window.CP_CONFIG = {
  firebase: {
    apiKey: "AIzaSyDx8HYnEUR0nhuMsLZ3bwNueemvg7AJYrY",
    authDomain: "conectaparceiro-alupar.firebaseapp.com",
    projectId: "conectaparceiro-alupar",
    storageBucket: "conectaparceiro-alupar.firebasestorage.app",
    messagingSenderId: "780065039144",
    appId: "1:780065039144:web:2bdf233cae96179baf661d"
  },
  administradores: ["hvieira@alupar.com.br"],
  regiaoFuncoes: "southamerica-east1",
  ia: true   // false = desliga a análise por IA (os documentos ficam para análise manual)
};
