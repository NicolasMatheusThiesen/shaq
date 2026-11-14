// Gera o par de chaves das notificações (VAPID). Rode uma vez e guarde nas variáveis de ambiente do servidor.
import { generateVAPIDKeys } from 'web-push';

const { publicKey, privateKey } = generateVAPIDKeys();
console.log('Copie estas três linhas para as variáveis de ambiente do servidor (nunca para o repositório):\n');
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('VAPID_SUBJECT=mailto:seu-email@exemplo.com');
console.log('\nA chave privada é secreta. Se vazar, gere um novo par e peça para reativar as notificações no iPhone.');
