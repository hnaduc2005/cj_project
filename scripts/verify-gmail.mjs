import {createGmailRelay} from '../lib/gmail.js';
try{
  await createGmailRelay().verify();
  console.log('Gmail SMTP: ket noi va xac thuc thanh cong. Chua gui email.');
}catch(error){console.error(error.message);process.exitCode=1;}
