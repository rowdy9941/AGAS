import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// CEO identities and the inbox persist. A provider process exists only while
// answering one admitted request, and interrupted responses never auto-replay.
export class ConversationManager {
  constructor(store,executor) {
    this.store=store;this.executor=executor;this.active=null;this.busy=false;this.stopping=false;
    this.store.recoverCeoReplies();
  }
  prompt({message,notes,history}) {
    const context=notes.slice(0,12).map(note=>`[${note.scope} / ${note.title}]\n${note.content.slice(0,1100)}`)
      .join("\n\n").slice(0,9000);
    const prior=history.map(row=>`Owner: ${row.text.slice(0,600)}\nCEO: ${row.reply.slice(0,800)}`)
      .join("\n\n").slice(0,6500);
    return [
      `You are the persistent AGAS ${message.hub_id} hub CEO. Respond to the owner's direct request in plain text.`,
      `Request: ${message.text}`,
      `Authorized organization and ${message.hub_id} hub notes:\n${context||"None."}`,
      `Recent completed conversation in this hub:\n${prior||"None."}`,
      "Explain useful next steps. You have no permission to edit files, call tools, deploy, spend, publish, or claim that a mission has been completed. State uncertainty. Keep the answer within this hub's scope and leave acceptance to the owner."
    ].join("\n\n");
  }
  enqueue() {
    if(this.busy||this.stopping)return;
    this.busy=true;
    queueMicrotask(async()=>{
      try {
        while(!this.stopping) {
          const next=this.store.queuedCeoReplies()[0];
          if(!next)break;
          await this.answer(next.message_id);
        }
      } catch(error){console.error("AGAS CEO reply queue stopped:",error)}
      finally {this.busy=false}
    });
  }
  async answer(id) {
    let workspace,child,timer,timedOut=false;
    try {
      const context=this.store.claimCeoReply(id);
      this.active={id,child:null};
      const adapter=this.executor.adapters[context.reply.runtime];
      const readiness=await adapter?.probe();
      if(!readiness?.ready||!adapter.launchMessage)throw new Error(readiness?.reason||"Conversation runtime is not ready");
      workspace=await mkdtemp(join(tmpdir(),"agas-ceo-"));
      if(this.stopping)return;
      child=adapter.launchMessage(workspace,this.prompt(context));
      this.active.child=child;
      child.stderr.on("data",()=>{});
      let bytes=0,pending="",reply="";
      const consume=line=>{
        try {
          const event=JSON.parse(line),item=event.part||event.item;
          if(event.ok===true&&event.status==="ok"&&!event.deliveryStatus&&typeof event.final==="string")
            reply=event.final.trim().slice(0,8000);
          else if((event.type==="text"&&item?.type==="text")||
            (event.type==="item.completed"&&item?.type==="agent_message"))
            reply=(reply+"\n"+String(item.text||"")).trim().slice(-8000);
        } catch {}
      };
      child.stdout.setEncoding("utf8");
      child.stdout.on("data",chunk=>{
        bytes+=Buffer.byteLength(chunk);
        if(bytes>128*1024){this.executor.terminate(child);return}
        pending+=chunk;
        const lines=pending.split("\n");pending=lines.pop().slice(-16000);
        for(const line of lines)consume(line);
      });
      child.stdout.on("end",()=>{if(pending)consume(pending)});
      const completed=new Promise((resolve,reject)=>{
        child.once("error",reject);
        child.once("close",(code,signal)=>resolve({code,signal}));
      });
      timer=setTimeout(()=>{timedOut=true;this.executor.terminate(child)},120000);
      const {code}=await completed;
      if(this.stopping)return;
      if(code===0&&!timedOut&&reply)this.store.completeCeoReply(id,{status:"completed",reply});
      else this.store.completeCeoReply(id,{status:"failed",error:timedOut?"CEO response timed out":
        bytes>128*1024?"CEO response exceeded output limit":`Runtime exited ${code??"without a code"} or supplied no text reply`});
    } catch(error) {
      if(!this.stopping)this.store.completeCeoReply(id,{status:"failed",error:error.message});
    } finally {
      clearTimeout(timer);
      if(this.active?.id===id)this.active=null;
      if(workspace)await rm(workspace,{recursive:true,force:true});
    }
  }
  shutdown() {
    this.stopping=true;
    if(this.active) {
      this.store.completeCeoReply(this.active.id,{status:"interrupted",error:"AGAS stopped before this reply finished"});
      if(this.active.child)this.executor.terminate(this.active.child);
    }
  }
}
