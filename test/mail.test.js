import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../lib/database.js';
import {provisionMicrosoftUser} from '../lib/identity.js';
import {createMailService} from '../lib/mail.js';

test('Graph transport uses verified mailbox ID and distinguishes accepted, rejected, unknown',async()=>{
  const db=openDatabase(':memory:',{bootstrapPassword:'unit-test-password'});
  provisionMicrosoftUser(db,{email:'mail.sender@cj.net',name:'Sender',oid:'verified-object-id'});
  const service=createMailService({db,identity:{configured:true,appToken:async()=>'mock-token-not-real'},enabled:true});
  const originalFetch=globalThis.fetch;
  const event={id:'event-123',sender:'mail.sender@cj.net',recipients:JSON.stringify(['manager@cj.net']),subject:'Subject',body:'<p>Safe content</p>',document_id:null};
  try{
    globalThis.fetch=async(url,options)=>{assert.equal(url,'https://graph.microsoft.com/v1.0/users/verified-object-id/sendMail');const payload=JSON.parse(options.body);assert.equal(payload.saveToSentItems,true);assert.equal(payload.message.toRecipients[0].emailAddress.address,'manager@cj.net');assert.equal(options.headers['client-request-id'],'event-123');return new Response(null,{status:202,headers:{'request-id':'accepted-1'}});};
    assert.equal((await service.deliver(event)).requestId,'accepted-1');
    globalThis.fetch=async()=>new Response(null,{status:403});await assert.rejects(()=>service.deliver(event),error=>!error.uncertain&&error.message.includes('403'));
    globalThis.fetch=async()=>new Response(null,{status:503});await assert.rejects(()=>service.deliver(event),error=>error.uncertain===true);
    globalThis.fetch=async()=>{throw Error('Simulated timeout');};await assert.rejects(()=>service.deliver(event),error=>error.uncertain===true);
  }finally{globalThis.fetch=originalFetch;db.close();}
});
