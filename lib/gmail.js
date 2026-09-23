import nodemailer from 'nodemailer';
import {emailAddress} from './identity.js';

export const DEFAULT_GMAIL='prc.cjgmd@gmail.com';
export function createGmailRelay({env=process.env,transport}={}){
  const user=String(env.GMAIL_USER||DEFAULT_GMAIL).trim().toLowerCase();
  const password=String(env.GMAIL_APP_PASSWORD||'').replace(/\s/g,'');
  const validUser=emailAddress(user)&&user.endsWith('@gmail.com');
  const configured=validUser&&Boolean(transport||/^[a-zA-Z0-9]{16}$/.test(password));
  const client=transport||(configured?nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user,pass:password},tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000,logger:false,debug:false}):null);
  const errorMessage=error=>{
    if(error.code==='EAUTH')return 'Gmail không chấp nhận đăng nhập. Kiểm tra mật khẩu ứng dụng và Xác minh 2 bước; không dùng mật khẩu đăng nhập Gmail thông thường.';
    if(error.responseCode===421||error.responseCode===454)return 'Gmail tạm giới hạn gửi. Kiểm tra hộp thư và thử lại sau.';
    if(error.responseCode>=400)return `Gmail từ chối gửi (SMTP ${error.responseCode}). Kiểm tra địa chỉ nhận, hạn mức và hộp thư.`;
    return 'Không kết nối được Gmail SMTP. Kiểm tra Internet/tường lửa cổng 465 và hộp thư Đã gửi trước khi thử lại.';
  };
  return {
    user,configured,
    async verify(){
      if(!configured)throw Error('Chưa có Gmail và mật khẩu ứng dụng hợp lệ.');
      try{await client.verify();return true;}catch(error){throw Error(errorMessage(error));}
    },
    async send({event,recipients,attachments}){
      if(!configured)throw Error('Chưa cấu hình Gmail và mật khẩu ứng dụng.');
      try{
        const result=await client.sendMail({
          from:{name:'PROCUREMENT SMILE · CJ Logistics Vina',address:user},
          replyTo:{address:event.sender},to:recipients.map(address=>({address})),
          subject:event.subject,html:event.body,messageId:`<${event.id}@gmail.com>`,
          attachments:attachments.map(a=>({filename:a.name,content:Buffer.from(a.contentBytes,'base64'),contentType:a.contentType})),
          disableFileAccess:true,disableUrlAccess:true
        });
        const accepted=(result.accepted||[]).map(v=>String(typeof v==='string'?v:v.address).toLowerCase());
        const rejected=recipients.filter(address=>!accepted.includes(address.toLowerCase()));
        if(!accepted.length){const error=Error('Gmail không tiếp nhận người nhận nào. Kiểm tra email và thử lại.');error.safe=true;throw error;}
        return {requestId:result.messageId||event.id,acceptedRecipients:accepted,rejectedRecipients:rejected};
      }catch(error){
        if(error.safe)throw error;
        const safe=Error(errorMessage(error));
        // A dropped connection without an explicit SMTP refusal may follow DATA acceptance.
        safe.uncertain=!(error.responseCode>=400||['EAUTH','EDNS','ECONNECTION','ETLS'].includes(error.code));
        throw safe;
      }
    }
  };
}
